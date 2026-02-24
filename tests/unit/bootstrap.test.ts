// ─── Bootstrap Tests ─────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isBootstrapNeeded } from '../../src/agent/prompts.js';

describe('Bootstrap Detection', () => {
    let workspaceRoot: string;
    let templateRoot: string;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talon-workspace-'));
        templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talon-templates-'));

        fs.writeFileSync(
            path.join(templateRoot, 'PROFILE.json'),
            JSON.stringify({ name: '', timezone: '' }, null, 2),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(templateRoot, 'IDENTITY.md'),
            '# IDENTITY\n\n**Name:** *(pick something you like)*\n',
            'utf-8',
        );
    });

    afterEach(() => {
        if (fs.existsSync(workspaceRoot)) {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
        if (fs.existsSync(templateRoot)) {
            fs.rmSync(templateRoot, { recursive: true, force: true });
        }
    });

    it('requests bootstrap when workspace is template-identical', () => {
        fs.writeFileSync(
            path.join(workspaceRoot, 'PROFILE.json'),
            JSON.stringify({ name: '', timezone: '' }, null, 2),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(workspaceRoot, 'IDENTITY.md'),
            '# IDENTITY\n\n**Name:** *(pick something you like)*\n',
            'utf-8',
        );

        const needed = isBootstrapNeeded(workspaceRoot, templateRoot);
        expect(needed).toBe(true);
    });

    it('skips bootstrap when profile and identity are filled', () => {
        fs.writeFileSync(
            path.join(workspaceRoot, 'PROFILE.json'),
            JSON.stringify({ name: 'Orlando', timezone: 'America/New_York' }, null, 2),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(workspaceRoot, 'IDENTITY.md'),
            '# IDENTITY\n\n**Name:** Talon\n',
            'utf-8',
        );

        const needed = isBootstrapNeeded(workspaceRoot, templateRoot);
        expect(needed).toBe(false);
    });
});
