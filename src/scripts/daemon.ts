// ─── Daemon Support ───────────────────────────────────────────────
// Background running support for Talon (launchd/systemd compatible)

import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../utils/logger.js';

export type DaemonPlatform = 'darwin' | 'linux' | 'win32';

interface DaemonConfig {
    name: string;
    description: string;
    workingDirectory: string;
    logFile: string;
    pidFile: string;
}

/**
 * Get platform-specific daemon configuration.
 */
export function getDaemonConfig(name: string = 'talon'): DaemonConfig {
    const platform = process.platform as DaemonPlatform;
    const home = os.homedir();
    
    const config: DaemonConfig = {
        name,
        description: 'Talon Personal AI Assistant',
        workingDirectory: process.cwd(),
        logFile: '',
        pidFile: '',
    };

    if (platform === 'darwin') {
        config.logFile = path.join(home, 'Library', 'Logs', `${name}.log`);
        config.pidFile = path.join(home, 'Library', 'Application Support', `${name}`, 'talon.pid');
    } else if (platform === 'linux') {
        config.logFile = path.join(home, '.local', 'share', name, 'logs', `${name}.log`);
        config.pidFile = path.join(home, '.local', 'share', name, `${name}.pid`);
    } else {
        config.logFile = path.join(home, `${name}.log`);
        config.pidFile = path.join(home, `${name}.pid`);
    }

    return config;
}

/**
 * Check if daemon is currently running.
 */
export function isDaemonRunning(config: DaemonConfig): boolean {
    try {
        if (!fs.existsSync(config.pidFile)) {
            return false;
        }
        const pid = parseInt(fs.readFileSync(config.pidFile, 'utf-8').trim(), 10);
        
        // Check if process exists
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            // Process doesn't exist, stale pid file
            fs.unlinkSync(config.pidFile);
            return false;
        }
    } catch {
        return false;
    }
}

/**
 * Write PID file.
 */
export function writePidFile(config: DaemonConfig): void {
    const dir = path.dirname(config.pidFile);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(config.pidFile, String(process.pid), 'utf-8');
}

/**
 * Remove PID file.
 */
export function removePidFile(config: DaemonConfig): void {
    try {
        if (fs.existsSync(config.pidFile)) {
            fs.unlinkSync(config.pidFile);
        }
    } catch {
        // Ignore errors
    }
}

/**
 * Start Talon as a daemon (background process).
 */
export function startDaemon(): void {
    const config = getDaemonConfig();
    
    if (isDaemonRunning(config)) {
        logger.error('Talon is already running');
        console.log('Talon is already running. Use `talon stop` to stop it first.');
        process.exit(1);
    }

    // Ensure log directory exists
    const logDir = path.dirname(config.logFile);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // Spawn child process
    const child = spawn(process.argv[0], process.argv.slice(1), {
        detached: true,
        stdio: ['ignore', fs.openSync(config.logFile, 'a'), fs.openSync(config.logFile, 'a')],
        cwd: config.workingDirectory,
        env: { ...process.env, TALON_DAEMON: 'true' },
    });

    // Write PID
    fs.writeFileSync(config.pidFile, String(child.pid), 'utf-8');

    // Unref child so parent can exit
    child.unref();

    console.log(`Talon started as daemon (PID: ${child.pid})`);
    console.log(`Logs: ${config.logFile}`);
}

/**
 * Stop the daemon.
 */
export function stopDaemon(): void {
    const config = getDaemonConfig();
    
    if (!isDaemonRunning(config)) {
        console.log('Talon is not running');
        return;
    }

    try {
        const pid = parseInt(fs.readFileSync(config.pidFile, 'utf-8').trim(), 10);
        process.kill(pid, 'SIGTERM');
        
        // Wait for process to exit
        setTimeout(() => {
            removePidFile(config);
            console.log('Talon stopped');
        }, 2000);
    } catch (err) {
        logger.error({ err }, 'Failed to stop daemon');
        console.log('Failed to stop Talon');
    }
}

/**
 * Get daemon status.
 */
export function daemonStatus(): void {
    const config = getDaemonConfig();
    const running = isDaemonRunning(config);
    
    if (running) {
        const pid = fs.readFileSync(config.pidFile, 'utf-8').trim();
        console.log(`Talon is running (PID: ${pid})`);
        console.log(`Log file: ${config.logFile}`);
    } else {
        console.log('Talon is not running');
    }
}

/**
 * Generate launchd plist for macOS.
 */
export function generateLaunchdPlist(executablePath: string): string {
    const config = getDaemonConfig();
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.talon.gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>${executablePath}</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${config.logFile}</string>
    <key>StandardErrorPath</key>
    <string>${config.logFile}</string>
    <key>WorkingDirectory</key>
    <string>${config.workingDirectory}</string>
    <key>UserName</key>
    <string>${os.userInfo().username}</string>
</dict>
</plist>`;
}

/**
 * Generate systemd service file for Linux.
 */
export function generateSystemdService(executablePath: string): string {
    const config = getDaemonConfig();
    
    return `[Unit]
Description=Talon Personal AI Assistant
After=network.target

[Service]
Type=simple
User=${os.userInfo().username}
WorkingDirectory=${config.workingDirectory}
ExecStart=${executablePath} start
Restart=always
RestartSec=10

StandardOutput=append:${config.logFile}
StandardError=append:${config.logFile}

[Install]
WantedBy=multi-user.target`;
}
