# Talon Plugin Architecture System

## Purpose
Modular extension system for dynamically loading channels, tools, and authentication providers. Enables third-party extensions without modifying core codebase, supporting hot reloading, dependency management, and standardized plugin lifecycle.

## Scope Boundaries
- **IN SCOPE**: Plugin discovery, loading, activation/deactivation, configuration management, plugin registry, channel/tool/auth provider interfaces
- **OUT OF SCOPE**: Core application logic, agent reasoning, memory management, user session handling
- **BOUNDARIES**: Plugins extend functionality but don't replace core systems. Plugin API provides controlled access to core services. Plugins load from configured directories at startup.

## Architecture Overview
```
Plugin Directories → PluginLoader → PluginRegistry → [Channel|Tool|Auth]Plugins
    ↓                    ↓               ↓
plugin.json        Validation      Registration
package.json       Activation      API Access
```

**Core Design**: Factory pattern with plugin discovery, Zod schema validation, and singleton registry. Supports both `plugin.json` and `package.json` (with `talon.plugin` config) manifest formats.

**Key Components**:
1. `PluginLoader` - Discovers, loads, validates, and manages plugin lifecycle
2. `PluginRegistry` - Central registry for plugin instances by type
3. `PluginAPI` - Controlled interface exposing core services to plugins
4. Plugin interfaces - `ChannelPlugin`, `ToolPlugin`, `AuthProviderPlugin`

## Folder Structure Explanation
```
plugins/
├── index.ts              # Complete plugin system (332 lines)
└── README.md             # This documentation
```

**Single File Architecture**: All plugin system code resides in `index.ts` containing:
- Plugin configuration schema (Zod)
- Plugin API interface
- Plugin loader with lifecycle management
- Plugin registry with type-specific registration
- Specialized plugin interfaces for channels, tools, auth providers

## Public API
```typescript
// Core Types
interface PluginConfig { id: string; name: string; version: string; description?: string; author?: string; main: string; configSchema?: Record<string, any>; }
interface Plugin { readonly meta: PluginConfig; activate(api: PluginAPI): void | Promise<void>; deactivate?(): void | Promise<void>; }

// Plugin API
interface PluginAPI { 
    readonly config: TalonConfig; 
    readonly events: EventBus; 
    readonly agent: AgentLoop; 
    readonly logger: typeof logger;
    getConfig<T = unknown>(key: string, defaultValue?: T): T;
    setConfig(key: string, value: unknown): void;
}

// Specialized Plugins
interface ChannelPlugin { 
    readonly id: string; readonly name: string; readonly capabilities: string[];
    initialize(api: PluginAPI): void | Promise<void>;
    start(): void | Promise<void>; 
    stop(): void | Promise<void>;
    send(sessionId: string, message: unknown): void | Promise<void>;
}

interface ToolPlugin {
    readonly name: string; readonly description: string; readonly parameters: Record<string, unknown>;
    execute(args: Record<string, unknown>): Promise<string>;
}

interface AuthProviderPlugin {
    readonly id: string; readonly name: string;
    authenticate(credentials: unknown): Promise<boolean>;
    refreshToken?(): Promise<string>;
    logout?(): Promise<void>;
}

// Loader and Registry
class PluginLoader { 
    constructor(pluginDirs: string[], api: PluginAPI);
    async loadAll(): Promise<Plugin[]>; 
    async activateAll(): Promise<void>;
    async deactivateAll(): Promise<void>;
    get(id: string): Plugin | undefined;
    getAll(): Plugin[];
    isLoaded(id: string): boolean;
    get count(): number;
}

class PluginRegistry {
    registerChannel(plugin: ChannelPlugin): void;
    registerTool(name: string, tool: ToolPlugin): void;
    registerAuthProvider(id: string, provider: AuthProviderPlugin): void;
    getChannel(id: string): ChannelPlugin | undefined;
    getTool(name: string): ToolPlugin | undefined;
    getAuthProvider(id: string): AuthProviderPlugin | undefined;
    getAllChannels(): ChannelPlugin[];
    getAllTools(): ToolPlugin[];
    getAllAuthProviders(): AuthProviderPlugin[];
}

// Singleton
export const pluginRegistry = new PluginRegistry();
```

**Usage Pattern**:
```typescript
import { PluginLoader, PluginAPI, pluginRegistry } from './plugins/index.js';

// In gateway initialization
const pluginAPI: PluginAPI = { config, events, agent, logger, getConfig, setConfig };
const pluginLoader = new PluginLoader(['./plugins', '/global/plugins'], pluginAPI);
const plugins = await pluginLoader.loadAll();
await pluginLoader.activateAll();

// Plugin implementation example
export default {
    meta: { id: 'my-plugin', name: 'My Plugin', version: '1.0.0', main: 'index.js' },
    async activate(api) {
        api.logger.info('My plugin activated');
        pluginRegistry.registerTool('customTool', {
            name: 'customTool',
            description: 'My custom tool',
            parameters: {},
            async execute(args) { return 'Result'; }
        });
    }
};
```

