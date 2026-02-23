// ─── Scratchpad Tools Tests ───────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AgentLoop } from '../../src/agent/loop.js';
import { ModelRouter } from '../../src/agent/router.js';
import { MemoryManager } from '../../src/memory/manager.js';
import { MemoryCompressor } from '../../src/memory/compressor.js';
import { EventBus } from '../../src/gateway/events.js';
import { registerAllTools } from '../../src/tools/registry.js';
import type { TalonConfig } from '../../src/config/schema.js';
import type { Session } from '../../src/gateway/sessions.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Scratchpad Tools Comprehensive', () => {
    let agentLoop: AgentLoop;
    let testDir: string;
    let mockSession: Session;

    beforeAll(async () => {
        testDir = path.join(os.tmpdir(), `talon-scratchpad-test-${Date.now()}`);
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

        // Create mock session
        mockSession = {
            id: 'test-session',
            channel: 'cli',
            senderId: 'test-user',
            senderName: 'Test User',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            scratchpad: undefined,
        } as Session;
    });

    afterAll(() => {
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    });

    beforeEach(() => {
        // Reset session scratchpad before each test
        mockSession.scratchpad = undefined;
    });

    describe('scratchpad_update - add_visited', () => {
        it('should add item to visited list', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_visited',
                value: 'item1',
            }, mockSession);

            expect(result).toContain('Added "item1" to visited');
            expect(mockSession.scratchpad?.visited).toContain('item1');
        });

        it('should not add duplicate visited items', async () => {
            await agentLoop.executeTool('scratchpad_update', {
                action: 'add_visited',
                value: 'duplicate',
            }, mockSession);

            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_visited',
                value: 'duplicate',
            }, mockSession);

            expect(mockSession.scratchpad?.visited).toHaveLength(1);
            expect(result).toContain('Total visited: 1');
        });

        it('should reject missing value', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_visited',
            }, mockSession);

            expect(result).toContain('"success": false');
        });

        it('should reject empty value', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_visited',
                value: '',
            }, mockSession);

            expect(result).toContain('"success": false');
        });
    });

    describe('scratchpad_update - add_collected', () => {
        it('should add data to collected list', async () => {
            const testData = { key: 'value', number: 42 };
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_collected',
                data: testData,
            }, mockSession);

            expect(result).toContain('Added item to collected');
            expect(mockSession.scratchpad?.collected).toContainEqual(testData);
        });

        it('should reject missing data', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_collected',
            }, mockSession);

            expect(result).toContain('"success": false');
        });
    });

    describe('scratchpad_update - add_pending', () => {
        it('should add item to pending list', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_pending',
                value: 'pending-task',
            }, mockSession);

            expect(result).toContain('Added "pending-task" to pending');
            expect(mockSession.scratchpad?.pending).toContain('pending-task');
        });

        it('should not add duplicate pending items', async () => {
            await agentLoop.executeTool('scratchpad_update', {
                action: 'add_pending',
                value: 'same-task',
            }, mockSession);

            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_pending',
                value: 'same-task',
            }, mockSession);

            expect(mockSession.scratchpad?.pending).toHaveLength(1);
        });

        it('should reject missing value', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_pending',
            }, mockSession);

            expect(result).toContain('"success": false');
        });
    });

    describe('scratchpad_update - remove_pending', () => {
        beforeEach(async () => {
            mockSession.scratchpad = {
                visited: [],
                collected: [],
                pending: ['task1', 'task2', 'task3'],
                progress: {},
            };
        });

        it('should remove item from pending list', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'remove_pending',
                value: 'task2',
            }, mockSession);

            expect(result).toContain('Removed "task2" from pending');
            expect(mockSession.scratchpad?.pending).not.toContain('task2');
            expect(mockSession.scratchpad?.pending).toHaveLength(2);
        });

        it('should handle non-existent item', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'remove_pending',
                value: 'nonexistent',
            }, mockSession);

            expect(result).toContain('not found');
        });

        it('should reject missing value', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'remove_pending',
            }, mockSession);

            expect(result).toContain('"success": false');
        });
    });

    describe('scratchpad_update - set_progress', () => {
        it('should set progress state', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'set_progress',
                data: { step: 1, total: 10 },
            }, mockSession);

            expect(result).toContain('Updated progress state');
            expect(mockSession.scratchpad?.progress).toEqual({ step: 1, total: 10 });
        });

        it('should merge with existing progress', async () => {
            mockSession.scratchpad = {
                visited: [],
                collected: [],
                pending: [],
                progress: { existing: 'value' },
            };

            await agentLoop.executeTool('scratchpad_update', {
                action: 'set_progress',
                data: { newKey: 'newValue' },
            }, mockSession);

            expect(mockSession.scratchpad?.progress).toEqual({
                existing: 'value',
                newKey: 'newValue',
            });
        });

        it('should reject missing data', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'set_progress',
            }, mockSession);

            expect(result).toContain('"success": false');
        });
    });

    describe('scratchpad_update - clear', () => {
        beforeEach(async () => {
            mockSession.scratchpad = {
                visited: ['item1', 'item2'],
                collected: [{ data: 'test' }],
                pending: ['task1'],
                progress: { step: 5 },
            };
        });

        it('should clear all scratchpad data', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'clear',
            }, mockSession);

            expect(result).toContain('Scratchpad cleared');
            expect(mockSession.scratchpad?.visited).toEqual([]);
            expect(mockSession.scratchpad?.collected).toEqual([]);
            expect(mockSession.scratchpad?.pending).toEqual([]);
            expect(mockSession.scratchpad?.progress).toEqual({});
        });
    });

    describe('Input Validation', () => {
        it('should reject invalid action', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'invalid_action',
            }, mockSession);

            expect(result).toContain('"success": false');
        });

        it('should reject missing action', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {}, mockSession);

            expect(result).toContain('"success": false');
        });

        it('should reject invalid action type', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 123 as any,
            }, mockSession);

            expect(result).toContain('"success": false');
        });

        it('should reject invalid data type', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'set_progress',
                data: 'not-an-object' as any,
            }, mockSession);

            expect(result).toContain('"success": false');
        });

        it('should reject invalid value type', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'add_visited',
                value: 123 as any,
            }, mockSession);

            expect(result).toContain('"success": false');
        });
    });

    describe('Session Requirement', () => {
        it('should reject execution without session', async () => {
            const result = await agentLoop.executeTool('scratchpad_update', {
                action: 'clear',
            });

            expect(result).toContain('Session context required');
        });
    });

    describe('Auto-initialization', () => {
        it('should initialize scratchpad if not exists', async () => {
            expect(mockSession.scratchpad).toBeUndefined();

            await agentLoop.executeTool('scratchpad_update', {
                action: 'add_visited',
                value: 'first-item',
            }, mockSession);

            expect(mockSession.scratchpad).toBeDefined();
            expect(mockSession.scratchpad?.visited).toContain('first-item');
        });
    });
});
