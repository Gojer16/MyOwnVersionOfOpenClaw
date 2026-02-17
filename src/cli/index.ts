#!/usr/bin/env node

// ─── Talon CLI ────────────────────────────────────────────────────
// Entry point for `talon setup`, `talon start`, `talon health`, `talon status`

import fs from 'node:fs';
import { runWizard } from './wizard.js';

const command = process.argv[2];
const flags = process.argv.slice(3);

async function main(): Promise<void> {
    switch (command) {
        case 'setup':
        case 'onboard':
        case 'init': {
            await runWizard();
            break;
        }

        case 'start': {
            const isDaemon = flags.includes('--daemon') || flags.includes('-d');
            
            if (isDaemon) {
                // Suppress logs in daemon mode
                process.env.LOG_LEVEL = 'silent';
                // Disable CLI channel
                process.env.TALON_CLI_ENABLED = 'false';
            }
            
            // Import and boot the gateway (it runs boot() automatically)
            await import('../gateway/index.js');
            
            if (isDaemon) {
                console.log('🦅 Talon started in daemon mode');
                console.log('   Gateway: http://127.0.0.1:19789');
                console.log('   Use `talon health` to check status');
            }
            
            // Keep process alive - gateway handles its own lifecycle
            await new Promise(() => {});
            break;
        }

        case 'health': {
            try {
                const res = await fetch('http://127.0.0.1:19789/api/health', {
                    signal: AbortSignal.timeout(5000),
                });
                const data = await res.json();
                console.log('🦅 Talon Health Check');
                console.log('─────────────────────');
                console.log(`  Status:     ${data.status === 'ok' ? '✅ OK' : '❌ Error'}`);
                console.log(`  Version:    ${data.version}`);
                console.log(`  Uptime:     ${Math.round(data.uptime)}s`);
                console.log(`  Sessions:   ${data.sessions}`);
                console.log(`  WS Clients: ${data.wsClients}`);
            } catch {
                console.log('❌ Talon is not running.');
                console.log('   Run `talon start` to start the gateway.');
            }
            break;
        }

        case 'status': {
            try {
                const [health, sessions] = await Promise.all([
                    fetch('http://127.0.0.1:19789/api/health', { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
                    fetch('http://127.0.0.1:19789/api/sessions', { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
                ]);

                console.log('🦅 Talon Status');
                console.log('─────────────────────');
                console.log(`  Gateway:  ${health.status === 'ok' ? '✅ Running' : '❌ Error'}`);
                console.log(`  Uptime:   ${Math.round(health.uptime)}s`);
                console.log(`  Sessions: ${sessions.length}`);

                if (sessions.length > 0) {
                    console.log('');
                    console.log('  Active Sessions:');
                    for (const s of sessions as Array<{ id: string; channel: string; state: string; messageCount: number }>) {
                        console.log(`    • ${s.id} [${s.channel}] ${s.state} (${s.messageCount} msgs)`);
                    }
                }
            } catch {
                console.log('❌ Talon is not running.');
            }
            break;
        }

        case '--help':
        case '-h':
        case undefined: {
            console.log(`
🦅 Talon — Personal AI Assistant

Usage: talon <command>

Commands:
  setup     Run the onboarding wizard
  start     Start the gateway server (add --daemon to run in background)
  stop      Stop a running daemon
  restart   Restart the daemon
  health    Check if the gateway is running
  status    Show detailed status and sessions

Examples:
  talon setup          # First-time setup
  talon start         # Start with interactive CLI
  talon start --daemon # Start as background service
  talon health         # Quick health check
  talon status        # Detailed status
      `);
            break;
        }

        case 'stop': {
            // Stop daemon via PID file
            const { isDaemonRunning, getDaemonConfig, removePidFile } = await import('../scripts/daemon.js');
            const config = getDaemonConfig();
            
            if (!isDaemonRunning(config)) {
                console.log('Talon is not running as daemon');
                break;
            }
            
            try {
                const pid = parseInt(fs.readFileSync(config.pidFile, 'utf-8').trim(), 10);
                process.kill(pid, 'SIGTERM');
                console.log('Talon stopping...');
                setTimeout(() => {
                    removePidFile(config);
                    console.log('Talon stopped');
                }, 2000);
            } catch {
                console.log('Failed to stop Talon');
            }
            break;
        }

        case 'restart': {
            // Restart: stop then start
            const { isDaemonRunning, getDaemonConfig, removePidFile, startDaemon } = await import('../scripts/daemon.js');
            const config = getDaemonConfig();
            
            if (isDaemonRunning(config)) {
                try {
                    const pid = parseInt(fs.readFileSync(config.pidFile, 'utf-8').trim(), 10);
                    process.kill(pid, 'SIGTERM');
                    await new Promise(r => setTimeout(r, 2000));
                } catch {
                    // Ignore errors
                }
            }
            
            console.log('Starting Talon...');
            process.argv = ['node', 'talon', 'start', '--daemon'];
            await import('../gateway/index.js');
            console.log('Talon restarted');
            break;
        }

        default: {
            console.error(`Unknown command: ${command}`);
            console.error('Run `talon --help` for available commands.');
            process.exit(1);
        }
    }
}

main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
