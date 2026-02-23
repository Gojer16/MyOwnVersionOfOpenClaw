// ─── Shared Apple Tool Infrastructure ─────────────────────────────
// Bulletproof utilities shared across all Apple integration tools
// Extracted from apple-calendar.ts patterns

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// ─── Output Contract ──────────────────────────────────────────────

export interface BulletproofOutput {
    success: boolean;
    error?: {
        code: string;
        message: string;
        recoverable: boolean;
        recoverySteps?: string[];
    };
    data?: Record<string, any>;
    metadata: {
        timestamp: string;
        duration_ms: number;
        [key: string]: any;
    };
}

export function formatSuccess(data: Record<string, any>, metadata: Record<string, any>, startTime: number): string {
    const result: BulletproofOutput = {
        success: true,
        data,
        metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
        }
    };
    return JSON.stringify(result, null, 2);
}

export function formatError(
    code: string,
    message: string,
    recoverable: boolean,
    metadata: Record<string, any>,
    startTime: number,
    recoverySteps?: string[]
): string {
    const result: BulletproofOutput = {
        success: false,
        error: {
            code,
            message,
            recoverable,
            ...(recoverySteps ? { recoverySteps } : {})
        },
        metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
        }
    };
    return JSON.stringify(result, null, 2);
}

// ─── String Utilities ─────────────────────────────────────────────

export function normalizeString(str: string): string {
    return str.trim().replace(/\s+/g, ' ').replace(/\.+$/, '');
}

export function escapeAppleScript(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// ─── Zod Helpers ──────────────────────────────────────────────────

export const createBaseString = (maxLength: number, lengthMsg: string) =>
    z.string().trim().min(1, "String cannot be empty").max(maxLength, lengthMsg).transform(normalizeString);

// ─── Safe AppleScript Execution ───────────────────────────────────

/**
 * Execute AppleScript by writing to a temp file (avoids shell quoting issues).
 * The temp file is cleaned up afterwards regardless of success/failure.
 */
export async function safeExecAppleScript(
    script: string,
    timeoutMs: number = 10000
): Promise<{ stdout: string; stderr: string }> {
    const tempFile = join(tmpdir(), `talon-apple-${Date.now()}-${Math.random().toString(36).substring(7)}.scpt`);
    writeFileSync(tempFile, script, 'utf-8');
    try {
        const { stdout, stderr } = await execAsync(`osascript "${tempFile}"`, { timeout: timeoutMs });
        return { stdout, stderr };
    } finally {
        try { unlinkSync(tempFile); } catch (e) { /* ignore cleanup errors */ }
    }
}

// ─── Permission Detection ─────────────────────────────────────────

export function detectPermissionError(stderr: string): boolean {
    const lower = stderr.toLowerCase();
    return lower.includes('not authorized') ||
        lower.includes('access denied') ||
        lower.includes('not allowed');
}

export function getPermissionRecoverySteps(appName: string): string[] {
    return [
        'Open System Settings',
        `Go to Privacy & Security → Automation`,
        `Find Terminal (or your terminal app)`,
        `Enable the ${appName} checkbox`,
        'Restart your terminal and try again',
    ];
}

// ─── Permission Check with Cache ──────────────────────────────────

interface PermissionCacheEntry {
    granted: boolean;
    checkedAt: number;
}

const permissionCaches: Record<string, PermissionCacheEntry> = {};
const PERMISSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check permissions for a specific Apple app.
 * Uses a cached probe (5-minute TTL) to avoid repeated checks.
 */
export async function checkAppPermission(
    appName: string,
    testScript: string
): Promise<{ granted: boolean; needsCheck: boolean }> {
    const now = Date.now();
    const cached = permissionCaches[appName];

    if (cached && (now - cached.checkedAt) < PERMISSION_CACHE_TTL) {
        return { granted: cached.granted, needsCheck: false };
    }

    try {
        await safeExecAppleScript(testScript, 5000);
        permissionCaches[appName] = { granted: true, checkedAt: now };
        return { granted: true, needsCheck: true };
    } catch (err: any) {
        if (err.stderr && detectPermissionError(err.stderr)) {
            permissionCaches[appName] = { granted: false, checkedAt: now };
            return { granted: false, needsCheck: true };
        }
        // Other errors (e.g., app not installed) don't indicate permission issues
        return { granted: true, needsCheck: true };
    }
}

/** Reset permission caches (for testing) */
export function __resetPermissionCaches() {
    for (const key of Object.keys(permissionCaches)) {
        delete permissionCaches[key];
    }
}

// ─── Platform Check ───────────────────────────────────────────────

/**
 * Returns an error string if not on macOS, or null if OK.
 * Use at the top of every Apple tool execute function.
 */
export function checkPlatform(appName: string, startTime: number): string | null {
    if (process.platform !== 'darwin') {
        return formatError(
            'PLATFORM_NOT_SUPPORTED',
            `${appName} is only available on macOS`,
            false,
            {},
            startTime
        );
    }
    return null;
}

// ─── Error Handler ────────────────────────────────────────────────

/**
 * Standard error handler for AppleScript tool execution.
 * Handles timeout, permission, and generic errors.
 */
export function handleAppleScriptError(
    error: any,
    appName: string,
    context: Record<string, any>,
    startTime: number
): string {
    if (error.killed && error.signal === 'SIGTERM') {
        return formatError('TIMEOUT', `${appName} action timed out`, true, context, startTime);
    }
    if (error.stderr && detectPermissionError(error.stderr)) {
        return formatError(
            'PERMISSION_DENIED',
            `Terminal does not have permission to access ${appName}`,
            true,
            { ...context, applescriptOutput: error.stderr },
            startTime,
            getPermissionRecoverySteps(appName)
        );
    }
    logger.error({ error, ...context }, `Failed ${appName} operation`);
    return formatError(
        'APPLESCRIPT_ERROR',
        error.message || 'Unknown AppleScript error',
        false,
        { ...context, applescriptOutput: error.stderr },
        startTime
    );
}

// Safe delimiter for AppleScript output parsing
export const DELIMITER = '§';
