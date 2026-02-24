// ─── Recall Tests ────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildRecallContext } from '../../src/memory/recall.js';

describe('Memory Recall', () => {
    let workspaceRoot: string;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talon-recall-'));
        fs.mkdirSync(path.join(workspaceRoot, 'memory'), { recursive: true });
    });

    afterEach(() => {
        if (fs.existsSync(workspaceRoot)) {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    it('returns relevant snippets from MEMORY.md', () => {
        fs.writeFileSync(
            path.join(workspaceRoot, 'MEMORY.md'),
            'User prefers Obsidian for notes.\nUser uses macOS.\n',
            'utf-8',
        );

        const recall = buildRecallContext(workspaceRoot, 'What notes app do I use?');
        expect(recall).toContain('Obsidian');
    });

    it('returns null if no matches', () => {
        fs.writeFileSync(path.join(workspaceRoot, 'MEMORY.md'), 'Nothing relevant.\n', 'utf-8');
        const recall = buildRecallContext(workspaceRoot, 'calendar');
        expect(recall).toBeNull();
    });
});
