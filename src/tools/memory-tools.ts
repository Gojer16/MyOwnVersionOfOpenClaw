// ─── Memory Tools ─────────────────────────────────────────────────
// Tools for the agent to manage its own memory files (MEMORY.md, SOUL.md)
// Includes both simple file operations and semantic search

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import type { TalonConfig } from '../config/schema.js';
import { ProfileSchema } from '../memory/profile.js';
import { writeFileAtomicSync } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import type { ToolDefinition } from './registry.js';

function getWorkspacePath(config: TalonConfig, file: string): string {
    return path.join(
        config.workspace.root.replace(/^~/, os.homedir()),
        file,
    );
}

function getMemoryDir(config: TalonConfig): string {
    return path.join(
        config.workspace.root.replace(/^~/, os.homedir()),
        'memory',
    );
}

// Simple text-based search in memory files
function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchMemoryFiles(query: string, config: TalonConfig, maxResults: number = 5): Promise<string[]> {
    const results: string[] = [];
    const workspaceRoot = config.workspace.root.replace(/^~/, os.homedir());
    const searchRegex = new RegExp(escapeRegExp(query), 'i');

    const filesToSearch = [
        getWorkspacePath(config, 'MEMORY.md'),
        getWorkspacePath(config, 'SOUL.md'),
        getWorkspacePath(config, 'USER.md'),
        getWorkspacePath(config, 'IDENTITY.md'),
        getWorkspacePath(config, 'FACTS.json'),
        getWorkspacePath(config, 'PROFILE.json'),
    ];

    const memoryDir = getMemoryDir(config);
    if (fs.existsSync(memoryDir)) {
        const memoryFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
        for (const f of memoryFiles) {
            filesToSearch.push(path.join(memoryDir, f));
        }
    }

    for (const filePath of filesToSearch) {
        if (!fs.existsSync(filePath)) continue;

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                if (searchRegex.test(lines[i])) {
                    const relativePath = path.relative(workspaceRoot, filePath);
                    results.push(`${relativePath}:${i + 1}: ${lines[i].trim()}`);

                    if (results.length >= maxResults * 3) break;
                }
            }
        } catch {
            // Skip files we can't read
        }

        if (results.length >= maxResults * 3) break;
    }

    return results.slice(0, maxResults);
}

