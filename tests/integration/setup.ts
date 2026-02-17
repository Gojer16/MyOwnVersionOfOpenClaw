// ─── Integration Test Setup ──────────────────────────────────────────
// Shared utilities and mock objects for integration tests

import { vi } from 'vitest';
import type { TalonConfig } from '@/config/schema.js';
import type { Session, Message } from '@/utils/types.js';
import type { OpenAICompatibleProvider, LLMResponse } from '@/agent/providers/openai-compatible.js';

export const mockConfig: TalonConfig = {
    gateway: {
        host: '127.0.0.1',
        port: 19789,
        auth: { mode: 'none' },
        tailscale: { enabled: false, mode: 'off', resetOnExit: true },
        cors: { origins: ['http://127.0.0.1:*'] },
    },
    agent: {
        model: 'deepseek/deepseek-chat',
        providers: {
            deepseek: {
                apiKey: 'test-key',
                models: ['deepseek-chat'],
            },
        },
        failover: [],
        maxTokens: 4096,
        maxIterations: 10,
        temperature: 0.7,
        thinkingLevel: 'medium',
    },
    channels: {
        cli: { enabled: true },
        telegram: { enabled: false },
        discord: { enabled: false },
        whatsapp: { enabled: false },
        webchat: { enabled: true },
    },
    tools: {
        files: { enabled: true, allowedPaths: ['/tmp'], deniedPaths: [] },
        shell: { enabled: true, confirmDestructive: true },
        browser: { enabled: false },
        os: { enabled: true },
        web: {
            search: { enabled: false },
            fetch: { enabled: false },
        },
    },
    memory: {
        enabled: true,
        session: { idleTimeout: 1_800_000, archiveAfterDays: 30, maxMessagesBeforeCompact: 100 },
        compaction: { enabled: true, threshold: 0.8, keepRecentMessages: 10 },
    },
    workspace: { root: '/tmp/test-workspace' },
    skills: { enabled: true, dir: '/tmp/test-skills' },
    logging: { level: 'info' },
};

export function createMockSession(overrides?: Partial<Session>): Session {
    return {
        id: 'test-session-' + Math.random().toString(36).slice(2),
        channel: 'cli',
        senderId: 'test-user',
        state: 'created',
        messages: [],
        memorySummary: '',
        metadata: {
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
            messageCount: 0,
            model: 'deepseek-chat',
        },
        config: {},
        ...overrides,
    };
}

export function createMockMessage(role: Message['role'], content: string): Message {
    return {
        id: 'msg-' + Math.random().toString(36).slice(2),
        role,
        content,
        timestamp: Date.now(),
    };
}

export function createMockProvider(response: LLMResponse): OpenAICompatibleProvider {
    return {
        chat: vi.fn().mockResolvedValue(response),
    };
}

export function createMockProviderWithTools(
    responses: LLMResponse[],
): OpenAICompatibleProvider {
    let callCount = 0;
    return {
        chat: vi.fn().mockImplementation(() => {
            const response = responses[callCount] || responses[responses.length - 1];
            callCount++;
            return Promise.resolve(response);
        }),
    };
}
