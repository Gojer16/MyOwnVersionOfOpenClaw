// ─── Daily Memory Loader ──────────────────────────────────────────
// Loads today's and yesterday's daily memory files
// Location: ~/.talon/workspace/memory/YYYY-MM-DD.md

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { estimateTokens, truncateToTokens } from '../utils/tokens.js';

/**
 * Get paths for today and yesterday's memory files
 */
export function getDailyMemoryPaths(workspaceRoot: string): {
    today: string;
    yesterday: string;
    todayDate: string;
    yesterdayDate: string;
} {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    const formatDate = (date: Date): string => {
        return date.toISOString().split('T')[0];
    };
    
    const todayDate = formatDate(today);
    const yesterdayDate = formatDate(yesterday);
    
    const resolvedRoot = workspaceRoot.replace(/^~/, os.homedir());

    return {
        today: path.join(resolvedRoot, 'memory', `${todayDate}.md`),
        yesterday: path.join(resolvedRoot, 'memory', `${yesterdayDate}.md`),
        todayDate,
        yesterdayDate,
    };
}

/**
 * Load daily memory files for today and yesterday
 * Returns array of file contents (only for files that exist and have content)
 */
export function loadDailyMemories(workspaceRoot: string): string[] {
    return loadRecentDailyMemories(workspaceRoot, { maxFiles: 2, maxTotalTokens: 600 });
}

/**
 * Load recent daily memory files (most recent N dates).
 * Returns array of file contents in chronological order.
 */
export function loadRecentDailyMemories(
    workspaceRoot: string,
    options?: { maxFiles?: number; maxTotalTokens?: number },
): string[] {
    const memories: string[] = [];
    const maxFiles = options?.maxFiles ?? 7;
    const maxTotalTokens = options?.maxTotalTokens ?? 1200;

    // Ensure memory directory exists
    const memoryDir = path.join(workspaceRoot.replace(/^~/, os.homedir()), 'memory');
    if (!fs.existsSync(memoryDir)) {
        try {
            fs.mkdirSync(memoryDir, { recursive: true });
        } catch {
            return memories;
        }
    }

    let files: string[] = [];
    try {
        files = fs.readdirSync(memoryDir)
            .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
            .sort();
    } catch {
        return memories;
    }

    const recentFiles = files.slice(-maxFiles);
    let usedTokens = 0;

    for (const file of recentFiles) {
        const filePath = path.join(memoryDir, file);
        const date = file.replace(/\.md$/, '');

        try {
            const content = fs.readFileSync(filePath, 'utf-8').trim();
            if (!content) continue;

            const header = `## ${date}\n\n`;
            const headerTokens = estimateTokens(header);
            const contentTokens = estimateTokens(content);
            const totalTokens = headerTokens + contentTokens;

            if (usedTokens + totalTokens > maxTotalTokens) {
                const remaining = maxTotalTokens - usedTokens - headerTokens;
                if (remaining <= 0) break;
                const truncated = truncateToTokens(content, remaining);
                memories.push(`${header}${truncated}`);
                usedTokens = maxTotalTokens;
                break;
            }

            memories.push(`${header}${content}`);
            usedTokens += totalTokens;
        } catch {
            // Skip unreadable files
        }
    }

    return memories;
}

/**
 * Get the most recent daily memory date that exists
 * Returns null if no daily memories exist
 */
export function getMostRecentDailyMemoryDate(workspaceRoot: string): string | null {
    const { today, yesterday, todayDate, yesterdayDate } = getDailyMemoryPaths(workspaceRoot);
    
    try {
        if (fs.existsSync(today)) {
            const content = fs.readFileSync(today, 'utf-8').trim();
            if (content && content.length > 0) {
                return todayDate;
            }
        }
        
        if (fs.existsSync(yesterday)) {
            const content = fs.readFileSync(yesterday, 'utf-8').trim();
            if (content && content.length > 0) {
                return yesterdayDate;
            }
        }
    } catch {
        // Ignore errors
    }
    
    return null;
}

/**
 * Check if daily memory files exist
 */
export function hasDailyMemories(workspaceRoot: string): boolean {
    return loadDailyMemories(workspaceRoot).length > 0;
}

/**
 * Extract user name from USER.md content
 * Looks for patterns like:
 * - **Name:** Orlando
 * - Name: Orlando
 * - **What to call them:** Orlando
 */
export function extractUserName(userContent: string | null): string | null {
    if (!userContent) return null;
    
    // Try various patterns to find the name
    const patterns = [
        /\*\*Name:\*\*\s*(.+)/i,
        /\*\*What to call them:\*\*\s*(.+)/i,
        /^Name:\s*(.+)/im,
        /^\*\*Name\*\*:\s*(.+)/im,
        /^\*\s*Name:\s*(.+)/im,
    ];
    
    for (const pattern of patterns) {
        const match = userContent.match(pattern);
        if (match && match[1]) {
            const name = match[1].trim();
            // Filter out template placeholders
            if (name && 
                !name.includes('(optional)') && 
                !name.startsWith('*') &&
                !name.startsWith('(') &&
                name.length > 0 &&
                name.length < 50) {
                return name;
            }
        }
    }
    
    return null;
}
