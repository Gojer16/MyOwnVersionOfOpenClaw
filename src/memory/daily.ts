// ─── Daily Memory Loader ──────────────────────────────────────────
// Loads today's and yesterday's daily memory files
// Location: ~/.talon/workspace/memory/YYYY-MM-DD.md

import fs from 'node:fs';
import path from 'node:path';

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
    
    return {
        today: path.join(workspaceRoot, 'memory', `${todayDate}.md`),
        yesterday: path.join(workspaceRoot, 'memory', `${yesterdayDate}.md`),
        todayDate,
        yesterdayDate,
    };
}

/**
 * Load daily memory files for today and yesterday
 * Returns array of file contents (only for files that exist and have content)
 */
export function loadDailyMemories(workspaceRoot: string): string[] {
    const memories: string[] = [];
    const { today, yesterday, todayDate, yesterdayDate } = getDailyMemoryPaths(workspaceRoot);
    
    // Ensure memory directory exists
    const memoryDir = path.join(workspaceRoot, 'memory');
    if (!fs.existsSync(memoryDir)) {
        try {
            fs.mkdirSync(memoryDir, { recursive: true });
        } catch (err) {
            // Silently fail - directory creation is not critical
        }
    }
    
    // Load yesterday's memory first (chronological order)
    try {
        if (fs.existsSync(yesterday)) {
            const content = fs.readFileSync(yesterday, 'utf-8').trim();
            if (content && content.length > 0) {
                memories.push(`## Yesterday (${yesterdayDate})\n\n${content}`);
            }
        }
    } catch {
        // Silently skip if file can't be read
    }
    
    // Load today's memory
    try {
        if (fs.existsSync(today)) {
            const content = fs.readFileSync(today, 'utf-8').trim();
            if (content && content.length > 0) {
                memories.push(`## Today (${todayDate})\n\n${content}`);
            }
        }
    } catch {
        // Silently skip if file can't be read
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
