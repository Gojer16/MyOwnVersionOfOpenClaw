// ─── Memory Manager Tests ─────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager } from '@/memory/manager.js';
import type { Session } from '@/utils/types.js';

describe('MemoryManager', () => {
    let memoryManager: MemoryManager;
    let mockSession: Session;

    beforeEach(() => {
        memoryManager = new MemoryManager({
            workspaceRoot: '/tmp/test-workspace',
            maxContextTokens: 6000,
            maxSummaryTokens: 800,
            keepRecentMessages: 5,
            maxToolOutputTokens: 500,
        });

        mockSession = {
            id: 'test-session',
            channelId: 'test-channel',
            userId: 'test-user',
            messages: [],
            memorySummary: '',
            createdAt: new Date(),
            lastActivity: new Date(),
        };
    });

    describe('buildContext', () => {
        it('should include system prompt', () => {
            const context = memoryManager.buildContext(mockSession);
            expect(context[0].role).toBe('system');
            expect(context[0].content).toContain('Talon');
        });

        it('should include memory summary when present', () => {
            mockSession.memorySummary = 'User prefers TypeScript';
            const context = memoryManager.buildContext(mockSession);
            
            const summaryMsg = context.find(m => 
                m.role === 'system' && m.content?.includes('Memory Summary')
            );
            expect(summaryMsg).toBeDefined();
            expect(summaryMsg?.content).toContain('TypeScript');
        });

        it('should only include recent messages', () => {
            // Add 10 messages
            for (let i = 0; i < 10; i++) {
                mockSession.messages.push({
                    role: 'user',
                    content: `Message ${i}`,
                    timestamp: new Date(),
                });
            }

            const context = memoryManager.buildContext(mockSession);
            const userMessages = context.filter(m => m.role === 'user');
            
            // Should only keep last 5
            expect(userMessages.length).toBeLessThanOrEqual(5);
        });

        it('should handle tool messages correctly', () => {
            mockSession.messages.push(
                {
                    role: 'assistant',
                    content: '',
                    timestamp: new Date(),
                    toolCalls: [{
                        id: 'call_123',
                        tool: 'file_read',
                        args: { path: '/test.txt' },
                    }],
                },
                {
                    role: 'tool',
                    content: 'File content here',
                    timestamp: new Date(),
                    toolResults: [{
                        tool: 'file_read',
                        result: 'File content here',
                        metadata: { confirmation: 'call_123' },
                    }],
                }
            );

            const context = memoryManager.buildContext(mockSession);
            const toolMsg = context.find(m => m.role === 'tool');
            
            expect(toolMsg).toBeDefined();
            expect(toolMsg?.tool_call_id).toBe('call_123');
        });
    });

    describe('needsCompression', () => {
        it('should return false for short conversations', () => {
            mockSession.messages = [
                { role: 'user', content: 'Hello', timestamp: new Date() },
                { role: 'assistant', content: 'Hi', timestamp: new Date() },
            ];

            expect(memoryManager.needsCompression(mockSession)).toBe(false);
        });

        it('should return true for long conversations', () => {
            // Add 20 messages (threshold is 10)
            for (let i = 0; i < 20; i++) {
                mockSession.messages.push({
                    role: 'user',
                    content: `Message ${i}`,
                    timestamp: new Date(),
                });
            }

            expect(memoryManager.needsCompression(mockSession)).toBe(true);
        });
    });

    describe('applyCompression', () => {
        it('should keep recent messages and update summary', () => {
            // Add 15 messages
            for (let i = 0; i < 15; i++) {
                mockSession.messages.push({
                    role: 'user',
                    content: `Message ${i}`,
                    timestamp: new Date(),
                });
            }

            const newSummary = 'Compressed summary of conversation';
            memoryManager.applyCompression(mockSession, newSummary);

            // Should keep last 5 messages
            expect(mockSession.messages.length).toBe(5);
            expect(mockSession.memorySummary).toBe(newSummary);
        });
    });
});
