// ─── WebSocket Protocol Tests ──────────────────────────────────────
// Tests for structured WebSocket protocol events

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { TalonServer } from '@/gateway/server.js';
import { SessionManager } from '@/gateway/sessions.js';
import { MessageRouter } from '@/gateway/router.js';
import { EventBus } from '@/gateway/events.js';
import { AgentLoop } from '@/agent/loop.js';
import { ModelRouter } from '@/agent/router.js';
import { MemoryManager } from '@/memory/manager.js';
import { MemoryCompressor } from '@/memory/compressor.js';
import type { TalonConfig } from '@/config/schema.js';
import { nanoid } from 'nanoid';

const mockConfig: TalonConfig = {
    gateway: {
        host: '127.0.0.1',
        port: 0,
        auth: { mode: 'none' },
        tailscale: { enabled: false, mode: 'off', resetOnExit: true },
        cors: { origins: ['http://127.0.0.1:*'] },
    },
    agent: {
        model: 'deepseek/deepseek-chat',
        providers: {
            deepseek: { apiKey: 'test-key', models: ['deepseek-chat'] }
        },
        failover: [],
        maxTokens: 4096,
        maxIterations: 10,
        temperature: 0.7,
        thinkingLevel: 'medium',
    },
    channels: {
        cli: { enabled: true },
        telegram: { enabled: false },
        discord: { enabled: false },
        whatsapp: { enabled: false },
        webchat: { enabled: true },
    },
    tools: {
        files: { enabled: true, allowedPaths: ['/tmp'], deniedPaths: [] },
        shell: { enabled: true, blockedCommands: [], confirmDestructive: false, defaultTimeout: 30000 },
        browser: { enabled: false },
        os: { enabled: true },
        web: { search: { enabled: false }, fetch: { enabled: false } },
    },
    memory: {
        enabled: true,
        session: { idleTimeout: 60000, archiveAfterDays: 30, maxMessagesBeforeCompact: 100 },
        compaction: { enabled: true, threshold: 0.8, keepRecentMessages: 10 },
    },
    workspace: { root: '/tmp/test-workspace' },
    skills: { enabled: false, dir: '' },
    logging: { level: 'error' },
};

