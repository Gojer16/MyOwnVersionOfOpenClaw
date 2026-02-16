// ─── Shell Tool ───────────────────────────────────────────────────
// shell_execute — runs commands with timeout, output truncation, and safety checks

import { exec } from 'node:child_process';
import os from 'node:os';
import type { TalonConfig } from '../config/schema.js';
import type { ToolDefinition } from './registry.js';
import { logger } from '../utils/logger.js';

// ─── Dangerous Command Detection ─────────────────────────────────

const DESTRUCTIVE_PATTERNS = [
    /\brm\s+-rf?\s/i,
    /\brm\s+--force/i,
    /\bsudo\s+rm\b/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    /\b>\s*\/dev\//i,
    /\bformat\b/i,
    /\bfdisk\b/i,
    /\bsudo\s+shutdown\b/i,
    /\bsudo\s+reboot\b/i,
    /\bchmod\s+-R\s+777\b/i,
    /\bcurl\b.*\|\s*(ba)?sh\b/i,
    /\bwget\b.*\|\s*(ba)?sh\b/i,
];

function isDestructiveCommand(cmd: string): boolean {
    return DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(cmd));
}

// ─── Tool ─────────────────────────────────────────────────────────

export function registerShellTools(config: TalonConfig): ToolDefinition[] {
    return [
        {
            name: 'shell_execute',
            description: 'Execute a shell command and return its output. Use for running scripts, checking git status, installing packages, running tests, etc. Commands run in the user\'s default shell.',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The shell command to execute',
                    },
                    cwd: {
                        type: 'string',
                        description: 'Working directory for the command. Default: user home directory',
                    },
                    timeout: {
                        type: 'number',
                        description: `Timeout in milliseconds. Default: ${config.tools.shell.defaultTimeout}ms`,
                    },
                },
                required: ['command'],
            },
            execute: async (args) => {
                const command = args.command as string;
                const cwd = (args.cwd as string) || os.homedir();
                const timeout = (args.timeout as number) || config.tools.shell.defaultTimeout;

                // Check blocked commands
                for (const blocked of config.tools.shell.blockedCommands) {
                    if (command.includes(blocked)) {
                        return `Error: Command blocked by config (contains "${blocked}"). ` +
                            'Check tools.shell.blockedCommands in config.';
                    }
                }

                // Check destructive patterns
                if (config.tools.shell.confirmDestructive && isDestructiveCommand(command)) {
                    return `⚠️ BLOCKED: This command looks destructive:\n\`${command}\`\n\n` +
                        'Destructive commands are blocked by default. Use `trash` instead of `rm`, ' +
                        'or ask the user for explicit permission. ' +
                        'Set tools.shell.confirmDestructive: false to disable this check.';
                }

                logger.info({ command, cwd, timeout }, 'shell_execute');

                try {
                    const result = await executeCommand(command, cwd, timeout);

                    // Truncate output if too large
                    let output = result.stdout;
                    if (result.stderr) {
                        output += output ? '\n\n--- stderr ---\n' : '';
                        output += result.stderr;
                    }

                    if (output.length > config.tools.shell.maxOutputSize) {
                        const truncated = output.slice(0, config.tools.shell.maxOutputSize);
                        output = truncated + `\n\n... (output truncated, ${output.length} total characters)`;
                    }

                    // Include exit code
                    const exitInfo = result.exitCode === 0
                        ? ''
                        : `\n[Exit code: ${result.exitCode}]`;

                    return (output || '(no output)') + exitInfo;
                } catch (err) {
                    if (err instanceof Error && err.message.includes('timeout')) {
                        return `Error: Command timed out after ${timeout}ms.\n` +
                            `Command: ${command}`;
                    }
                    return `Error: ${err instanceof Error ? err.message : String(err)}`;
                }
            },
        },
    ];
}

// ─── Command Execution ───────────────────────────────────────────

interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

function executeCommand(command: string, cwd: string, timeout: number): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        const proc = exec(
            command,
            {
                cwd,
                timeout,
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                shell: process.env.SHELL || '/bin/zsh',
                env: { ...process.env, PAGER: 'cat', GIT_PAGER: 'cat' },
            },
            (error, stdout, stderr) => {
                if (error && error.killed) {
                    reject(new Error(`Command timeout after ${timeout}ms`));
                    return;
                }

                resolve({
                    stdout: stdout?.toString() ?? '',
                    stderr: stderr?.toString() ?? '',
                    exitCode: error ? (error.code ?? 1) : 0,
                });
            },
        );

        // Cleanup on timeout
        setTimeout(() => {
            try {
                proc.kill('SIGTERM');
            } catch {
                // Already dead
            }
        }, timeout + 1000);
    });
}
