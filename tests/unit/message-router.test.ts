// ─── Message Router Tests ─────────────────────────────────────────────
// Tests for message routing between channels and sessions

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageRouter } from '@/gateway/router.js';
import { SessionManager } from '@/gateway/sessions.js';
import { EventBus } from '@/gateway/events.js';
import type { TalonConfig } from '@/config/schema.js';
import type { InboundMessage } from '@/utils/types.js';

const mockConfig: TalonConfig = {
    gateway: {
        host: '127.0.0.1',
        port: 19789,
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

describe('MessageRouter', () => {
    let router: MessageRouter;
    let sessionManager: SessionManager;
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
        sessionManager = new SessionManager(mockConfig, eventBus);
        router = new MessageRouter(sessionManager, eventBus);
    });

    describe('handleInbound', () => {
        it('should create session for new user', () => {
            const message: InboundMessage = {
                channel: 'cli',
                senderId: 'new-user-123',
                senderName: 'New User',
                text: 'Hello Talon',
                media: null,
                isGroup: false,
                groupId: null,
            };

            const sessionId = router.handleInbound(message);

            expect(sessionId).toBeDefined();
            const session = sessionManager.getSession(sessionId);
            expect(session).toBeDefined();
            expect(session?.senderId).toBe('new-user-123');
        });

        it('should reuse existing session for returning user', () => {
            const message1: InboundMessage = {
                channel: 'cli',
                senderId: 'user-123',
                senderName: 'User',
                text: 'First message',
                media: null,
                isGroup: false,
                groupId: null,
            };

            const sessionId1 = router.handleInbound(message1);

            const message2: InboundMessage = {
                channel: 'cli',
                senderId: 'user-123',
                senderName: 'User',
                text: 'Second message',
                media: null,
                isGroup: false,
                groupId: null,
            };

            const sessionId2 = router.handleInbound(message2);

            expect(sessionId1).toBe(sessionId2);
        });

        it('should add message to session history', () => {
            const message: InboundMessage = {
                channel: 'cli',
                senderId: 'user-123',
                senderName: 'User',
                text: 'Test message',
                media: null,
                isGroup: false,
                groupId: null,
            };

            router.handleInbound(message);

            const session = sessionManager.getSessionBySender('user-123');
            expect(session?.messages.length).toBe(1);
            expect(session?.messages[0].content).toBe('Test message');
        });

        it('should increment message count', () => {
            const message: InboundMessage = {
                channel: 'cli',
                senderId: 'user-123',
                senderName: 'User',
                text: 'Test',
                media: null,
                isGroup: false,
                groupId: null,
            };

            router.handleInbound(message);
            router.handleInbound({ ...message, text: 'Test 2' });

            const session = sessionManager.getSessionBySender('user-123');
            expect(session?.metadata.messageCount).toBe(2);
        });

        it('should emit message.inbound event', () => {
            const eventHandler = vi.fn();
            eventBus.on('message.inbound' as any, eventHandler);

            const message: InboundMessage = {
                channel: 'cli',
                senderId: 'user-123',
                senderName: 'User',
                text: 'Test',
                media: null,
                isGroup: false,
                groupId: null,
            };

            router.handleInbound(message);

            expect(eventHandler).toHaveBeenCalled();
        });

        it('should handle group messages', () => {
            const message: InboundMessage = {
                channel: 'telegram',
                senderId: 'user-123',
                senderName: 'User',
                text: 'Hello in group',
                media: null,
                isGroup: true,
                groupId: 'group-456',
            };

            const sessionId = router.handleInbound(message);

            expect(sessionId).toBeDefined();
            const session = sessionManager.getSession(sessionId);
            expect(session).toBeDefined();
        });
    });

    describe('handleOutbound', () => {
        it('should emit message.outbound event', () => {
            const eventHandler = vi.fn();
            eventBus.on('message.outbound' as any, eventHandler);

            const session = sessionManager.createSession('user-123', 'cli');

            router.handleOutbound(session.id, 'Hello from agent');

            expect(eventHandler).toHaveBeenCalled();
        });

        it('should handle unknown session gracefully', () => {
            expect(() => {
                router.handleOutbound('non-existent-session', 'Hello');
            }).not.toThrow();
        });

        it('should deduplicate rapid outbound messages', () => {
            const eventHandler = vi.fn();
            eventBus.on('message.outbound' as any, eventHandler);

            const session = sessionManager.createSession('user-123', 'cli');

            router.handleOutbound(session.id, 'First message');
            router.handleOutbound(session.id, 'Second message (duplicate)');
            router.handleOutbound(session.id, 'Third message (duplicate)');

            // Only first message should emit event within 5 second window
            expect(eventHandler).toHaveBeenCalledTimes(1);
        });
    });

    describe('Message Payload Validation', () => {
        it('should handle messages with media', () => {
            const message: InboundMessage = {
                channel: 'whatsapp',
                senderId: 'user-123',
                senderName: 'User',
                text: 'Check this image',
                media: {
                    type: 'image',
                    url: 'https://example.com/image.jpg',
                    mimeType: 'image/jpeg',
                },
                isGroup: false,
                groupId: null,
            };

            const sessionId = router.handleInbound(message);

            expect(sessionId).toBeDefined();
        });

        it('should handle empty message text', () => {
            const message: InboundMessage = {
                channel: 'cli',
                senderId: 'user-123',
                senderName: 'User',
                text: '',
                media: null,
                isGroup: false,
                groupId: null,
            };

            const sessionId = router.handleInbound(message);

            expect(sessionId).toBeDefined();
        });

        it('should handle very long message text', () => {
            const longText = 'A'.repeat(10000);
            const message: InboundMessage = {
                channel: 'cli',
                senderId: 'user-123',
                senderName: 'User',
                text: longText,
                media: null,
                isGroup: false,
                groupId: null,
            };

            const sessionId = router.handleInbound(message);

            expect(sessionId).toBeDefined();
            const session = sessionManager.getSession(sessionId);
            expect(session?.messages[0].content.length).toBe(10000);
        });
    });

    describe('Error Handling', () => {
        it('should not crash on invalid event handlers', () => {
            // Remove all event handlers
            eventBus.removeAllListeners();

            const message: InboundMessage = {
                channel: 'cli',
                senderId: 'user-123',
                senderName: 'User',
                text: 'Test',
                media: null,
                isGroup: false,
                groupId: null,
            };

            expect(() => router.handleInbound(message)).not.toThrow();
        });
    });
});
