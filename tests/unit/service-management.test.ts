// ─── Service Management Tests ────────────────────────────────────────────
// Tests for service generation (LaunchAgent / systemd)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
    getDaemonConfig,
    generateLaunchdPlist,
    generateSystemdService,
    isDaemonRunning,
    writePidFile,
    removePidFile,
} from '@/scripts/daemon.js';

describe('Daemon / Service Management', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talon-daemon-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('getDaemonConfig', () => {
        it('should return config with correct paths for darwin', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'darwin' });
            
            const config = getDaemonConfig('test-talon');
            
            expect(config.name).toBe('test-talon');
            expect(config.description).toBe('Talon Personal AI Assistant');
            expect(config.logFile).toContain('Library/Logs');
            expect(config.pidFile).toContain('Application Support');
            
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('should return config with correct paths for linux', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux' });
            
            const config = getDaemonConfig('test-talon');
            
            expect(config.logFile).toContain('.local/share');
            expect(config.pidFile).toContain('.local/share');
            
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });
    });

    describe('generateLaunchdPlist', () => {
        it('should generate valid plist for macOS', () => {
            const plist = generateLaunchdPlist('/usr/bin/node', ['/app/index.js']);
            
            expect(plist).toContain('<?xml');
            expect(plist).toContain('ai.talon.gateway');
            expect(plist).toContain('ProgramArguments');
            expect(plist).toContain('/usr/bin/node');
            expect(plist).toContain('/app/index.js');
            expect(plist).toContain('RunAtLoad');
            expect(plist).toContain('KeepAlive');
        });

        it('should include log paths', () => {
            const plist = generateLaunchdPlist('node', ['index.js']);
            
            expect(plist).toContain('StandardOutPath');
            expect(plist).toContain('StandardErrorPath');
        });

        it('should include working directory', () => {
            const plist = generateLaunchdPlist('node', ['index.js']);
            
            expect(plist).toContain('WorkingDirectory');
        });

        it('should include user name', () => {
            const plist = generateLaunchdPlist('node', ['index.js']);
            
            expect(plist).toContain('UserName');
        });
    });

    describe('generateSystemdService', () => {
        it('should generate valid systemd service file', () => {
            const service = generateSystemdService('/usr/bin/node', ['/app/index.js']);
            
            expect(service).toContain('[Unit]');
            expect(service).toContain('Description=Talon Personal AI Assistant');
            expect(service).toContain('[Service]');
            expect(service).toContain('Type=simple');
            expect(service).toContain('Restart=always');
            expect(service).toContain('RestartSec=10');
            expect(service).toContain('[Install]');
        });

        it('should include correct ExecStart', () => {
            const service = generateSystemdService('/usr/bin/node', ['/app/index.js', 'start']);
            
            expect(service).toContain('ExecStart=');
            expect(service).toContain('/usr/bin/node /app/index.js start');
        });

        it('should include working directory', () => {
            const service = generateSystemdService('node', ['index.js']);
            
            expect(service).toContain('WorkingDirectory=');
        });

        it('should include log paths', () => {
            const service = generateSystemdService('node', ['index.js']);
            
            expect(service).toContain('StandardOutput=append:');
            expect(service).toContain('StandardError=append:');
        });
    });

    describe('PID File Management', () => {
        it('should write PID file', () => {
            const config = {
                name: 'test',
                description: 'Test',
                workingDirectory: tempDir,
                logFile: path.join(tempDir, 'test.log'),
                pidFile: path.join(tempDir, 'test.pid'),
            };
            
            writePidFile(config);
            
            expect(fs.existsSync(config.pidFile)).toBe(true);
            expect(fs.readFileSync(config.pidFile, 'utf-8')).toBe(String(process.pid));
        });

        it('should remove PID file', () => {
            const config = {
                name: 'test',
                description: 'Test',
                workingDirectory: tempDir,
                logFile: path.join(tempDir, 'test.log'),
                pidFile: path.join(tempDir, 'test.pid'),
            };
            
            writePidFile(config);
            expect(fs.existsSync(config.pidFile)).toBe(true);
            
            removePidFile(config);
            expect(fs.existsSync(config.pidFile)).toBe(false);
        });

        it('should handle missing PID file gracefully', () => {
            const config = {
                name: 'test',
                description: 'Test',
                workingDirectory: tempDir,
                logFile: path.join(tempDir, 'test.log'),
                pidFile: path.join(tempDir, 'non-existent.pid'),
            };
            
            expect(() => removePidFile(config)).not.toThrow();
        });
    });

    describe('isDaemonRunning', () => {
        it('should return false when no PID file', () => {
            const config = {
                name: 'test',
                description: 'Test',
                workingDirectory: tempDir,
                logFile: path.join(tempDir, 'test.log'),
                pidFile: path.join(tempDir, 'non-existent.pid'),
            };
            
            expect(isDaemonRunning(config)).toBe(false);
        });

        it('should return false when PID file contains invalid PID', () => {
            const config = {
                name: 'test',
                description: 'Test',
                workingDirectory: tempDir,
                logFile: path.join(tempDir, 'test.log'),
                pidFile: path.join(tempDir, 'test.pid'),
            };
            
            fs.writeFileSync(config.pidFile, '999999999', 'utf-8');
            
            expect(isDaemonRunning(config)).toBe(false);
        });
    });
});
