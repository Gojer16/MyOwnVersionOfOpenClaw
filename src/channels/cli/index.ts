// ─── Enhanced CLI Channel ─────────────────────────────────────────
// Interactive REPL with slash commands and bash support
// Enhanced with features from openclaw TUI

import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { BaseChannel } from '../base.js';
import type { OutboundMessage } from '../../utils/types.js';
import type { AgentChunk } from '../../agent/loop.js';
import { logger } from '../../utils/logger.js';
import { createBuiltinCommands, parseCommand, isBangLine, parseBangLine, type CommandContext } from './commands.js';
import { initializeSkills } from '../../skills/loader.js';
import chalk from 'chalk';

export class CliChannel extends BaseChannel {
    public readonly name = 'cli';
    private rl: readline.Interface | null = null;
    private sessionId: string | null = null;
    private isShutdown = false;
    private isStarted = false;
    private commands = createBuiltinCommands();
    private currentStream: AsyncIterable<AgentChunk> | null = null;
    private logLevel = 'info';
    private currentModel = 'unknown';

    // Get command context for passing to handlers
    private getCommandContext(): CommandContext {
        return {
            logLevel: this.logLevel,
            setLogLevel: async (level: string) => {
                this.logLevel = level;
                // Update logger level using dynamic import
                const { logger } = await import('../../utils/logger.js');
                logger.level = level;
            },
            config: {
                workspace: this.config.workspace.root,
                model: this.config.agent.model,
                providers: Object.keys(this.config.agent.providers),
                channels: {
                    cli: this.config.channels.cli.enabled,
                    telegram: this.config.channels.telegram.enabled,
                    whatsapp: this.config.channels.whatsapp?.enabled ?? false,
                    webchat: this.config.channels.webchat.enabled,
                },
                gateway: {
                    host: this.config.gateway.host,
                    port: this.config.gateway.port,
                },
            },
        };
    }

