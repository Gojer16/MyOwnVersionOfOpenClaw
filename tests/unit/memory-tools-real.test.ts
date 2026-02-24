// ─── Memory Tools (Real) Tests ───────────────────────────────────
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TalonConfigSchema } from '../../src/config/schema.js';
import { registerMemoryTools } from '../../src/tools/memory-tools.js';

function createConfig(workspaceRoot: string) {
    const base = TalonConfigSchema.parse({});
    return {
        ...base,
        workspace: {
            ...base.workspace,
            root: workspaceRoot,
        },
    };
}

describe('Memory Tools (Real)', () => {
    let testWorkspace: string;

    beforeEach(() => {
        testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'talon-memory-real-'));
    });

    afterEach(() => {
        if (fs.existsSync(testWorkspace)) {
            fs.rmSync(testWorkspace, { recursive: true, force: true });
        }
    });

    it('memory_search escapes regex input', async () => {
        const config = createConfig(testWorkspace);
        const tools = registerMemoryTools(config);
        const searchTool = tools.find(t => t.name === 'memory_search');

        if (!searchTool) throw new Error('memory_search tool not found');

        fs.writeFileSync(path.join(testWorkspace, 'MEMORY.md'), 'hello world\n', 'utf-8');

        const result = await searchTool.execute({ query: '.*' });
        expect(result).toContain('No matches found for ".*"');
    });

    it('facts_update rejects invalid facts structure', async () => {
        const config = createConfig(testWorkspace);
        const tools = registerMemoryTools(config);
        const factsTool = tools.find(t => t.name === 'facts_update');

        if (!factsTool) throw new Error('facts_update tool not found');

        const result = await factsTool.execute({ facts: '["bad"]' });
        expect(result).toContain('Error: Invalid facts structure');
    });

    it('facts_update accepts valid facts and writes file', async () => {
        const config = createConfig(testWorkspace);
        const tools = registerMemoryTools(config);
        const factsTool = tools.find(t => t.name === 'facts_update');

        if (!factsTool) throw new Error('facts_update tool not found');

        const result = await factsTool.execute({
            facts: JSON.stringify({
                user: { name: 'Orlando' },
                learned_facts: ['prefers TypeScript'],
            }),
        });

        expect(result).toContain('Updated facts:');

        const factsPath = path.join(testWorkspace, 'FACTS.json');
        const saved = JSON.parse(fs.readFileSync(factsPath, 'utf-8')) as any;
        expect(saved.user?.name).toBe('Orlando');
        expect(saved.learned_facts?.[0]).toBe('prefers TypeScript');
    });

    it('profile_update writes PROFILE.json with schema validation', async () => {
        const config = createConfig(testWorkspace);
        const tools = registerMemoryTools(config);
        const profileTool = tools.find(t => t.name === 'profile_update');

        if (!profileTool) throw new Error('profile_update tool not found');

        const result = await profileTool.execute({
            profile: JSON.stringify({
                name: 'Orlando',
                preferredName: 'Gojer',
                timezone: 'America/New_York',
                workingHours: { mon: '09:00-18:00' },
                preferredTools: { notes: 'Obsidian' },
            }),
        });

        expect(result).toContain('Updated profile for Orlando');

        const profilePath = path.join(testWorkspace, 'PROFILE.json');
        const saved = JSON.parse(fs.readFileSync(profilePath, 'utf-8')) as any;
        expect(saved.name).toBe('Orlando');
        expect(saved.timezone).toBe('America/New_York');
    });
});
