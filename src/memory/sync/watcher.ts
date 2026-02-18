import chokidar from 'chokidar';
import { EventEmitter } from 'node:events';
import { logger } from '../../utils/logger.js';
import path from 'node:path';

export interface FileWatcherOptions {
  paths: string[];
  ignore?: string[];
  debounceMs?: number;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  absPath: string;
}

/**
 * File watcher with debouncing for memory indexing.
 */
export class FileWatcher extends EventEmitter {
  private watcher?: chokidar.FSWatcher;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private debounceMs: number;

  constructor(private options: FileWatcherOptions) {
    super();
    this.debounceMs = options.debounceMs || 1500;
  }

  /**
   * Start watching files.
   */
  start(): void {
    if (this.watcher) {
      logger.warn('File watcher already started');
      return;
    }

    this.watcher = chokidar.watch(this.options.paths, {
      ignored: this.options.ignore || [],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filePath) => this.handleChange('add', filePath));
    this.watcher.on('change', (filePath) => this.handleChange('change', filePath));
    this.watcher.on('unlink', (filePath) => this.handleChange('unlink', filePath));

    this.watcher.on('error', (error) => {
      logger.error({ error }, 'File watcher error');
    });

    logger.info({ paths: this.options.paths }, 'File watcher started');
  }

  /**
   * Stop watching files.
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    // Clear all pending timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    await this.watcher.close();
    this.watcher = undefined;

    logger.info('File watcher stopped');
  }

  /**
   * Handle file change with debouncing.
   */
  private handleChange(type: 'add' | 'change' | 'unlink', filePath: string): void {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);

      const event: FileChangeEvent = {
        type,
        path: filePath,
        absPath: path.resolve(filePath),
      };

      logger.debug({ event }, 'File change detected');
      this.emit('change', event);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }
}
