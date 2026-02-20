// ─── TUI Client ───────────────────────────────────────────────────
// Connect to running gateway and provide interactive chat interface.
// Uses the SHARED TerminalRenderer — all display logic lives there.

import WebSocket from 'ws';
import readline from 'node:readline';
import chalk from 'chalk';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
import { TerminalRenderer, wsMessageToChunk } from '../channels/cli/renderer.js';

const GATEWAY_URL = 'ws://127.0.0.1:19789/ws';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export async function startTUI(): Promise<void> {
    console.clear();
    printBanner();

    // Check if gateway is running
    try {
        console.log(chalk.dim('  Connecting to gateway...'));
        const healthCheck = await fetch('http://127.0.0.1:19789/api/health');
        if (!healthCheck.ok) {
            console.log(chalk.red('✗ Gateway is not responding'));
            console.log(chalk.dim('  Run `talon service start` or `talon start --daemon`\n'));
            process.exit(1);
        }

        // Wait for gateway to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1500));

    } catch {
        console.log(chalk.red('✗ Gateway is not running'));
        console.log(chalk.dim('  Run `talon service start` or `talon start --daemon`\n'));
        process.exit(1);
    }

    // Show status indicators
    const configPath = path.join(os.homedir(), '.talon', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    console.log(chalk.green('✓ Connected to gateway'));
    console.log(chalk.yellow('⚡ Model: ') + chalk.dim(config.agent.model));
    console.log(chalk.blue('📍 Workspace: ') + chalk.dim(config.workspace.root));
    console.log(chalk.dim('  Loading memory files...'));
    console.log('');

    const ws = new WebSocket(GATEWAY_URL);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.cyan('You > '),
    });

    // ─── Shared Renderer (single source of truth for display) ─────
    const renderer = new TerminalRenderer(
        () => rl.prompt(),
        { currentModel: config.agent.model },
    );

    ws.on('open', () => {
        rl.prompt();
    });

    // ─── Message Handler ─────────────────────────────────────────
    // Convert WebSocket messages → RenderChunks → pass to renderer.
    // NO display logic here — it all lives in TerminalRenderer.
    ws.on('message', (data: Buffer) => {
        try {
            const msg = JSON.parse(data.toString());
            const chunk = wsMessageToChunk(msg);
            if (chunk) {
                renderer.handleChunk(chunk);
            }
        } catch (err) {
            console.log(chalk.red('\n[ERROR] Parse error:'), err);
        }
    });

    ws.on('error', (err) => {
        console.log(chalk.red('\n✗ Connection error:'), err.message);
        process.exit(1);
    });

    ws.on('close', () => {
        console.log(chalk.yellow('\n✗ Disconnected from gateway'));
        process.exit(0);
    });

    // ─── User Input ──────────────────────────────────────────────
    rl.on('line', (line: string) => {
        const input = line.trim();

        if (!input) {
            rl.prompt();
            return;
        }

        // Handle slash commands
        if (input.startsWith('/')) {
            handleSlashCommand(input, rl, ws, renderer);
            return;
        }

        // Handle bash commands
        if (input.startsWith('!')) {
            const command = input.slice(1);
            console.log(chalk.dim(`$ ${command}`));
            sendToGateway(ws, `Execute this shell command: ${command}`);
            renderer.startWaiting();
            return;
        }

        // Send regular message
        sendToGateway(ws, input);
        renderer.startWaiting();
    });

    rl.on('close', () => {
        ws.close();
        console.log(chalk.dim('\nGoodbye! 🦅\n'));
        process.exit(0);
    });

    // ─── Handle Ctrl+C gracefully ─────
    let ctrlCCount = 0;
    process.on('SIGINT', () => {
        ctrlCCount++;
        if (ctrlCCount === 1) {
            console.log('\n');
            console.log(chalk.yellow('  ⚠️  Press Ctrl+C again to exit'));
            rl.prompt();
            setTimeout(() => { ctrlCCount = 0; }, 2000);
        } else {
            console.log('\n');
            console.log(chalk.gray('  👋 Goodbye!'));
            ws.close();
            rl.close();
            process.exit(0);
        }
    });
}

// ─── Gateway Communication ───────────────────────────────────────

