// ─── CLI Commands ─────────────────────────────────────────────────
// Slash command system for Talon CLI
// Adapted from openclaw/src/tui/commands.ts

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Session } from '../../utils/types.js';
import { TALON_HOME } from '../../config/index.js';
import { formatAlignedColumns, formatSectionHeader, formatDivider } from './utils.js';
import { cronService } from '../../cron/index.js';
import { CronJobStore } from '../../cron/store.js';

export type ParsedCommand = {
    name: string;
    args: string;
};

export type CommandCategory = 'Session' | 'System' | 'Tools' | 'Shortcuts' | 'Skills';

export interface SlashCommand {
    name: string;
    description: string;
    category: CommandCategory;
    handler: (args: string, session: Session, context?: CommandContext) => Promise<CommandResult> | CommandResult;
}

export interface CommandContext {
    config?: TalonConfigSummary;
    logLevel?: string;
    setLogLevel?: (level: string) => void;
    prompt?: (question: string) => Promise<string>;
}

export interface TalonConfigSummary {
    workspace: string;
    model: string;
    providers: string[];
    channels: {
        cli: boolean;
        telegram: boolean;
        whatsapp: boolean;
        webchat: boolean;
    };
    gateway: {
        host: string;
        port: number;
    };
}

export interface CommandResult {
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
    shouldContinue?: boolean;
    shouldClear?: boolean;
}

// ─── Command Parser ───────────────────────────────────────────────

