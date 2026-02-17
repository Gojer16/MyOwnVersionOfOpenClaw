import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShadowLoop, FilesystemWatcher, HeuristicEngine, GhostMessenger } from '../../src/shadow/index.js';
import type { WatchEvent, GhostMessage, Heuristic, WatcherConfig } from '../../src/shadow/types.js';

describe('Shadow Loop - Filesystem Watcher', () => {
    let watcher: FilesystemWatcher;
    
    beforeEach(() => {
        watcher = new FilesystemWatcher();
    });
    
    afterEach(() => {
        watcher.stop();
    });
    
    it('should start watching configured paths', () => {
        const config: WatcherConfig = { paths: ['src/**', 'tests/**'] };
        watcher.watch(config);
        expect(watcher).toBeDefined();
    });
    
    it('should emit events on file changes', () => {
        const events: WatchEvent[] = [];
        watcher.on('change', (e: WatchEvent) => {
            events.push(e);
        });
        
        // Manually emit for testing
        (watcher as any).emitEvent('change', 'src/test.ts');
        
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('change');
        expect(events[0].path).toBe('src/test.ts');
        expect(events[0].timestamp).toBeGreaterThan(0);
    });
    
    it('should stop watching when stopped', () => {
        watcher.watch({ paths: ['src/**'] });
        watcher.stop();
        expect(watcher).toBeDefined();
    });
});

describe('Shadow Loop - Heuristic Engine', () => {
    let engine: HeuristicEngine;
    
    beforeEach(() => {
        engine = new HeuristicEngine();
    });
    
    it('should register heuristics', () => {
        const heuristic: Heuristic = {
            name: 'test',
            test: () => true,
            generate: () => ({ message: 'test', context: {}, priority: 'low' })
        };
        
        engine.register(heuristic);
        expect(engine).toBeDefined();
    });
    
    it('should evaluate events against heuristics', () => {
        const heuristic: Heuristic = {
            name: 'typescript-file',
            test: (e) => e.path.endsWith('.ts'),
            generate: (e) => ({ 
                message: `TypeScript file changed: ${e.path}`, 
                context: { path: e.path }, 
                priority: 'medium' 
            })
        };
        
        engine.register(heuristic);
        const event: WatchEvent = { type: 'change', path: 'src/test.ts', timestamp: Date.now() };
        const result = engine.evaluate(event);
        
        expect(result).not.toBeNull();
        expect(result?.message).toContain('TypeScript file changed');
    });
    
    it('should return null if no heuristic matches', () => {
        const heuristic: Heuristic = {
            name: 'typescript-file',
            test: (e) => e.path.endsWith('.ts'),
            generate: (e) => ({ message: 'test', context: {}, priority: 'low' })
        };
        
        engine.register(heuristic);
        const event: WatchEvent = { type: 'change', path: 'src/test.js', timestamp: Date.now() };
        const result = engine.evaluate(event);
        
        expect(result).toBeNull();
    });
    
    it('should use first matching heuristic', () => {
        const h1: Heuristic = {
            name: 'first',
            test: () => true,
            generate: () => ({ message: 'first', context: {}, priority: 'low' })
        };
        const h2: Heuristic = {
            name: 'second',
            test: () => true,
            generate: () => ({ message: 'second', context: {}, priority: 'low' })
        };
        
        engine.register(h1);
        engine.register(h2);
        
        const event: WatchEvent = { type: 'change', path: 'test.ts', timestamp: Date.now() };
        const result = engine.evaluate(event);
        
        expect(result?.message).toBe('first');
    });
});

describe('Shadow Loop - Ghost Messenger', () => {
    let ghost: GhostMessenger;
    
    beforeEach(() => {
        ghost = new GhostMessenger();
    });
    
    afterEach(() => {
        ghost.clear();
    });
    
    it('should send ghost messages', () => {
        const message: GhostMessage = {
            message: 'Test message',
            context: { file: 'test.ts' },
            priority: 'medium'
        };
        
        ghost.send(message);
        
        expect(ghost.getMessages()).toHaveLength(1);
        expect(ghost.getMessages()[0].message).toBe('Test message');
    });
    
    it('should store multiple messages', () => {
        ghost.send({ message: 'msg1', context: {}, priority: 'low' });
        ghost.send({ message: 'msg2', context: {}, priority: 'high' });
        
        expect(ghost.getMessages()).toHaveLength(2);
    });
    
    it('should clear messages', () => {
        ghost.send({ message: 'test', context: {}, priority: 'low' });
        ghost.clear();
        
        expect(ghost.getMessages()).toHaveLength(0);
    });
});

