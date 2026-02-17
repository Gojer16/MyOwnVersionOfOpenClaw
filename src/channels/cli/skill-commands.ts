// ─── Skill Command Registration System ──────────────────────────────
// Extensible CLI architecture for Talon skills

import type { Session } from '../../utils/types.js';
import type { CommandContext, CommandResult } from './commands.js';

// ─── Skill Command Interface ──────────────────────────────────────

/**
 * Interface for skill commands that can be registered by skills
 */
export interface SkillCommand {
    /** Command name (without slash) */
    name: string;
    /** Short description for /help */
    description: string;
    /** Skill ID that owns this command */
    skillId: string;
    /** Command handler function */
    handler: (args: string, session: Session, context?: CommandContext) => Promise<CommandResult> | CommandResult;
    /** Optional: Category for help organization */
    category?: string;
    /** Optional: Usage examples */
    examples?: string[];
}

// ─── Skill Command Registry ───────────────────────────────────────

/**
 * Global registry for skill commands
 */
class SkillCommandRegistry {
    private commands = new Map<string, SkillCommand>();
    private skillCommands = new Map<string, Set<string>>(); // skillId -> command names

    /**
     * Register a command from a skill
     */
    register(command: SkillCommand): void {
        const normalizedName = command.name.toLowerCase();
        
        // Check for conflicts
        const existing = this.commands.get(normalizedName);
        if (existing) {
            throw new Error(`Command /${command.name} is already registered by skill "${existing.skillId}"`);
        }
        
        // Register command
        this.commands.set(normalizedName, command);
        
        // Track by skill
        if (!this.skillCommands.has(command.skillId)) {
            this.skillCommands.set(command.skillId, new Set());
        }
        this.skillCommands.get(command.skillId)!.add(normalizedName);
        
        console.log(`[Skill] Registered command /${command.name} from skill "${command.skillId}"`);
    }

    /**
     * Get a command by name
     */
    get(name: string): SkillCommand | undefined {
        return this.commands.get(name.toLowerCase());
    }

    /**
     * List all registered skill commands
     */
    list(): SkillCommand[] {
        return Array.from(this.commands.values());
    }

    /**
     * List commands by skill
     */
    listBySkill(skillId: string): SkillCommand[] {
        const commandNames = this.skillCommands.get(skillId);
        if (!commandNames) return [];
        
        return Array.from(commandNames)
            .map(name => this.commands.get(name))
            .filter((cmd): cmd is SkillCommand => cmd !== undefined);
    }

    /**
     * Unregister all commands from a skill
     */
    unregisterSkill(skillId: string): void {
        const commandNames = this.skillCommands.get(skillId);
        if (!commandNames) return;
        
        for (const name of commandNames) {
            this.commands.delete(name);
        }
        
        this.skillCommands.delete(skillId);
        console.log(`[Skill] Unregistered all commands from skill "${skillId}"`);
    }

    /**
     * Check if a command exists
     */
    has(name: string): boolean {
        return this.commands.has(name.toLowerCase());
    }

    /**
     * Get help text for skill commands, organized by category
     */
    getHelpText(): string {
        const commands = this.list();
        if (commands.length === 0) {
            return '';
        }
        
        // Group by category
        const byCategory = new Map<string, SkillCommand[]>();
        const uncategorized: SkillCommand[] = [];
        
        for (const cmd of commands) {
            if (cmd.category) {
                if (!byCategory.has(cmd.category)) {
                    byCategory.set(cmd.category, []);
                }
                byCategory.get(cmd.category)!.push(cmd);
            } else {
                uncategorized.push(cmd);
            }
        }
        
        const lines: string[] = [];
        
        // Add categorized commands
        const sortedCategories = Array.from(byCategory.keys()).sort();
        for (const category of sortedCategories) {
            lines.push(`  ${category}:`);
            const categoryCommands = byCategory.get(category)!;
            categoryCommands.sort((a, b) => a.name.localeCompare(b.name));
            
            for (const cmd of categoryCommands) {
                lines.push(`    /${cmd.name.padEnd(12)} ${cmd.description}`);
                if (cmd.examples && cmd.examples.length > 0) {
                    lines.push(`                Example: ${cmd.examples[0]}`);
                }
            }
            lines.push('');
        }
        
        // Add uncategorized commands
        if (uncategorized.length > 0) {
            lines.push('  Skills:');
            uncategorized.sort((a, b) => a.name.localeCompare(b.name));
            
            for (const cmd of uncategorized) {
                lines.push(`    /${cmd.name.padEnd(12)} ${cmd.description}`);
                if (cmd.examples && cmd.examples.length > 0) {
                    lines.push(`                Example: ${cmd.examples[0]}`);
                }
            }
            lines.push('');
        }
        
        return lines.join('\n');
    }
}

// ─── Global Instance ──────────────────────────────────────────────

export const skillCommandRegistry = new SkillCommandRegistry();

// ─── Registration API ─────────────────────────────────────────────

/**
 * Simple API for skills to register commands
 * @param skillId - Unique identifier for the skill
 * @param name - Command name (without slash)
 * @param handler - Command handler function
 * @param description - Command description for /help
 * @param options - Optional configuration
 */
export function registerSkillCommand(
    skillId: string,
    name: string,
    handler: SkillCommand['handler'],
    description: string,
    options?: {
        category?: string;
        examples?: string[];
    }
): void {
    const command: SkillCommand = {
        name,
        description,
        skillId,
        handler,
        category: options?.category,
        examples: options?.examples,
    };
    
    skillCommandRegistry.register(command);
}

/**
 * Unregister all commands from a skill
 */
export function unregisterSkillCommands(skillId: string): void {
    skillCommandRegistry.unregisterSkill(skillId);
}

/**
 * Check if a command is registered by a skill
 */
export function isSkillCommand(name: string): boolean {
    return skillCommandRegistry.has(name);
}

/**
 * Get a skill command by name
 */
export function getSkillCommand(name: string): SkillCommand | undefined {
    return skillCommandRegistry.get(name);
}

/**
 * List all registered skill commands
 */
export function listSkillCommands(): SkillCommand[] {
    return skillCommandRegistry.list();
}