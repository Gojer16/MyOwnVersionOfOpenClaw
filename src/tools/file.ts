// ─── File Tools ───────────────────────────────────────────────────
// file_read, file_write, file_list — respects allowedPaths / deniedPaths

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { TalonConfig } from '../config/schema.js';
import type { ToolDefinition } from './registry.js';
import { logger } from '../utils/logger.js';

// ─── Path Safety ──────────────────────────────────────────────────

function expandPath(p: string): string {
    return p.replace(/^~/, os.homedir());
}

function isPathAllowed(filePath: string, config: TalonConfig): boolean {
    const resolved = path.resolve(expandPath(filePath));

    // Check denied paths first
    for (const denied of config.tools.files.deniedPaths) {
        const deniedResolved = path.resolve(expandPath(denied));
        if (resolved.startsWith(deniedResolved)) {
            return false;
        }
    }

    // Check allowed paths
    for (const allowed of config.tools.files.allowedPaths) {
        const allowedResolved = path.resolve(expandPath(allowed));
        if (resolved.startsWith(allowedResolved)) {
            return true;
        }
    }

    return false;
}

// ─── Tools ────────────────────────────────────────────────────────

export function registerFileTools(config: TalonConfig): ToolDefinition[] {
    return [
        // ── file_read ─────────────────────────────────────────
        {
            name: 'file_read',
            description: 'Read the contents of a file. Returns the full text content. Use for reading code, config files, documents, etc.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Absolute or ~-relative path to the file to read',
                    },
                    startLine: {
                        type: 'number',
                        description: 'Optional: start reading from this line (1-indexed)',
                    },
                    endLine: {
                        type: 'number',
                        description: 'Optional: stop reading at this line (1-indexed, inclusive)',
                    },
                },
                required: ['path'],
            },
            execute: async (args) => {
                const filePath = path.resolve(expandPath(args.path as string));

                if (!isPathAllowed(filePath, config)) {
                    return `Error: Access denied to path "${filePath}". Check tools.files.allowedPaths in config.`;
                }

                if (!fs.existsSync(filePath)) {
                    return `Error: File not found: "${filePath}"`;
                }

                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    return `Error: "${filePath}" is a directory, not a file. Use file_list instead.`;
                }

                if (stat.size > config.tools.files.maxFileSize) {
                    return `Error: File too large (${(stat.size / 1_048_576).toFixed(1)}MB). Max: ${(config.tools.files.maxFileSize / 1_048_576).toFixed(1)}MB.`;
                }

                const content = fs.readFileSync(filePath, 'utf-8');
                const startLine = args.startLine as number | undefined;
                const endLine = args.endLine as number | undefined;

                if (startLine || endLine) {
                    const lines = content.split('\n');
                    const start = Math.max(1, startLine ?? 1) - 1;
                    const end = Math.min(lines.length, endLine ?? lines.length);
                    const slice = lines.slice(start, end);
                    return `[Lines ${start + 1}-${end} of ${lines.length}]\n${slice.join('\n')}`;
                }

                const lineCount = content.split('\n').length;
                logger.debug({ path: filePath, lines: lineCount }, 'file_read');
                return `[${lineCount} lines]\n${content}`;
            },
        },

        // ── file_write ────────────────────────────────────────
        {
            name: 'file_write',
            description: 'Write content to a file. Creates the file if it doesn\'t exist. Creates parent directories as needed. Use for writing code, configs, notes, etc.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Absolute or ~-relative path to the file to write',
                    },
                    content: {
                        type: 'string',
                        description: 'The content to write to the file',
                    },
                    append: {
                        type: 'boolean',
                        description: 'If true, append to the file instead of overwriting. Default: false',
                    },
                },
                required: ['path', 'content'],
            },
            execute: async (args) => {
                const filePath = path.resolve(expandPath(args.path as string));
                const content = args.content as string;
                const append = args.append as boolean | undefined;

                if (!isPathAllowed(filePath, config)) {
                    return `Error: Access denied to path "${filePath}". Check tools.files.allowedPaths in config.`;
                }

                // Create parent directories
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                if (append) {
                    fs.appendFileSync(filePath, content, 'utf-8');
                    logger.debug({ path: filePath, mode: 'append' }, 'file_write');
                    return `Appended ${content.length} characters to "${filePath}"`;
                }

                fs.writeFileSync(filePath, content, 'utf-8');
                const lineCount = content.split('\n').length;
                logger.debug({ path: filePath, lines: lineCount }, 'file_write');
                return `Wrote ${lineCount} lines to "${filePath}"`;
            },
        },

        // ── file_list ─────────────────────────────────────────
        {
            name: 'file_list',
            description: 'List files and directories at a given path. Shows names, types, and sizes. Use to explore directory structure.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Absolute or ~-relative path to the directory to list',
                    },
                    recursive: {
                        type: 'boolean',
                        description: 'If true, list recursively (max depth 3). Default: false',
                    },
                    pattern: {
                        type: 'string',
                        description: 'Optional glob pattern to filter results (e.g., "*.ts")',
                    },
                },
                required: ['path'],
            },
            execute: async (args) => {
                const dirPath = path.resolve(expandPath(args.path as string));
                const recursive = args.recursive as boolean | undefined;

                if (!isPathAllowed(dirPath, config)) {
                    return `Error: Access denied to path "${dirPath}".`;
                }

                if (!fs.existsSync(dirPath)) {
                    return `Error: Path not found: "${dirPath}"`;
                }

                const stat = fs.statSync(dirPath);
                if (!stat.isDirectory()) {
                    return `Error: "${dirPath}" is a file, not a directory. Use file_read instead.`;
                }

                const entries = listDir(dirPath, recursive ? 3 : 1, 0);
                const pattern = args.pattern as string | undefined;

                let filtered = entries;
                if (pattern) {
                    const regex = new RegExp(
                        pattern.replace(/\*/g, '.*').replace(/\?/g, '.'),
                        'i',
                    );
                    filtered = entries.filter(e => regex.test(e.name));
                }

                if (filtered.length === 0) {
                    return `Directory is empty or no matches for pattern "${pattern}"`;
                }

                // Cap output
                const maxEntries = 100;
                const truncated = filtered.length > maxEntries;
                const shown = truncated ? filtered.slice(0, maxEntries) : filtered;

                const lines = shown.map(e => {
                    const icon = e.isDir ? '📁' : '📄';
                    const size = e.isDir ? '' : ` (${formatSize(e.size)})`;
                    return `${icon} ${e.relativePath}${size}`;
                });

                let result = lines.join('\n');
                if (truncated) {
                    result += `\n\n... and ${filtered.length - maxEntries} more entries`;
                }

                return result;
            },
        },

        // ── file_search ───────────────────────────────────────
        {
            name: 'file_search',
            description: 'Search for text within files using grep-like search. Returns matching lines with context. Great for finding code, configs, or content.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Directory to search in (absolute or ~-relative)',
                    },
                    query: {
                        type: 'string',
                        description: 'Text or regex to search for',
                    },
                    filePattern: {
                        type: 'string',
                        description: 'Optional file glob pattern (e.g., "*.ts", "*.md")',
                    },
                    caseSensitive: {
                        type: 'boolean',
                        description: 'Case-sensitive search. Default: false',
                    },
                },
                required: ['path', 'query'],
            },
            execute: async (args) => {
                const searchPath = path.resolve(expandPath(args.path as string));
                const query = args.query as string;
                const caseSensitive = args.caseSensitive as boolean | undefined;

                if (!isPathAllowed(searchPath, config)) {
                    return `Error: Access denied to path "${searchPath}".`;
                }

                if (!fs.existsSync(searchPath)) {
                    return `Error: Path not found: "${searchPath}"`;
                }

                const regex = new RegExp(query, caseSensitive ? '' : 'i');
                const filePattern = args.filePattern as string | undefined;
                const patternRegex = filePattern
                    ? new RegExp(filePattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i')
                    : null;

                const results: string[] = [];
                const maxResults = 50;

                searchFiles(searchPath, regex, patternRegex, results, maxResults, 0, 5);

                if (results.length === 0) {
                    return `No matches found for "${query}" in "${searchPath}"`;
                }

                let output = results.join('\n');
                if (results.length >= maxResults) {
                    output += `\n\n... search limited to ${maxResults} results`;
                }

                return output;
            },
        },
    ];
}

