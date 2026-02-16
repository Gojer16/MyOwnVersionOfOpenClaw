// ─── Memory Tools ─────────────────────────────────────────────────
// Tools for the agent to manage its own memory files (MEMORY.md, SOUL.md)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { TalonConfig } from '../config/schema.js';
import type { ToolDefinition } from './registry.js';
import { logger } from '../utils/logger.js';

function getWorkspacePath(config: TalonConfig, file: string): string {
    return path.join(
        config.workspace.root.replace(/^~/, os.homedir()),
        file,
    );
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
                const text = args.text as string;
                const category = (args.category as string) || 'Note';
                const memoryPath = getWorkspacePath(config, 'MEMORY.md');

                if (!fs.existsSync(memoryPath)) {
                    // Create if missing
                    fs.writeFileSync(memoryPath, '# MEMORY\n\nYour long-term memory.\n\n## Entries\n\n');
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
                properties: {},
            },
            execute: async () => {
                const memoryPath = getWorkspacePath(config, 'MEMORY.md');
                if (!fs.existsSync(memoryPath)) {
                    return 'Memory file is empty.';
                }
                const content = fs.readFileSync(memoryPath, 'utf-8');
                return content;
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
                const content = args.content as string;
                const soulPath = getWorkspacePath(config, 'SOUL.md');

                // Backup existing soul
                if (fs.existsSync(soulPath)) {
                    const backupPath = `${soulPath}.bak`;
                    fs.copyFileSync(soulPath, backupPath);
                }

                fs.writeFileSync(soulPath, content, 'utf-8');
                logger.warn('SOUL.md updated by agent');

                return 'SOUL.md updated successfully. I will read this new identity on the next turn.';
            },
        },
    ];
}
