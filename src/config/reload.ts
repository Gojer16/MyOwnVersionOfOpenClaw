// ─── Config Hot Reload System ─────────────────────────────────────
// Watches config file and reloads without full restart
// Inspired by OpenClaw's config-reload.ts

import fs from 'node:fs';
import path from 'node:path';
import { TALON_HOME } from './loader.js';
import { logger } from '../utils/logger.js';

export type ReloadHandler = (newConfig: unknown) => void | Promise<void>;

interface ReloadRule {
    prefix: string;
    kind: 'hot' | 'restart' | 'none';
}

const CONFIG_PATH = path.join(TALON_HOME, 'config.json');

const DEFAULT_RELOAD_RULES: ReloadRule[] = [
    { prefix: 'gateway', kind: 'hot' },
    { prefix: 'channels', kind: 'hot' },
    { prefix: 'tools', kind: 'hot' },
    { prefix: 'memory', kind: 'hot' },
    { prefix: 'agent', kind: 'hot' },
];

export class ConfigReloader {
    private watcher: fs.FSWatcher | null = null;
    private handlers = new Set<ReloadHandler>();
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastConfig: string = '';
    private debounceMs: number;

    constructor(debounceMs: number = 300) {
        this.debounceMs = debounceMs;
    }

    /**
     * Register a handler to be called when config changes.
     */
    onReload(handler: ReloadHandler): void {
        this.handlers.add(handler);
    }

    /**
     * Start watching the config file.
     */
    start(): void {
        if (this.watcher) {
            logger.warn('ConfigReloader already started');
            return;
        }

        if (!fs.existsSync(CONFIG_PATH)) {
            logger.info('No config file to watch');
            return;
        }

        // Store initial content hash
        this.lastConfig = this.getConfigContent();

        // Watch for changes
        this.watcher = fs.watch(CONFIG_PATH, (eventType) => {
            if (eventType === 'change') {
                this.handleChange();
            }
        });

        logger.info({ path: CONFIG_PATH }, 'Config reload watcher started');
    }

    /**
     * Stop watching the config file.
     */
    stop(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            logger.info('Config reload watcher stopped');
        }
    }

    /**
     * Force a config reload (useful for testing or manual triggers).
     */
    async reload(): Promise<void> {
        logger.info('Manual config reload triggered');
        await this.handleChange(true);
    }

    private getConfigContent(): string {
        try {
            return fs.readFileSync(CONFIG_PATH, 'utf-8');
        } catch {
            return '';
        }
    }

    private async handleChange(force: boolean = false): Promise<void> {
        // Debounce rapid changes
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
            try {
                const content = this.getConfigContent();

                // Check if config actually changed
                if (!force && content === this.lastConfig) {
                    return;
                }

                // Parse and validate new config
                const newConfig = JSON.parse(content);
                this.lastConfig = content;

                // Determine what changed
                const changedPaths = this.detectChanges();

                if (changedPaths.length === 0 && !force) {
                    logger.debug('No significant config changes detected');
                    return;
                }

                logger.info({ changedPaths, force }, 'Config changed, reloading...');

                // Notify all handlers
                for (const handler of this.handlers) {
                    try {
                        await handler(newConfig);
                    } catch (err) {
                        logger.error({ err, handler: handler.name }, 'Reload handler error');
                    }
                }

                logger.info('Config reload completed');
            } catch (err) {
                logger.error({ err }, 'Error during config reload');
            }
        }, this.debounceMs);
    }

    private detectChanges(): string[] {
        // Simple detection - could be enhanced to track specific paths
        return ['config']; // For now, signal that config changed
    }
}

/**
 * Create a config reloader with handlers for specific components.
 */
export function createConfigReloader(
    handlers: {
        onGatewayReload?: ReloadHandler;
        onChannelReload?: ReloadHandler;
        onToolReload?: ReloadHandler;
        onAgentReload?: ReloadHandler;
    },
): ConfigReloader {
    const reloader = new ConfigReloader();

    if (handlers.onGatewayReload) {
        reloader.onReload(handlers.onGatewayReload);
    }

    if (handlers.onChannelReload) {
        reloader.onReload(handlers.onChannelReload);
    }

    if (handlers.onToolReload) {
        reloader.onReload(handlers.onToolReload);
    }

    if (handlers.onAgentReload) {
        reloader.onReload(handlers.onAgentReload);
    }

    return reloader;
}