## Internal Logic Details
**Plugin Discovery** (`index.ts:74-119`):
1. Iterate through configured plugin directories
2. Scan for subdirectories (each plugin must be in its own directory)
3. Look for `plugin.json` or `package.json` with `talon.plugin` config
4. Validate manifest against Zod schema `PluginConfigSchema`

**Plugin Loading** (`index.ts:124-184`):
1. Parse manifest file (`plugin.json` takes precedence over `package.json`)
2. Check for duplicate plugin IDs
3. Dynamically import plugin main file using ES modules
4. Validate plugin exports (`meta` and `activate` required)
5. Store in `Map<string, Plugin>` with plugin ID as key

**Plugin Activation** (`index.ts:189-201`):
1. Iterate through loaded plugins
2. Call `plugin.activate(api)` with PluginAPI instance
3. Track activated plugins in `Set<string>` to prevent duplicate activation
4. Log activation success/failure

**Plugin Registry** (`index.ts:285-328`):
- Separate maps for channel, tool, and auth provider plugins
- Type-safe registration and retrieval methods
- Singleton instance exported as `pluginRegistry`
- Used by core systems to discover and use plugins

**Plugin API Design** (`index.ts:27-45`):
- Read-only access to core services (`config`, `events`, `agent`, `logger`)
- Configuration getter/setter for plugin-specific settings
- No direct access to internal state - all interaction through controlled interfaces

## Data Contracts
**Plugin Manifest** (`index.ts:13-23`):
```typescript
{
    id: string;           // Unique plugin identifier (required)
    name: string;         // Human-readable name (required)
    version: string;      // Semantic version (required)
    description?: string; // Optional description
    author?: string;      // Optional author information
    main: string;         // Entry point file (required, e.g., "index.js")
    configSchema?: Record<string, any>; // Optional Zod schema for plugin config
}
```

**Package.json Alternative** (`index.ts:138-149`):
```json
{
    "name": "plugin-id",
    "version": "1.0.0",
    "description": "Plugin description",
    "author": "Author Name",
    "main": "index.js",
    "talon": {
        "plugin": {
            "name": "Plugin Display Name",
            "main": "index.js"
        }
    }
}
```

**Event Payloads** (`utils/types.ts:313-316`):
```typescript
'plugin.loaded': { pluginId: string; pluginName: string };
'plugin.activated': { pluginId: string; pluginName: string };
'plugin.deactivated': { pluginId: string; pluginName: string };
'plugin.error': { pluginId: string; error: string };
```

**Directory Structure**:
```
plugins/
├── my-channel-plugin/
│   ├── plugin.json      # or package.json with talon.plugin config
│   ├── index.js         # Main entry point
│   └── ...              # Additional files
└── my-tool-plugin/
    ├── plugin.json
    ├── index.js
    └── ...
```

## Failure Modes
1. **Missing Manifest** (`index.ts:150-152`): Returns `null` when neither `plugin.json` nor `package.json` found in plugin directory.

2. **Duplicate Plugin ID** (`index.ts:155-158`): Logs warning and returns existing plugin when duplicate ID detected.

3. **Missing Main File** (`index.ts:162-164`): Throws `Error("Plugin main file not found: ${mainPath}")` when entry point doesn't exist.

4. **Invalid Plugin Structure** (`index.ts:170-172`): Throws `Error("Plugin must export meta and activate function")` when plugin doesn't meet interface requirements.

5. **Module Import Failure**: Unhandled rejection when `import(mainPath)` fails (e.g., syntax error, missing dependencies).

6. **Activation Failure** (`index.ts:197-199`): Logs error but continues with other plugins when `plugin.activate()` throws.

**Recovery Strategies**:
- Plugin loading errors are isolated per plugin/directory
- Failed plugins don't prevent system startup
- Activation failures logged but don't stop other plugins
- Missing: Health checks and automatic plugin reloading

## Observability
**Current State**: Basic logging at INFO level for plugin lifecycle events.

**Log Events**:
- Plugin loaded: `{ pluginId, name, version }`
- Plugin activated: `{ pluginId }`
- Plugin deactivated: `{ pluginId }`
- Plugin error: `{ err, pluginId }` or `{ err, dir }` or `{ err, path }`