export function parseCommand(input: string): ParsedCommand {
    const trimmed = input.replace(/^\//, '').trim();
    if (!trimmed) {
        return { name: '', args: '' };
    }
    const [name, ...rest] = trimmed.split(/\s+/);
    return {
        name: name.toLowerCase(),
        args: rest.join(' ').trim(),
    };
}

// ─── Command Registry ─────────────────────────────────────────────

import { skillCommandRegistry, type SkillCommand } from './skill-commands.js';

export class CommandRegistry {
    private commands = new Map<string, SlashCommand>();

    register(command: SlashCommand): void {
        this.commands.set(command.name, command);
    }

    get(name: string): SlashCommand | undefined {
        const normalizedName = name.toLowerCase();

        // First check built-in commands
        const builtin = this.commands.get(normalizedName);
        if (builtin) return builtin;

        // Then check skill commands
        const skillCmd = skillCommandRegistry.get(normalizedName);
        if (skillCmd) {
            // Convert SkillCommand to SlashCommand for compatibility
            return {
                name: skillCmd.name,
                description: skillCmd.description,
                category: 'Skills',
                handler: skillCmd.handler,
            };
        }

        return undefined;
    }

    list(): SlashCommand[] {
        const builtin = Array.from(this.commands.values());
        const skill = skillCommandRegistry.list().map(skillCmd => ({
            name: skillCmd.name,
            description: skillCmd.description,
            category: 'Skills' as CommandCategory,
            handler: skillCmd.handler,
        }));

        return [...builtin, ...skill];
    }

    listBuiltin(): SlashCommand[] {
        return Array.from(this.commands.values());
    }

    listSkill(): SlashCommand[] {
        return skillCommandRegistry.list().map(skillCmd => ({
            name: skillCmd.name,
            description: skillCmd.description,
            category: 'Skills' as CommandCategory,
            handler: skillCmd.handler,
        }));
    }

    listByCategory(category: CommandCategory): SlashCommand[] {
        return this.list().filter(cmd => cmd.category === category);
    }

    getHelpText(): string {
        const categories: CommandCategory[] = ['Session', 'System', 'Tools', 'Shortcuts', 'Skills'];
        const lines: string[] = [
            '🦅 Talon CLI Commands',
            formatDivider(50),
        ];

        for (const category of categories) {
            const commands = category === 'Skills' 
                ? this.listSkill()
                : this.listBuiltin().filter(cmd => cmd.category === category);

            if (commands.length > 0) {
                lines.push(formatSectionHeader(category));
                
                const items: Array<[string, string]> = commands.map(cmd => [cmd.name, cmd.description]);
                lines.push(formatAlignedColumns(items));
                lines.push('');
            }
        }

        // Other shortcuts
        lines.push(formatSectionHeader('Shell'));
        lines.push(formatAlignedColumns([['!<command>', 'Execute bash command (e.g., !ls, !pwd)']]));

        return lines.join('\n');
    }

    getCommandSuggestions(input: string, maxSuggestions: number = 3): string[] {
        const allCommands = this.list().map(cmd => cmd.name);
        const inputLower = input.toLowerCase();

        // Calculate similarity scores
        const scored = allCommands.map(name => {
            const nameLower = name.toLowerCase();
            
            // Exact substring match gets high priority
            if (nameLower.includes(inputLower)) {
                return { name, score: 0.9 + (nameLower === inputLower ? 0.1 : 0) };
            }
            
            // Prefix match
            if (nameLower.startsWith(inputLower)) {
                return { name, score: 0.8 };
            }
            
            // Levenshtein distance for typos
            const { stringSimilarity } = require('./utils.js');
            const similarity = stringSimilarity(inputLower, nameLower);
            return { name, score: similarity };
        });

        // Filter by minimum similarity threshold and sort
        return scored
            .filter(item => item.score > 0.4) // Minimum threshold
            .sort((a, b) => b.score - a.score)
            .slice(0, maxSuggestions)
            .map(item => item.name);
    }
}

// ─── Built-in Commands ────────────────────────────────────────────

export function createBuiltinCommands(): CommandRegistry {
    const registry = new CommandRegistry();

    // Help command
    registry.register({
        name: 'help',
        description: 'Show available commands',
        category: 'Session',
        handler: (_args, _session) => ({
            type: 'info',
            message: registry.getHelpText(),
        }),
    });

    // Status command
    registry.register({
        name: 'status',
        description: 'Show session status and token usage',
        category: 'Session',
        handler: (_args, session) => {
            const msgCount = session.messages.length;
            const summaryTokens = session.memorySummary 
                ? Math.ceil(session.memorySummary.length / 4)
                : 0;
            
            return {
                type: 'info',
                message: [
                    '🦅 Session Status',
                    '─────────────────',
                    `  Session ID:    ${session.id}`,
                    `  Messages:      ${msgCount}`,
                    `  Memory Summary: ~${summaryTokens} tokens`,
                    `  State:         ${session.state}`,
                ].join('\n'),
            };
        },
    });

    // Reset command
    registry.register({
        name: 'reset',
        description: 'Reset the current session (clear history)',
        category: 'Session',
        handler: (_args, session) => {
            session.messages = [];
            session.memorySummary = '';
            return {
                type: 'success',
                message: 'Session reset. History cleared.',
            };
        },
    });

    registry.register({
        name: 'new',
        description: 'Alias for /reset',
        category: 'Session',
        handler: (_args, session) => {
            session.messages = [];
            session.memorySummary = '';
            return {
                type: 'success',
                message: 'Session reset. History cleared.',
            };
        },
    });

    // Model command
    registry.register({
        name: 'model',
        description: 'Show current model',
        category: 'System',
        handler: (_args, _session, context) => {
            if (!context?.config) {
                return {
                    type: 'info',
                    message: '⚙️  Model information not available',
                };
            }

            const { model, providers } = context.config;
            const activeProviders = providers.join(', ');

            return {
                type: 'info',
                message: `🤖 Current Model\n  Model:     ${model}\n  Providers: ${activeProviders}`,
            };
        },
    });

    // Compact command
    registry.register({
        name: 'compact',
        description: 'Force memory compression',
        category: 'Session',
        handler: (_args, session) => {
            // Mark for compression - actual compression happens in agent loop
            return {
                type: 'success',
                message: `Session has ${session.messages.length} messages. Compression will run on next iteration.`,
            };
        },
    });

    // Exit command
    registry.register({
        name: 'exit',
        description: 'Exit Talon',
        category: 'System',
        handler: () => ({
            type: 'success',
            message: 'Goodbye!',
            shouldContinue: false,
        }),
    });

    registry.register({
        name: 'quit',
        description: 'Alias for /exit',
        category: 'System',
        handler: () => ({
            type: 'success',
            message: 'Goodbye!',
            shouldContinue: false,
        }),
    });

    // Token usage command
    registry.register({
        name: 'tokens',
        description: 'Show estimated token usage',
        category: 'Session',
        handler: (_args, session) => {
            const totalChars = session.messages.reduce((sum: number, m: typeof session.messages[0]) => sum + m.content.length, 0);
            const estimatedTokens = Math.ceil(totalChars / 4);
            const summaryTokens = session.memorySummary 
                ? Math.ceil(session.memorySummary.length / 4)
                : 0;
            
            return {
                type: 'info',
                message: [
                    '💰 Token Usage Estimate',
                    '───────────────────────',
                    `  Messages:       ~${estimatedTokens.toLocaleString()} tokens`,
                    `  Memory Summary: ~${summaryTokens.toLocaleString()} tokens`,
                    `  Total:          ~${(estimatedTokens + summaryTokens).toLocaleString()} tokens`,
                    '',
                    'Note: These are estimates (~4 chars/token).',
                    'Actual usage shown in API responses.',
                ].join('\n'),
            };
        },
    });

    // ── Config command ─────────────────────────────────────────────
    registry.register({
        name: 'config',
        description: 'View current Talon configuration',
        category: 'System',
        handler: (_args, _session, context) => {
            const config = context?.config ?? getDefaultConfig();
            
            return {
                type: 'info',
                message: [
                    '⚙️  Talon Configuration',
                    '────────────────────────',
                    `  Workspace:   ${config.workspace}`,
                    `  Model:       ${config.model}`,
                    `  Gateway:     ${config.gateway.host}:${config.gateway.port}`,
                    '',
                    '  Channels:',
                    `    CLI:       ${config.channels.cli ? '✅' : '❌'}`,
                    `    Telegram:  ${config.channels.telegram ? '✅' : '❌'}`,
                    `    WhatsApp:  ${config.channels.whatsapp ? '✅' : '❌'}`,
                    `    WebChat:   ${config.channels.webchat ? '✅' : '❌'}`,
                    '',
                    `  Providers:  ${config.providers.join(', ')}`,
                ].join('\n'),
            };
        },
    });

    // ── Memory command ─────────────────────────────────────────────
    registry.register({
        name: 'memory',
        description: 'View recent memory entries',
        category: 'System',
        handler: (_args, _session, _context) => {
            const memoryDir = path.join(TALON_HOME, 'workspace');
            const memoryFiles = [
                'MEMORY.md',
                'SOUL.md', 
                'USER.md',
                'PROFILE.json',
                'IDENTITY.md',
                'FACTS.json',
            ];
            
            const entries: string[] = [];
            
            for (const file of memoryFiles) {
                const filePath = path.join(memoryDir, file);
                if (fs.existsSync(filePath)) {
                    const stat = fs.statSync(filePath);
                    const date = stat.mtime.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                    });
                    entries.push(`  • ${file} (${date})`);
                }
            }
            
            if (entries.length === 0) {
                return {
                    type: 'info',
                    message: '📝 Memory\n\nNo memory files found.',
                };
            }
            
            return {
                type: 'info',
                message: [
                    '📝 Memory Files',
                    '────────────────',
                    ...entries,
                    '',
                    'Use /reset to clear session history.',
                ].join('\n'),
            };
        },
    });

    // ── Cron command ───────────────────────────────────────────────
    registry.register({
        name: 'cron',
        description: 'List/add/remove scheduled cron jobs',
        category: 'System',
        handler: async (args, _session, context) => {
            const sub = args.split(/\s+/).filter(Boolean);
            const action = sub[0] ?? 'list';
            const workspaceRoot = context?.config?.workspace ?? path.join(TALON_HOME, 'workspace');
            const store = new CronJobStore(workspaceRoot);

            if (action === 'list') {
                const jobs = cronService.getAllJobs();
                if (jobs.length === 0) {
                    return {
                        type: 'info',
                        message: '🕒 Cron Jobs\n\nNo jobs scheduled. Use `/cron add` to create one.',
                    };
                }

                const lines = jobs.map(j => {
                    const status = j.enabled ? '✅' : '⏸️';
                    const next = j.nextRun ? new Date(j.nextRun).toLocaleString() : 'n/a';
                    return `  • ${status} ${j.id} — ${j.name} (${j.schedule}) next: ${next}`;
                });

                return {
                    type: 'info',
                    message: ['🕒 Cron Jobs', '────────────────', ...lines].join('\n'),
                };
            }

            if (action === 'show') {
                const id = sub[1];
                if (!id) {
                    return { type: 'error', message: 'Usage: /cron show <jobId>' };
                }
                const job = cronService.getJob(id);
                if (!job) {
                    return { type: 'error', message: `Job not found: ${id}` };
                }
                const actions = (job.actions ?? []).map((a, i) => {
                    if (a.type === 'agent') {
                        return `  ${i + 1}) agent — ${a.prompt}`;
                    }
                    if (a.type === 'tool') {
                        return `  ${i + 1}) tool — ${a.tool} ${JSON.stringify(a.args ?? {})} (sendOutput: ${a.sendOutput ? 'yes' : 'no'})`;
                    }
                    return `  ${i + 1}) message — ${a.text}`;
                });
                return {
                    type: 'info',
                    message: [
                        `🕒 Cron Job: ${job.id}`,
                        '────────────────',
                        `  Name:      ${job.name}`,
                        `  Schedule:  ${job.schedule}`,
                        `  Enabled:   ${job.enabled ? 'yes' : 'no'}`,
                        `  Next Run:  ${job.nextRun ? new Date(job.nextRun).toLocaleString() : 'n/a'}`,
                        `  Last Run:  ${job.lastRun ? new Date(job.lastRun).toLocaleString() : 'n/a'}`,
                        `  Runs:      ${job.runCount}`,
                        `  Failures:  ${job.failCount}`,
                        '  Actions:',
                        ...(actions.length > 0 ? actions : ['  (none)']),
                    ].join('\n'),
                };
            }

            if (action === 'enable' || action === 'disable') {
                const id = sub[1];
                if (!id) {
                    return { type: 'error', message: `Usage: /cron ${action} <jobId>` };
                }
                const job = cronService.getJob(id);
                if (!job) {
                    return { type: 'error', message: `Job not found: ${id}` };
                }
                const enabled = action === 'enable';
                cronService.setEnabled(id, enabled);
                store.save(cronService.getAllJobs());
                return { type: 'success', message: `Cron job ${id} ${enabled ? 'enabled' : 'disabled'}.` };
            }

            if (action === 'remove') {
                const id = sub[1];
                if (!id) {
                    return { type: 'error', message: 'Usage: /cron remove <jobId>' };
                }
                const removed = cronService.removeJob(id);
                if (!removed) {
                    return { type: 'error', message: `Job not found: ${id}` };
                }
                store.save(cronService.getAllJobs());
                return { type: 'success', message: `Removed cron job ${id}` };
            }

            if (action === 'edit') {
                const id = sub[1];
                if (!id) {
                    return { type: 'error', message: 'Usage: /cron edit <jobId>' };
                }
                if (!context?.prompt) {
                    return { type: 'error', message: 'Interactive prompt not available in this mode.' };
                }

                const job = cronService.getJob(id);
                if (!job) {
                    return { type: 'error', message: `Job not found: ${id}` };
                }

                const field = (await context.prompt('Edit field:\n  1) name\n  2) schedule\n  3) enabled\n  4) action\nChoose (1-4): ')).trim();
                const fieldMap: Record<string, string> = {
                    '1': 'name',
                    '2': 'schedule',
                    '3': 'enabled',
                    '4': 'action',
                };
                const selectedField = fieldMap[field] ?? field.toLowerCase();

                if (selectedField === 'name') {
                    const name = await context.prompt(`Name [${job.name}]: `);
                    if (name.trim()) job.name = name.trim();
                } else if (selectedField === 'schedule') {
                    const schedule = await context.prompt(`Schedule [${job.schedule}]: `);
                    if (schedule.trim()) {
                        job.schedule = schedule.trim();
                        cronService.setEnabled(job.id, job.enabled);
                    }
                } else if (selectedField === 'enabled') {
                    const enabledRaw = await context.prompt(`Enabled (y/n) [${job.enabled ? 'y' : 'n'}]: `);
                    const enabled = ['y', 'yes'].includes(enabledRaw.toLowerCase());
                    cronService.setEnabled(job.id, enabled);
                } else if (selectedField === 'action') {
                    const actionLines = (job.actions ?? []).map((a, i) => {
                        if (a.type === 'agent') return `  ${i + 1}) agent — ${a.prompt.slice(0, 60)}`;
                        if (a.type === 'tool') return `  ${i + 1}) tool — ${a.tool}`;
                        return `  ${i + 1}) message — ${a.text.slice(0, 60)}`;
                    });
                    const indexRaw = await context.prompt(`Select action:\n${actionLines.join('\n')}\nChoose (1-${actionLines.length}): `);
                    const index = Math.max(1, parseInt(indexRaw, 10)) - 1;
                    const actionItem = job.actions?.[index];
                    if (!actionItem) {
                        return { type: 'error', message: 'Invalid action index.' };
                    }

                    if (actionItem.type === 'agent') {
                        const promptText = await context.prompt('Agent prompt (blank = keep): ');
                        const channel = await context.prompt('Channel (blank = keep): ');
                        if (promptText.trim()) actionItem.prompt = promptText.trim();
                        if (channel.trim()) actionItem.channel = channel.trim();
                    } else if (actionItem.type === 'tool') {
                        const tool = await context.prompt(`Tool name [${actionItem.tool}]: `);
                        const argsJson = await context.prompt('Tool args JSON (blank = keep): ');
                        const sendOutputRaw = await context.prompt(`Send output? (y/n) [${actionItem.sendOutput ? 'y' : 'n'}]: `);
                        const channel = await context.prompt('Channel (blank = keep): ');

                        if (tool.trim()) actionItem.tool = tool.trim();
                        if (argsJson.trim()) {
                            try {
                                actionItem.args = JSON.parse(argsJson);
                            } catch {
                                return { type: 'error', message: 'Invalid JSON for tool args.' };
                            }
                        }
                        if (sendOutputRaw.trim()) {
                            actionItem.sendOutput = ['y', 'yes'].includes(sendOutputRaw.toLowerCase());
                        }
                        if (channel.trim()) actionItem.channel = channel.trim();
                    } else if (actionItem.type === 'message') {
                        const text = await context.prompt('Message text (blank = keep): ');
                        const channel = await context.prompt('Channel (blank = keep): ');
                        if (text.trim()) actionItem.text = text.trim();
                        if (channel.trim()) actionItem.channel = channel.trim();
                    }
                } else {
                    return { type: 'error', message: 'Unknown field. Use name/schedule/enabled/action.' };
                }

                store.save(cronService.getAllJobs());
                return { type: 'success', message: `Updated cron job ${job.id}` };
            }

            if (action === 'add') {
                if (!context?.prompt) {
                    return { type: 'error', message: 'Interactive prompt not available in this mode.' };
                }

                const name = await context.prompt('Job name: ');
                const schedule = await context.prompt('Cron schedule (e.g., "0 6 * * *"): ');
                const type = (await context.prompt('Action type (agent/tool/message): ')).toLowerCase();
                const channel = await context.prompt('Channel (blank = default from profile): ');

                let actions: any[] = [];

                if (type === 'agent') {
                    const prompt = await context.prompt('Prompt for agent: ');
                    actions = [{
                        type: 'agent',
                        prompt,
                        channel: channel || undefined,
                    }];
                } else if (type === 'tool') {
                    const tool = await context.prompt('Tool name: ');
                    const argsJson = await context.prompt('Tool args JSON (blank = {}): ');
                    const sendOutputRaw = await context.prompt('Send tool output? (y/n): ');
                    let argsParsed: Record<string, unknown> = {};
                    if (argsJson.trim()) {
                        try {
                            argsParsed = JSON.parse(argsJson);
                        } catch {
                            return { type: 'error', message: 'Invalid JSON for tool args.' };
                        }
                    }
                    const sendOutput = ['y', 'yes'].includes(sendOutputRaw.toLowerCase());
                    actions = [{
                        type: 'tool',
                        tool,
                        args: argsParsed,
                        sendOutput,
                        channel: channel || undefined,
                    }];
                } else if (type === 'message') {
                    const text = await context.prompt('Message text: ');
                    actions = [{
                        type: 'message',
                        text,
                        channel: channel || undefined,
                    }];
                } else {
                    return { type: 'error', message: 'Unknown action type. Use agent/tool/message.' };
                }

                const job = cronService.addJob({
                    name: name || 'Cron Job',
                    schedule,
                    command: undefined,
                    args: [],
                    actions,
                    enabled: true,
                    timeout: 60000,
                    retryCount: 1,
                });

                store.save(cronService.getAllJobs());
                return {
                    type: 'success',
                    message: `Created cron job ${job.id} (${job.schedule})`,
                };
            }

            return { type: 'error', message: 'Usage: /cron [list|add|edit|show|enable|disable|remove]' };
        },
    });

    // ── Clear command ─────────────────────────────────────────────
    registry.register({
        name: 'clear',
        description: 'Clear screen (keep history)',
        category: 'Tools',
        handler: () => {
            return {
                type: 'success',
                message: '',
                shouldClear: true,
            };
        },
    });

    // ── Version command ────────────────────────────────────────────
    registry.register({
        name: 'version',
        description: 'Show Talon version and info',
        category: 'System',
        handler: () => {
            const packageJson = getPackageInfo();
            const uptime = process.uptime();
            const uptimeStr = formatUptime(uptime);
            
            return {
                type: 'info',
                message: [
                    '🦅 Talon',
                    '────────',
                    `  Version:   ${packageJson.version}`,
                    `  Name:      ${packageJson.name}`,
                    `  Node:      ${process.version}`,
                    `  Platform:  ${os.platform()} ${os.arch()}`,
                    `  Uptime:    ${uptimeStr}`,
                    '',
                    packageJson.description,
                ].join('\n'),
            };
        },
    });

    // ── Debug command ─────────────────────────────────────────────
    registry.register({
        name: 'debug',
        description: 'Toggle debug logging',
        category: 'System',
        handler: async (_args, _session, context) => {
            const currentLevel = context?.logLevel ?? 'info';
            const newLevel = currentLevel === 'debug' ? 'info' : 'debug';
            
            if (context?.setLogLevel) {
                await context.setLogLevel(newLevel);
            }
            
            return {
                type: 'success',
                message: `Debug mode ${newLevel === 'debug' ? 'enabled' : 'disabled'}. Current: ${newLevel}`,
            };
        },
    });

    return registry;
}

// ─── Bash Command Handler ─────────────────────────────────────────

export function isBangLine(input: string): boolean {
    return input.startsWith('!') && input !== '!';
}

export function parseBangLine(input: string): string {
    return input.slice(1).trim(); // Remove the '!' prefix
}

// ─── Helper Functions ─────────────────────────────────────────────

interface PackageJson {
    name: string;
    version: string;
    description: string;
}

function getPackageInfo(): PackageJson {
    try {
        const packagePath = path.join(TALON_HOME, '..', 'package.json');
        const content = fs.readFileSync(packagePath, 'utf-8');
        return JSON.parse(content) as PackageJson;
    } catch {
        return {
            name: 'talon',
            version: '0.3.0',
            description: 'Personal AI Assistant',
        };
    }
}

function getDefaultConfig(): TalonConfigSummary {
    return {
        workspace: path.join(os.homedir(), '.talon', 'workspace'),
        model: 'deepseek/deepseek-chat',
        providers: ['deepseek'],
        channels: {
            cli: true,
            telegram: false,
            whatsapp: false,
            webchat: true,
        },
        gateway: {
            host: '127.0.0.1',
            port: 19789,
        },
    };
}

function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
}
