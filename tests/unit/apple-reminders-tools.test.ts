// ─── Apple Reminders Tools Tests ──────────────────────────────────
// TDD: Tests for Apple Reminders automation via AppleScript (bulletproof JSON output)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the child_process module
vi.mock('child_process', () => ({
    exec: vi.fn(),
}));

// Mock fs for safeExecAppleScript temp file handling
vi.mock('fs', () => ({
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
}));

import { exec } from 'child_process';
import { appleRemindersTools } from '@/tools/apple-reminders.js';

describe('Apple Reminders Tools', () => {
    const mockedExec = vi.mocked(exec);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Tool Definitions', () => {
        it('should export 3 Reminders tools', () => {
            expect(appleRemindersTools).toHaveLength(3);
        });

        it('should have correct tool names', () => {
            const toolNames = appleRemindersTools.map(t => t.name);
            expect(toolNames).toContain('apple_reminders_add');
            expect(toolNames).toContain('apple_reminders_list');
            expect(toolNames).toContain('apple_reminders_complete');
        });

        it('should have descriptions for all tools', () => {
            appleRemindersTools.forEach(tool => {
                expect(tool.description).toBeDefined();
                expect(tool.description.length).toBeGreaterThan(0);
                expect(tool.description).toContain('macOS only');
            });
        });

        it('should have parameter schemas for all tools', () => {
            appleRemindersTools.forEach(tool => {
                expect(tool.parameters).toBeDefined();
                expect(tool.parameters.type).toBe('object');
                expect(tool.parameters.properties).toBeDefined();
            });
        });

        it('should have execute functions for all tools', () => {
            appleRemindersTools.forEach(tool => {
                expect(typeof tool.execute).toBe('function');
            });
        });
    });

    describe('apple_reminders_add', () => {
        const tool = appleRemindersTools.find(t => t.name === 'apple_reminders_add')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.required).toContain('title');
            expect(tool.parameters.properties).toHaveProperty('title');
            expect(tool.parameters.properties).toHaveProperty('list');
            expect(tool.parameters.properties).toHaveProperty('dueDate');
            expect(tool.parameters.properties).toHaveProperty('priority');
        });

        it('should return JSON error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'linux' });

            const result = await tool.execute({ title: 'Test reminder' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('PLATFORM_NOT_SUPPORTED');
            expect(parsed.error.message).toContain('macOS');
        });

        it('should return validation error for empty title', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            const result = await tool.execute({ title: '' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return validation error for invalid dueDate format', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            const result = await tool.execute({ title: 'Test', dueDate: 'tomorrow' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return validation error for invalid priority', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            const result = await tool.execute({ title: 'Test', priority: 15 });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('VALIDATION_ERROR');
        });

        it('should attempt to add reminder on macOS', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    setTimeout(() => actualCallback(null, { stdout: 'Buy milk', stderr: '' }), 0);
                }
                return {} as any;
            });

            const result = await tool.execute({ title: 'Buy milk' });

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.data.title).toBe('Buy milk');
        });
    });

    describe('apple_reminders_list', () => {
        const tool = appleRemindersTools.find(t => t.name === 'apple_reminders_list')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.properties).toHaveProperty('list');
            expect(tool.parameters.properties).toHaveProperty('completed');
        });

        it('should return JSON error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'win32' });

            const result = await tool.execute({});

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('PLATFORM_NOT_SUPPORTED');
        });
    });

    describe('apple_reminders_complete', () => {
        const tool = appleRemindersTools.find(t => t.name === 'apple_reminders_complete')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.required).toContain('title');
            expect(tool.parameters.properties).toHaveProperty('title');
            expect(tool.parameters.properties).toHaveProperty('list');
        });

        it('should return JSON error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'linux' });

            const result = await tool.execute({ title: 'Test' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('PLATFORM_NOT_SUPPORTED');
        });
    });

    describe('Platform Detection', () => {
        it('should reject on all non-macOS platforms', async () => {
            const platforms = ['linux', 'win32', 'freebsd'];
            const addTool = appleRemindersTools.find(t => t.name === 'apple_reminders_add')!;

            for (const platform of platforms) {
                const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
                Object.defineProperty(process, 'platform', { value: platform });

                const result = await addTool.execute({ title: 'Test' });

                Object.defineProperty(process, 'platform', originalPlatform!);

                const parsed = JSON.parse(result);
                expect(parsed.success).toBe(false);
                expect(parsed.error.message).toContain('macOS');
            }
        });
    });
});