function sendToGateway(ws: WebSocket, text: string): void {
    ws.send(JSON.stringify({
        type: 'channel.message',
        payload: {
            channel: 'tui',
            senderId: 'tui-user',
            senderName: 'TUI User',
            text,
            media: null,
            isGroup: false,
            groupId: null,
        },
    }));
}

// ─── Slash Commands ──────────────────────────────────────────────

function handleSlashCommand(input: string, rl: readline.Interface, ws: WebSocket, renderer: TerminalRenderer): void {
    const [cmd, ...args] = input.slice(1).split(' ');

    switch (cmd) {
        case 'help':
            showHelp();
            rl.prompt();
            break;

        case 'clear':
            console.clear();
            printBanner();
            rl.prompt();
            break;

        case 'exit':
        case 'quit':
            ws.close();
            rl.close();
            break;

        case 'model':
            showModel();
            rl.prompt();
            break;

        case 'config':
            showConfig();
            rl.prompt();
            break;

        case 'version':
            showVersion();
            rl.prompt();
            break;

        case 'debug':
            renderer.showToolOutputs = !renderer.showToolOutputs;
            const status = renderer.showToolOutputs ? chalk.green('ON') : chalk.red('OFF');
            console.log(chalk.yellow(`\n🔧 Debug mode: ${status}`));
            console.log(chalk.dim(renderer.showToolOutputs 
                ? '  Raw tool outputs will be shown' 
                : '  Tool outputs hidden (clean UX)'));
            console.log('');
            rl.prompt();
            break;

        case 'provider':
            console.log(chalk.yellow('\n⚠ Run provider setup as a separate command:\n'));
            console.log(chalk.dim('  $ talon setup\n'));
            console.log(chalk.dim('  Or press Ctrl+C to exit and run: talon setup\n'));
            rl.prompt();
            break;

        case 'switch':
            console.log(chalk.yellow('\n⚠ Model switching requires gateway restart.\n'));
            console.log(chalk.dim('  Exit TUI and run: talon setup\n'));
            rl.prompt();
            break;

        case 'status':
        case 'reset':
        case 'new':
        case 'compact':
        case 'tokens':
        case 'memory':
            // Send to agent
            sendToGateway(ws, input);
            break;

        default:
            console.log(chalk.yellow(`Unknown command: /${cmd}`));
            console.log(chalk.dim('Type /help for available commands\n'));
            rl.prompt();
    }
}

// ─── UI Helpers ──────────────────────────────────────────────────

function printBanner(): void {
    console.log(chalk.cyan(`
  ╔══════════════════════════════════════╗
  ║                                      ║
  ║   🦅  T A L O N   T U I             ║
  ║                                      ║
  ║   Connected to Gateway               ║
  ║                                      ║
  ╚══════════════════════════════════════╝
  `));
}

function showHelp(): void {
    console.log(chalk.bold.cyan('\n🦅 Talon CLI Commands'));
    console.log(chalk.dim('──────────────────────────────────────────────────\n'));

    console.log(chalk.bold('Session'));
    console.log('  /help       Show available commands');
    console.log('  /status     Show session status and token usage');
    console.log('  /reset      Reset the current session (clear history)');
    console.log('  /new        Alias for /reset');
    console.log('  /compact    Force memory compression');
    console.log('  /tokens     Show estimated token usage');
    console.log('');
    console.log(chalk.bold('Display'));
    console.log('  /debug      Toggle raw tool output visibility');
    console.log('  /clear      Clear screen');
    console.log('');

    console.log(chalk.bold('System'));
    console.log('  /model      Show current model');
    console.log('  /exit       Exit Talon');
    console.log('  /quit       Alias for /exit');
    console.log('  /config     View current Talon configuration');
    console.log('  /memory     View recent memory entries');
    console.log('  /version    Show Talon version and info');
    console.log('  /debug      Toggle debug logging');
    console.log('');

    console.log(chalk.bold('Configuration'));
    console.log('  Run `talon setup` to change provider or model');
    console.log('');

    console.log(chalk.bold('Tools'));
    console.log('  /clear    Clear screen (keep history)');
    console.log('');

    console.log(chalk.bold('Shell'));
    console.log('  /!<command>    Execute bash command (e.g., !ls, !pwd)');
    console.log('');
}

