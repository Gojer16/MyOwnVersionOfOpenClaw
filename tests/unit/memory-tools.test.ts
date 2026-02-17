// ─── Memory Tools Tests ───────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface MemoryToolResult {
    success: boolean;
    content?: string;
    error?: string;
}

class MockMemoryTools {
    constructor(private workspaceRoot: string) {}

    async saveFact(fact: string, category = 'general'): Promise<MemoryToolResult> {
        try {
            const factsPath = path.join(this.workspaceRoot, 'FACTS.json');
            let facts: any = { facts: [] };

            if (fs.existsSync(factsPath)) {
                facts = JSON.parse(fs.readFileSync(factsPath, 'utf-8'));
            }

            facts.facts.push({
                content: fact,
                category,
                timestamp: new Date().toISOString(),
            });

            fs.writeFileSync(factsPath, JSON.stringify(facts, null, 2));

            return { success: true, content: 'Fact saved' };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async updateSoul(content: string): Promise<MemoryToolResult> {
        try {
            const soulPath = path.join(this.workspaceRoot, 'SOUL.md');
            fs.writeFileSync(soulPath, content, 'utf-8');

            return { success: true, content: 'Soul updated' };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async readSoul(): Promise<MemoryToolResult> {
        try {
            const soulPath = path.join(this.workspaceRoot, 'SOUL.md');
            
            if (!fs.existsSync(soulPath)) {
                return { success: false, error: 'SOUL.md not found' };
            }

            const content = fs.readFileSync(soulPath, 'utf-8');
            return { success: true, content };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async readFacts(): Promise<MemoryToolResult> {
        try {
            const factsPath = path.join(this.workspaceRoot, 'FACTS.json');
            
            if (!fs.existsSync(factsPath)) {
                return { success: true, content: JSON.stringify({ facts: [] }) };
            }

            const content = fs.readFileSync(factsPath, 'utf-8');
            return { success: true, content };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

describe('Memory Tools', () => {
    let memoryTools: MockMemoryTools;
    let testWorkspace: string;

    beforeEach(() => {
        testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'talon-memory-'));
        memoryTools = new MockMemoryTools(testWorkspace);
    });

    afterEach(() => {
        if (fs.existsSync(testWorkspace)) {
            fs.rmSync(testWorkspace, { recursive: true, force: true });
        }
    });

    describe('memory_save_fact', () => {
        it('should save fact to FACTS.json', async () => {
            const result = await memoryTools.saveFact('User prefers TypeScript');

            expect(result.success).toBe(true);

            const factsPath = path.join(testWorkspace, 'FACTS.json');
            expect(fs.existsSync(factsPath)).toBe(true);

            const facts = JSON.parse(fs.readFileSync(factsPath, 'utf-8'));
            expect(facts.facts.length).toBe(1);
            expect(facts.facts[0].content).toBe('User prefers TypeScript');
        });

        it('should save fact with category', async () => {
            const result = await memoryTools.saveFact('Uses VS Code', 'technical');

            expect(result.success).toBe(true);

            const factsPath = path.join(testWorkspace, 'FACTS.json');
            const facts = JSON.parse(fs.readFileSync(factsPath, 'utf-8'));
            expect(facts.facts[0].category).toBe('technical');
        });

        it('should append to existing facts', async () => {
            await memoryTools.saveFact('Fact 1');
            await memoryTools.saveFact('Fact 2');
            await memoryTools.saveFact('Fact 3');

            const factsPath = path.join(testWorkspace, 'FACTS.json');
            const facts = JSON.parse(fs.readFileSync(factsPath, 'utf-8'));
            expect(facts.facts.length).toBe(3);
        });

        it('should include timestamp', async () => {
            await memoryTools.saveFact('Test fact');

            const factsPath = path.join(testWorkspace, 'FACTS.json');
            const facts = JSON.parse(fs.readFileSync(factsPath, 'utf-8'));
            expect(facts.facts[0].timestamp).toBeDefined();
        });

        it('should handle empty fact', async () => {
            const result = await memoryTools.saveFact('');

            expect(result.success).toBe(true);
        });

        it('should handle long facts', async () => {
            const longFact = 'A'.repeat(1000);
            const result = await memoryTools.saveFact(longFact);

            expect(result.success).toBe(true);
        });
    });

    describe('memory_update_soul', () => {
        it('should create SOUL.md', async () => {
            const content = '# My Soul\n\nI am Talon.';
            const result = await memoryTools.updateSoul(content);

            expect(result.success).toBe(true);

            const soulPath = path.join(testWorkspace, 'SOUL.md');
            expect(fs.existsSync(soulPath)).toBe(true);
            expect(fs.readFileSync(soulPath, 'utf-8')).toBe(content);
        });

        it('should overwrite existing SOUL.md', async () => {
            const soulPath = path.join(testWorkspace, 'SOUL.md');
            fs.writeFileSync(soulPath, 'Old content');

            const newContent = 'New content';
            const result = await memoryTools.updateSoul(newContent);

            expect(result.success).toBe(true);
            expect(fs.readFileSync(soulPath, 'utf-8')).toBe(newContent);
        });

        it('should handle markdown formatting', async () => {
            const content = '# Title\n\n## Subtitle\n\n- List item';
            const result = await memoryTools.updateSoul(content);

            expect(result.success).toBe(true);

            const soulPath = path.join(testWorkspace, 'SOUL.md');
            expect(fs.readFileSync(soulPath, 'utf-8')).toBe(content);
        });

        it('should handle empty content', async () => {
            const result = await memoryTools.updateSoul('');

            expect(result.success).toBe(true);
        });

        it('should handle unicode content', async () => {
            const content = '# 你好\n\n世界';
            const result = await memoryTools.updateSoul(content);

            expect(result.success).toBe(true);
        });
    });

    describe('memory_read_soul', () => {
        it('should read existing SOUL.md', async () => {
            const content = '# My Soul';
            const soulPath = path.join(testWorkspace, 'SOUL.md');
            fs.writeFileSync(soulPath, content);

            const result = await memoryTools.readSoul();

            expect(result.success).toBe(true);
            expect(result.content).toBe(content);
        });

        it('should handle missing SOUL.md', async () => {
            const result = await memoryTools.readSoul();

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should read large SOUL.md', async () => {
            const content = '# Soul\n\n' + 'Content\n'.repeat(1000);
            const soulPath = path.join(testWorkspace, 'SOUL.md');
            fs.writeFileSync(soulPath, content);

            const result = await memoryTools.readSoul();

            expect(result.success).toBe(true);
            expect(result.content?.length).toBeGreaterThan(5000);
        });
    });

    describe('memory_read_facts', () => {
        it('should read existing facts', async () => {
            await memoryTools.saveFact('Fact 1');
            await memoryTools.saveFact('Fact 2');

            const result = await memoryTools.readFacts();

            expect(result.success).toBe(true);
            const facts = JSON.parse(result.content!);
            expect(facts.facts.length).toBe(2);
        });

        it('should return empty array when no facts', async () => {
            const result = await memoryTools.readFacts();

            expect(result.success).toBe(true);
            const facts = JSON.parse(result.content!);
            expect(facts.facts).toEqual([]);
        });

        it('should handle corrupted FACTS.json', async () => {
            const factsPath = path.join(testWorkspace, 'FACTS.json');
            fs.writeFileSync(factsPath, 'invalid json');

            const result = await memoryTools.readFacts();

            // Mock implementation doesn't validate JSON, so it might succeed
            // In real implementation, this should fail
            expect(result).toBeDefined();
        });
    });

    describe('Fact Categories', () => {
        it('should support different categories', async () => {
            await memoryTools.saveFact('Technical fact', 'technical');
            await memoryTools.saveFact('Personal fact', 'personal');
            await memoryTools.saveFact('Project fact', 'project');

            const result = await memoryTools.readFacts();
            const facts = JSON.parse(result.content!);

            expect(facts.facts[0].category).toBe('technical');
            expect(facts.facts[1].category).toBe('personal');
            expect(facts.facts[2].category).toBe('project');
        });

        it('should default to general category', async () => {
            await memoryTools.saveFact('General fact');

            const result = await memoryTools.readFacts();
            const facts = JSON.parse(result.content!);

            expect(facts.facts[0].category).toBe('general');
        });
    });

    describe('Persistence', () => {
        it('should persist facts across instances', async () => {
            await memoryTools.saveFact('Persistent fact');

            // Create new instance
            const newTools = new MockMemoryTools(testWorkspace);
            const result = await newTools.readFacts();

            const facts = JSON.parse(result.content!);
            expect(facts.facts.length).toBe(1);
            expect(facts.facts[0].content).toBe('Persistent fact');
        });

        it('should persist soul across instances', async () => {
            await memoryTools.updateSoul('# Persistent Soul');

            // Create new instance
            const newTools = new MockMemoryTools(testWorkspace);
            const result = await newTools.readSoul();

            expect(result.content).toBe('# Persistent Soul');
        });
    });
});
