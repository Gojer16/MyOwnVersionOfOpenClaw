// ─── CLI Utilities ────────────────────────────────────────────────
// Shared helper functions for CLI UI/UX improvements

import chalk from 'chalk';

// ─── Levenshtein Distance Algorithm ───────────────────────────────

/**
 * Calculate Levenshtein distance between two strings
 * Used for command suggestions when user types unknown command
 */
export function levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    // Create distance matrix
    const matrix: number[][] = [];
    
    // Initialize first column and row
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }
    
    // Fill the matrix
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // Deletion
                matrix[i][j - 1] + 1,      // Insertion
                matrix[i - 1][j - 1] + cost // Substitution
            );
        }
    }
    
    return matrix[len1][len2];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
export function stringSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;
    
    const distance = levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
}

// ─── Text Formatting Utilities ────────────────────────────────────

/**
 * Format text into aligned columns
 * @param items Array of [command, description] tuples
 * @param maxWidth Maximum total width (default 80)
 * @returns Formatted string with aligned columns
 */
export function formatAlignedColumns(
    items: Array<[string, string]>,
    maxWidth: number = 80
): string {
    if (items.length === 0) return '';
    
    // Find longest command for alignment
    const maxCmdLength = Math.max(...items.map(([cmd]) => cmd.length));
    
    // Calculate available space for description
    // Format: "  /cmd    description"
    //         ^2 ^cmd   ^4
    const descStart = 2 + maxCmdLength + 4;
    const descWidth = maxWidth - descStart;
    
    return items.map(([cmd, desc]) => {
        const paddedCmd = cmd.padEnd(maxCmdLength);
        
        // Word wrap description if needed
        if (desc.length <= descWidth) {
            return `  /${paddedCmd}    ${desc}`;
        }
        
        // Wrap long descriptions
        const words = desc.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
            if ((currentLine + ' ' + word).trim().length <= descWidth) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) lines.push(currentLine);
        
        // First line with command, subsequent lines indented
        const firstLine = `  /${paddedCmd}    ${lines[0]}`;
        const otherLines = lines.slice(1).map(line => 
            ' '.repeat(descStart) + line
        );
        
        return [firstLine, ...otherLines].join('\n');
    }).join('\n');
}

/**
 * Create a section header with consistent styling
 */
export function formatSectionHeader(title: string): string {
    return chalk.bold.cyan(`\n${title}`);
}

/**
 * Create a divider line
 */
export function formatDivider(width: number = 50): string {
    return chalk.gray('─'.repeat(width));
}

// ─── Spinner Animation ────────────────────────────────────────────

export class Spinner {
    private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private interval: NodeJS.Timeout | null = null;
    private currentFrame = 0;
    private text: string;
    private isRunning = false;
    
    constructor(text: string = 'Thinking') {
        this.text = text;
    }
    
    start(): void {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.currentFrame = 0;
        
        // Hide cursor
        process.stdout.write('\x1B[?25l');
        
        this.interval = setInterval(() => {
            const frame = this.frames[this.currentFrame];
            process.stdout.write(`\r${chalk.gray(`  ${frame} ${this.text}...`)}`);
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 80);
    }
    
    stop(): void {
        if (!this.isRunning) return;
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        // Clear the spinner line and show cursor
        process.stdout.write('\r\x1b[K');
        process.stdout.write('\x1B[?25h');
        
        this.isRunning = false;
    }
    
    setText(text: string): void {
        this.text = text;
    }
    
    isActive(): boolean {
        return this.isRunning;
    }
}

// ─── Terminal Utilities ───────────────────────────────────────────

/**
 * Get terminal width (with fallback)
 */
export function getTerminalWidth(): number {
    return process.stdout.columns || 80;
}

// ─── AI Response Formatting ───────────────────────────────────────

/**
 * Format AI response text for terminal display
 * - Removes ** markdown bold syntax (looks ugly in terminal)
 * - Adds color to bullet points for better readability
 * - Preserves other formatting
 */
export function formatAIResponse(text: string): string {
    if (!text) return text;

    return text
        // Remove ** markdown bold (but keep the content)
        .replace(/\*\*(.+?)\*\*/g, '$1')
        // Add color to bullet points (lines starting with -)
        .replace(/^(\s*)-\s+/gm, (match, indent) => {
            return `${indent}${chalk.cyan('•')} `;
        });
}

/**
 * Truncate text to fit width with ellipsis
 */
export function truncate(text: string, maxWidth: number): string {
    if (text.length <= maxWidth) return text;
    return text.slice(0, maxWidth - 3) + '...';
}
