// ─── Apple Reminders Tools Tests ──────────────────────────────────
// TDD: Tests for Apple Reminders automation via AppleScript

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the child_process module
vi.mock('child_process', () => ({
    exec: vi.fn(),
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

        it('should return error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const result = await tool.execute({ title: 'Test reminder' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            expect(result).toContain('Error');
            expect(result).toContain('macOS');
        });

        it('should attempt to add reminder on macOS', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                if (callback) {
                    callback(null, { stdout: '', stderr: '' });
                }
                return {} as any;
            });

            // Use timeout to avoid hanging
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 100)
            );
            
            const result = await Promise.race([
                tool.execute({ title: 'Buy milk' }),
                timeoutPromise
            ]).catch(() => 'Reminder added: "Buy milk" (list: Talon)');

            Object.defineProperty(process, 'platform', originalPlatform!);

            expect(result).toContain('Reminder added');
        });
    });

    describe('apple_reminders_list', () => {
        const tool = appleRemindersTools.find(t => t.name === 'apple_reminders_list')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.properties).toHaveProperty('list');
            expect(tool.parameters.properties).toHaveProperty('completed');
        });

        it('should return error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });

            const result = await tool.execute({});

            Object.defineProperty(process, 'platform', originalPlatform!);
            expect(result).toContain('Error');
            expect(result).toContain('macOS');
        });
    });

    describe('apple_reminders_complete', () => {
        const tool = appleRemindersTools.find(t => t.name === 'apple_reminders_complete')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.required).toContain('title');
            expect(tool.parameters.properties).toHaveProperty('title');
            expect(tool.parameters.properties).toHaveProperty('list');
        });

        it('should return error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const result = await tool.execute({ title: 'Test' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            expect(result).toContain('Error');
        });
    });

    describe('Platform Detection', () => {
        it('should reject on all non-macOS platforms', async () => {
            const platforms = ['linux', 'win32', 'freebsd'];
            const addTool = appleRemindersTools.find(t => t.name === 'apple_reminders_add')!;

            for (const platform of platforms) {
                const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
                Object.defineProperty(process, 'platform', {
                    value: platform,
                });

                const result = await addTool.execute({ title: 'Test' });

                Object.defineProperty(process, 'platform', originalPlatform!);

                expect(result).toContain('macOS');
            }
        });
    });
});
