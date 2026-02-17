// ─── Filesystem Watcher ───────────────────────────────────────────
// Monitors filesystem changes using chokidar

import chokidar, { type FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import type { WatchEvent, WatcherConfig } from './types.js';
import { logger } from '../utils/logger.js';

export class FilesystemWatcher extends EventEmitter {
    private watcher: FSWatcher | null = null;

    watch(config: WatcherConfig): void {
        if (this.watcher) {
            this.stop();
        }

        this.watcher = chokidar.watch(config.paths, {
            ignored: config.ignored || ['**/node_modules/**', '**/dist/**', '**/.git/**'],
            persistent: true,
            ignoreInitial: true,
        });

        this.watcher
            .on('add', (path) => this.emitEvent('add', path))
            .on('change', (path) => this.emitEvent('change', path))
            .on('unlink', (path) => this.emitEvent('unlink', path));

        logger.info({ paths: config.paths }, 'Filesystem watcher started');
    }

    stop(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            logger.info('Filesystem watcher stopped');
        }
    }

    private emitEvent(type: 'add' | 'change' | 'unlink', path: string): void {
        const event: WatchEvent = {
            type,
            path,
            timestamp: Date.now(),
        };
        this.emit('change', event);
    }
}
