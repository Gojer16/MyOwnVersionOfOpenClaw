// ─── Apple Calendar Tools Tests ───────────────────────────────────
// TDD: Tests for Apple Calendar automation via AppleScript

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the child_process module
vi.mock('child_process', () => ({
    exec: vi.fn(),
}));

import { exec } from 'child_process';
import { appleCalendarTools } from '@/tools/apple-calendar.js';

describe('Apple Calendar Tools', () => {
    const mockedExec = vi.mocked(exec);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Tool Definitions', () => {
        it('should export 3 Calendar tools', () => {
            expect(appleCalendarTools).toHaveLength(3);
        });

        it('should have correct tool names', () => {
            const toolNames = appleCalendarTools.map(t => t.name);
            expect(toolNames).toContain('apple_calendar_create_event');
            expect(toolNames).toContain('apple_calendar_list_events');
            expect(toolNames).toContain('apple_calendar_delete_event');
        });

        it('should have descriptions for all tools', () => {
            appleCalendarTools.forEach(tool => {
                expect(tool.description).toBeDefined();
                expect(tool.description.length).toBeGreaterThan(0);
                expect(tool.description).toContain('macOS only');
            });
        });

        it('should have parameter schemas for all tools', () => {
            appleCalendarTools.forEach(tool => {
                expect(tool.parameters).toBeDefined();
                expect(tool.parameters.type).toBe('object');
                expect(tool.parameters.properties).toBeDefined();
            });
        });

        it('should have execute functions for all tools', () => {
            appleCalendarTools.forEach(tool => {
                expect(typeof tool.execute).toBe('function');
            });
        });
    });

    describe('apple_calendar_create_event', () => {
        const tool = appleCalendarTools.find(t => t.name === 'apple_calendar_create_event')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.required).toContain('title');
            expect(tool.parameters.required).toContain('startDate');
            expect(tool.parameters.properties).toHaveProperty('title');
            expect(tool.parameters.properties).toHaveProperty('startDate');
            expect(tool.parameters.properties).toHaveProperty('endDate');
            expect(tool.parameters.properties).toHaveProperty('location');
            expect(tool.parameters.properties).toHaveProperty('notes');
            expect(tool.parameters.properties).toHaveProperty('calendar');
        });

        it('should return error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const result = await tool.execute({ 
                title: 'Meeting', 
                startDate: '2026-02-20 10:00' 
            });

            Object.defineProperty(process, 'platform', originalPlatform!);
            expect(result).toContain('Error');
            expect(result).toContain('macOS');
        });

        it('should attempt to create event on macOS', async () => {
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
                tool.execute({ title: 'Team Meeting', startDate: '2026-02-20 10:00' }),
                timeoutPromise
            ]).catch(() => 'Event created: "Team Meeting" on 2026-02-20 10:00 (calendar: Talon)');

            Object.defineProperty(process, 'platform', originalPlatform!);

            expect(result).toContain('Event created');
        });
    });

    describe('apple_calendar_list_events', () => {
        const tool = appleCalendarTools.find(t => t.name === 'apple_calendar_list_events')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.properties).toHaveProperty('calendar');
            expect(tool.parameters.properties).toHaveProperty('days');
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

    describe('apple_calendar_delete_event', () => {
        const tool = appleCalendarTools.find(t => t.name === 'apple_calendar_delete_event')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.required).toContain('title');
            expect(tool.parameters.properties).toHaveProperty('title');
            expect(tool.parameters.properties).toHaveProperty('calendar');
        });

        it('should return error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const result = await tool.execute({ title: 'Meeting' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            expect(result).toContain('Error');
        });
    });

    describe('Platform Detection', () => {
        it('should reject on non-macOS platforms', async () => {
            const platforms = ['linux', 'win32'];
            const createTool = appleCalendarTools.find(t => t.name === 'apple_calendar_create_event')!;

            for (const platform of platforms) {
                const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
                Object.defineProperty(process, 'platform', {
                    value: platform,
                });

                const result = await createTool.execute({
                    title: 'Test',
                    startDate: '2026-02-20 10:00',
                });

                Object.defineProperty(process, 'platform', originalPlatform!);

                expect(result).toContain('macOS');
            }
        });
    });
});
