// ─── Shadow Loop ──────────────────────────────────────────────────
// Main orchestrator for proactive intelligence

import { FilesystemWatcher } from './watcher.js';
import { HeuristicEngine, builtInHeuristics } from './heuristics.js';
import { GhostMessenger } from './ghost.js';
import type { WatcherConfig, WatchEvent, GhostMessage } from './types.js';
import { logger } from '../utils/logger.js';

export class ShadowLoop {
    private watcher: FilesystemWatcher;
    private heuristics: HeuristicEngine;
    private ghost: GhostMessenger;
    private enabled: boolean = false;

    constructor(config: WatcherConfig) {
        this.watcher = new FilesystemWatcher();
        this.heuristics = new HeuristicEngine();
        this.ghost = new GhostMessenger();

        // Register built-in heuristics
        for (const heuristic of builtInHeuristics) {
            this.heuristics.register(heuristic);
        }

        // Setup pipeline
        this.watcher.on('change', (event: WatchEvent) => {
            const message = this.heuristics.evaluate(event);
            if (message) {
                this.ghost.send(message);
            }
        });

        if (config.enabled !== false) {
            this.watcher.watch(config);
        }
    }

    start(): void {
        this.enabled = true;
        logger.info('Shadow Loop started');
    }

    stop(): void {
        this.enabled = false;
        this.watcher.stop();
        logger.info('Shadow Loop stopped');
    }

    isRunning(): boolean {
        return this.enabled;
    }

    getWatcher(): FilesystemWatcher {
        return this.watcher;
    }

    getHeuristics(): HeuristicEngine {
        return this.heuristics;
    }

    getGhost(): GhostMessenger {
        return this.ghost;
    }

    onGhostMessage(handler: (message: GhostMessage) => void): void {
        this.ghost.setHandler(handler);
    }
}

export * from './types.js';
export { FilesystemWatcher } from './watcher.js';
export { HeuristicEngine, builtInHeuristics } from './heuristics.js';
export { GhostMessenger } from './ghost.js';
