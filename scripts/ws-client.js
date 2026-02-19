#!/usr/bin/env node

/**
 * Talon WebSocket Test Client
 * Simple CLI for testing gateway WebSocket protocol
 */

import WebSocket from 'ws';
import readline from 'readline';

const WS_URL = 'ws://127.0.0.1:19789/ws';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'talon-ws> '
});

let ws = null;

// Predefined commands
const commands = {
    status: () => ({ type: 'gateway.status' }),
    tools: () => ({ type: 'tools.list' }),
    echo: (text) => ({ type: 'tools.invoke', toolName: 'shell_execute', args: { command: `echo '${text}'` } }),
    ls: () => ({ type: 'tools.invoke', toolName: 'shell_execute', args: { command: 'ls -la' } }),
    pwd: () => ({ type: 'tools.invoke', toolName: 'shell_execute', args: { command: 'pwd' } }),
    screenshot: () => ({ type: 'tools.invoke', toolName: 'desktop_screenshot', args: {} }),
    'test-safety': () => ({ type: 'tools.invoke', toolName: 'shell_execute', args: { command: 'rm -rf /' } }),
};

function connect() {
    console.log(`Connecting to ${WS_URL}...`);
    
    ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
        console.log('✓ Connected to Talon Gateway\n');
        console.log('Quick commands:');
        console.log('  status          - Get gateway status');
        console.log('  tools           - List available tools');
        console.log('  echo <text>     - Echo text via shell');
        console.log('  ls              - List files');
        console.log('  pwd             - Print working directory');
        console.log('  screenshot      - Take screenshot');
        console.log('  test-safety     - Test dangerous command blocking');
        console.log('  raw <json>      - Send raw JSON');
        console.log('  quit            - Exit\n');
        rl.prompt();
    });
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            console.log('\n← Response:');
            console.log(JSON.stringify(msg, null, 2));
            console.log('');
            rl.prompt();
        } catch (err) {
            console.log('\n← Raw:', data.toString());
            rl.prompt();
        }
    });
    
    ws.on('error', (err) => {
        console.error('✗ WebSocket error:', err.message);
        process.exit(1);
    });
    
    ws.on('close', () => {
        console.log('\n✗ Connection closed');
        process.exit(0);
    });
}

rl.on('line', (line) => {
    const input = line.trim();
    
    if (!input) {
        rl.prompt();
        return;
    }
    
    if (input === 'quit' || input === 'exit') {
        ws.close();
        return;
    }
    
    let message;
    
    if (input.startsWith('raw ')) {
        try {
            message = JSON.parse(input.slice(4));
        } catch (err) {
            console.log('✗ Invalid JSON');
            rl.prompt();
            return;
        }
    } else if (input.startsWith('echo ')) {
        message = commands.echo(input.slice(5));
    } else if (commands[input]) {
        message = commands[input]();
    } else {
        console.log('✗ Unknown command. Type "status", "tools", "echo <text>", "ls", "pwd", "screenshot", "test-safety", or "raw <json>"');
        rl.prompt();
        return;
    }
    
    console.log('→ Sending:', JSON.stringify(message));
    ws.send(JSON.stringify(message));
});

rl.on('close', () => {
    if (ws) ws.close();
    process.exit(0);
});

connect();