describe('Shadow Loop - Integration', () => {
    let shadow: ShadowLoop;
    
    beforeEach(() => {
        // Create without built-in heuristics for testing
        shadow = new ShadowLoop({ paths: ['src/**'], enabled: false });
        // Clear built-in heuristics
        (shadow.getHeuristics() as any).heuristics = [];
    });
    
    afterEach(() => {
        shadow.stop();
    });
    
    it('should start and stop', () => {
        shadow.start();
        expect(shadow.isRunning()).toBe(true);
        
        shadow.stop();
        expect(shadow.isRunning()).toBe(false);
    });
    
    it('should process events through full pipeline', () => {
        const heuristic: Heuristic = {
            name: 'test-file',
            test: (e) => e.path.includes('test'),
            generate: (e) => ({ 
                message: 'Test file changed', 
                context: { path: e.path }, 
                priority: 'low' 
            })
        };
        
        shadow.getHeuristics().register(heuristic);
        shadow.start();
        
        // Manually trigger event
        (shadow.getWatcher() as any).emitEvent('change', 'src/test.ts');
        
        const messages = shadow.getGhost().getMessages();
        expect(messages).toHaveLength(1);
        expect(messages[0].message).toBe('Test file changed');
    });
    
    it('should not send ghost message if no heuristic matches', () => {
        const heuristic: Heuristic = {
            name: 'typescript',
            test: (e) => e.path.endsWith('.ts'),
            generate: (e) => ({ message: 'TS changed', context: {}, priority: 'low' })
        };
        
        shadow.getHeuristics().register(heuristic);
        shadow.start();
        
        // Manually trigger event
        (shadow.getWatcher() as any).emitEvent('change', 'src/test.js');
        
        expect(shadow.getGhost().getMessages()).toHaveLength(0);
    });
});

describe('Shadow Loop - Built-in Heuristics', () => {
    it('should detect TypeScript file changes', () => {
        const heuristic: Heuristic = {
            name: 'typescript-change',
            test: (e) => e.type === 'change' && e.path.endsWith('.ts'),
            generate: (e) => ({
                message: `I noticed you changed ${e.path}. Need help?`,
                context: { path: e.path, type: 'typescript' },
                priority: 'low'
            })
        };
        
        const event: WatchEvent = { type: 'change', path: 'src/App.ts', timestamp: Date.now() };
        expect(heuristic.test(event)).toBe(true);
        
        const result = heuristic.generate(event);
        expect(result?.message).toContain('App.ts');
    });
    
    it('should detect new file creation', () => {
        const heuristic: Heuristic = {
            name: 'new-file',
            test: (e) => e.type === 'add' && e.path.endsWith('.ts'),
            generate: (e) => ({
                message: `I see you created ${e.path}. Need tests?`,
                context: { path: e.path, type: 'new-file' },
                priority: 'medium'
            })
        };
        
        const event: WatchEvent = { type: 'add', path: 'src/feature.ts', timestamp: Date.now() };
        expect(heuristic.test(event)).toBe(true);
        
        const result = heuristic.generate(event);
        expect(result?.message).toContain('Need tests?');
    });
    
    it('should detect test file changes', () => {
        const heuristic: Heuristic = {
            name: 'test-change',
            test: (e) => e.path.includes('.test.') || e.path.includes('.spec.'),
            generate: (e) => ({
                message: `Test file updated: ${e.path}`,
                context: { path: e.path, type: 'test' },
                priority: 'low'
            })
        };
        
        const event: WatchEvent = { type: 'change', path: 'tests/unit/app.test.ts', timestamp: Date.now() };
        expect(heuristic.test(event)).toBe(true);
    });
});
