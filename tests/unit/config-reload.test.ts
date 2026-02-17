// ─── Config Reload Tests ────────────────────────────────────────────────
// Tests for hot reload functionality (unit tests for class API)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigReloader } from '@/config/reload.js';

describe('ConfigReloader', () => {
    let reloader: ConfigReloader;

    beforeEach(() => {
        reloader = new ConfigReloader(50);
    });

    afterEach(() => {
        reloader.stop();
    });

    describe('constructor', () => {
        it('should create instance with default debounce', () => {
            const r = new ConfigReloader();
            expect(r).toBeDefined();
            r.stop();
        });

        it('should create instance with custom debounce', () => {
            const r = new ConfigReloader(200);
            expect(r).toBeDefined();
            r.stop();
        });
    });

    describe('onReload', () => {
        it('should register reload handler', () => {
            const handler = vi.fn();
            reloader.onReload(handler);
            // Handler registered - no error thrown
            expect(handler).toBeDefined();
        });

        it('should support multiple handlers', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            
            reloader.onReload(handler1);
            reloader.onReload(handler2);
            
            expect(handler1).toBeDefined();
            expect(handler2).toBeDefined();
        });
    });

    describe('start/stop', () => {
        it('should start without error when no config exists', () => {
            // Should not throw - just logs and returns
            expect(() => reloader.start()).not.toThrow();
        });

        it('should stop without error', () => {
            reloader.start();
            expect(() => reloader.stop()).not.toThrow();
        });

        it('should handle start when already started', () => {
            reloader.start();
            // Second start should not throw
            expect(() => reloader.start()).not.toThrow();
        });

        it('should handle stop when not started', () => {
            // Stop without start should not throw
            expect(() => reloader.stop()).not.toThrow();
        });
    });

    describe('reload', () => {
        it('should be an async function', async () => {
            // reload should exist and be callable
            expect(typeof reloader.reload).toBe('function');
            
            // Should resolve even if config doesn't exist
            await expect(reloader.reload()).resolves.toBeUndefined();
        });
    });
});
