// ─── Event Bus Tests ──────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/gateway/events.js';

describe('EventBus', () => {
    describe('emit and on', () => {
        it('should emit and receive events', () => {
            const bus = new EventBus();
            const handler = vi.fn();

            bus.on('test.event', handler);
            bus.emit('test.event', { data: 'test' });

            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith({ data: 'test' });
        });

        it('should support multiple handlers for same event', () => {
            const bus = new EventBus();
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            bus.on('test.event', handler1);
            bus.on('test.event', handler2);
            bus.emit('test.event', { data: 'test' });

            expect(handler1).toHaveBeenCalledOnce();
            expect(handler2).toHaveBeenCalledOnce();
        });

        it('should not call handlers for different events', () => {
            const bus = new EventBus();
            const handler = vi.fn();

            bus.on('event.one', handler);
            bus.emit('event.two', { data: 'test' });

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('off', () => {
        it('should remove event handler', () => {
            const bus = new EventBus();
            const handler = vi.fn();

            bus.on('test.event', handler);
            bus.off('test.event', handler);
            bus.emit('test.event', { data: 'test' });

            expect(handler).not.toHaveBeenCalled();
        });

        it('should only remove specified handler', () => {
            const bus = new EventBus();
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            bus.on('test.event', handler1);
            bus.on('test.event', handler2);
            bus.off('test.event', handler1);
            bus.emit('test.event', { data: 'test' });

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).toHaveBeenCalledOnce();
        });
    });

    describe('once', () => {
        it('should only call handler once', () => {
            const bus = new EventBus();
            const handler = vi.fn();

            bus.once('test.event', handler);
            bus.emit('test.event', { data: 'test1' });
            bus.emit('test.event', { data: 'test2' });

            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith({ data: 'test1' });
        });
    });
});
