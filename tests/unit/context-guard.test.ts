// ─── Context Guard Tests ──────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { ContextGuard } from '@/agent/context-guard.js';

describe('ContextGuard', () => {
    describe('estimateTokens', () => {
        it('should estimate tokens for simple text', () => {
            const text = 'Hello world';
            const tokens = ContextGuard.estimateTokens(text);
            
            // ~4 chars per token
            expect(tokens).toBeGreaterThan(0);
            expect(tokens).toBeLessThan(10);
        });

        it('should estimate more tokens for longer text', () => {
            const shortText = 'Hello';
            const longText = 'Hello world this is a much longer text with many more words';
            
            const shortTokens = ContextGuard.estimateTokens(shortText);
            const longTokens = ContextGuard.estimateTokens(longText);
            
            expect(longTokens).toBeGreaterThan(shortTokens);
        });

        it('should handle empty string', () => {
            const tokens = ContextGuard.estimateTokens('');
            expect(tokens).toBe(0);
        });
    });

    describe('truncateToTokens', () => {
        it('should not truncate text within limit', () => {
            const text = 'Hello world';
            const truncated = ContextGuard.truncateToTokens(text, 100);
            
            expect(truncated).toBe(text);
        });

        it('should truncate text exceeding limit', () => {
            const text = 'A'.repeat(1000);
            const truncated = ContextGuard.truncateToTokens(text, 10);
            
            expect(truncated.length).toBeLessThan(text.length);
            expect(truncated).toContain('(truncated)');
        });

        it('should handle empty string', () => {
            const truncated = ContextGuard.truncateToTokens('', 100);
            expect(truncated).toBe('');
        });
    });

    describe('isWithinLimit', () => {
        it('should return true for text within limit', () => {
            const text = 'Hello world';
            const result = ContextGuard.isWithinLimit(text, 1000);
            
            expect(result).toBe(true);
        });

        it('should return false for text exceeding limit', () => {
            const text = 'A'.repeat(10000);
            const result = ContextGuard.isWithinLimit(text, 100);
            
            expect(result).toBe(false);
        });
    });
});