    public async start(): Promise<void> {
        if (this.isStarted) {
            logger.warn('CLI channel already started');
            return;
        }

        if (!this.config.channels.cli.enabled) {
            return;
        }

        if (!process.stdin.isTTY) {
            logger.info('Not running in TTY, CLI channel disabled');
            return;
        }

        this.isStarted = true;
        logger.info('Starting CLI channel...');

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.cyan('You > '),
            completer: (line: string) => this.completer(line),
        });

        // Print Welcome Banner
        this.printBanner();

        // Create or resume session
        const cliSessionId = 'cli-local';
        let session = this.sessionManager.getSession(cliSessionId);

        if (!session) {
            try {
                session = this.sessionManager.resumeSession(cliSessionId);
            } catch {
                session = this.sessionManager.createSession('user', 'cli', 'User', cliSessionId);
            }
        }
        this.sessionId = session.id;

        // Set initial model from config
        this.currentModel = this.config.agent.model;

        // Setup event listeners
        this.setupEventListeners();

        // Initialize skills
        await this.initializeSkills();

        // Start input loop
        this.prompt();

        this.rl.on('line', async (line) => {
            await this.handleInput(line.trim());
        });

        this.rl.on('close', () => {
            if (!this.isShutdown) {
                console.log('\n👋 Goodbye!');
                process.exit(0);
            }
        });
    }

    private printBanner(): void {
        console.clear();
        console.log('');
        console.log(chalk.bold.hex('#FF6B35')('  🦅 Welcome to Talon'));
        console.log(chalk.gray('  Your Personal AI Assistant'));
        console.log('');
        
        // Show current model
        const modelName = this.config.agent.model.split('/').pop() || this.config.agent.model;
        console.log(chalk.dim(`  Model: ${chalk.yellow(modelName)}`));
        console.log('');
        
        console.log(chalk.dim('  Type /help for commands or just start chatting!'));
        console.log('');
    }

    private setupEventListeners(): void {
        // Listen for outbound messages
        this.eventBus.on('message.outbound', (params: { sessionId: string; message: OutboundMessage }) => {
            if (params.sessionId === this.sessionId) {
                this.printResponse(params.message);
            }
        });

        // Tool execution feedback
        this.eventBus.on('tool.execute', (params) => {
            if (params.sessionId === this.sessionId) {
                process.stdout.write('\r\x1b[K'); // Clear line
                console.log(chalk.gray(`  🛠️  Using ${params.tool}...`));
            }
        });

        // Agent thinking indicator
        this.eventBus.on('agent.thinking', (params) => {
            if (params.sessionId === this.sessionId) {
                process.stdout.write(chalk.gray('  🤔 Thinking...\r'));
            }
        });

        // Track model usage
        this.eventBus.on('agent.model.used', (params) => {
            if (params.sessionId === this.sessionId && params.model) {
                this.currentModel = params.model;
            }
        });
    }

    private async initializeSkills(): Promise<void> {
        try {
            await initializeSkills(this.config);
        } catch (error) {
            console.log(chalk.yellow(`  ⚠️  Failed to initialize skills: ${error instanceof Error ? error.message : String(error)}`));
        }
    }

    private async handleInput(text: string): Promise<void> {
        if (!text) {
            this.prompt();
            return;
        }

        // Handle slash commands
        if (text.startsWith('/')) {
            await this.handleSlashCommand(text);
            return;
        }

        // Handle bang lines (bash)
        if (isBangLine(text)) {
            await this.handleBangCommand(text);
            return;
        }

        // Regular message to agent
        await this.sendToAgent(text);
    }

    private async handleSlashCommand(text: string): Promise<void> {
        const parsed = parseCommand(text);
        const command = this.commands.get(parsed.name);

        if (!command) {
            console.log(chalk.red(`  Unknown command: /${parsed.name}`));
            
            // Show command suggestions
            const suggestions = this.commands.getCommandSuggestions(parsed.name);
            if (suggestions.length > 0) {
                console.log(chalk.dim(`  Did you mean: ${suggestions.map(c => `/${c}`).join(', ')}?`));
            }
            
            console.log(chalk.dim('  Type /help for all available commands'));
            this.prompt();
            return;
        }

        const session = this.sessionManager.getSession(this.sessionId!);
        if (!session) {
            console.log(chalk.red('  Error: Session not found'));
            this.prompt();
            return;
        }

        try {
            const context = this.getCommandContext();
            const result = await command.handler(parsed.args, session, context);
            
            // Handle clear screen
            if (result.shouldClear) {
                console.clear();
                this.printBanner();
                this.prompt();
                return;
            }
            
            // Print result with color coding
            switch (result.type) {
                case 'success':
                    if (result.message) console.log(chalk.green(result.message));
                    break;
                case 'error':
                    console.log(chalk.red(result.message));
                    break;
                case 'warning':
                    console.log(chalk.yellow(result.message));
                    break;
                case 'info':
                    if (result.message) console.log(result.message);
                    break;
            }

            if (result.shouldContinue === false) {
                console.log('');
                process.exit(0);
            }
        } catch (err) {
            console.log(chalk.red(`  Command failed: ${err instanceof Error ? err.message : String(err)}`));
        }

        this.prompt();
    }

    private async handleBangCommand(text: string): Promise<void> {
        const command = parseBangLine(text);
        
        console.log(chalk.gray(`  $ ${command}`));
        
        return new Promise((resolve) => {
            const [cmd, ...args] = command.split(' ');
            const child = spawn(cmd, args, {
                stdio: 'inherit',
                shell: true,
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    console.log(chalk.red(`  Exit code: ${code}`));
                }
                console.log('');
                this.prompt();
                resolve();
            });

            child.on('error', (err) => {
                console.log(chalk.red(`  Error: ${err.message}`));
                this.prompt();
                resolve();
            });
        });
    }

    private async sendToAgent(text: string): Promise<void> {
        await this.ingestMessage('user', 'User', text);
    }

    private printResponse(message: OutboundMessage): void {
        // Clear thinking indicator if present
        process.stdout.write('\r\x1b[K');
        
        // Check if this is an error message
        const isError = message.metadata?.error === true;
        
        // Use different styling for errors vs normal responses
        const prefix = isError 
            ? chalk.yellow('⚠️  Talon > ') 
            : chalk.green('🦅 Talon > ');
        const cleanText = this.formatResponse(message.text);
        
        console.log('');
        console.log(prefix + cleanText);
        
        // Show model indicator
        const modelName = this.currentModel.split('/').pop() || this.currentModel;
        console.log(chalk.dim(`  [${chalk.yellow(modelName)}]`));
        
        // Show error details in debug mode
        if (isError && message.metadata?.errorDetails) {
            console.log(chalk.gray(`  🔧 ${String(message.metadata.errorDetails).substring(0, 100)}...`));
        }
        
        console.log('');
        this.prompt();
    }

    private formatResponse(text: string): string {
        return text
            .replace(/\*\*([^*]+)\*\*/g, chalk.bold('$1'))
            .replace(/\*([^*]+)\*/g, chalk.italic('$1'))
            .replace(/`([^`]+)`/g, chalk.yellow('$1'))
            .replace(/```[\s\S]*?```/g, (match) => {
                // Keep code blocks but dim them
                return chalk.dim(match);
            })
            .trim();
    }

    private completer(line: string): [string[], string] {
        const completions = this.commands.list().map(cmd => `/${cmd.name}`);
        const hits = completions.filter(c => c.startsWith(line));
        return [hits.length ? hits : completions, line];
    }

    private prompt(): void {
        if (this.rl && !this.isShutdown) {
            this.rl.prompt();
        }
    }

    public async stop(): Promise<void> {
        this.isShutdown = true;
        this.isStarted = false;
        this.rl?.close();
        this.rl = null;
    }

    public async send(_sessionId: string, _message: OutboundMessage): Promise<void> {
        // Handled by event listener
    }
}
