// ─── Config Loader ────────────────────────────────────────────────
// Loads ~/.talon/config.json, resolves env vars, validates with Zod

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { TalonConfigSchema, type TalonConfig } from './schema.js';
import { ConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const TALON_HOME = path.join(os.homedir(), '.talon');
const CONFIG_PATH = path.join(TALON_HOME, 'config.json');

// ─── Frontmatter Stripping ────────────────────────────────────────

/**
 * Strip YAML frontmatter from template content.
 * Matches OpenClaw's approach: removes --- delimited blocks at the start.
 */
function stripFrontMatter(content: string): string {
    if (!content.startsWith('---')) {
        return content;
    }
    const endIndex = content.indexOf('\n---', 3);
    if (endIndex === -1) {
        return content;
    }
    const start = endIndex + '\n---'.length;
    let trimmed = content.slice(start);
    trimmed = trimmed.replace(/^\s+/, '');
    return trimmed;
}

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
 * Copy default workspace files from templates if they don't exist.
 * Seeds the full workspace template suite on first run.
 * 
 * SECURITY: Templates are generic and safe to commit.
 * The copied files in ~/.talon/workspace/ contain personal data and must NOT be committed.
 */
export function ensureWorkspaceDefaults(sourceDir: string): void {
    const workspaceDir = path.join(TALON_HOME, 'workspace');

    // Ensure workspace directory exists
    if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
        logger.info(`Created workspace directory: ${workspaceDir}`);
    }

    // Ensure memory subdirectory
    const memoryDir = path.join(workspaceDir, 'memory');
    if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(memoryDir, { recursive: true });
    }

    const defaults = [
        { file: 'SOUL.md', description: 'AI personality and soul' },
        { file: 'USER.md', description: 'Information about you' },
        { file: 'PROFILE.json', description: 'Structured user profile' },
        { file: 'TOOLS.md', description: 'Environment-specific tool notes' },
        { file: 'IDENTITY.md', description: "Agent's self-chosen identity" },
        { file: 'BOOTSTRAP.md', description: 'First-run onboarding ritual' },
        { file: 'AGENTS.md', description: 'Operating manual' },
        { file: 'MEMORY.md', description: 'Long-term curated memory' },
        { file: 'cron.json', description: 'Scheduled jobs' },
        { file: 'HEARTBEAT.md', description: 'Heartbeat poll checklist' },
        { file: 'FACTS.json', description: 'Structured facts about you' },
    ];

    let copiedCount = 0;
    for (const { file, description } of defaults) {
        const target = path.join(workspaceDir, file);
        const source = path.join(sourceDir, file);

        if (!fs.existsSync(target) && fs.existsSync(source)) {
            // Read template and strip frontmatter
            const templateContent = fs.readFileSync(source, 'utf-8');
            const cleanContent = stripFrontMatter(templateContent);
            
            // Write clean content to user workspace
            fs.writeFileSync(target, cleanContent, 'utf-8');
            copiedCount++;
            logger.info(`Copied ${file} to workspace (${description})`);
        }
    }

    if (copiedCount > 0) {
        logger.info(`\n⚠️  IMPORTANT: ${copiedCount} template files copied to ~/.talon/workspace/`);
        logger.info('   These files will contain YOUR PERSONAL DATA as the AI learns about you.');
        logger.info('   NEVER commit the ~/.talon/ directory to Git!\n');
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
    let templateDir = workspaceTemplateDir;
    if (!templateDir) {
        const moduleDir = path.dirname(fileURLToPath(import.meta.url));
        const fallback = path.resolve(moduleDir, '../../templates/workspace');
        if (fs.existsSync(fallback)) {
            templateDir = fallback;
        }
    }
    if (templateDir) {
        ensureWorkspaceDefaults(templateDir);
    }

    return result.data;
}
