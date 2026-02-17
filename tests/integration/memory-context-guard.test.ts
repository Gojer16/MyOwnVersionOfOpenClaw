// ─── Memory + Context Guard Integration Tests ────────────────────────
// Tests memory compression triggered by context window limits

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryManager } from '@/memory/manager.js';
import { MemoryCompressor } from '@/memory/compressor.js';
import { evaluateContextWindow, truncateMessagesToFit } from '@/agent/context-guard.js';
import { createMockSession, createMockMessage } from './setup.js';
import type { LLMResponse } from '@/agent/providers/openai-compatible.js';

describe('Memory + Context Guard Integration', () => {
    let memoryManager: MemoryManager;
    let memoryCompressor: MemoryCompressor;

    beforeEach(() => {
        memoryManager = new MemoryManager({
            workspaceRoot: '/tmp/test-workspace',
            maxContextTokens: 6000,
            maxSummaryTokens: 800,
            keepRecentMessages: 5,
            maxToolOutputTokens: 500,
        });
        
        memoryCompressor = new MemoryCompressor({
            model: 'deepseek-chat',
            chat: vi.fn().mockResolvedValue({
                content: 'Summary of the old conversation.',
                finishReason: 'stop',
                usage: { input: 100, output: 50 },
            } as LLMResponse),
        });
    });

    describe('Context Window Evaluation', () => {
        it('should evaluate context window with messages', () => {
            const session = createMockSession();
            
            // Add many messages to fill context
            for (let i = 0; i < 50; i++) {
                session.messages.push(createMockMessage('user', `Message ${i}: Lorem ipsum dolor sit amet consectetur adipiscing elit.`.repeat(10)));
            }

            const context = memoryManager.buildContext(session);
            
            const status = evaluateContextWindow({
                modelId: 'deepseek-chat', // 64k context
                messages: context,
            });

            // Should show high usage
            expect(status.contextWindow).toBe(64_000);
            expect(status.usagePercent).toBeGreaterThan(0);
        });

        it('should trigger compression when threshold exceeded', () => {
            const session = createMockSession();
            
            // Add more messages than keepRecentMessages
            for (let i = 0; i < 20; i++) {
                session.messages.push(createMockMessage('user', `Message ${i}`));
                session.messages.push(createMockMessage('assistant', `Response ${i}`));
            }

            // Should need compression
            expect(memoryManager.needsCompression(session)).toBe(true);
        });

        it('should not trigger compression for short sessions', () => {
            const session = createMockSession();
            
            // Add just a few messages
            session.messages.push(createMockMessage('user', 'Hello'));
            session.messages.push(createMockMessage('assistant', 'Hi there'));

            expect(memoryManager.needsCompression(session)).toBe(false);
        });
    });

    describe('Truncation', () => {
        it('should truncate messages to fit token budget', () => {
            const messages = [];
            for (let i = 0; i < 100; i++) {
                messages.push(createMockMessage('user', `This is message number ${i} with some content`.repeat(5)));
            }

            const truncated = truncateMessagesToFit(messages, 100);
            
            // Should have fewer messages than original
            expect(truncated.length).toBeLessThan(messages.length);
        });

        it('should keep system messages during truncation', () => {
            const messages = [
                { role: 'system', content: 'You are Talon, a helpful AI assistant.' },
                ...Array(50).fill(null).map((_, i) => createMockMessage('user', `Message ${i}`)),
            ];

            const truncated = truncateMessagesToFit(messages, 50);
            
            // Should keep the system message
            expect(truncated.some(m => m.role === 'system')).toBe(true);
        });
    });

    describe('Memory Compression Flow', () => {
        it('should compress old messages and keep recent', async () => {
            const session = createMockSession();
            
            // Add many messages
            for (let i = 0; i < 15; i++) {
                session.messages.push(createMockMessage('user', `User message ${i}`));
                session.messages.push(createMockMessage('assistant', `Assistant response ${i}`));
            }

            const messageCountBefore = session.messages.length;

            // Apply compression
            const newSummary = 'User discussed various topics about testing and development.';
            memoryManager.applyCompression(session, newSummary);

            // Should have fewer messages now
            expect(session.messages.length).toBeLessThan(messageCountBefore);
            // Recent messages should be kept
            expect(session.messages.length).toBe(5);
            // Summary should be updated
            expect(session.memorySummary).toBe(newSummary);
        });

        it('should build context with memory summary', () => {
            const session = createMockSession();
            session.memorySummary = 'User prefers TypeScript and likes testing.';
            
            session.messages.push(createMockMessage('user', 'Hello'));
            session.messages.push(createMockMessage('assistant', 'Hi!'));

            const context = memoryManager.buildContext(session);
            
            // Context should include the summary
            const summaryContent = context.map(m => m.content).join(' ');
            expect(summaryContent).toContain('TypeScript');
            expect(summaryContent).toContain('testing');
        });
    });

    describe('Full Flow: Detect, Compress, Rebuild', () => {
        it('should handle full compression cycle', async () => {
            const session = createMockSession();
            
            // Phase 1: Add many messages
            for (let i = 0; i < 20; i++) {
                session.messages.push(createMockMessage('user', `Question ${i}: How do I test ${i}?`));
                session.messages.push(createMockMessage('assistant', `Answer ${i}: Here's how to test ${i}.`));
            }

            // Phase 2: Check if compression is needed
            const needsCompression = memoryManager.needsCompression(session);
            expect(needsCompression).toBe(true);

            // Phase 3: Get messages for compression
            const messagesToCompress = memoryManager.getMessagesForCompression
                ? memoryManager.getMessagesForCompression(session)
                : [];
            
            // Phase 4: Apply compression
            const summary = 'User asked many questions about testing various topics.';
            memoryManager.applyCompression(session, summary);

            // Phase 5: Verify new context includes summary
            const newContext = memoryManager.buildContext(session);
            const newContextText = newContext.map(m => m.content).join(' ');
            
            expect(newContextText).toContain('testing');
            expect(session.messages.length).toBeLessThan(20);
        });
    });
});
