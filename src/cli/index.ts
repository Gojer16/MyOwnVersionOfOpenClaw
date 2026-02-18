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
            
            // Check for running gateway
            try {
                const { execSync } = await import('child_process');
                const lsofOutput = execSync('lsof -ti :19789 2>/dev/null || true', { encoding: 'utf-8' }).trim();
                
                if (lsofOutput) {
                    const pids = lsofOutput.split('\n').filter(Boolean);
                    
                    // Verify these are actually Talon processes
                    const talonPids: string[] = [];
                    for (const pid of pids) {
                        try {
                            const cmdline = execSync(`ps -p ${pid} -o command= 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
                            if (cmdline.toLowerCase().includes('talon') || cmdline.toLowerCase().includes('gateway')) {
                                talonPids.push(pid);
                            }
                        } catch {
                            // Ignore
                        }
                    }
                    
                    if (talonPids.length > 0) {
                        console.log(`⚠️  Talon gateway already running (PID: ${talonPids.join(', ')})`);
                        console.log('   Run `talon stop` first, or use `talon restart`');
                        process.exit(1);
                    }
                }
            } catch {
                // Ignore - no gateway running
            }
            
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
  setup     Run the onboarding wizard (auto-detects running gateways)
  tui       Connect to running gateway (interactive chat)
  provider  Add/change AI provider
  switch    Switch between configured models
  start     Start the gateway server (prevents duplicates)
  stop      Stop any running gateway (safe process detection)
  restart   Restart the daemon
  health    Check if the gateway is running
  status    Show detailed status and sessions
  service   Manage system service (install/uninstall/start/stop/restart/status)

Examples:
  talon setup           # First-time setup (stops old gateways)
  talon tui             # Interactive chat (connect to gateway)
  talon provider        # Add/change AI provider
  talon switch          # Switch model
  talon start           # Start gateway (checks for duplicates)
  talon stop            # Stop all Talon gateways safely
  talon start --daemon  # Start as background service
  talon service install # Install as system service
  talon health          # Quick health check
  talon status          # Detailed status
      `);
            break;
        }

        case 'stop': {
            // Stop daemon via PID file or any running gateway
            const { isDaemonRunning, getDaemonConfig, removePidFile } = await import('../scripts/daemon.js');
            const config = getDaemonConfig();
            
            let stopped = false;
            
            // Try daemon first
            if (isDaemonRunning(config)) {
                try {
                    const pid = parseInt(fs.readFileSync(config.pidFile, 'utf-8').trim(), 10);
                    process.kill(pid, 'SIGTERM');
                    console.log('✓ Talon daemon stopping...');
                    setTimeout(() => {
                        removePidFile(config);
                        console.log('✓ Talon daemon stopped');
                    }, 2000);
                    stopped = true;
                } catch {
                    console.log('✗ Failed to stop daemon');
                }
            }
            
            // Try to kill any running gateway process by port
            try {
                const { execSync } = await import('child_process');
                // Find process listening on port 19789
                const lsofOutput = execSync('lsof -ti :19789 2>/dev/null || true', { encoding: 'utf-8' }).trim();
                if (lsofOutput) {
                    const pids = lsofOutput.split('\n').filter(Boolean);
                    
                    // Verify these are Talon processes before killing
                    for (const pid of pids) {
                        try {
                            const cmdline = execSync(`ps -p ${pid} -o command= 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
                            // Only kill if it's a Talon process
                            if (cmdline.toLowerCase().includes('talon') || cmdline.toLowerCase().includes('gateway')) {
                                process.kill(parseInt(pid, 10), 'SIGTERM');
                                if (!stopped) {
                                    console.log('✓ Stopped running gateway');
                                    stopped = true;
                                }
                            }
                        } catch {
                            // Ignore
                        }
                    }
                }
            } catch {
                // Ignore - no process found
            }
            
            if (!stopped) {
                console.log('ℹ Talon is not running');
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

        case 'service': {
            const { installService, uninstallService, restartService, serviceStatus, stopService, startService } = await import('./service.js');
            const subcommand = flags[0];
            
            switch (subcommand) {
                case 'install':
                    await installService();
                    break;
                case 'uninstall':
                    await uninstallService();
                    break;
                case 'restart':
                    await restartService();
                    break;
                case 'stop':
                    await stopService();
                    break;
                case 'start':
                    await startService();
                    break;
                case 'status':
                    await serviceStatus();
                    break;
                default:
                    console.error('Usage: talon service <install|uninstall|start|stop|restart|status>');
                    process.exit(1);
            }
            break;
        }

        case 'tui': {
            const { startTUI } = await import('./tui.js');
            await startTUI();
            break;
        }

        case 'provider': {
            const { addProvider } = await import('./provider.js');
            await addProvider();
            break;
        }

        case 'switch': {
            const { switchModel } = await import('./provider.js');
            await switchModel();
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
