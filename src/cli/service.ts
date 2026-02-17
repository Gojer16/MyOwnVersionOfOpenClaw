// ─── Service Management Commands ──────────────────────────────────
// Install, uninstall, restart, and check status of Talon as a system service

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { getDaemonConfig, generateLaunchdPlist, generateSystemdService } from '../scripts/daemon.js';

const SERVICE_LABEL = 'ai.talon.gateway';

/**
 * Get the path to the talon executable
 */
function getTalonExecutable(): string {
    // In production, this would be the installed binary
    // For now, use node + the built CLI
    const cliPath = path.join(process.cwd(), 'dist', 'cli', 'index.js');
    return `${process.execPath} ${cliPath}`;
}

/**
 * Get platform-specific service paths
 */
function getServicePaths() {
    const home = os.homedir();
    
    if (process.platform === 'darwin') {
        return {
            dir: path.join(home, 'Library', 'LaunchAgents'),
            file: path.join(home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`),
        };
    } else if (process.platform === 'linux') {
        return {
            dir: path.join(home, '.config', 'systemd', 'user'),
            file: path.join(home, '.config', 'systemd', 'user', 'talon.service'),
        };
    }
    
    throw new Error('Unsupported platform. Service management only works on macOS and Linux.');
}

/**
 * Check if service is installed
 */
export function isServiceInstalled(): boolean {
    try {
        const { file } = getServicePaths();
        return fs.existsSync(file);
    } catch {
        return false;
    }
}

/**
 * Check if service is running
 */
export function isServiceRunning(): boolean {
    try {
        if (process.platform === 'darwin') {
            const result = execSync(`launchctl list | grep ${SERVICE_LABEL}`, { encoding: 'utf-8' });
            return result.trim().length > 0;
        } else if (process.platform === 'linux') {
            const result = execSync('systemctl --user is-active talon.service', { encoding: 'utf-8' });
            return result.trim() === 'active';
        }
    } catch {
        return false;
    }
    return false;
}

/**
 * Install Talon as a system service
 */
export async function installService(): Promise<void> {
    console.log(chalk.bold.cyan('\n🔧 Installing Talon as system service...\n'));
    
    if (isServiceInstalled()) {
        console.log(chalk.yellow('⚠  Service already installed'));
        console.log(chalk.dim('   Use `talon service uninstall` first if you want to reinstall\n'));
        return;
    }

    try {
        const { dir, file } = getServicePaths();
        const executable = getTalonExecutable();

        // Ensure directory exists
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Generate service file
        let content: string;
        if (process.platform === 'darwin') {
            content = generateLaunchdPlist(executable);
            fs.writeFileSync(file, content, 'utf-8');
            
            // Load the service
            console.log(chalk.dim('  Loading LaunchAgent...'));
            execSync(`launchctl load ${file}`, { stdio: 'inherit' });
            
        } else if (process.platform === 'linux') {
            content = generateSystemdService(executable);
            fs.writeFileSync(file, content, 'utf-8');
            
            // Reload systemd and enable service
            console.log(chalk.dim('  Reloading systemd...'));
            execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
            execSync('systemctl --user enable talon.service', { stdio: 'inherit' });
            execSync('systemctl --user start talon.service', { stdio: 'inherit' });
        }

        console.log(chalk.green('✓ Service installed successfully'));
        console.log(chalk.dim(`  Service file: ${file}`));
        console.log(chalk.dim('  Talon will now start automatically on login\n'));
        
    } catch (err) {
        console.log(chalk.red('✗ Failed to install service'));
        console.log(chalk.dim(`  Error: ${err instanceof Error ? err.message : String(err)}\n`));
        throw err;
    }
}

/**
 * Uninstall Talon service
 */
export async function uninstallService(): Promise<void> {
    console.log(chalk.bold.cyan('\n🔧 Uninstalling Talon service...\n'));
    
    if (!isServiceInstalled()) {
        console.log(chalk.yellow('⚠  Service not installed\n'));
        return;
    }

    try {
        const { file } = getServicePaths();

        // Stop and unload the service
        if (process.platform === 'darwin') {
            console.log(chalk.dim('  Unloading LaunchAgent...'));
            try {
                execSync(`launchctl unload ${file}`, { stdio: 'inherit' });
            } catch {
                // Ignore errors if already unloaded
            }
        } else if (process.platform === 'linux') {
            console.log(chalk.dim('  Stopping systemd service...'));
            try {
                execSync('systemctl --user stop talon.service', { stdio: 'inherit' });
                execSync('systemctl --user disable talon.service', { stdio: 'inherit' });
            } catch {
                // Ignore errors if already stopped
            }
        }

        // Remove service file
        fs.unlinkSync(file);

        console.log(chalk.green('✓ Service uninstalled successfully\n'));
        
    } catch (err) {
        console.log(chalk.red('✗ Failed to uninstall service'));
        console.log(chalk.dim(`  Error: ${err instanceof Error ? err.message : String(err)}\n`));
        throw err;
    }
}

/**
 * Restart Talon service
 */
export async function restartService(): Promise<void> {
    console.log(chalk.bold.cyan('\n🔄 Restarting Talon service...\n'));
    
    if (!isServiceInstalled()) {
        console.log(chalk.yellow('⚠  Service not installed'));
        console.log(chalk.dim('   Run `talon service install` first\n'));
        return;
    }

    try {
        if (process.platform === 'darwin') {
            const { file } = getServicePaths();
            console.log(chalk.dim('  Restarting LaunchAgent...'));
            execSync(`launchctl unload ${file} && launchctl load ${file}`, { stdio: 'inherit' });
        } else if (process.platform === 'linux') {
            console.log(chalk.dim('  Restarting systemd service...'));
            execSync('systemctl --user restart talon.service', { stdio: 'inherit' });
        }

        console.log(chalk.green('✓ Service restarted successfully\n'));
        
    } catch (err) {
        console.log(chalk.red('✗ Failed to restart service'));
        console.log(chalk.dim(`  Error: ${err instanceof Error ? err.message : String(err)}\n`));
        throw err;
    }
}

/**
 * Show service status
 */
export async function serviceStatus(): Promise<void> {
    console.log(chalk.bold.cyan('\n📊 Talon Service Status\n'));
    
    const installed = isServiceInstalled();
    const running = isServiceRunning();
    
    console.log(`  Installed: ${installed ? chalk.green('✓ Yes') : chalk.red('✗ No')}`);
    console.log(`  Running:   ${running ? chalk.green('✓ Yes') : chalk.red('✗ No')}`);
    
    if (installed) {
        const { file } = getServicePaths();
        console.log(chalk.dim(`  Service file: ${file}`));
    }
    
    console.log('');
    
    if (!installed) {
        console.log(chalk.dim('  Run `talon service install` to install the service'));
    } else if (!running) {
        console.log(chalk.dim('  Run `talon service restart` to start the service'));
    }
    
    console.log('');
}
