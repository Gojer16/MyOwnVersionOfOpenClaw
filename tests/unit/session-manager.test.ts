// ─── Session Manager Tests ────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '@/gateway/sessions.js';

describe('SessionManager', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
        sessionManager = new SessionManager();
    });

    describe('createSession', () => {
        it('should create a new session', () => {
            const session = sessionManager.createSession('test-channel', 'user-123');
            
            expect(session.id).toBeDefined();
            expect(session.channelId).toBe('test-channel');
            expect(session.userId).toBe('user-123');
            expect(session.messages).toEqual([]);
            expect(session.memorySummary).toBe('');
        });

        it('should generate unique session IDs', () => {
            const session1 = sessionManager.createSession('channel-1', 'user-1');
            const session2 = sessionManager.createSession('channel-2', 'user-2');
            
            expect(session1.id).not.toBe(session2.id);
        });
    });

    describe('getSession', () => {
        it('should retrieve existing session', () => {
            const created = sessionManager.createSession('test-channel', 'user-123');
            const retrieved = sessionManager.getSession(created.id);
            
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe(created.id);
        });

        it('should return undefined for non-existent session', () => {
            const retrieved = sessionManager.getSession('non-existent');
            expect(retrieved).toBeUndefined();
        });
    });

    describe('getOrCreateSession', () => {
        it('should create session if not exists', () => {
            const session = sessionManager.getOrCreateSession('channel-1', 'user-1');
            
            expect(session).toBeDefined();
            expect(session.channelId).toBe('channel-1');
            expect(session.userId).toBe('user-1');
        });

        it('should return existing session for same channel+user', () => {
            const session1 = sessionManager.getOrCreateSession('channel-1', 'user-1');
            const session2 = sessionManager.getOrCreateSession('channel-1', 'user-1');
            
            expect(session1.id).toBe(session2.id);
        });

        it('should create different sessions for different users', () => {
            const session1 = sessionManager.getOrCreateSession('channel-1', 'user-1');
            const session2 = sessionManager.getOrCreateSession('channel-1', 'user-2');
            
            expect(session1.id).not.toBe(session2.id);
        });
    });

    describe('addMessage', () => {
        it('should add message to session', () => {
            const session = sessionManager.createSession('test-channel', 'user-123');
            
            sessionManager.addMessage(session.id, {
                role: 'user',
                content: 'Hello',
                timestamp: new Date(),
            });

            const updated = sessionManager.getSession(session.id);
            expect(updated?.messages.length).toBe(1);
            expect(updated?.messages[0].content).toBe('Hello');
        });

        it('should update lastActivity timestamp', () => {
            const session = sessionManager.createSession('test-channel', 'user-123');
            const originalTime = session.lastActivity;
            
            // Wait a bit
            setTimeout(() => {
                sessionManager.addMessage(session.id, {
                    role: 'user',
                    content: 'Hello',
                    timestamp: new Date(),
                });

                const updated = sessionManager.getSession(session.id);
                expect(updated?.lastActivity.getTime()).toBeGreaterThan(originalTime.getTime());
            }, 10);
        });
    });

    describe('listSessions', () => {
        it('should return all sessions', () => {
            sessionManager.createSession('channel-1', 'user-1');
            sessionManager.createSession('channel-2', 'user-2');
            sessionManager.createSession('channel-3', 'user-3');

            const sessions = sessionManager.listSessions();
            expect(sessions.length).toBe(3);
        });

        it('should return empty array when no sessions', () => {
            const sessions = sessionManager.listSessions();
            expect(sessions).toEqual([]);
        });
    });

    describe('deleteSession', () => {
        it('should delete existing session', () => {
            const session = sessionManager.createSession('test-channel', 'user-123');
            
            sessionManager.deleteSession(session.id);
            
            const retrieved = sessionManager.getSession(session.id);
            expect(retrieved).toBeUndefined();
        });

        it('should not throw when deleting non-existent session', () => {
            expect(() => {
                sessionManager.deleteSession('non-existent');
            }).not.toThrow();
        });
    });
});
