// ─── TUI Client ───────────────────────────────────────────────────
// Connect to running gateway and provide interactive chat interface

import WebSocket from 'ws';
import readline from 'node:readline';
import chalk from 'chalk';

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

            // Debug: log all messages
            console.log(chalk.dim(`\n[DEBUG] Received: ${msg.type}`));

            if (msg.type === 'agent.response') {
                // Clear the prompt line
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                if (msg.payload?.type === 'text') {
                    process.stdout.write(chalk.green('🦅 Talon > ') + msg.payload.text);
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

        case 'status':
            ws.send(JSON.stringify({
                type: 'channel.message',
                payload: {
                    channel: 'tui',
                    senderId: 'tui-user',
                    senderName: 'TUI User',
                    text: 'Show my current session status',
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
    console.log(chalk.bold.cyan('\n🦅 Talon TUI Commands\n'));
    console.log(chalk.dim('System:'));
    console.log('  /help        Show this help');
    console.log('  /clear       Clear screen');
    console.log('  /status      Show session status');
    console.log('  /exit        Exit TUI');
    console.log('');
    console.log(chalk.dim('Usage:'));
    console.log('  Type your message and press Enter');
    console.log('  Use ! prefix for shell commands (e.g., !ls -la)');
    console.log('');
}
