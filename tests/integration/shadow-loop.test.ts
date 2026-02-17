import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ShadowLoop } from '../../src/shadow/index.js';
import type { GhostMessage } from '../../src/shadow/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, '../../.test-workspace-shadow');

describe('Shadow Loop - Filesystem Integration', () => {
    beforeAll(async () => {
        await fs.mkdir(TEST_DIR, { recursive: true });
    });

    afterAll(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should start and stop without errors', () => {
        const shadow = new ShadowLoop({ paths: [TEST_DIR + '/**'] });
        shadow.start();
        expect(shadow.isRunning()).toBe(true);
        shadow.stop();
        expect(shadow.isRunning()).toBe(false);
    });

    it('should accept ghost message handler', () => {
        const shadow = new ShadowLoop({ paths: [TEST_DIR + '/**'] });
        let called = false;
        
        shadow.onGhostMessage(() => {
            called = true;
        });
        
        // Manually trigger via internal watcher
        (shadow.getWatcher() as any).emitEvent('change', 'test.ts');
        
        expect(called).toBe(true);
        shadow.stop();
    });

    it('should filter events through heuristics', () => {
        const shadow = new ShadowLoop({ paths: [TEST_DIR + '/**'] });
        const messages: GhostMessage[] = [];
        
        shadow.onGhostMessage((msg) => messages.push(msg));
        shadow.start();
        
        // Trigger TypeScript file change
        (shadow.getWatcher() as any).emitEvent('change', 'App.ts');
        
        expect(messages.length).toBeGreaterThan(0);
        expect(messages[0].message).toContain('App.ts');
        
        shadow.stop();
    });

    it('should not send messages for non-matching files', () => {
        const shadow = new ShadowLoop({ paths: [TEST_DIR + '/**'] });
        const messages: GhostMessage[] = [];
        
        shadow.onGhostMessage((msg) => messages.push(msg));
        shadow.start();
        
        // Trigger non-TypeScript file
        (shadow.getWatcher() as any).emitEvent('change', 'readme.md');
        
        expect(messages.length).toBe(0);
        
        shadow.stop();
    });
});

describe('Shadow Loop - Error Handling', () => {
    it('should handle invalid paths gracefully', () => {
        expect(() => {
            const shadow = new ShadowLoop({ paths: ['/nonexistent/**'] });
            shadow.start();
            shadow.stop();
        }).not.toThrow();
    });

    it('should handle empty paths', () => {
        expect(() => {
            const shadow = new ShadowLoop({ paths: [] });
            shadow.start();
            shadow.stop();
        }).not.toThrow();
    });

    it('should handle stop before start', () => {
        const shadow = new ShadowLoop({ paths: ['src/**'] });
        expect(() => shadow.stop()).not.toThrow();
    });

    it('should handle multiple starts', () => {
        const shadow = new ShadowLoop({ paths: ['src/**'] });
        shadow.start();
        shadow.start();
        expect(shadow.isRunning()).toBe(true);
        shadow.stop();
    });

    it('should handle multiple stops', () => {
        const shadow = new ShadowLoop({ paths: ['src/**'] });
        shadow.start();
        shadow.stop();
        shadow.stop();
        expect(shadow.isRunning()).toBe(false);
    });

    it('should handle restart', () => {
        const shadow = new ShadowLoop({ paths: ['src/**'] });
        shadow.start();
        shadow.stop();
        shadow.start();
        expect(shadow.isRunning()).toBe(true);
        shadow.stop();
    });
});

describe('Shadow Loop - Heuristic Integration', () => {
    it('should use built-in heuristics', () => {
        const shadow = new ShadowLoop({ paths: ['src/**'] });
        const messages: GhostMessage[] = [];
        
        shadow.onGhostMessage((msg) => messages.push(msg));
        shadow.start();
        
        // Test new file heuristic
        (shadow.getWatcher() as any).emitEvent('add', 'NewFeature.ts');
        expect(messages.length).toBe(1);
        expect(messages[0].message).toContain('Need tests?');
        expect(messages[0].priority).toBe('medium');
        
        shadow.stop();
    });

    it('should detect file changes', () => {
        const shadow = new ShadowLoop({ paths: ['src/**'] });
        const messages: GhostMessage[] = [];
        
        shadow.onGhostMessage((msg) => messages.push(msg));
        shadow.start();
        
        (shadow.getWatcher() as any).emitEvent('change', 'App.ts');
        expect(messages.length).toBe(1);
        expect(messages[0].message).toContain('Need help?');
        
        shadow.stop();
    });

    it('should detect test files', () => {
        const shadow = new ShadowLoop({ paths: ['tests/**'] });
        const messages: GhostMessage[] = [];
        
        shadow.onGhostMessage((msg) => messages.push(msg));
        shadow.start();
        
        (shadow.getWatcher() as any).emitEvent('change', 'app.test.ts');
        expect(messages.length).toBe(1);
        expect(messages[0].message).toContain('Test file updated');
        
        shadow.stop();
    });

    it('should allow custom heuristics', () => {
        const shadow = new ShadowLoop({ paths: ['src/**'] });
        const messages: GhostMessage[] = [];
        
        shadow.getHeuristics().register({
            name: 'custom',
            test: (e) => e.path.endsWith('.jsx'),
            generate: (e) => ({
                message: `React file: ${e.path}`,
                context: { path: e.path },
                priority: 'high',
            }),
        });
        
        shadow.onGhostMessage((msg) => messages.push(msg));
        shadow.start();
        
        (shadow.getWatcher() as any).emitEvent('change', 'Component.jsx');
        expect(messages.length).toBe(1);
        expect(messages[0].message).toContain('React file');
        expect(messages[0].priority).toBe('high');
        
        shadow.stop();
    });
});

describe('Shadow Loop - Message Priority', () => {
    it('should set correct priority for new files', () => {
        const shadow = new ShadowLoop({ paths: ['src/**'] });
        const messages: GhostMessage[] = [];
        
        shadow.onGhostMessage((msg) => messages.push(msg));
        shadow.start();
        
        (shadow.getWatcher() as any).emitEvent('add', 'new.ts');
        expect(messages[0].priority).toBe('medium');
        
        shadow.stop();
    });

    it('should set correct priority for changes', () => {
        const shadow = new ShadowLoop({ paths: ['src/**'] });
        const messages: GhostMessage[] = [];
        
        shadow.onGhostMessage((msg) => messages.push(msg));
        shadow.start();
        
        (shadow.getWatcher() as any).emitEvent('change', 'existing.ts');
        expect(messages[0].priority).toBe('low');
        
        shadow.stop();
    });
});
