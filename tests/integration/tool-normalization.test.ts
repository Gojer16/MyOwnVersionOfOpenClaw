import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentLoop } from '../../src/agent/loop.js';
import { ModelRouter } from '../../src/agent/router.js';
import { MemoryManager } from '../../src/memory/manager.js';
import { MemoryCompressor } from '../../src/memory/compressor.js';
import { EventBus } from '../../src/gateway/events.js';
import { registerAllTools } from '../../src/tools/registry.js';
import type { TalonConfig } from '../../src/config/schema.js';
import type { NormalizedToolResult } from '../../src/tools/normalize.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Tool Normalization Integration', () => {
    let agentLoop: AgentLoop;
    let testDir: string;

    beforeAll(async () => {
        // Create test directory
        testDir = path.join(os.tmpdir(), `talon-test-${Date.now()}`);
        fs.mkdirSync(testDir, { recursive: true });

        // Minimal config
        const config: TalonConfig = {
            workspace: { root: testDir },
            agent: { 
                model: 'test', 
                maxIterations: 5, 
                subagentModel: 'test',
                providers: {}
            },
            tools: {
                files: {
                    enabled: true,
                    allowedPaths: [testDir],
                    deniedPaths: [],
                    maxFileSize: 1048576,
                },
                shell: {
                    enabled: true,
                    defaultTimeout: 5000,
                    maxOutputSize: 10000,
                    blockedCommands: ['rm -rf /'],
                    confirmDestructive: true,
                },
                browser: { enabled: false },
            },
            memory: { compaction: { enabled: false, keepRecentMessages: 10 } },
            channels: { cli: { enabled: true }, telegram: { enabled: false }, whatsapp: { enabled: false } },
            gateway: { host: '127.0.0.1', port: 19789, token: null },
            hooks: { bootMd: { enabled: false } },
            shadow: { enabled: false, watchPaths: [], ignorePatterns: [] },
        } as TalonConfig;

        const eventBus = new EventBus();
        const modelRouter = new ModelRouter(config);
        const memoryManager = new MemoryManager({
            workspaceRoot: testDir,
            maxContextTokens: 6000,
            maxSummaryTokens: 800,
            keepRecentMessages: 10,
        });
        const memoryCompressor = new MemoryCompressor(modelRouter);

        agentLoop = new AgentLoop(modelRouter, memoryManager, memoryCompressor, eventBus, { maxIterations: 5 });
        registerAllTools(agentLoop, config);
    });

    afterAll(() => {
        // Cleanup
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('File Tools', () => {
        it('file_read should return normalized JSON on success', async () => {
            const testFile = path.join(testDir, 'test.txt');
            fs.writeFileSync(testFile, 'Hello World');

            const result = await agentLoop.executeTool('file_read', { path: testFile });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('Hello World');
            expect(parsed.error).toBeNull();
            expect(parsed.meta.duration_ms).toBeGreaterThanOrEqual(0);
        });

        it('file_read should return normalized JSON on error', async () => {
            const result = await agentLoop.executeTool('file_read', { path: '/nonexistent/file.txt' });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(false);
            expect(parsed.data).toBeNull();
            expect(parsed.error?.code).toBe('EXECUTION_ERROR');
            expect(parsed.error?.message).toContain('Access denied');
        });

        it('file_write should return normalized JSON', async () => {
            const testFile = path.join(testDir, 'write-test.txt');
            const result = await agentLoop.executeTool('file_write', {
                path: testFile,
                content: 'Test content',
            });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(fs.existsSync(testFile)).toBe(true);
        });

        it('file_list should return normalized JSON', async () => {
            const result = await agentLoop.executeTool('file_list', { path: testDir });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(typeof parsed.data).toBe('string');
        });
    });

    describe('Shell Tools', () => {
        it('shell_execute should return normalized JSON on success', async () => {
            const result = await agentLoop.executeTool('shell_execute', {
                command: 'echo "test"',
                cwd: testDir,
            });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('test');
        });

        it('shell_execute should block dangerous commands', async () => {
            const result = await agentLoop.executeTool('shell_execute', {
                command: 'rm -rf /',
            });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(false);
            // Could be BLOCKED or EXECUTION_ERROR depending on config
            expect(parsed.error?.code).toMatch(/BLOCKED|EXECUTION_ERROR/);
            expect(parsed.error?.message).toContain('rm -rf');
        });

        it('shell_execute should handle command errors', async () => {
            const result = await agentLoop.executeTool('shell_execute', {
                command: 'nonexistent-command-xyz',
            });
            const parsed: NormalizedToolResult = JSON.parse(result);

            // Should still be valid JSON even if command fails
            expect(parsed).toHaveProperty('success');
            expect(parsed).toHaveProperty('meta');
        });
    });

    describe('Memory Tools', () => {
        it('memory_read should return normalized JSON', async () => {
            // First write a memory file directly to workspace
            const memFile = path.join(testDir, 'MEMORY.md');
            fs.writeFileSync(memFile, '# Test Memory\nContent here');

            const result = await agentLoop.executeTool('memory_read', {});
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('Test Memory');
        });

        it('memory_read should handle missing files', async () => {
            const result = await agentLoop.executeTool('memory_read', {
                path: 'NONEXISTENT.md',
            });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('empty or does not exist');
        });
    });

    describe('Productivity Tools', () => {
        it('notes_save should return normalized JSON', async () => {
            const result = await agentLoop.executeTool('notes_save', {
                title: 'Test Note',
                content: 'Note content',
                tags: ['test'],
            });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(true);
        });

        it('tasks_add should return normalized JSON', async () => {
            const result = await agentLoop.executeTool('tasks_add', {
                title: 'Test Task',
                description: 'Task description',
                priority: 'medium',
            });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(true);
        });

        it('tasks_list should return normalized JSON', async () => {
            const result = await agentLoop.executeTool('tasks_list', { status: 'all' });
            const parsed: NormalizedToolResult = JSON.parse(result);

            expect(parsed.success).toBe(true);
        });
    });

    describe('Screenshot Tool', () => {
        it('desktop_screenshot should return normalized JSON', async () => {
            const result = await agentLoop.executeTool('desktop_screenshot', {});
            const parsed: NormalizedToolResult = JSON.parse(result);

            // May succeed or fail depending on environment, but should be normalized
            expect(parsed).toHaveProperty('success');
            expect(parsed).toHaveProperty('meta');
            expect(parsed.meta.duration_ms).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Error Handling', () => {
        it('should handle tool not found', async () => {
            await expect(
                agentLoop.executeTool('nonexistent_tool', {})
            ).rejects.toThrow('Tool not found');
        });

        it('should normalize all tool errors consistently', async () => {
            const tools = ['file_read', 'file_write', 'shell_execute'];
            
            for (const toolName of tools) {
                const result = await agentLoop.executeTool(toolName, { invalid: 'args' });
                const parsed: NormalizedToolResult = JSON.parse(result);

                expect(parsed).toHaveProperty('success');
                expect(parsed).toHaveProperty('data');
                expect(parsed).toHaveProperty('error');
                expect(parsed).toHaveProperty('meta');
                expect(parsed.meta).toHaveProperty('duration_ms');
                expect(parsed.meta).toHaveProperty('timestamp');
            }
        });
    });

    describe('JSON Consistency', () => {
        it('all tools should return parseable JSON', async () => {
            const testCases = [
                { tool: 'file_read', args: { path: path.join(testDir, 'test.txt') } },
                { tool: 'file_list', args: { path: testDir } },
                { tool: 'shell_execute', args: { command: 'pwd' } },
                { tool: 'tasks_list', args: { status: 'all' } },
            ];

            for (const { tool, args } of testCases) {
                const result = await agentLoop.executeTool(tool, args);
                expect(() => JSON.parse(result)).not.toThrow();
                
                const parsed: NormalizedToolResult = JSON.parse(result);
                expect(typeof parsed.success).toBe('boolean');
                expect(parsed.meta).toBeDefined();
            }
        });
    });
});