// ─── Helpers ──────────────────────────────────────────────────────

interface DirEntry {
    name: string;
    relativePath: string;
    isDir: boolean;
    size: number;
}

function listDir(dirPath: string, maxDepth: number, currentDepth: number): DirEntry[] {
    if (currentDepth >= maxDepth) return [];

    const entries: DirEntry[] = [];

    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
            // Skip hidden files and common noise
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;

            const fullPath = path.join(dirPath, item.name);
            const isDir = item.isDirectory();

            const indent = '  '.repeat(currentDepth);
            const relativePath = `${indent}${item.name}`;

            if (isDir) {
                entries.push({ name: item.name, relativePath, isDir: true, size: 0 });
                entries.push(...listDir(fullPath, maxDepth, currentDepth + 1));
            } else {
                const stat = fs.statSync(fullPath);
                entries.push({ name: item.name, relativePath, isDir: false, size: stat.size });
            }
        }
    } catch {
        // Permission errors, etc.
    }

    return entries;
}

function searchFiles(
    dirPath: string,
    regex: RegExp,
    filePattern: RegExp | null,
    results: string[],
    maxResults: number,
    depth: number,
    maxDepth: number,
): void {
    if (depth >= maxDepth || results.length >= maxResults) return;

    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
            if (results.length >= maxResults) return;
            if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist') continue;

            const fullPath = path.join(dirPath, item.name);

            if (item.isDirectory()) {
                searchFiles(fullPath, regex, filePattern, results, maxResults, depth + 1, maxDepth);
            } else {
                if (filePattern && !filePattern.test(item.name)) continue;

                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.size > 1_048_576) continue; // Skip large files

                    const content = fs.readFileSync(fullPath, 'utf-8');
                    const lines = content.split('\n');

                    for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                        if (regex.test(lines[i])) {
                            results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                        }
                    }
                } catch {
                    // Binary file or permission error
                }
            }
        }
    } catch {
        // Permission errors
    }
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1_048_576).toFixed(1)}MB`;
}
