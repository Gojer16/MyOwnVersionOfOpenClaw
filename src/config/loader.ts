// ─── Config Loader ────────────────────────────────────────────────
// Loads ~/.talon/config.json, resolves env vars, validates with Zod

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TalonConfigSchema, type TalonConfig } from './schema.js';
import { ConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const TALON_HOME = path.join(os.homedir(), '.talon');
const CONFIG_PATH = path.join(TALON_HOME, 'config.json');

// ─── Env Var Resolution ───────────────────────────────────────────

/**
 * Replace ${VAR_NAME} patterns in a string with process.env values.
 * Returns the original pattern if the env var is not set.
 */
export function resolveEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
        const envValue = process.env[varName];
        return envValue !== undefined ? envValue : match;
    });
}

/**
 * Recursively resolve env vars in all string values of an object.
 */
function resolveEnvVarsDeep(obj: unknown): unknown {
    if (typeof obj === 'string') {
        return resolveEnvVars(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(resolveEnvVarsDeep);
    }
    if (obj !== null && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            result[key] = resolveEnvVarsDeep(value);
        }
        return result;
    }
    return obj;
}

// ─── Runtime Directory Setup ──────────────────────────────────────

const RUNTIME_DIRS = [
    TALON_HOME,
    path.join(TALON_HOME, 'sessions'),
    path.join(TALON_HOME, 'logs'),
    path.join(TALON_HOME, 'workspace'),
    path.join(TALON_HOME, 'workspace', 'skills'),
    path.join(TALON_HOME, 'memory'),
];

/**
 * Ensure all required runtime directories exist.
 */
export function ensureRuntimeDirs(): void {
    for (const dir of RUNTIME_DIRS) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logger.debug(`Created directory: ${dir}`);
        }
    }
}

/**
 * Copy default workspace files if they don't exist.
 * Seeds the full workspace template suite on first run.
 */
export function ensureWorkspaceDefaults(sourceDir: string): void {
    const workspaceDir = path.join(TALON_HOME, 'workspace');

    // Ensure memory subdirectory
    const memoryDir = path.join(workspaceDir, 'memory');
    if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(memoryDir, { recursive: true });
    }

    const defaults = [
        'SOUL.md',        // Identity and personality
        'USER.md',        // Info about the human
        'TOOLS.md',       // Environment-specific tool notes
        'IDENTITY.md',    // Agent's self-chosen identity
        'BOOTSTRAP.md',   // First-run onboarding ritual
        'AGENTS.md',      // Operating manual
        'MEMORY.md',      // Long-term curated memory
        'HEARTBEAT.md',   // Heartbeat poll checklist
        'FACTS.json',     // Structured facts
    ];

    for (const file of defaults) {
        const target = path.join(workspaceDir, file);
        const source = path.join(sourceDir, file);

        if (!fs.existsSync(target) && fs.existsSync(source)) {
            fs.copyFileSync(source, target);
            logger.info(`Copied default ${file} to workspace`);
        }
    }
}

// ─── Main Loader ──────────────────────────────────────────────────

/**
 * Load and validate the Talon configuration.
 *
 * 1. Ensure runtime directories exist
 * 2. Read ~/.talon/config.json (or use empty object if not found)
 * 3. Resolve ${ENV_VAR} patterns
 * 4. Validate with Zod schema (applies defaults)
 * 5. Copy workspace template files if missing
 */
export async function loadConfig(workspaceTemplateDir?: string): Promise<TalonConfig> {
    // Load .env file if present
    try {
        const dotenv = await import('dotenv');
        dotenv.config({ path: path.join(TALON_HOME, '.env') });
    } catch {
        // dotenv is optional
    }

    // Ensure runtime directories
    ensureRuntimeDirs();

    // Read config file
    let rawConfig: Record<string, unknown> = {};

    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
            rawConfig = JSON.parse(content) as Record<string, unknown>;
            logger.info(`Loaded config from ${CONFIG_PATH}`);
        } catch (err) {
            throw new ConfigError(
                `Failed to parse config file: ${CONFIG_PATH}`,
                { cause: err },
            );
        }
    } else {
        logger.info('No config file found, using defaults');
    }

    // Resolve environment variables
    const resolved = resolveEnvVarsDeep(rawConfig) as Record<string, unknown>;

    // Validate with Zod (this applies all defaults)
    const result = TalonConfigSchema.safeParse(resolved);

    if (!result.success) {
        const issues = result.error.issues
            .map(i => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new ConfigError(`Invalid configuration:\n${issues}`);
    }

    // Copy workspace template files
    if (workspaceTemplateDir) {
        ensureWorkspaceDefaults(workspaceTemplateDir);
    }

    return result.data;
}