function showModel(): void {
    try {
        const configPath = path.join(os.homedir(), '.talon', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const providerIds = Object.keys(config.agent.providers);

        console.log(chalk.cyan('\n🤖 Current Model'));
        console.log(`  Model:     ${config.agent.model}`);
        console.log(`  Providers: ${providerIds.join(', ')}`);
        console.log('');
    } catch (err) {
        console.log(chalk.red('\n✗ Failed to load config'));
        console.log('');
    }
}

function showConfig(): void {
    try {
        const configPath = path.join(os.homedir(), '.talon', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        console.log(chalk.cyan('\n⚙️  Talon Configuration'));
        console.log(chalk.dim('────────────────────────'));
        console.log(`  Workspace:   ${config.workspace}`);
        console.log(`  Model:       ${config.agent.model}`);
        console.log(`  Gateway:     ${config.gateway.host}:${config.gateway.port}`);
        console.log('');
        console.log('  Channels:');
        console.log(`    CLI:       ${config.channels.cli?.enabled ? '✅' : '❌'}`);
        console.log(`    Telegram:  ${config.channels.telegram?.enabled ? '✅' : '❌'}`);
        console.log(`    WhatsApp:  ${config.channels.whatsapp?.enabled ? '✅' : '❌'}`);
        console.log(`    WebChat:   ${config.channels.webchat?.enabled ? '✅' : '❌'}`);
        console.log('');
        console.log(`  Providers:  ${Object.keys(config.agent.providers).join(', ')}`);
        console.log('');
    } catch (err) {
        console.log(chalk.red('\n✗ Failed to load config'));
        console.log('');
    }
}

function showVersion(): void {
    try {
        const packagePath = path.join(process.cwd(), 'package.json');
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const uptimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        console.log(chalk.cyan('\n🦅 Talon'));
        console.log(chalk.dim('────────'));
        console.log(`  Version:   ${pkg.version}`);
        console.log(`  Name:      ${pkg.name}`);
        console.log(`  Node:      ${process.version}`);
        console.log(`  Platform:  ${os.platform()} ${os.arch()}`);
        console.log(`  Uptime:    ${uptimeStr}`);
        console.log('');
        console.log(chalk.dim(`  ${pkg.description}`));
        console.log('');
    } catch (err) {
        console.log(chalk.red('\n✗ Failed to load version info'));
        console.log('');
    }
}

async function changeProvider(): Promise<void> {
    const inquirer = await import('inquirer');
    const { PROVIDERS } = await import('./providers.js');
    const { execSync } = await import('node:child_process');

    try {
        const configPath = path.join(os.homedir(), '.talon', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        const providerId = await inquirer.default.prompt({
            type: 'list',
            name: 'providerId',
            message: 'Choose provider:',
            choices: PROVIDERS.filter(p => p.id !== 'anthropic' && p.id !== 'custom').map(p => ({
                name: p.name,
                value: p.id,
            })),
        });

        const provider = PROVIDERS.find(p => p.id === providerId.providerId)!;
        const apiKey = await inquirer.default.prompt({
            type: 'password',
            name: 'apiKey',
            message: `Enter ${provider.name} API key:`,
        });

        // Update config
        config.agent.providers[providerId.providerId] = {
            apiKey: apiKey.apiKey,
            baseUrl: provider.baseUrl,
            models: provider.models.map(m => m.id),
        };

        const switchNow = await inquirer.default.prompt({
            type: 'confirm',
            name: 'switch',
            message: 'Switch to this provider now?',
            default: true,
        });

        if (switchNow.switch) {
            const defaultModel = provider.models[0].id;
            // Don't prefix if already has provider prefix
            if (defaultModel.includes('/')) {
                config.agent.model = defaultModel;
            } else {
                config.agent.model = providerId.providerId === 'deepseek' ? defaultModel : `${providerId.providerId}/${defaultModel}`;
            }
        }

        // Update env
        const envPath = path.join(os.homedir(), '.talon', '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
        const envVar = provider.envVar;
        const regex = new RegExp(`^${envVar}=.*$`, 'm');

        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${envVar}=${apiKey.apiKey}`);
        } else {
            envContent += `\n${envVar}=${apiKey.apiKey}\n`;
        }

        fs.writeFileSync(envPath, envContent, 'utf-8');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

        console.log(chalk.green(`\n✓ Provider ${provider.name} configured`));
        if (switchNow.switch) {
            console.log(chalk.green(`✓ Switched to ${config.agent.model}`));
        }

        const shouldRestart = await inquirer.default.prompt({
            type: 'confirm',
            name: 'restart',
            message: 'Restart gateway now?',
            default: true,
        });

        if (shouldRestart.restart) {
            console.log(chalk.dim('\n  Restarting gateway...'));
            try {
                const cliPath = path.join(process.cwd(), 'dist', 'cli', 'index.js');
                execSync(`${process.execPath} ${cliPath} service restart`, {
                    stdio: 'pipe',
                    timeout: 10000,
                });
                console.log(chalk.green('  ✓ Gateway restarted'));
                console.log(chalk.dim('  Waiting for gateway...'));

                // Wait for gateway to be ready
                await new Promise(resolve => setTimeout(resolve, 2000));

                console.log(chalk.green('  ✓ Ready!'));
                console.log(chalk.yellow('\n  Restart TUI to use new provider: /exit then talon tui\n'));
                process.exit(0);
            } catch (err) {
                console.log(chalk.red('  ✗ Failed to restart gateway'));
                console.log(chalk.yellow('  Run manually: talon service restart\n'));
                process.exit(1);
            }
        } else {
            console.log(chalk.yellow('\n  Remember to restart gateway: talon service restart'));
            console.log(chalk.yellow('  Then restart TUI: /exit then talon tui\n'));
            process.exit(0);
        }
    } catch (err: any) {
        if (err.name !== 'ExitError') {
            console.log(chalk.red('\n✗ Failed to change provider\n'));
        }
        process.exit(0);
    }
}

async function switchModel(): Promise<void> {
    const { select, confirm } = await import('@inquirer/prompts');
    const { execSync } = await import('node:child_process');

    try {
        const configPath = path.join(os.homedir(), '.talon', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        const providers = Object.keys(config.agent.providers);
        if (providers.length === 0) {
            console.log(chalk.yellow('\n⚠ No providers configured. Use /provider first\n'));
            process.exit(0);
        }

        console.log(''); // Add spacing

        const providerId = await select({
            message: 'Choose provider:',
            choices: providers.map(p => ({ name: p, value: p })),
        });

        const models = config.agent.providers[providerId].models || [];
        const modelId = await select({
            message: 'Choose model:',
            choices: models.map((m: string) => ({ name: m, value: m })),
        });

        // Update model
        config.agent.model = providerId === 'deepseek' ? modelId : `${providerId}/${modelId}`;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

        console.log(chalk.green(`\n✓ Switched to ${config.agent.model}`));

        console.log(''); // Add spacing before next prompt

        // Auto-restart gateway
        const shouldRestart = await confirm({
            message: 'Restart gateway now?',
            default: true,
        });

        if (shouldRestart) {
            console.log(chalk.dim('\n  Restarting gateway...'));
            try {
                const cliPath = path.join(process.cwd(), 'dist', 'cli', 'index.js');
                execSync(`${process.execPath} ${cliPath} service restart`, {
                    stdio: 'pipe',
                    timeout: 10000,
                });
                console.log(chalk.green('  ✓ Gateway restarted'));
                console.log(chalk.dim('  Waiting for gateway...'));

                // Wait for gateway to be ready
                await new Promise(resolve => setTimeout(resolve, 2000));

                console.log(chalk.green('  ✓ Ready!'));
                console.log(chalk.yellow('\n  Restart TUI to use new model: /exit then talon tui\n'));
                process.exit(0);
            } catch (err) {
                console.log(chalk.red('  ✗ Failed to restart gateway'));
                console.log(chalk.yellow('  Run manually: talon service restart\n'));
                process.exit(1);
            }
        } else {
            console.log(chalk.yellow('\n  Remember to restart gateway: talon service restart'));
            console.log(chalk.yellow('  Then restart TUI: /exit then talon tui\n'));
            process.exit(0);
        }
    } catch (err: any) {
        if (err.name !== 'ExitPromptError') {
            console.log(chalk.red('\n✗ Failed to switch model\n'));
        }
    }
}
