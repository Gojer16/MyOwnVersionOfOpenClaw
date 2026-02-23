// ─── Apple Mail Tools Tests ───────────────────────────────────────
// TDD: Tests for Apple Mail automation via AppleScript (bulletproof JSON output)

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
import { appleMailTools } from '@/tools/apple-mail.js';

describe('Apple Mail Tools', () => {
    const mockedExec = vi.mocked(exec);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Tool Definitions', () => {
        it('should export 5 Mail tools', () => {
            expect(appleMailTools).toHaveLength(5);
        });

        it('should have correct tool names', () => {
            const toolNames = appleMailTools.map(t => t.name);
            expect(toolNames).toContain('apple_mail_list_emails');
            expect(toolNames).toContain('apple_mail_get_recent');
            expect(toolNames).toContain('apple_mail_search');
            expect(toolNames).toContain('apple_mail_get_email_content');
            expect(toolNames).toContain('apple_mail_count');
        });

        it('should have descriptions for all tools', () => {
            appleMailTools.forEach(tool => {
                expect(tool.description).toBeDefined();
                expect(tool.description.length).toBeGreaterThan(0);
                expect(tool.description).toContain('macOS');
            });
        });

        it('should have parameter schemas for all tools', () => {
            appleMailTools.forEach(tool => {
                expect(tool.parameters).toBeDefined();
                expect(tool.parameters.type).toBe('object');
                expect(tool.parameters.properties).toBeDefined();
            });
        });

        it('should have execute functions for all tools', () => {
            appleMailTools.forEach(tool => {
                expect(typeof tool.execute).toBe('function');
            });
        });
    });

    describe('apple_mail_list_emails', () => {
        const tool = appleMailTools.find(t => t.name === 'apple_mail_list_emails')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.properties).toHaveProperty('count');
            expect(tool.parameters.properties).toHaveProperty('mailbox');
            expect(tool.parameters.properties).toHaveProperty('unreadOnly');
        });

        it('should return JSON error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'linux' });

            const result = await tool.execute({ count: 10 });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('PLATFORM_NOT_SUPPORTED');
            expect(parsed.error.message).toContain('macOS');
        });

        it('should list emails with default count', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            const mockEmails = '[1] Test Subject | From: Test Sender (test@example.com) | Date: Wed Feb 18 2026 | Read: true';
            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    setTimeout(() => actualCallback(null, { stdout: mockEmails, stderr: '' }), 0);
                }
                return {} as any;
            });

            const result = await tool.execute({});

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.data.emails).toContain('Test Subject');
        });

        it('should validate count is capped at 50', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            // count: 100 exceeds max of 50, should be validation error
            const result = await tool.execute({ count: 100 });

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('VALIDATION_ERROR');
        });

        it('should filter by unread only', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    setTimeout(() => actualCallback(null, { stdout: 'unread emails', stderr: '' }), 0);
                }
                return {} as any;
            });

            const result = await tool.execute({ unreadOnly: true });

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.data.unreadOnly).toBe(true);
        });
    });

    describe('apple_mail_get_recent', () => {
        const tool = appleMailTools.find(t => t.name === 'apple_mail_get_recent')!;

        it('should have correct parameters', () => {
            expect(tool.parameters.properties).toHaveProperty('hours');
            expect(tool.parameters.properties).toHaveProperty('count');
        });

        it('should return JSON error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'win32' });

            const result = await tool.execute({ hours: 24 });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('PLATFORM_NOT_SUPPORTED');
        });

        it('should get recent emails with hours filter', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    setTimeout(() => actualCallback(null, { stdout: 'Recent emails from last 24 hours', stderr: '' }), 0);
                }
                return {} as any;
            });

            const result = await tool.execute({ hours: 24 });

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.data.hours).toBe(24);
        });
    });

    describe('apple_mail_search', () => {
        const tool = appleMailTools.find(t => t.name === 'apple_mail_search')!;

        it('should require query parameter', () => {
            expect(tool.parameters.required).toContain('query');
        });

        it('should return JSON error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'linux' });

            const result = await tool.execute({ query: 'test' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('PLATFORM_NOT_SUPPORTED');
        });

        it('should return validation error for empty query', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            const result = await tool.execute({ query: '' });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('VALIDATION_ERROR');
        });

        it('should search emails by query', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    setTimeout(() => actualCallback(null, { stdout: '[1] Invoice from Vendor | From: vendor@test.com', stderr: '' }), 0);
                }
                return {} as any;
            });

            const result = await tool.execute({ query: 'invoice' });

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.data.query).toBe('invoice');
        });
    });

    describe('apple_mail_get_email_content', () => {
        const tool = appleMailTools.find(t => t.name === 'apple_mail_get_email_content')!;

        it('should require index parameter', () => {
            expect(tool.parameters.required).toContain('index');
        });

        it('should return JSON error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'win32' });

            const result = await tool.execute({ index: 1 });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('PLATFORM_NOT_SUPPORTED');
        });

        it('should return validation error for index 0', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            const result = await tool.execute({ index: 0 });

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('VALIDATION_ERROR');
        });

        it('should get email content by index', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            const mockContent = 'Subject: Test Email\nFrom: Sender <sender@test.com>\nDate: Wed Feb 18 2026\n\nEmail body content here';
            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    setTimeout(() => actualCallback(null, { stdout: mockContent, stderr: '' }), 0);
                }
                return {} as any;
            });

            const result = await tool.execute({ index: 1 });

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.data.content).toContain('Subject:');
        });
    });

    describe('apple_mail_count', () => {
        const tool = appleMailTools.find(t => t.name === 'apple_mail_count')!;

        it('should have optional parameters', () => {
            expect(tool.parameters.properties).toHaveProperty('mailbox');
            expect(tool.parameters.properties).toHaveProperty('unreadOnly');
        });

        it('should return JSON error on non-macOS platform', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'linux' });

            const result = await tool.execute({});

            Object.defineProperty(process, 'platform', originalPlatform!);
            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('PLATFORM_NOT_SUPPORTED');
        });

        it('should count total emails', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            // Output uses § delimiter: totalCount§unreadCount
            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    setTimeout(() => actualCallback(null, { stdout: '100§5', stderr: '' }), 0);
                }
                return {} as any;
            });

            const result = await tool.execute({});

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.data.totalCount).toBe(100);
            expect(parsed.data.unreadCount).toBe(5);
        });

        it('should count unread only', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    setTimeout(() => actualCallback(null, { stdout: '5', stderr: '' }), 0);
                }
                return {} as any;
            });

            const result = await tool.execute({ unreadOnly: true });

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.data.unreadCount).toBe(5);
        });
    });

    describe('Platform Detection', () => {
        it('should work on macOS', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    setTimeout(() => actualCallback(null, { stdout: 'email data', stderr: '' }), 0);
                }
                return {} as any;
            });

            const listTool = appleMailTools.find(t => t.name === 'apple_mail_list_emails')!;
            const result = await listTool.execute({ count: 5 });

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
        });

        it('should reject on all non-macOS platforms', async () => {
            const platforms = ['linux', 'win32', 'freebsd'];
            const listTool = appleMailTools.find(t => t.name === 'apple_mail_list_emails')!;

            for (const platform of platforms) {
                const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
                Object.defineProperty(process, 'platform', { value: platform });

                const result = await listTool.execute({ count: 5 });

                Object.defineProperty(process, 'platform', originalPlatform!);

                const parsed = JSON.parse(result);
                expect(parsed.success).toBe(false);
                expect(parsed.error.message).toContain('macOS');
            }
        });
    });

    describe('Error Handling', () => {
        it('should handle AppleScript execution errors', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    const error = new Error('AppleScript error: Mail is not running');
                    setTimeout(() => actualCallback(error, { stdout: '', stderr: '' }), 0);
                }
                return {} as any;
            });

            const listTool = appleMailTools.find(t => t.name === 'apple_mail_list_emails')!;
            const result = await listTool.execute({});

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('APPLESCRIPT_ERROR');
        });

        it('should handle permission denied errors', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            mockedExec.mockImplementation((command: string, options: any, callback: any) => {
                const actualCallback = callback || options;
                if (typeof actualCallback === 'function') {
                    const error: any = new Error('not authorized to send Apple events');
                    error.stderr = 'not authorized to send Apple events';
                    setTimeout(() => actualCallback(error, { stdout: '', stderr: error.stderr }), 0);
                }
                return {} as any;
            });

            const searchTool = appleMailTools.find(t => t.name === 'apple_mail_search')!;
            const result = await searchTool.execute({ query: 'test' });

            Object.defineProperty(process, 'platform', originalPlatform!);

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('PERMISSION_DENIED');
            expect(parsed.error.recoverySteps).toBeDefined();
            expect(parsed.error.recoverySteps.length).toBeGreaterThan(0);
        });
    });
});
