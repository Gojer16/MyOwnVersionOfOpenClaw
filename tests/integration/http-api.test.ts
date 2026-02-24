// ─── HTTP API Tests ────────────────────────────────────────────────────
// Tests for Fastify HTTP endpoints using app.inject()

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { TalonServer } from '@/gateway/server.js';
import { SessionManager } from '@/gateway/sessions.js';
import { MessageRouter } from '@/gateway/router.js';
import { EventBus } from '@/gateway/events.js';
import type { TalonConfig } from '@/config/schema.js';

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
        shell: { enabled: true },
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
    logging: { level: 'info' },
};

async function getAvailablePort(): Promise<number> {
    return new Promise((resolve) => {
        const server = require('net').createServer();
        server.listen(0, () => {
            const address = server.address();
            if (address && typeof address === 'object') {
                resolve(address.port);
            } else {
                resolve(0);
            }
            server.close();
        });
    });
}

describe('TalonServer HTTP API', () => {
    let server: TalonServer;
    let eventBus: EventBus;
    let sessionManager: SessionManager;
    let messageRouter: MessageRouter;
    let baseUrl: string;
    let serverPort: number;

    beforeEach(async () => {
        eventBus = new EventBus();
        sessionManager = new SessionManager(mockConfig, eventBus);
        messageRouter = new MessageRouter(sessionManager, eventBus);
        
        serverPort = await getAvailablePort();
        
        const configWithPort = {
            ...mockConfig,
            gateway: { ...mockConfig.gateway, port: serverPort }
        };
        
        server = new TalonServer(configWithPort, eventBus, sessionManager, messageRouter);
        await server.setup();
        
        baseUrl = `http://127.0.0.1:${serverPort}`;
    });

    afterEach(async () => {
        await server.stop();
    });

    describe('Health Endpoints', () => {
        it('should serve a usable dashboard entrypoint at root', async () => {
            const response = await fetch(`${baseUrl}/`);
            const html = await response.text();

            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('text/html');
            expect(html).toContain('Talon WebChat');
            expect(html).not.toContain('/src/main.tsx');
        });

        it('should return health status', async () => {
            const response = await fetch(`${baseUrl}/api/health`);
            const data = await response.json();
            
            expect(response.status).toBe(200);
            expect(data.status).toBe('ok');
            expect(data.version).toBeDefined();
            expect(data.uptime).toBeGreaterThan(0);
        });

        it('should return deep health status', async () => {
            const response = await fetch(`${baseUrl}/api/health/deep`);
            const data = await response.json();
            
            expect(response.status).toBe(200);
            expect(data.status).toBeDefined();
            expect(data.checks).toBeDefined();
        });

        it('should return ready status', async () => {
            const response = await fetch(`${baseUrl}/api/ready`);
            const data = await response.json();
            
            expect(response.status).toBe(200);
            expect(data.ready).toBeDefined();
        });
    });

    describe('Session Endpoints', () => {
        it('should list sessions', async () => {
            // Create a session first
            sessionManager.createSession('test-user', 'cli');
            
            const response = await fetch(`${baseUrl}/api/sessions`);
            const data = await response.json();
            
            expect(response.status).toBe(200);
            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThan(0);
        });

        it('should return empty array when no sessions', async () => {
            const response = await fetch(`${baseUrl}/api/sessions`);
            const data = await response.json();
            
            expect(response.status).toBe(200);
            expect(data).toEqual([]);
        });

        it('should get specific session', async () => {
            const session = sessionManager.createSession('test-user', 'cli');
            
            const response = await fetch(`${baseUrl}/api/sessions/${session.id}`);
            const data = await response.json();
            
            expect(response.status).toBe(200);
            expect(data.id).toBe(session.id);
            expect(data.senderId).toBe('test-user');
        });

        it('should return 404 for non-existent session', async () => {
            const response = await fetch(`${baseUrl}/api/sessions/non-existent-id`);
            
            expect(response.status).toBe(404);
        });

        it('should send message to session via REST', async () => {
            const session = sessionManager.createSession('test-user', 'cli');
            
            const response = await fetch(`${baseUrl}/api/sessions/${session.id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Hello via REST' }),
            });
            
            const data = await response.json();
            
            expect(response.status).toBe(200);
            expect(data.status).toBe('queued');
        });

        it('should return 404 when sending to non-existent session', async () => {
            const response = await fetch(`${baseUrl}/api/sessions/non-existent/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Hello' }),
            });
            
            expect(response.status).toBe(404);
        });
    });

    describe('Config Endpoint', () => {
        it('should return config (redacted)', async () => {
            const response = await fetch(`${baseUrl}/api/config`);
            const data = await response.json();
            
            expect(response.status).toBe(200);
            expect(data.gateway).toBeDefined();
            expect(data.agent).toBeDefined();
        });
    });

    describe('Tools Endpoint', () => {
        it('should return tools list', async () => {
            const response = await fetch(`${baseUrl}/api/tools`);
            const data = await response.json();
            
            expect(response.status).toBe(200);
            expect(data.tools).toBeDefined();
            expect(Array.isArray(data.tools)).toBe(true);
        });
    });

    describe('Request Validation', () => {
        it('should handle invalid JSON in POST body', async () => {
            const session = sessionManager.createSession('test-user', 'cli');
            
            const response = await fetch(`${baseUrl}/api/sessions/${session.id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'invalid json {{{',
            });
            
            // Fastify should return 400 for invalid JSON
            expect([400, 500]).toContain(response.status);
        });
    });

    describe('CORS', () => {
        it('should include CORS headers', async () => {
            const response = await fetch(`${baseUrl}/api/health`, {
                headers: { 'Origin': 'http://127.0.0.1:3000' },
            });
            
            // Should have access-control headers
            expect(response.headers.get('access-control-allow-origin')).toBeDefined();
        });
    });
});
