// ─── Tasks Tools Tests ───────────────────────────────────────────
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

describe('Tasks Tools Comprehensive', () => {
    let agentLoop: AgentLoop;
    let testDir: string;
    let tasksPath: string;

    beforeAll(async () => {
        testDir = path.join(os.tmpdir(), `talon-tasks-test-${Date.now()}`);
        tasksPath = path.join(testDir, 'tasks.json');
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

    describe('tasks_add', () => {
        beforeEach(() => {
            // Clear tasks before each test
            if (fs.existsSync(tasksPath)) {
                fs.writeFileSync(tasksPath, JSON.stringify({ tasks: [] }));
            }
        });

        it('should add a task with title', async () => {
            const result = await agentLoop.executeTool('tasks_add', {
                title: 'Test Task',
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.data).toContain('Test Task');

            const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
            expect(tasks.tasks).toHaveLength(1);
            expect(tasks.tasks[0].title).toBe('Test Task');
            expect(tasks.tasks[0].status).toBe('pending');
            expect(tasks.tasks[0].priority).toBe('medium');
        });

        it('should add a task with description', async () => {
            const result = await agentLoop.executeTool('tasks_add', {
                title: 'Task with Desc',
                description: 'This is a description',
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);

            const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
            expect(tasks.tasks[0].description).toBe('This is a description');
        });

        it('should add a task with priority', async () => {
            const result = await agentLoop.executeTool('tasks_add', {
                title: 'High Priority Task',
                priority: 'high',
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);

            const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
            expect(tasks.tasks[0].priority).toBe('high');
        });

        it('should default to medium priority', async () => {
            await agentLoop.executeTool('tasks_add', {
                title: 'Default Priority',
            });

            const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
            const defaultPriorityTask = tasks.tasks.find((t: any) => t.title === 'Default Priority');
            expect(defaultPriorityTask.priority).toBe('medium');
        });

        it('should reject empty title', async () => {
            const result = await agentLoop.executeTool('tasks_add', {
                title: '',
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
        });

        it('should reject missing title', async () => {
            const result = await agentLoop.executeTool('tasks_add', {});

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
        });

        it('should reject invalid priority', async () => {
            const result = await agentLoop.executeTool('tasks_add', {
                title: 'Task',
                priority: 'invalid' as any,
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
        });

        it('should generate unique IDs', async () => {
            await agentLoop.executeTool('tasks_add', { title: 'Task 1' });
            await agentLoop.executeTool('tasks_add', { title: 'Task 2' });

            const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
            const ids = tasks.tasks.map((t: any) => t.id);
            expect(new Set(ids).size).toBe(ids.length); // All IDs unique
        });
    });

    describe('tasks_list', () => {
        beforeEach(async () => {
            // Clear tasks and add test data
            fs.writeFileSync(tasksPath, JSON.stringify({ tasks: [] }));

            await agentLoop.executeTool('tasks_add', { title: 'Pending Task 1', priority: 'high' });
            await agentLoop.executeTool('tasks_add', { title: 'Pending Task 2' });
            await agentLoop.executeTool('tasks_complete', { id: JSON.parse(fs.readFileSync(tasksPath, 'utf-8')).tasks[0].id });
        });

        it('should list all tasks', async () => {
            const result = await agentLoop.executeTool('tasks_list', { status: 'all' });

            expect(result).toContain('Pending Task 1');
            expect(result).toContain('Pending Task 2');
            expect(result).toContain('completed');
        });

        it('should list only pending tasks', async () => {
            const result = await agentLoop.executeTool('tasks_list', { status: 'pending' });

            expect(result).toContain('Pending Task 2');
            expect(result).not.toContain('completed');
        });

        it('should list only completed tasks', async () => {
            const result = await agentLoop.executeTool('tasks_list', { status: 'completed' });

            expect(result).toContain('Pending Task 1');
            expect(result).toContain('completed');
        });

        it('should default to all status', async () => {
            const result = await agentLoop.executeTool('tasks_list', {});

            expect(result).toContain('Pending Task 1');
            expect(result).toContain('Pending Task 2');
        });

        it('should show task count', async () => {
            const result = await agentLoop.executeTool('tasks_list', { status: 'all' });

            expect(result).toMatch(/Total: \d+ task/);
        });

        it('should handle empty task list', async () => {
            fs.writeFileSync(tasksPath, JSON.stringify({ tasks: [] }));

            const result = await agentLoop.executeTool('tasks_list', { status: 'all' });

            expect(result).toContain('No tasks found');
        });
    });

    describe('tasks_complete', () => {
        beforeEach(async () => {
            fs.writeFileSync(tasksPath, JSON.stringify({ tasks: [] }));
            await agentLoop.executeTool('tasks_add', { title: 'Task to Complete' });
        });

        it('should mark a task as completed', async () => {
            const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
            const taskId = tasks.tasks[0].id;

            const result = await agentLoop.executeTool('tasks_complete', { id: taskId });

            expect(result).toContain('marked as completed');

            const updatedTasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
            expect(updatedTasks.tasks[0].status).toBe('completed');
        });

        it('should reject invalid task ID', async () => {
            const result = await agentLoop.executeTool('tasks_complete', {
                id: 'nonexistent-id',
            });

            expect(result).toContain('Error');
            expect(result).toContain('not found');
        });

        it('should reject empty ID', async () => {
            const result = await agentLoop.executeTool('tasks_complete', {
                id: '',
            });

            expect(result).toContain('"success": false');
        });

        it('should reject missing ID', async () => {
            const result = await agentLoop.executeTool('tasks_complete', {});

            expect(result).toContain('"success": false');
        });
    });

    describe('Task Limits', () => {
        it.skip('should handle 500 task limit', async () => {
            // Clear existing tasks
            fs.writeFileSync(tasksPath, JSON.stringify({ tasks: [] }));

            // Add 500 tasks
            for (let i = 0; i < 500; i++) {
                await agentLoop.executeTool('tasks_add', { title: `Task ${i}` });
            }

            const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
            expect(tasks.tasks).toHaveLength(500);
        });
    });

    describe('Input Validation', () => {
        it('should handle invalid types for tasks_add', async () => {
            const result = await agentLoop.executeTool('tasks_add', {
                title: 123 as any,
            });

            expect(result).toContain('"success": false');
        });

        it('should handle invalid types for tasks_complete', async () => {
            const result = await agentLoop.executeTool('tasks_complete', {
                id: 123 as any,
            });

            expect(result).toContain('"success": false');
        });

        it('should handle invalid status for tasks_list', async () => {
            const result = await agentLoop.executeTool('tasks_list', {
                status: 'invalid' as any,
            });

            expect(result).toContain('"success": false');
        });
    });
});
