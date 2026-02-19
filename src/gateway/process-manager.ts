// ─── Gateway Process Manager ──────────────────────────────────────
// Robust daemon lifecycle management with PID files, health checks, and port detection

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const TALON_HOME = path.join(os.homedir(), '.talon');
const RUN_DIR = path.join(TALON_HOME, 'run');
const PID_FILE = path.join(RUN_DIR, 'gateway.pid');
const STATE_FILE = path.join(RUN_DIR, 'gateway.json');
const GATEWAY_PORT = 19789;
const HEALTH_URL = `http://127.0.0.1:${GATEWAY_PORT}/api/health`;

interface GatewayState {
    pid: number;
    port: number;
    wsPath: string;
    startedAt: number;
    version: string;
    configPath: string;
    binaryPath: string;
    platform: string;
}

// ─── Utilities ────────────────────────────────────────────────────

function ensureRunDir(): void {
    if (!fs.existsSync(RUN_DIR)) {
        fs.mkdirSync(RUN_DIR, { recursive: true });
    }
}

function readPidFile(): number | null {
    try {
        if (!fs.existsSync(PID_FILE)) return null;
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
        return isNaN(pid) ? null : pid;
    } catch {
        return null;
    }
}

function readStateFile(): GatewayState | null {
    try {
        if (!fs.existsSync(STATE_FILE)) return null;
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {
        return null;
    }
}

function writeStateFile(state: GatewayState): void {
    ensureRunDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    fs.writeFileSync(PID_FILE, String(state.pid), 'utf-8');
}

function deleteStateFiles(): void {
    try {
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    } catch {
        // Ignore
    }
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function isTalonProcess(pid: number): boolean {
    try {
        const cmdline = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf-8' }).trim();
        return cmdline.includes('talon') || cmdline.includes('gateway') || cmdline.includes('node');
    } catch {
        return false;
    }
}

async function checkHealth(): Promise<{ ok: boolean; version?: string; uptime?: number }> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        
        const res = await fetch(HEALTH_URL, { signal: controller.signal });
        clearTimeout(timeout);
        
        if (res.ok) {
            const data = await res.json();
            return { ok: true, version: data.version, uptime: data.uptime };
        }
        return { ok: false };
    } catch {
        return { ok: false };
    }
}

function getPortOwner(): number | null {
    try {
        const output = execSync(`lsof -ti :${GATEWAY_PORT}`, { encoding: 'utf-8' }).trim();
        if (!output) return null;
        const pids = output.split('\n').filter(Boolean);
        return pids.length > 0 ? parseInt(pids[0], 10) : null;
    } catch {
        return null;
    }
}

// ─── Public API ───────────────────────────────────────────────────

export async function isGatewayRunning(): Promise<{ running: boolean; pid?: number; version?: string; uptime?: number; stale?: boolean }> {
    // 1. Check PID file
    const pid = readPidFile();
    const state = readStateFile();
    
    // 2. Check health endpoint (most reliable)
    const health = await checkHealth();
    if (health.ok) {
        // Gateway is definitely running
        if (pid && isProcessAlive(pid)) {
            return { running: true, pid, version: health.version, uptime: health.uptime };
        } else {
            // Health OK but PID file is stale/missing
            const portOwner = getPortOwner();
            return { running: true, pid: portOwner || undefined, version: health.version, uptime: health.uptime, stale: true };
        }
    }
    
    // 3. Health check failed - check if process exists
    if (pid && isProcessAlive(pid) && isTalonProcess(pid)) {
        // Process exists but health check failed (starting up or broken)
        return { running: true, pid, stale: false };
    }
    
    // 4. Check port directly
    const portOwner = getPortOwner();
    if (portOwner) {
        // Something is on the port
        if (isTalonProcess(portOwner)) {
            return { running: true, pid: portOwner, stale: true };
        } else {
            // Port occupied by non-Talon process
            return { running: false };
        }
    }
    
    // 5. Clean up stale files
    if (pid || state) {
        deleteStateFiles();
    }
    
    return { running: false };
}

export function registerGateway(version: string): void {
    const state: GatewayState = {
        pid: process.pid,
        port: GATEWAY_PORT,
        wsPath: '/ws',
        startedAt: Date.now(),
        version,
        configPath: path.join(TALON_HOME, 'config.json'),
        binaryPath: process.argv[1],
        platform: process.platform,
    };
    writeStateFile(state);
}

export function unregisterGateway(): void {
    deleteStateFiles();
}

