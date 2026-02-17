// ─── Plugin/Extension System ──────────────────────────────────────
// Modular architecture for extensibility
// Allows channels, tools, and auth providers to be loaded dynamically

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { TalonConfig } from '../config/schema.js';
import type { EventBus } from '../gateway/events.js';
import type { AgentLoop } from '../agent/loop.js';

// ─── Plugin Schema ────────────────────────────────────────────────

export const PluginConfigSchema = z.object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    author: z.string().optional(),
    main: z.string(), // Entry point file
    configSchema: z.record(z.any()).optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// ─── Plugin API Interface ─────────────────────────────────────────

export interface PluginAPI {
    /** Plugin configuration */
    readonly config: TalonConfig;
    
    /** Event bus for communication */
    readonly events: EventBus;
    
    /** Agent loop reference */
    readonly agent: AgentLoop;
    
    /** Logger instance */
    readonly logger: typeof logger;
    
    /** Get plugin configuration */
    getConfig<T = unknown>(key: string, defaultValue?: T): T;
    
    /** Set plugin configuration */
    setConfig(key: string, value: unknown): void;
}

// ─── Plugin Interface ─────────────────────────────────────────────

export interface Plugin {
    /** Plugin metadata */
    readonly meta: PluginConfig;
    
    /** Called when plugin is loaded */
    activate(api: PluginAPI): void | Promise<void>;
    
    /** Called when plugin is unloaded */
    deactivate?(): void | Promise<void>;
}

// ─── Plugin Loader ────────────────────────────────────────────────

export class PluginLoader {
    private plugins = new Map<string, Plugin>();
    private loaded = new Set<string>();
    
    constructor(
        private pluginDirs: string[],
        private api: PluginAPI,
    ) {}

    /**
     * Load all plugins from registered directories
     */
    async loadAll(): Promise<Plugin[]> {
        const loaded: Plugin[] = [];
        
        for (const dir of this.pluginDirs) {
            try {
                const plugins = await this.loadFromDirectory(dir);
                loaded.push(...plugins);
            } catch (err) {
                this.api.logger.error({ err, dir }, 'Failed to load plugins from directory');
            }
        }
        
        return loaded;
    }

    /**
     * Load plugins from a specific directory
     */
    private async loadFromDirectory(dir: string): Promise<Plugin[]> {
        const fs = await import('node:fs');
        const path = await import('node:path');
        
        const loaded: Plugin[] = [];
        
        if (!fs.existsSync(dir)) {
            return loaded;
        }

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            
            const pluginPath = path.join(dir, entry.name);
            try {
                const plugin = await this.loadPlugin(pluginPath);
                if (plugin) {
                    loaded.push(plugin);
                }
            } catch (err) {
                this.api.logger.error({ err, path: pluginPath }, 'Failed to load plugin');
            }
        }
        
