import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeToolExecution, type NormalizedToolResult } from '../../src/tools/normalize.js';

describe('Tool Normalization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Success Cases', () => {
        it('should wrap successful string output in JSON', async () => {
            const mockExecute = vi.fn().mockResolvedValue('File content here');
            
            const result = await normalizeToolExecution('file_read', mockExecute, { path: '/test' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toBe('File content here');
            expect(parsed.error).toBeNull();
            expect(parsed.meta.duration_ms).toBeGreaterThanOrEqual(0);
            expect(parsed.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });

        it('should handle empty string output', async () => {
            const mockExecute = vi.fn().mockResolvedValue('');
            
            const result = await normalizeToolExecution('shell_execute', mockExecute, { command: 'true' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toBe('');
        });

        it('should handle multiline output', async () => {
            const mockExecute = vi.fn().mockResolvedValue('line1\nline2\nline3');
            
            const result = await normalizeToolExecution('file_read', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toBe('line1\nline2\nline3');
        });

        it('should handle JSON-like strings in output', async () => {
            const mockExecute = vi.fn().mockResolvedValue('{"key": "value"}');
            
            const result = await normalizeToolExecution('web_fetch', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toBe('{"key": "value"}');
        });
    });

    describe('Error Cases', () => {
        it('should detect "Error:" prefix and mark as failure', async () => {
            const mockExecute = vi.fn().mockResolvedValue('Error: File not found');
            
            const result = await normalizeToolExecution('file_read', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(false);
            expect(parsed.data).toBeNull();
            expect(parsed.error?.code).toBe('EXECUTION_ERROR');
            expect(parsed.error?.message).toBe('File not found');
        });

        it('should detect blocked commands', async () => {
            const mockExecute = vi.fn().mockResolvedValue('⚠️ BLOCKED: Command contains rm -rf');
            
            const result = await normalizeToolExecution('shell_execute', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(false);
            expect(parsed.error?.code).toBe('BLOCKED');
            expect(parsed.error?.message).toContain('Command contains rm -rf');
        });

        it('should catch thrown exceptions', async () => {
            const mockExecute = vi.fn().mockRejectedValue(new Error('Network timeout'));
            
            const result = await normalizeToolExecution('web_search', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(false);
            expect(parsed.error?.code).toBe('EXCEPTION');
            expect(parsed.error?.message).toBe('Network timeout');
        });

        it('should handle non-Error exceptions', async () => {
            const mockExecute = vi.fn().mockRejectedValue('String error');
            
            const result = await normalizeToolExecution('browser_navigate', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(false);
            expect(parsed.error?.code).toBe('EXCEPTION');
            expect(parsed.error?.message).toBe('String error');
        });
    });

    describe('Metadata', () => {
        it('should track execution duration', async () => {
            const mockExecute = vi.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return 'done';
            });
            
            const result = await normalizeToolExecution('test_tool', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.meta.duration_ms).toBeGreaterThanOrEqual(50);
            expect(parsed.meta.duration_ms).toBeLessThan(200);
        });

        it('should include timestamp in ISO format', async () => {
            const mockExecute = vi.fn().mockResolvedValue('test');
            
            const result = await normalizeToolExecution('test_tool', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            const timestamp = new Date(parsed.meta.timestamp);
            expect(timestamp.toISOString()).toBe(parsed.meta.timestamp);
        });

        it('should track duration even on error', async () => {
            const mockExecute = vi.fn().mockRejectedValue(new Error('fail'));
            
            const result = await normalizeToolExecution('test_tool', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.meta.duration_ms).toBeGreaterThanOrEqual(0);
        });
    });

    describe('JSON Validity', () => {
        it('should always return valid JSON', async () => {
            const mockExecute = vi.fn().mockResolvedValue('test\nwith\nspecial"chars\'and\\backslash');
            
            const result = await normalizeToolExecution('test_tool', mockExecute, {});
            
            expect(() => JSON.parse(result)).not.toThrow();
        });

        it('should handle unicode in output', async () => {
            const mockExecute = vi.fn().mockResolvedValue('Hello 世界 🌍');
            
            const result = await normalizeToolExecution('test_tool', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.data).toBe('Hello 世界 🌍');
        });

        it('should handle very long output', async () => {
            const longString = 'x'.repeat(100000);
            const mockExecute = vi.fn().mockResolvedValue(longString);
            
            const result = await normalizeToolExecution('test_tool', mockExecute, {});
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.data).toBe(longString);
        });
    });

    describe('Tool Arguments', () => {
        it('should pass arguments to tool execute function', async () => {
            const mockExecute = vi.fn().mockResolvedValue('ok');
            const args = { path: '/test', startLine: 10, endLine: 20 };
            
            await normalizeToolExecution('file_read', mockExecute, args);
            
            expect(mockExecute).toHaveBeenCalledWith(args);
            expect(mockExecute).toHaveBeenCalledTimes(1);
        });

        it('should handle empty arguments', async () => {
            const mockExecute = vi.fn().mockResolvedValue('ok');
            
            await normalizeToolExecution('test_tool', mockExecute, {});
            
            expect(mockExecute).toHaveBeenCalledWith({});
        });
    });
});
