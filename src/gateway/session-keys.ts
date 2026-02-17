// ─── Session Key Manager ──────────────────────────────────────────
// Sophisticated session identification and management system
// Based on OpenClaw's session architecture

import crypto from 'node:crypto';
import path from 'node:path';
import type { Session } from '../utils/types.js';

// ─── Types ────────────────────────────────────────────────────────

export interface SessionKeyComponents {
    channel: string;      // e.g., 'telegram', 'whatsapp', 'cli'
    senderId: string;     // User identifier
    agentId?: string;     // Optional agent identifier
    scope?: string;       // 'direct', 'group', 'thread'
    groupId?: string;     // Group/chat ID (if applicable)
    threadId?: string;    // Thread ID (if applicable)
    accountId?: string;   // Account ID (for multi-account channels)
}

export interface SessionKey {
    key: string;          // Full session key string
    components: SessionKeyComponents;
    displayName: string;  // Human-readable name
}

export interface SessionEntry {
    sessionKey: string;
    sessionId: string;
    createdAt: number;
    lastActiveAt: number;
    messageCount: number;
    channel: string;
    senderId: string;
    agentId: string | null;
    scope: string;
    metadata: Record<string, unknown>;
}

// ─── Session Key Builder ──────────────────────────────────────────

export class SessionKeyBuilder {
    private components: Partial<SessionKeyComponents> = {};

    static fromKey(key: string): SessionKeyComponents {
        const parts = key.split(':');
        
        // Format: channel:senderId[:agentId][:scope][:groupId][:threadId]
        return {
            channel: parts[0] ?? 'unknown',
            senderId: parts[1] ?? 'unknown',
            agentId: parts[2] || undefined,
            scope: parts[3] || undefined,
            groupId: parts[4] || undefined,
            threadId: parts[5] || undefined,
        };
    }

    channel(channel: string): this {
        this.components.channel = channel;
        return this;
    }

    senderId(senderId: string): this {
        this.components.senderId = senderId;
        return this;
    }

    agentId(agentId: string): this {
        this.components.agentId = agentId;
        return this;
    }

    scope(scope: 'direct' | 'group' | 'thread'): this {
        this.components.scope = scope;
        return this;
    }

    groupId(groupId: string): this {
        this.components.groupId = groupId;
        return this;
    }

    threadId(threadId: string): this {
        this.components.threadId = threadId;
        return this;
    }

    accountId(accountId: string): this {
        this.components.accountId = accountId;
        return this;
    }

    build(): SessionKey {
        const comps = this.components as SessionKeyComponents;
        
        if (!comps.channel || !comps.senderId) {
            throw new Error('Session key requires at least channel and senderId');
        }

        // Build key: channel:senderId[:agentId][:scope][:groupId][:threadId]
        const parts = [
            comps.channel,
            comps.senderId,
            comps.agentId,
            comps.scope,
            comps.groupId,
            comps.threadId,
        ].filter(Boolean);

        const key = parts.join(':');
        
        return {
            key,
            components: comps,
            displayName: this.buildDisplayName(comps),
        };
    }

    private buildDisplayName(comps: SessionKeyComponents): string {
        const parts: string[] = [comps.channel];
        
        if (comps.scope === 'group' && comps.groupId) {
            parts.push(`group:${comps.groupId}`);
        } else if (comps.scope === 'thread' && comps.threadId) {
            parts.push(`thread:${comps.threadId}`);
        }
        
        parts.push(comps.senderId);
        
        if (comps.agentId) {
            parts.push(`(agent:${comps.agentId})`);
        }
        
        return parts.join(' / ');
    }
}

// ─── Session Key Utilities ────────────────────────────────────────

export function createSessionKey(components: SessionKeyComponents): SessionKey {
    const builder = new SessionKeyBuilder()
        .channel(components.channel)
        .senderId(components.senderId);
    
    if (components.agentId) {
        builder.agentId(components.agentId);
    }
    
    builder.scope((components.scope ?? 'direct') as 'group' | 'direct' | 'thread');
    
    if (components.groupId) {
        builder.groupId(components.groupId);
    }
    
    if (components.threadId) {
        builder.threadId(components.threadId);
    }
    
    return builder.build();
}

export function parseSessionKey(key: string): SessionKeyComponents {
    return SessionKeyBuilder.fromKey(key);
}

export function normalizeSessionKey(key: string): string {
    // Normalize to ensure consistency
    const comps = parseSessionKey(key);
    return createSessionKey(comps).key;
}