        return loaded;
    }

    /**
     * Load a single plugin from path
     */
    private async loadPlugin(pluginPath: string): Promise<Plugin | null> {
        const fs = await import('node:fs');
        const path = await import('node:path');
        
        // Look for plugin.json or package.json
        const pluginJsonPath = path.join(pluginPath, 'plugin.json');
        const packageJsonPath = path.join(pluginPath, 'package.json');
        
        let config: PluginConfig;
        
        if (fs.existsSync(pluginJsonPath)) {
            const content = fs.readFileSync(pluginJsonPath, 'utf-8');
            const raw = JSON.parse(content);
            config = PluginConfigSchema.parse(raw);
        } else if (fs.existsSync(packageJsonPath)) {
            const content = fs.readFileSync(packageJsonPath, 'utf-8');
            const raw = JSON.parse(content);
            // Use package.json with talon.plugin config
            config = PluginConfigSchema.parse({
                id: raw.name,
                name: raw.talon?.plugin?.name ?? raw.name,
                version: raw.version,
                description: raw.description,
                author: raw.author,
                main: raw.talon?.plugin?.main ?? raw.main ?? 'index.js',
            });
        } else {
            return null;
        }

        // Check if already loaded
        if (this.plugins.has(config.id)) {
            this.api.logger.warn({ pluginId: config.id }, 'Plugin already loaded');
            return this.plugins.get(config.id)!;
        }

        // Load the plugin module
        const mainPath = path.join(pluginPath, config.main);
        if (!fs.existsSync(mainPath)) {
            throw new Error(`Plugin main file not found: ${mainPath}`);
        }

        const module = await import(mainPath);
        const plugin: Plugin = module.default ?? module;
        
        // Validate plugin structure
        if (!plugin.meta || !plugin.activate) {
            throw new Error('Plugin must export meta and activate function');
        }

        // Store plugin
        this.plugins.set(config.id, plugin);
        
        this.api.logger.info({ 
            pluginId: config.id, 
            name: config.name,
            version: config.version,
        }, 'Plugin loaded');
        
        return plugin;
    }

    /**
     * Activate all loaded plugins
     */
    async activateAll(): Promise<void> {
        for (const [id, plugin] of this.plugins) {
            if (this.loaded.has(id)) continue;
            
            try {
                await plugin.activate(this.api);
                this.loaded.add(id);
                this.api.logger.info({ pluginId: id }, 'Plugin activated');
            } catch (err) {
                this.api.logger.error({ err, pluginId: id }, 'Failed to activate plugin');
            }
        }
    }

    /**
     * Deactivate all plugins
     */
    async deactivateAll(): Promise<void> {
        for (const [id, plugin] of this.plugins) {
            if (!this.loaded.has(id)) continue;
            
            try {
                await plugin.deactivate?.();
                this.loaded.delete(id);
                this.api.logger.info({ pluginId: id }, 'Plugin deactivated');
            } catch (err) {
                this.api.logger.error({ err, pluginId: id }, 'Failed to deactivate plugin');
            }
        }
    }

    /**
     * Get a specific plugin
     */
    get(id: string): Plugin | undefined {
        return this.plugins.get(id);
    }

    /**
     * Get all loaded plugins
     */
    getAll(): Plugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Check if plugin is loaded
     */
    isLoaded(id: string): boolean {
        return this.loaded.has(id);
    }

    /**
     * Get plugin count
     */
    get count(): number {
        return this.plugins.size;
    }
}

// ─── Channel Plugin Interface ─────────────────────────────────────

export interface ChannelPlugin {
    readonly id: string;
    readonly name: string;
    readonly capabilities: string[];
    
    initialize(api: PluginAPI): void | Promise<void>;
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    send(sessionId: string, message: unknown): void | Promise<void>;
}

// ─── Tool Plugin Interface ────────────────────────────────────────

export interface ToolPlugin {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
    
    execute(args: Record<string, unknown>): Promise<string>;
}

// ─── Auth Provider Plugin Interface ───────────────────────────────

export interface AuthProviderPlugin {
    readonly id: string;
    readonly name: string;
    
    authenticate(credentials: unknown): Promise<boolean>;
    refreshToken?(): Promise<string>;
    logout?(): Promise<void>;
}

// ─── Plugin Registry ──────────────────────────────────────────────

export class PluginRegistry {
    private channels = new Map<string, ChannelPlugin>();
    private tools = new Map<string, ToolPlugin>();
    private authProviders = new Map<string, AuthProviderPlugin>();

    registerChannel(plugin: ChannelPlugin): void {
        this.channels.set(plugin.id, plugin);
        logger.info({ channelId: plugin.id }, 'Channel plugin registered');
    }

    registerTool(name: string, tool: ToolPlugin): void {
        this.tools.set(name, tool);
        logger.info({ toolName: name }, 'Tool plugin registered');
    }

    registerAuthProvider(id: string, provider: AuthProviderPlugin): void {
        this.authProviders.set(id, provider);
        logger.info({ providerId: id }, 'Auth provider registered');
    }

    getChannel(id: string): ChannelPlugin | undefined {
        return this.channels.get(id);
    }

    getTool(name: string): ToolPlugin | undefined {
        return this.tools.get(name);
    }

    getAuthProvider(id: string): AuthProviderPlugin | undefined {
        return this.authProviders.get(id);
    }

    getAllChannels(): ChannelPlugin[] {
        return Array.from(this.channels.values());
    }

    getAllTools(): ToolPlugin[] {
        return Array.from(this.tools.values());
    }

    getAllAuthProviders(): AuthProviderPlugin[] {
        return Array.from(this.authProviders.values());
    }
}

// ─── Export Singleton ─────────────────────────────────────────────

export const pluginRegistry = new PluginRegistry();