export async function stopGateway(force: boolean = false): Promise<{ success: boolean; message: string }> {
    const status = await isGatewayRunning();
    
    if (!status.running) {
        deleteStateFiles(); // Clean up any stale files
        return { success: true, message: 'Gateway is not running' };
    }
    
    if (!status.pid) {
        return { success: false, message: 'Cannot determine gateway PID' };
    }
    
    const pid = status.pid;
    
    try {
        // 1. Send SIGTERM (graceful)
        process.kill(pid, 'SIGTERM');
        
        // 2. Wait for shutdown (up to 10 seconds)
        const maxWait = force ? 2000 : 10000;
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Check if process is gone
            if (!isProcessAlive(pid)) {
                deleteStateFiles();
                return { success: true, message: 'Gateway stopped gracefully' };
            }
            
            // Check if health endpoint is down
            const health = await checkHealth();
            if (!health.ok && !isProcessAlive(pid)) {
                deleteStateFiles();
                return { success: true, message: 'Gateway stopped' };
            }
        }
        
        // 3. Process still alive - escalate to SIGKILL
        if (isProcessAlive(pid)) {
            if (force) {
                process.kill(pid, 'SIGKILL');
                await new Promise(resolve => setTimeout(resolve, 1000));
                deleteStateFiles();
                return { success: true, message: 'Gateway force-killed' };
            } else {
                return { success: false, message: `Gateway did not stop gracefully (PID ${pid}). Use 'talon stop --force' to force kill.` };
            }
        }
        
        deleteStateFiles();
        return { success: true, message: 'Gateway stopped' };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, message: `Failed to stop gateway: ${error}` };
    }
}

export async function getGatewayStatus(): Promise<{
    running: boolean;
    pid?: number;
    version?: string;
    uptime?: number;
    port?: number;
    stale?: boolean;
    configPath?: string;
}> {
    const status = await isGatewayRunning();
    const state = readStateFile();
    
    return {
        running: status.running,
        pid: status.pid,
        version: status.version,
        uptime: status.uptime,
        port: GATEWAY_PORT,
        stale: status.stale,
        configPath: state?.configPath,
    };
}

export async function debugProcess(): Promise<void> {
    console.log('🔍 Talon Gateway Process Debug\n');
    
    // PID file
    const pid = readPidFile();
    console.log(`PID File: ${PID_FILE}`);
    console.log(`  Exists: ${fs.existsSync(PID_FILE)}`);
    console.log(`  PID: ${pid || 'N/A'}`);
    
    // State file
    const state = readStateFile();
    console.log(`\nState File: ${STATE_FILE}`);
    console.log(`  Exists: ${fs.existsSync(STATE_FILE)}`);
    if (state) {
        console.log(`  Version: ${state.version}`);
        console.log(`  Started: ${new Date(state.startedAt).toISOString()}`);
        console.log(`  Binary: ${state.binaryPath}`);
    }
    
    // Process check
    if (pid) {
        console.log(`\nProcess Check (PID ${pid}):`);
        console.log(`  Alive: ${isProcessAlive(pid)}`);
        console.log(`  Is Talon: ${isTalonProcess(pid)}`);
        
        if (isProcessAlive(pid)) {
            try {
                const cmdline = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf-8' }).trim();
                console.log(`  Command: ${cmdline}`);
            } catch {
                console.log(`  Command: <unable to read>`);
            }
        }
    }
    
    // Health check
    console.log(`\nHealth Check:`);
    const health = await checkHealth();
    console.log(`  Endpoint: ${HEALTH_URL}`);
    console.log(`  Reachable: ${health.ok}`);
    if (health.ok) {
        console.log(`  Version: ${health.version}`);
        console.log(`  Uptime: ${Math.round(health.uptime || 0)}s`);
    }
    
    // Port check
    console.log(`\nPort Check:`);
    const portOwner = getPortOwner();
    console.log(`  Port: ${GATEWAY_PORT}`);
    console.log(`  In Use: ${portOwner !== null}`);
    if (portOwner) {
        console.log(`  Owner PID: ${portOwner}`);
        console.log(`  Is Talon: ${isTalonProcess(portOwner)}`);
    }
    
    // Final status
    const status = await isGatewayRunning();
    console.log(`\nFinal Status:`);
    console.log(`  Running: ${status.running}`);
    console.log(`  Stale: ${status.stale || false}`);
    console.log(`  PID: ${status.pid || 'N/A'}`);
}
