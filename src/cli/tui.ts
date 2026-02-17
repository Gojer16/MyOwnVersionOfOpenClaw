// ─── TUI Client ───────────────────────────────────────────────────
// Connect to running gateway and provide interactive chat interface

import WebSocket from 'ws';
import readline from 'node:readline';
import chalk from 'chalk';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config/index.js';

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
        const healthCheck = await fetch('http://127.0.0.1:19789/api/health');
        if (!healthCheck.ok) {
            console.log(chalk.red('✗ Gateway is not responding'));
            console.log(chalk.dim('  Run `talon service start` or `talon start --daemon`\n'));
            process.exit(1);
        }
    } catch {
        console.log(chalk.red('✗ Gateway is not running'));
        console.log(chalk.dim('  Run `talon service start` or `talon start --daemon`\n'));
        process.exit(1);
    }

    console.log(chalk.green('✓ Connected to gateway\n'));

    const ws = new WebSocket(GATEWAY_URL);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.cyan('You > '),
    });

    let isWaitingForResponse = false;

    ws.on('open', () => {
        // Send hello message
        ws.send(JSON.stringify({
            type: 'hello',
            version: '0.3.0',
        }));

        rl.prompt();
    });

    ws.on('message', (data: Buffer) => {
        try {
            const msg = JSON.parse(data.toString());

            if (msg.type === 'agent.response') {
                const payload = msg.payload;

                if (payload?.type === 'text') {
                    readline.clearLine(process.stdout, 0);
                    readline.cursorTo(process.stdout, 0);
                    process.stdout.write(chalk.green('🦅 Talon > ') + payload.content);
                } else if (payload?.type === 'thinking') {
                    readline.clearLine(process.stdout, 0);
                    readline.cursorTo(process.stdout, 0);
                    process.stdout.write(chalk.dim(`  💭 ${payload.content}`));
                } else if (payload?.type === 'error') {
                    console.log(chalk.red('\n❌ Error: ') + payload.content);
                    isWaitingForResponse = false;
                    rl.prompt();
                }
            } else if (msg.type === 'agent.response.end') {
                console.log('\n');
                isWaitingForResponse = false;
                rl.prompt();
            } else if (msg.type === 'tool.call') {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                console.log(chalk.dim(`  🛠️  Using ${msg.payload?.tool || msg.payload?.name}...`));
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

    rl.on('line', (line: string) => {
        const input = line.trim();

        if (!input) {
            rl.prompt();
            return;
        }

        // Handle slash commands
        if (input.startsWith('/')) {
            handleSlashCommand(input, rl, ws);
            return;
        }

        // Handle bash commands
        if (input.startsWith('!')) {
            const command = input.slice(1);
            console.log(chalk.dim(`$ ${command}`));
            ws.send(JSON.stringify({
                type: 'channel.message',
                payload: {
                    channel: 'tui',
                    senderId: 'tui-user',
                    senderName: 'TUI User',
                    text: `Execute this shell command: ${command}`,
                    media: null,
                    isGroup: false,
                    groupId: null,
                },
            }));
            isWaitingForResponse = true;
            return;
        }

        // Send regular message
        ws.send(JSON.stringify({
            type: 'channel.message',
            payload: {
                channel: 'tui',
                senderId: 'tui-user',
                senderName: 'TUI User',
                text: input,
                media: null,
                isGroup: false,
                groupId: null,
            },
        }));
        isWaitingForResponse = true;
    });

    rl.on('close', () => {
        ws.close();
        console.log(chalk.dim('\nGoodbye! 🦅\n'));
        process.exit(0);
    });

    // Handle Ctrl+C
    process.on('SIGINT', () => {
        ws.close();
        rl.close();
    });
}

function handleSlashCommand(input: string, rl: readline.Interface, ws: WebSocket): void {
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

        case 'provider':
            changeProvider().then(() => rl.prompt());
            break;

        case 'switch':
            switchModel().then(() => rl.prompt());
            break;

        case 'status':
        case 'reset':
        case 'new':
        case 'compact':
        case 'tokens':
        case 'memory':
        case 'debug':
            // Send to agent
            ws.send(JSON.stringify({
                type: 'channel.message',
                payload: {
                    channel: 'tui',
                    senderId: 'tui-user',
                    senderName: 'TUI User',
                    text: input,
                    media: null,
                    isGroup: false,
                    groupId: null,
                },
            }));
            break;

        default:
            console.log(chalk.yellow(`Unknown command: /${cmd}`));
            console.log(chalk.dim('Type /help for available commands\n'));
            rl.prompt();
    }
}

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
    
    console.log(chalk.bold('System'));
    console.log('  /model      Show current model');
    console.log('  /provider   Change AI provider');
    console.log('  /switch     Switch model');
    console.log('  /exit       Exit Talon');
    console.log('  /quit       Alias for /exit');
    console.log('  /config     View current Talon configuration');
    console.log('  /memory     View recent memory entries');
    console.log('  /version    Show Talon version and info');
    console.log('  /debug      Toggle debug logging');
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
    const { select, password, confirm } = await import('@inquirer/prompts');
    const { PROVIDERS } = await import('./providers.js');
    const { execSync } = await import('node:child_process');
    
    try {
        const configPath = path.join(os.homedir(), '.talon', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        
        const providerId = await select({
            message: 'Choose provider:',
            choices: PROVIDERS.filter(p => p.id !== 'anthropic' && p.id !== 'custom').map(p => ({
                name: p.name,
                value: p.id,
            })),
        });
        
        const provider = PROVIDERS.find(p => p.id === providerId)!;
        const apiKey = await password({ message: `Enter ${provider.name} API key:` });
        
        // Update config
        config.agent.providers[providerId] = {
            apiKey,
            baseUrl: provider.baseUrl,
            models: provider.models.map(m => m.id),
        };
        
        // Ask if they want to switch to this provider
        const switchNow = await confirm({
            message: 'Switch to this provider now?',
            default: true,
        });
        
        if (switchNow) {
            const defaultModel = provider.models[0].id;
            config.agent.model = providerId === 'deepseek' ? defaultModel : `${providerId}/${defaultModel}`;
        }
        
        // Update env
        const envPath = path.join(os.homedir(), '.talon', '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
        const envVar = provider.envVar;
        const regex = new RegExp(`^${envVar}=.*$`, 'm');
        
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${envVar}=${apiKey}`);
        } else {
            envContent += `\n${envVar}=${apiKey}\n`;
        }
        
        fs.writeFileSync(envPath, envContent, 'utf-8');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        
        console.log(chalk.green(`\n✓ Provider ${provider.name} configured`));
        if (switchNow) {
            console.log(chalk.green(`✓ Switched to ${config.agent.model}`));
        }
        
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
                console.log(chalk.green('  ✓ Gateway restarted\n'));
                console.log(chalk.yellow('  Reconnect with: /exit then talon tui\n'));
            } catch (err) {
                console.log(chalk.red('  ✗ Failed to restart gateway'));
                console.log(chalk.yellow('  Run manually: talon service restart\n'));
            }
        } else {
            console.log(chalk.yellow('  Remember to restart: talon service restart\n'));
        }
    } catch (err: any) {
        if (err.name !== 'ExitPromptError') {
            console.log(chalk.red('\n✗ Failed to change provider\n'));
        }
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
            return;
        }
        
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
                console.log(chalk.green('  ✓ Gateway restarted\n'));
                console.log(chalk.yellow('  Reconnect with: /exit then talon tui\n'));
            } catch (err) {
                console.log(chalk.red('  ✗ Failed to restart gateway'));
                console.log(chalk.yellow('  Run manually: talon service restart\n'));
            }
        } else {
            console.log(chalk.yellow('  Remember to restart: talon service restart\n'));
        }
    } catch (err: any) {
        if (err.name !== 'ExitPromptError') {
            console.log(chalk.red('\n✗ Failed to switch model\n'));
        }
    }
}
