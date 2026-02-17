// ─── File Tools Tests ──────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock file tools - will be replaced with real implementation
interface FileToolResult {
    success: boolean;
    content?: string;
    error?: string;
}

class MockFileTools {
    async read(filePath: string): Promise<FileToolResult> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return { success: true, content };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async write(filePath: string, content: string): Promise<FileToolResult> {
        try {
            fs.writeFileSync(filePath, content, 'utf-8');
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async list(dirPath: string): Promise<FileToolResult> {
        try {
            const files = fs.readdirSync(dirPath);
            return { success: true, content: JSON.stringify(files) };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async search(dirPath: string, pattern: string): Promise<FileToolResult> {
        try {
            const files = fs.readdirSync(dirPath);
            const matches = files.filter(f => f.includes(pattern));
            return { success: true, content: JSON.stringify(matches) };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

describe('File Tools', () => {
    let fileTools: MockFileTools;
    let testDir: string;
    let testFile: string;

    beforeEach(() => {
        fileTools = new MockFileTools();
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talon-test-'));
        testFile = path.join(testDir, 'test.txt');
    });

    afterEach(() => {
        // Cleanup
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('file_read', () => {
        it('should read existing file', async () => {
            fs.writeFileSync(testFile, 'Hello World', 'utf-8');

            const result = await fileTools.read(testFile);

            expect(result.success).toBe(true);
            expect(result.content).toBe('Hello World');
        });

        it('should handle non-existent file', async () => {
            const result = await fileTools.read('/non/existent/file.txt');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should read empty file', async () => {
            fs.writeFileSync(testFile, '', 'utf-8');

            const result = await fileTools.read(testFile);

            expect(result.success).toBe(true);
            expect(result.content).toBe('');
        });

        it('should read large file', async () => {
            const largeContent = 'A'.repeat(10000);
            fs.writeFileSync(testFile, largeContent, 'utf-8');

            const result = await fileTools.read(testFile);

            expect(result.success).toBe(true);
            expect(result.content?.length).toBe(10000);
        });
    });

    describe('file_write', () => {
        it('should write to new file', async () => {
            const result = await fileTools.write(testFile, 'Test content');

            expect(result.success).toBe(true);
            expect(fs.existsSync(testFile)).toBe(true);
            expect(fs.readFileSync(testFile, 'utf-8')).toBe('Test content');
        });

        it('should overwrite existing file', async () => {
            fs.writeFileSync(testFile, 'Old content', 'utf-8');

            const result = await fileTools.write(testFile, 'New content');

            expect(result.success).toBe(true);
            expect(fs.readFileSync(testFile, 'utf-8')).toBe('New content');
        });

        it('should write empty content', async () => {
            const result = await fileTools.write(testFile, '');

            expect(result.success).toBe(true);
            expect(fs.readFileSync(testFile, 'utf-8')).toBe('');
        });

        it('should handle invalid path', async () => {
            const result = await fileTools.write('/invalid/path/file.txt', 'content');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('file_list', () => {
        it('should list files in directory', async () => {
            fs.writeFileSync(path.join(testDir, 'file1.txt'), 'content1');
            fs.writeFileSync(path.join(testDir, 'file2.txt'), 'content2');

            const result = await fileTools.list(testDir);

            expect(result.success).toBe(true);
            const files = JSON.parse(result.content!);
            expect(files).toContain('file1.txt');
            expect(files).toContain('file2.txt');
        });

        it('should list empty directory', async () => {
            const result = await fileTools.list(testDir);

            expect(result.success).toBe(true);
            const files = JSON.parse(result.content!);
            expect(files).toEqual([]);
        });

        it('should handle non-existent directory', async () => {
            const result = await fileTools.list('/non/existent/dir');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('file_search', () => {
        it('should find matching files', async () => {
            fs.writeFileSync(path.join(testDir, 'test1.txt'), 'content');
            fs.writeFileSync(path.join(testDir, 'test2.txt'), 'content');
            fs.writeFileSync(path.join(testDir, 'other.md'), 'content');

            const result = await fileTools.search(testDir, 'test');

            expect(result.success).toBe(true);
            const matches = JSON.parse(result.content!);
            expect(matches).toContain('test1.txt');
            expect(matches).toContain('test2.txt');
            expect(matches).not.toContain('other.md');
        });

        it('should return empty array when no matches', async () => {
            fs.writeFileSync(path.join(testDir, 'file.txt'), 'content');

            const result = await fileTools.search(testDir, 'nomatch');

            expect(result.success).toBe(true);
            const matches = JSON.parse(result.content!);
            expect(matches).toEqual([]);
        });

        it('should handle case-sensitive search', async () => {
            fs.writeFileSync(path.join(testDir, 'Test.txt'), 'content');
            fs.writeFileSync(path.join(testDir, 'test.txt'), 'content');

            const result = await fileTools.search(testDir, 'Test');

            expect(result.success).toBe(true);
            const matches = JSON.parse(result.content!);
            expect(matches).toContain('Test.txt');
        });
    });

    describe('Path Safety', () => {
        it('should handle relative paths', async () => {
            const relativePath = path.join(testDir, './test.txt');
            const result = await fileTools.write(relativePath, 'content');

            expect(result.success).toBe(true);
        });

        it('should handle paths with spaces', async () => {
            const fileWithSpace = path.join(testDir, 'file with spaces.txt');
            const result = await fileTools.write(fileWithSpace, 'content');

            expect(result.success).toBe(true);
            expect(fs.existsSync(fileWithSpace)).toBe(true);
        });

        it('should handle unicode filenames', async () => {
            const unicodeFile = path.join(testDir, '文件.txt');
            const result = await fileTools.write(unicodeFile, 'content');

            expect(result.success).toBe(true);
            expect(fs.existsSync(unicodeFile)).toBe(true);
        });
    });
});
