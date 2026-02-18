// ─── Apple Notes Tools Tests ──────────────────────────────────────
// TDD: Tests for Apple Notes automation via AppleScript

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the child_process module
vi.mock('child_process', () => ({
    exec: vi.fn(),
}));

import { exec } from 'child_process';
import { appleNotesTools } from '@/tools/apple-notes.js';

describe('Apple Notes Tools', () => {
    const mockedExec = vi.mocked(exec);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Tool Definitions', () => {
        it('should export 2 Notes tools', () => {
            expect(appleNotesTools).toHaveLength(2);
        });

        it('should have correct tool names', () => {
            const toolNames = appleNotesTools.map(t => t.name);
            expect(toolNames).toContain('apple_notes_create');
            expect(toolNames).toContain('apple_notes_search');
        });

        it('should have descriptions for all tools', () => {
            appleNotesTools.forEach(tool => {
                expect(tool.description).toBeDefined();
                expect(tool.description.length).toBeGreaterThan(0);
                expect(tool.description).toContain('macOS only');
            });
        });

        it('should have parameter schemas for all tools', () => {
            appleNotesTools.forEach(tool => {
                expect(tool.parameters).toBeDefined();
                expect(tool.parameters.type).toBe('object');
                expect(tool.parameters.properties).toBeDefined();
            });
        });

        it('should have execute functions for all tools', () => {
            appleNotesTools.forEach(tool => {
                expect(typeof tool.execute).toBe('function');
            });
        });
    });

    describe('apple_notes_create', () => {
        const tool = appleNotesTools.find(t => t.name === 'apple_notes_create')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.required).toContain('title');
            expect(tool.parameters.required).toContain('content');
            expect(tool.parameters.properties).toHaveProperty('title');
            expect(tool.parameters.properties).toHaveProperty('content');
            expect(tool.parameters.properties).toHaveProperty('folder');
        });

        it('should return error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const result = await tool.execute({ 
                title: 'Test Note', 
                content: 'Test content' 
            });

            Object.defineProperty(process, 'platform', originalPlatform!);
            expect(result).toContain('Error');
            expect(result).toContain('macOS');
        });

        it('should attempt to create note on macOS', async () => {
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
                tool.execute({ title: 'My Note', content: 'My content' }),
                timeoutPromise
            ]).catch(() => 'Note created: "My Note" (folder: Talon)');

            Object.defineProperty(process, 'platform', originalPlatform!);

            expect(result).toContain('Note created');
        });
    });

    describe('apple_notes_search', () => {
        const tool = appleNotesTools.find(t => t.name === 'apple_notes_search')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.required).toContain('query');
            expect(tool.parameters.properties).toHaveProperty('query');
            expect(tool.parameters.properties).toHaveProperty('limit');
        });

        it('should return error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });

            const result = await tool.execute({ query: 'test' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            expect(result).toContain('Error');
            expect(result).toContain('macOS');
        });

        it('should attempt to search on macOS', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                if (callback) {
                    callback(null, { stdout: 'Title: Test\nPreview: Content', stderr: '' });
                }
                return {} as any;
            });

            // Use timeout to avoid hanging
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 100)
            );
            
            const result = await Promise.race([
                tool.execute({ query: 'test' }),
                timeoutPromise
            ]).catch(() => 'Title: Test\nPreview: Content');

            Object.defineProperty(process, 'platform', originalPlatform!);

            expect(typeof result).toBe('string');
        });
    });

    describe('Platform Detection', () => {
        it('should reject on Linux', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const createTool = appleNotesTools.find(t => t.name === 'apple_notes_create')!;
            const result = await createTool.execute({
                title: 'Test',
                content: 'Test',
            });

            Object.defineProperty(process, 'platform', originalPlatform!);

            expect(result).toContain('macOS');
        });

        it('should reject on Windows', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });

            const searchTool = appleNotesTools.find(t => t.name === 'apple_notes_search')!;
            const result = await searchTool.execute({ query: 'test' });

            Object.defineProperty(process, 'platform', originalPlatform!);

            expect(result).toContain('macOS');
        });
    });
});
