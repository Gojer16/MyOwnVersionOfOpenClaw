// ─── Enhanced CLI Channel ─────────────────────────────────────────
// Interactive REPL with slash commands and bash support
// Uses the SHARED TerminalRenderer — all display logic lives there.

import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { BaseChannel } from '../base.js';
import type { OutboundMessage } from '../../utils/types.js';
import type { AgentChunk } from '../../agent/loop.js';
import { logger } from '../../utils/logger.js';
import { createBuiltinCommands, parseCommand, isBangLine, parseBangLine, type CommandContext } from './commands.js';
import { initializeSkills } from '../../skills/loader.js';
import { TerminalRenderer } from './renderer.js';
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
    private renderer: TerminalRenderer | null = null;

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

        // ─── Handle Ctrl+C gracefully ─────
        let ctrlCCount = 0;
        process.on('SIGINT', () => {
            ctrlCCount++;
            if (ctrlCCount === 1) {
                console.log('\n');
                console.log(chalk.yellow('  ⚠️  Press Ctrl+C again to exit'));
                this.prompt();
                setTimeout(() => { ctrlCCount = 0; }, 2000);
            } else {
                console.log('\n');
                console.log(chalk.gray('  👋 Goodbye!'));
                this.isShutdown = true;
                this.rl?.close();
                process.exit(0);
            }
        });

        // ─── Shared Renderer (single source of truth for display) ─────
        this.renderer = new TerminalRenderer(
            () => this.prompt(),
            { currentModel: this.config.agent.model },
        );

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
        // Listen for outbound messages → convert to RenderChunks
        this.eventBus.on('message.outbound', (params: { sessionId: string; message: OutboundMessage }) => {
            if (params.sessionId !== this.sessionId) return;

            const message = params.message;
            const isError = message.metadata?.error === true;

            if (isError) {
                this.renderer?.handleChunk({
                    type: 'error',
                    content: message.text,
                });
            } else {
                // Emit text then done — renderer handles all display
                this.renderer?.handleChunk({
                    type: 'text',
                    content: message.text,
                });
                this.renderer?.handleChunk({
                    type: 'done',
                    model: message.metadata?.model as string | undefined,
                    providerId: message.metadata?.provider as string | undefined,
                    usage: message.metadata?.usage as any,
                });
            }
        });

        // Tool execution feedback → render as tool_call chunk
        this.eventBus.on('tool.execute', (params) => {
            if (params.sessionId !== this.sessionId) return;
            this.renderer?.handleChunk({
                type: 'tool_call',
                toolCall: {
                    id: '',
                    name: params.tool,
                    args: params.args ?? {},
                },
            });
        });

        // Agent thinking indicator → render as thinking chunk
        this.eventBus.on('agent.thinking', (params) => {
            if (params.sessionId !== this.sessionId) return;
            this.renderer?.handleChunk({ type: 'thinking' });
        });

        // Track model usage
        this.eventBus.on('agent.model.used', (params) => {
            if (params.sessionId === this.sessionId && params.model && this.renderer) {
                this.renderer.currentModel = params.model;
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
        this.renderer?.reset();
        this.rl?.close();
        this.rl = null;
    }

    public async send(_sessionId: string, _message: OutboundMessage): Promise<void> {
        // Handled by event listener
    }
}
