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

describe('Shell Tools Comprehensive', () => {
    let agentLoop: AgentLoop;
    let testDir: string;

    beforeAll(async () => {
        testDir = path.join(os.tmpdir(), `talon-shell-test-${Date.now()}`);
        fs.mkdirSync(testDir, { recursive: true });

        const config: TalonConfig = {
            workspace: { root: testDir },
            agent: { model: 'test', maxIterations: 5, subagentModel: 'test', providers: {} },
            tools: {
                files: { enabled: false, allowedPaths: [], deniedPaths: [], maxFileSize: 1048576 },
                shell: {
                    enabled: true,
                    defaultTimeout: 5000,
                    maxOutputSize: 10000,
                    blockedCommands: ['rm -rf /', 'sudo rm', 'format'],
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
        const memoryManager = new MemoryManager({ workspaceRoot: testDir, maxContextTokens: 6000, maxSummaryTokens: 800, keepRecentMessages: 10 });
        const memoryCompressor = new MemoryCompressor(modelRouter);
        agentLoop = new AgentLoop(modelRouter, memoryManager, memoryCompressor, eventBus, { maxIterations: 5 });
        registerAllTools(agentLoop, config);
    });

    afterAll(() => {
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    });

    describe('shell_execute', () => {
        it('should execute simple commands', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'echo "test"' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('test');
        });

        it('should respect working directory', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'pwd', cwd: testDir });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain(testDir);
        });

        it('should capture stdout', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'echo "stdout test"' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('stdout test');
        });

        it('should capture stderr', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'ls /nonexistent 2>&1' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('No such file');
        });

        it('should block dangerous commands', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'rm -rf /' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(false);
            expect(parsed.error?.message).toContain('rm -rf /');
        });

        it('should block destructive patterns', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'rm -rf *' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(false);
            expect(parsed.error?.message).toContain('Destructive');
        });

        it('should handle command not found', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'nonexistentcommand123' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            // Different shells have different error messages
            expect(parsed.data).toMatch(/not found|command not found/i);
        });

        it('should handle multiline output', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'echo "line1"; echo "line2"; echo "line3"' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('line1');
            expect(parsed.data).toContain('line2');
            expect(parsed.data).toContain('line3');
        });

        it('should handle exit codes', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'exit 42' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('Exit code: 42');
        });

        it('should handle pipes', async () => {
            const result = await agentLoop.executeTool('shell_execute', { command: 'echo "hello world" | grep world' });
            const parsed: NormalizedToolResult = JSON.parse(result);
            
            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('world');
        });
    });
});