export function getSessionScope(key: string): string {
    const comps = parseSessionKey(key);
    return comps.scope ?? 'direct';
}

export function isGroupSession(key: string): boolean {
    return getSessionScope(key) === 'group';
}

export function isDirectSession(key: string): boolean {
    return getSessionScope(key) === 'direct';
}

export function deriveSessionKeyFromMessage(params: {
    channel: string;
    senderId: string;
    isGroup: boolean;
    groupId?: string;
    threadId?: string;
    agentId?: string;
}): SessionKey {
    const builder = new SessionKeyBuilder()
        .channel(params.channel)
        .senderId(params.senderId);

    if (params.agentId) {
        builder.agentId(params.agentId);
    }

    if (params.isGroup && params.groupId) {
        builder.scope('group').groupId(params.groupId);
    } else if (params.threadId) {
        builder.scope('thread').threadId(params.threadId);
    } else {
        builder.scope('direct');
    }
    
    return builder.build();
}

// ─── Session Store Manager ────────────────────────────────────────

export class SessionKeyStore {
    private sessions = new Map<string, SessionEntry>();
    private keyToId = new Map<string, string>();

    constructor(private storePath?: string) {}

    /**
     * Register a new session or update existing
     */
    register(sessionKey: string, sessionId: string, metadata?: Record<string, unknown>): SessionEntry {
        const existing = this.sessions.get(sessionKey);
        
        const entry: SessionEntry = {
            sessionKey,
            sessionId,
            createdAt: existing?.createdAt ?? Date.now(),
            lastActiveAt: Date.now(),
            messageCount: (existing?.messageCount ?? 0) + 1,
            channel: parseSessionKey(sessionKey).channel,
            senderId: parseSessionKey(sessionKey).senderId,
            agentId: parseSessionKey(sessionKey).agentId ?? null,
            scope: parseSessionKey(sessionKey).scope ?? 'direct',
            metadata: { ...existing?.metadata, ...metadata },
        };

        this.sessions.set(sessionKey, entry);
        this.keyToId.set(sessionKey, sessionId);
        
        return entry;
    }

    /**
     * Get session by key
     */
    get(sessionKey: string): SessionEntry | undefined {
        return this.sessions.get(sessionKey);
    }

    /**
     * Get session ID by key
     */
    getSessionId(sessionKey: string): string | undefined {
        return this.keyToId.get(sessionKey);
    }

    /**
     * Get session key by ID (reverse lookup)
     */
    getKeyBySessionId(sessionId: string): string | undefined {
        for (const [key, entry] of this.sessions.entries()) {
            if (entry.sessionId === sessionId) {
                return key;
            }
        }
        return undefined;
    }

    /**
     * Update last activity
     */
    touch(sessionKey: string): void {
        const entry = this.sessions.get(sessionKey);
        if (entry) {
            entry.lastActiveAt = Date.now();
        }
    }

    /**
     * Increment message count
     */
    incrementMessageCount(sessionKey: string): void {
        const entry = this.sessions.get(sessionKey);
        if (entry) {
            entry.messageCount++;
        }
    }

    /**
     * Get all sessions
     */
    getAll(): SessionEntry[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Get sessions by channel
     */
    getByChannel(channel: string): SessionEntry[] {
        return this.getAll().filter(s => s.channel === channel);
    }

    /**
     * Get sessions by agent
     */
    getByAgent(agentId: string): SessionEntry[] {
        return this.getAll().filter(s => s.agentId === agentId);
    }

    /**
     * Get idle sessions (no activity for threshold ms)
     */
    getIdle(thresholdMs: number): SessionEntry[] {
        const now = Date.now();
        return this.getAll().filter(s => now - s.lastActiveAt > thresholdMs);
    }

    /**
     * Remove a session
     */
    remove(sessionKey: string): boolean {
        this.keyToId.delete(sessionKey);
        return this.sessions.delete(sessionKey);
    }

    /**
     * Get session count
     */
    get count(): number {
        return this.sessions.size;
    }

    /**
     * Clear all sessions
     */
    clear(): void {
        this.sessions.clear();
        this.keyToId.clear();
    }
}

// ─── Session Key Generator ────────────────────────────────────────

export function generateSessionId(): string {
    return `sess_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function generateShortSessionId(): string {
    return `sess_${crypto.randomBytes(4).toString('hex')}`;
}

// ─── Export Factory Function ──────────────────────────────────────

export function createSessionKeyBuilder(): SessionKeyBuilder {
    return new SessionKeyBuilder();
}