describe('WebSocket Protocol', () => {
    let server: TalonServer;
    let eventBus: EventBus;
    let sessionManager: SessionManager;
    let messageRouter: MessageRouter;
    let agentLoop: AgentLoop;
    let wsUrl: string;
    let serverPort: number;

    beforeEach(async () => {
        eventBus = new EventBus();
        sessionManager = new SessionManager(mockConfig, eventBus);
        messageRouter = new MessageRouter(sessionManager, eventBus);
        
        // Create agent loop with tools
        const modelRouter = new ModelRouter(mockConfig);
        const memoryManager = new MemoryManager(mockConfig);
        const memoryCompressor = new MemoryCompressor(mockConfig);
        agentLoop = new AgentLoop(modelRouter, memoryManager, memoryCompressor, eventBus);
        
        // Register a test tool
        agentLoop.registerTool({
            name: 'test_tool',
            description: 'Test tool',
            parameters: {},
            execute: async () => 'test result',
        });
        
        serverPort = await getAvailablePort();
        const configWithPort = {
            ...mockConfig,
            gateway: { ...mockConfig.gateway, port: serverPort }
        };
        
        server = new TalonServer(configWithPort, eventBus, sessionManager, messageRouter, agentLoop);
        await server.setup();
        
        wsUrl = `ws://127.0.0.1:${serverPort}/ws`;
    });

    afterEach(async () => {
        await server.stop();
    });

    async function getAvailablePort(): Promise<number> {
        const { WebSocketServer } = await import('ws');
        return new Promise((resolve) => {
            const testServer = new WebSocketServer({ port: 0 }, () => {
                const address = testServer.address();
                if (address && typeof address === 'object') {
                    resolve(address.port);
                } else {
                    resolve(0);
                }
                testServer.close();
            });
        });
    }

    function sendMessage(ws: WebSocket, type: string, payload: unknown = {}): void {
        ws.send(JSON.stringify({
            id: nanoid(),
            type,
            timestamp: Date.now(),
            payload
        }));
    }

    function waitForMessage(ws: WebSocket, expectedType?: string): Promise<any> {
        return new Promise((resolve) => {
            const handler = (data: Buffer) => {
                const msg = JSON.parse(data.toString());
                if (!expectedType || msg.type === expectedType) {
                    ws.off('message', handler);
                    resolve(msg);
                }
            };
            ws.on('message', handler);
        });
    }

    describe('Gateway Events', () => {
        it('should respond to gateway.status request', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'gateway.status');
            const response = await waitForMessage(ws, 'gateway.status');

            expect(response.type).toBe('gateway.status');
            expect(response.payload).toHaveProperty('status');
            expect(response.payload).toHaveProperty('version', '0.4.0');
            expect(response.payload).toHaveProperty('uptime');
            expect(response.payload).toHaveProperty('components');
            expect(response.payload).toHaveProperty('stats');

            ws.close();
        });
    });

    describe('Session Events', () => {
        it('should list sessions', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'session.list');
            const response = await waitForMessage(ws, 'session.list');

            expect(response.type).toBe('session.list');
            expect(response.payload).toHaveProperty('sessions');
            expect(Array.isArray(response.payload.sessions)).toBe(true);

            ws.close();
        });

        it('should create a new session', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'session.create', {
                senderId: 'test-user',
                channel: 'websocket',
                senderName: 'Test User'
            });

            const response = await waitForMessage(ws, 'session.created');

            expect(response.type).toBe('session.created');
            expect(response.payload).toHaveProperty('sessionId');
            expect(response.payload).toHaveProperty('senderId', 'test-user');
            expect(response.payload).toHaveProperty('channel', 'websocket');
            expect(response.payload).toHaveProperty('createdAt');

            ws.close();
        });

        it('should reset a session', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            // Create session first
            sendMessage(ws, 'session.create', {
                senderId: 'test-user',
                channel: 'websocket'
            });
            const createResponse = await waitForMessage(ws, 'session.created');
            const sessionId = createResponse.payload.sessionId;

            // Reset session
            sendMessage(ws, 'session.reset', { sessionId });
            const resetResponse = await waitForMessage(ws, 'session.reset');

            expect(resetResponse.type).toBe('session.reset');
            expect(resetResponse.payload).toHaveProperty('sessionId', sessionId);
            expect(resetResponse.payload).toHaveProperty('success', true);

            ws.close();
        });

        it('should return error for non-existent session', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'session.reset', { sessionId: 'non-existent' });
            const response = await waitForMessage(ws, 'session.error');

            expect(response.type).toBe('session.error');
            expect(response.payload).toHaveProperty('error');
            expect(response.payload).toHaveProperty('code', 'SESSION_NOT_FOUND');

            ws.close();
        });

        it('should deliver outbound messages as session.message.final to bound websocket clients', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'session.create', {
                senderId: 'test-user',
                channel: 'webchat',
                senderName: 'Test User',
            });
            const createResponse = await waitForMessage(ws, 'session.created');
            const sessionId = createResponse.payload.sessionId as string;

            eventBus.emit('message.outbound', {
                sessionId,
                message: {
                    sessionId,
                    text: 'Hello from outbound',
                },
            });

            const finalMessage = await waitForMessage(ws, 'session.message.final');
            expect(finalMessage.payload.sessionId).toBe(sessionId);
            expect(finalMessage.payload.message.role).toBe('assistant');
            expect(finalMessage.payload.message.content).toBe('Hello from outbound');

            ws.close();
        });
    });

    describe('Tool Events', () => {
        it('should list available tools', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'tools.list');
            const response = await waitForMessage(ws, 'tools.list');

            expect(response.type).toBe('tools.list');
            expect(response.payload).toHaveProperty('tools');
            expect(Array.isArray(response.payload.tools)).toBe(true);
            expect(response.payload.tools.length).toBeGreaterThan(0);
            expect(response.payload.tools[0]).toHaveProperty('name');
            expect(response.payload.tools[0]).toHaveProperty('description');
            expect(response.payload.tools[0]).toHaveProperty('parameters');

            ws.close();
        });

        it('should invoke a tool successfully', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'tools.invoke', {
                toolName: 'test_tool',
                args: {}
            });

            const response = await waitForMessage(ws, 'tools.result');

            expect(response.type).toBe('tools.result');
            expect(response.payload).toHaveProperty('toolName', 'test_tool');
            expect(response.payload).toHaveProperty('success', true);
            expect(response.payload).toHaveProperty('output', 'test result');

            ws.close();
        });

        it('should return error for non-existent tool', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'tools.invoke', {
                toolName: 'non_existent_tool',
                args: {}
            });

            const response = await waitForMessage(ws, 'tools.result');

            expect(response.type).toBe('tools.result');
            expect(response.payload).toHaveProperty('toolName', 'non_existent_tool');
            expect(response.payload).toHaveProperty('success', false);
            expect(response.payload).toHaveProperty('error');

            ws.close();
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid message format', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            ws.send('invalid json');
            const response = await waitForMessage(ws, 'error');

            expect(response.type).toBe('error');
            expect(response.payload).toHaveProperty('error');

            ws.close();
        });

        it('should handle unknown message type', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'unknown.type');
            const response = await waitForMessage(ws, 'error');

            expect(response.type).toBe('error');
            expect(response.payload).toHaveProperty('error');

            ws.close();
        });
    });

    describe('Legacy Support', () => {
        it('should still support channel.message event', async () => {
            const ws = new WebSocket(wsUrl);
            await new Promise(resolve => ws.once('open', resolve));

            sendMessage(ws, 'channel.message', {
                channel: 'websocket',
                senderId: 'test-user',
                senderName: 'Test User',
                text: 'Hello',
                media: null,
                isGroup: false,
                groupId: null
            });

            // Should not error
            await new Promise(resolve => setTimeout(resolve, 100));

            ws.close();
        });
    });
});