**Missing Observability**:
1. **Metrics**: Plugin count by type, activation success rate, plugin execution time
2. **Tracing**: Plugin execution context, dependency chain visualization
3. **Health Checks**: Plugin heartbeat monitoring, resource usage tracking
4. **Audit Log**: Configuration changes, plugin registration events

**Required Enhancements**:
- Plugin performance metrics (load time, activation time, memory usage)
- Dependency conflict detection and resolution
- Plugin version compatibility checking
- Hot reload monitoring and change detection

## AI Agent Instructions
**Plugin Development Guidelines**:
1. **Manifest Requirements**: Must include `id`, `name`, `version`, `main` in `plugin.json` or `package.json`

2. **Entry Point Structure**: Default export must implement `Plugin` interface with `meta` and `activate()`

3. **API Usage**: Access core services only through `PluginAPI` interface - no direct imports of internal modules

4. **Error Handling**: Plugins should handle their own errors and not crash the host system

5. **Resource Management**: Clean up resources in `deactivate()` method if provided

**Plugin Types**:
- **Channel Plugins**: Implement `ChannelPlugin` for new communication channels (Telegram, Slack, etc.)
- **Tool Plugins**: Implement `ToolPlugin` for new executable capabilities
- **Auth Provider Plugins**: Implement `AuthProviderPlugin` for alternative authentication methods

**Configuration Best Practices**:
- Use `api.getConfig()` for plugin-specific settings
- Define `configSchema` in manifest for validation
- Store sensitive data in environment variables, not plugin config

**Integration Points**:
- Plugins register with `pluginRegistry` singleton during activation
- Core systems discover plugins via registry methods (`getAllChannels()`, etc.)
- Event bus allows plugins to communicate with core and other plugins

**Security Considerations**:
- Plugins run with same privileges as main process
- Validate all plugin inputs and outputs
- Sandboxing not implemented - plugins have full system access
- Audit plugin behavior and network activity

## Extension Points
1. **New Plugin Types**: Extend `PluginRegistry` with additional maps and registration methods for new plugin categories.

2. **Plugin Hooks**: Add lifecycle hooks (`beforeActivate`, `afterActivate`, `beforeDeactivate`, `afterDeactivate`).

3. **Dependency Management**: Add `dependencies` and `peerDependencies` to plugin manifest with version resolution.

4. **Configuration UI**: Add schema-driven configuration UI generation from `configSchema`.

5. **Plugin Marketplace**: Add remote plugin repository support with signing and verification.

6. **Sandboxing**: Implement plugin isolation using worker threads or subprocesses.

7. **Hot Reload**: Add filesystem watching for plugin changes with safe reload.

8. **Plugin Composition**: Allow plugins to depend on and extend other plugins.

**Hook System** (Missing): No pre/post activation hooks. Suggested: `PluginHooks` interface with `validate(plugin): boolean`, `transform(plugin): Plugin`, etc.

**Plugin Events** (Missing): No plugin-specific event system. Suggested: `PluginEventBus` for plugin-to-plugin communication.

## Technical Debt & TODO
**HIGH PRIORITY**:
1. **Security**: Implement plugin sandboxing using worker threads or subprocess isolation
2. **Dependency Management**: Add version constraints and conflict resolution
3. **Error Recovery**: Add plugin health checks and automatic restart for failed plugins
4. **Validation**: Add runtime validation for plugin inputs/outputs using Zod schemas

**MEDIUM PRIORITY**:
5. **Hot Reload**: Implement filesystem watching and safe plugin reloading
6. **Configuration**: Add plugin configuration UI and persistence
7. **Metrics**: Comprehensive plugin performance and usage metrics
8. **Testing**: Unit tests for plugin loader, registry, and lifecycle

**LOW PRIORITY**:
9. **Plugin Marketplace**: Remote repository with signing and discovery
10. **Dependency Injection**: More sophisticated plugin dependency resolution
11. **Plugin Composition**: Allow plugins to extend and modify other plugins
12. **Migration Tools**: Version migration helpers for plugin updates

**ARCHITECTURAL DEBT**:
- Single large file (`index.ts:332 lines`) - should be split into separate modules
- No interface for `PluginLoader` - concrete class used directly
- Missing abstraction for plugin storage/persistence
- Hardcoded directory scanning logic - should be configurable
- No plugin isolation - all plugins share same memory space

**PERFORMANCE CONSIDERATIONS**:
- Dynamic imports (`import()`) have overhead - consider caching
- No plugin lazy loading - all plugins loaded at startup
- Missing plugin dependency graph for optimized loading order

**SECURITY DEBT**:
- Plugins have full system access (files, network, processes)
- No code signing or integrity verification
- No permission system for plugin capabilities
- No audit trail for plugin actions
- Missing: Plugin review process and security scanning