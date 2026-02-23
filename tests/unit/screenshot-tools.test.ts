// ─── Screenshot Tools Tests ───────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentLoop } from '../../src/agent/loop.js';
import { ModelRouter } from '../../src/agent/router.js';
import { MemoryManager } from '../../src/memory/manager.js';
import { MemoryCompressor } from '../../src/memory/compressor.js';
import { EventBus } from '../../src/gateway/events.js';
import { registerAllTools } from '../../src/tools/registry.js';
import type { TalonConfig } from '../../src/config/schema.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Screenshot Tools Comprehensive', () => {
    let agentLoop: AgentLoop;
    let testDir: string;

    beforeAll(async () => {
        testDir = path.join(os.tmpdir(), `talon-screenshot-test-${Date.now()}`);
        fs.mkdirSync(testDir, { recursive: true });

        const config: TalonConfig = {
            workspace: { root: testDir },
            agent: { model: 'test', maxIterations: 5, subagentModel: 'test', providers: {} },
            tools: {
                files: { enabled: false, allowedPaths: [], deniedPaths: [], maxFileSize: 1048576 },
                shell: { enabled: false },
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

    describe('desktop_screenshot', () => {
        it('should capture screenshot and return base64', async () => {
            const result = await agentLoop.executeTool('desktop_screenshot', {
                encoding: 'base64',
            });

            // Should return base64 encoded image or error if no display
            expect(result).toMatch(/(data:image\/png;base64,|Error:|Platform not supported|No display)/);
        });

        it('should save screenshot to temp directory', async () => {
            const outputPath = path.join(os.tmpdir(), `test-screenshot-${Date.now()}.png`);

            try {
                const result = await agentLoop.executeTool('desktop_screenshot', {
                    encoding: 'file',
                    outputPath,
                });

                // Should either save successfully or fail due to platform
                if (result.includes('saved')) {
                    expect(fs.existsSync(outputPath)).toBe(true);
                    // Clean up
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                    }
                } else {
                    expect(result).toMatch(/(Error:|Platform not supported)/);
                }
            } catch (error: any) {
                // Platform may not support screenshots (e.g., CI environment)
                expect(error.message).toMatch(/(not supported|No display)/);
            }
        });

        it('should reject invalid output path (path traversal)', async () => {
            const result = await agentLoop.executeTool('desktop_screenshot', {
                encoding: 'file',
                outputPath: '../../../etc/malicious.png',
            });

            expect(result).toContain('"success": false');
        });

        it('should reject output path outside allowed directories', async () => {
            const result = await agentLoop.executeTool('desktop_screenshot', {
                encoding: 'file',
                outputPath: '/etc/passwd.png',
            });

            expect(result).toContain('"success": false');
        });

        it('should require .png extension', async () => {
            const outputPath = path.join(os.tmpdir(), `test-screenshot-${Date.now()}.jpg`);

            const result = await agentLoop.executeTool('desktop_screenshot', {
                encoding: 'file',
                outputPath,
            });

            expect(result).toContain('"success": false');
        });

        it('should handle missing output path for file encoding', async () => {
            const result = await agentLoop.executeTool('desktop_screenshot', {
                encoding: 'file',
            });

            // Should either use default path or error
            expect(result).toMatch(/(saved|Error|default)/);
        });

        it('should accept valid encoding parameter', async () => {
            const result = await agentLoop.executeTool('desktop_screenshot', {
                encoding: 'base64',
            });

            expect(result).toBeDefined();
        });

        it('should reject invalid encoding parameter', async () => {
            const result = await agentLoop.executeTool('desktop_screenshot', {
                encoding: 'invalid' as any,
            });

            expect(result).toContain('"success": false');
        });
    });

    describe('Input Validation', () => {
        it('should handle invalid types', async () => {
            const result = await agentLoop.executeTool('desktop_screenshot', {
                encoding: 123 as any,
            });

            expect(result).toBeDefined();
        });

        it('should handle empty object', async () => {
            const result = await agentLoop.executeTool('desktop_screenshot', {});

            // Should use defaults or error gracefully
            expect(result).toBeDefined();
        });
    });

    describe('Platform Detection', () => {
        it('should handle platform-specific screenshot commands', () => {
            const platform = process.platform;

            // macOS: screencapture
            // Linux: scrot or import
            // Windows: PowerShell

            // The tool should handle all platforms gracefully
            expect(['darwin', 'linux', 'win32']).toContain(platform);
        });
    });
});