export function registerMemoryTools(config: TalonConfig): ToolDefinition[] {
    return [
        // ── memory_append ────────────────────────────────────
        {
            name: 'memory_append',
            description: 'Append a new entry to your long-term memory (MEMORY.md). Use this to store important facts, preferences, or decisions that you should remember across sessions.',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'The text to append to memory. Be concise.',
                    },
                    category: {
                        type: 'string',
                        description: 'Optional category (e.g., "Fact", "Decision", "Preference"). Default: "Note"',
                    },
                },
                required: ['text'],
            },
            execute: async (args) => {
                // Validate inputs
                let text: string;
                let category: string;
                try {
                    const parsed = z.object({
                        text: z.string().trim().min(1, 'Text cannot be empty'),
                        category: z.string().trim().max(50, 'Category too long').optional().default('Note'),
                    }).parse(args);
                    text = parsed.text;
                    category = parsed.category;
                } catch (error: any) {
                    return `Error: ${error.errors?.[0]?.message || 'Invalid parameters'}`;
                }

                const memoryPath = getWorkspacePath(config, 'MEMORY.md');

                if (!fs.existsSync(memoryPath)) {
                    writeFileAtomicSync(memoryPath, '# MEMORY\n\nYour long-term memory.\n\n## Entries\n\n');
                }

                const timestamp = new Date().toISOString().split('T')[0];
                const entry = `\n- **${timestamp}** [${category}] ${text}`;

                fs.appendFileSync(memoryPath, entry, 'utf-8');
                logger.info({ category, length: text.length }, 'Appended to MEMORY.md');

                return `Added to long-term memory:\n${entry.trim()}`;
            },
        },

        // ── memory_read ──────────────────────────────────────
        {
            name: 'memory_read',
            description: 'Read your long-term memory (MEMORY.md). Useful for recalling past decisions or facts.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Optional: path relative to workspace (e.g., "memory/todos.md"). Default: MEMORY.md',
                    },
                },
            },
            execute: async (args) => {
                // Validate input if provided
                let relPath: string | undefined;
                try {
                    if (args.path !== undefined) {
                        const parsed = z.object({
                            path: z.string().trim().min(1, 'Path cannot be empty'),
                        }).parse(args);
                        relPath = parsed.path;
                    }
                } catch (error: any) {
                    return `Error: ${error.errors?.[0]?.message || 'Invalid path parameter'}`;
                }

                const memoryPath = relPath
                    ? path.join(config.workspace.root.replace(/^~/, os.homedir()), relPath)
                    : getWorkspacePath(config, 'MEMORY.md');

                // Security: Ensure path is within workspace
                const resolvedPath = path.resolve(memoryPath);
                const workspaceRoot = path.resolve(config.workspace.root.replace(/^~/, os.homedir()));
                if (!resolvedPath.startsWith(workspaceRoot)) {
                    return 'Error: Path must be within the workspace directory';
                }

                if (!fs.existsSync(memoryPath)) {
                    return 'Memory file does not exist.';
                }
                const content = fs.readFileSync(memoryPath, 'utf-8');
                return content;
            },
        },

        // ── memory_search ────────────────────────────────────
        {
            name: 'memory_search',
            description: 'Search your long-term memory for relevant information. Searches MEMORY.md, SOUL.md, USER.md, and memory/*.md files. Returns matching lines with context.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query - keywords or phrases to find',
                    },
                    maxResults: {
                        type: 'number',
                        description: 'Maximum number of results. Default: 5',
                    },
                },
                required: ['query'],
            },
            execute: async (args) => {
                // Validate inputs
                let query: string;
                let maxResults: number;
                try {
                    const parsed = z.object({
                        query: z.string().trim().min(1, 'Query cannot be empty'),
                        maxResults: z.number().int().min(1).max(50).optional().default(5),
                    }).parse(args);
                    query = parsed.query;
                    maxResults = parsed.maxResults;
                } catch (error: any) {
                    return `Error: ${error.errors?.[0]?.message || 'Invalid parameters'}`;
                }

                logger.info({ query, maxResults }, 'memory_search');

                const results = await searchMemoryFiles(query, config, maxResults);

                if (results.length === 0) {
                    return `No matches found for "${query}" in memory files.`;
                }

                return `**Memory Search Results for "${query}"**\n\n${results.join('\n')}`;
            },
        },

        // ── soul_update ──────────────────────────────────────
        {
            name: 'soul_update',
            description: 'Update your SOUL.md file. Use this very carefully to evolve your personality or instructions based on user feedback.',
            parameters: {
                type: 'object',
                properties: {
                    content: {
                        type: 'string',
                        description: 'The new full content for SOUL.md.',
                    },
                },
                required: ['content'],
            },
            execute: async (args) => {
                const startTime = Date.now();
                const MAX_CONTENT_SIZE = 10 * 1024; // 10KB limit

                // Validate input
                let content: string;
                try {
                    const parsed = z.object({
                        content: z.string()
                            .trim()
                            .min(1, 'Content cannot be empty')
                            .max(MAX_CONTENT_SIZE, `Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes (10KB)`),
                    }).parse(args);
                    content = parsed.content;
                } catch (error: any) {
                    return `Error: ${error.errors?.[0]?.message || 'Invalid content parameter'}`;
                }

                const soulPath = getWorkspacePath(config, 'SOUL.md');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

                // Create backup if file exists
                let oldContent = '';
                if (fs.existsSync(soulPath)) {
                    try {
                        oldContent = fs.readFileSync(soulPath, 'utf-8');
                        const backupPath = `${soulPath}.${timestamp}.bak`;
                        fs.copyFileSync(soulPath, backupPath);
                        logger.info({ backupPath, oldSize: oldContent.length }, 'SOUL.md backup created');
                    } catch (backupError: any) {
                        logger.error({ error: backupError }, 'Failed to create SOUL.md backup');
                        return `Error: Failed to create backup before update: ${backupError.message}`;
                    }
                }

                try {
                    // Write new content
                    writeFileAtomicSync(soulPath, content);
                    logger.warn({ 
                        newSize: content.length, 
                        oldSize: oldContent.length,
                        changeBytes: content.length - oldContent.length 
                    }, 'SOUL.md updated by agent');

                    return `SOUL.md updated successfully (${content.length} bytes). I will read this new identity on the next turn.\nBackup saved to: SOUL.md.${timestamp}.bak`;
                } catch (writeError: any) {
                    // Attempt to restore from backup if write failed
                    if (oldContent && fs.existsSync(soulPath)) {
                        try {
                            writeFileAtomicSync(soulPath, oldContent);
                            logger.error('SOUL.md write failed, restored from backup');
                            return `Error: Failed to write SOUL.md. Original content restored from backup: ${writeError.message}`;
                        } catch (restoreError: any) {
                            logger.error({ error: restoreError }, 'CRITICAL: SOUL.md corrupted during failed update');
                            return `CRITICAL ERROR: SOUL.md update failed and backup restoration also failed. Manual intervention required.`;
                        }
                    }
                    logger.error({ error: writeError }, 'SOUL.md update failed');
                    return `Error: Failed to write SOUL.md: ${writeError.message}`;
                }
            },
        },

        // ── facts_update ─────────────────────────────────────
        {
            name: 'facts_update',
            description: 'Update facts about the user in FACTS.json. Use this to store important user preferences, details, or knowledge.',
            parameters: {
                type: 'object',
                properties: {
                    facts: {
                        type: 'string',
                        description: 'JSON string of facts to store (must be a valid JSON object)',
                    },
                },
                required: ['facts'],
            },
            execute: async (args) => {
                // Validate input
                let factsStr: string;
                try {
                    const parsed = z.object({
                        facts: z.string().trim().min(1, 'Facts cannot be empty'),
                    }).parse(args);
                    factsStr = parsed.facts;
                } catch (error: any) {
                    return `Error: ${error.errors?.[0]?.message || 'Invalid facts parameter'}`;
                }

                let facts: Record<string, unknown>;
                try {
                    facts = JSON.parse(factsStr);
                } catch {
                    return 'Error: facts must be a valid JSON string.';
                }

                const FactsSchema = z.object({
                    user: z.object({
                        name: z.string().min(1).optional(),
                        preferences: z.record(z.unknown()).optional(),
                    }).optional(),
                    environment: z.record(z.unknown()).optional(),
                    learned_facts: z.array(z.unknown()).optional(),
                }).passthrough();

                const factsValidation = FactsSchema.safeParse(facts);
                if (!factsValidation.success) {
                    return `Error: Invalid facts structure: ${factsValidation.error.message}`;
                }

                const factsPath = getWorkspacePath(config, 'FACTS.json');
                const dir = path.dirname(factsPath);

                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                let existingFacts: Record<string, unknown> = {};
                if (fs.existsSync(factsPath)) {
                    try {
                        existingFacts = JSON.parse(fs.readFileSync(factsPath, 'utf-8'));
                    } catch {
                        // Start fresh if corrupted
                    }
                }

                const merged = { ...existingFacts, ...facts };
                writeFileAtomicSync(factsPath, JSON.stringify(merged, null, 2));
                logger.info({ facts: Object.keys(facts) }, 'facts_update');

                return `Updated facts:\n${JSON.stringify(facts, null, 2)}`;
            },
        },

        // ── profile_update ───────────────────────────────────
        {
            name: 'profile_update',
            description: 'Update user profile in PROFILE.json. Use this for name, timezone, preferences, and working hours.',
            parameters: {
                type: 'object',
                properties: {
                    profile: {
                        type: 'string',
                        description: 'JSON string for PROFILE.json (must match schema)',
                    },
                },
                required: ['profile'],
            },
            execute: async (args) => {
                // Validate input
                let profileStr: string;
                try {
                    const parsed = z.object({
                        profile: z.string().trim().min(1, 'Profile cannot be empty'),
                    }).parse(args);
                    profileStr = parsed.profile;
                } catch (error: any) {
                    return `Error: ${error.errors?.[0]?.message || 'Invalid profile parameter'}`;
                }

                let profile: Record<string, unknown>;
                try {
                    profile = JSON.parse(profileStr);
                } catch {
                    return 'Error: profile must be a valid JSON string.';
                }

                const validation = ProfileSchema.safeParse(profile);
                if (!validation.success) {
                    return `Error: Invalid profile structure: ${validation.error.message}`;
                }

                const profilePath = getWorkspacePath(config, 'PROFILE.json');
                const dir = path.dirname(profilePath);

                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                writeFileAtomicSync(profilePath, JSON.stringify(validation.data, null, 2));
                logger.info({ name: validation.data.name }, 'profile_update');

                return `Updated profile for ${validation.data.name}`;
            },
        },
    ];
}
