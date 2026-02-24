import { describe, expect, it } from 'vitest';
import { ModelRouter } from '@/agent/router.js';
import type { TalonConfig } from '@/config/schema.js';

function createConfig(): TalonConfig {
    return {
        gateway: {
            host: '127.0.0.1',
            port: 19789,
            auth: { mode: 'none', allowTailscale: false },
            tailscale: { enabled: false, mode: 'off', resetOnExit: true },
            cors: { origins: ['http://127.0.0.1:*'] },
        },
        agent: {
            model: 'openai/gpt-4o',
            subagentModel: 'gpt-4o-mini',
            providers: {
                openai: {
                    apiKey: 'test-key',
                    models: ['gpt-5.3-codex', 'gpt-5.1-thinking', 'gpt-5.1-codex-mini'],
                },
            },
            failover: [],
            maxTokens: 4096,
            maxIterations: 10,
            temperature: 0.7,
            thinkingLevel: 'medium',
        },
        channels: {
            telegram: { enabled: false, allowedUsers: [], allowedGroups: [], groupActivation: 'mention' },
            discord: {
                enabled: false,
                botToken: undefined,
                applicationId: undefined,
                allowedGuilds: [],
                allowedUsers: [],
                allowedChannels: [],
            },
            webchat: { enabled: true, requireAuth: false },
            cli: { enabled: true },
            whatsapp: { enabled: false, allowedUsers: [], allowedGroups: [], groupActivation: 'mention', sessionName: 'Talon' },
        },
        tools: {
            files: { enabled: true, allowedPaths: ['~/'], deniedPaths: ['~/.ssh', '~/.gnupg'], maxFileSize: 10_485_760, confirmOverwrite: true },
            shell: { enabled: true, confirmDestructive: true, blockedCommands: [], defaultTimeout: 30_000, maxOutputSize: 1_048_576 },
            browser: { enabled: true, engine: 'playwright', headless: true, viewport: { width: 1280, height: 720 }, screenshotDir: '~/.talon/screenshots' },
            os: { enabled: true, notifications: true, clipboard: true },
            web: {
                search: { enabled: true, provider: 'deepseek', model: 'deepseek-chat', maxResults: 5, timeoutSeconds: 30 },
                fetch: { enabled: true, maxChars: 50_000, timeoutSeconds: 30, maxRedirects: 3 },
            },
        },
        memory: {
            enabled: true,
            autoExtractFacts: true,
            factDecayDays: 90,
            recall: { maxResults: 6, maxTokens: 500, includeDaily: true },
            session: { idleTimeout: 1_800_000, archiveAfterDays: 30, maxMessagesBeforeCompact: 100 },
            compaction: { enabled: true, threshold: 0.8, keepRecentMessages: 10, summarizationModel: 'deepseek/deepseek-chat' },
        },
        memoryV2: {
            enabled: true,
            embeddings: { provider: 'auto', fallback: 'gemini', cacheSize: 1000 },
            chunking: { tokens: 400, overlap: 80 },
            search: { vectorWeight: 0.7, keywordWeight: 0.3, defaultLimit: 10 },
            watcher: { enabled: true, debounceMs: 1500, paths: ['memory/**/*.md'], ignore: ['**/node_modules/**', '**/.git/**'] },
            indexSessions: true,
        },
        shadow: {
            enabled: false,
            watchers: {
                filesystem: { paths: ['~/projects'], ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'], events: ['change'] },
                shell: { watchErrors: true },
                git: { enabled: false },
            },
            cooldown: 30_000,
            maxGhostsPerHour: 10,
        },
        security: {
            sandbox: { mode: 'off', engine: 'docker', allowedTools: [], deniedTools: [] },
            audit: { enabled: true, logFile: '~/.talon/logs/audit.jsonl', retentionDays: 90 },
        },
        ui: { theme: 'dark', showToolCalls: true, showTokenUsage: false, streaming: true },
        workspace: { root: '~/.talon/workspace', soulFile: 'SOUL.md', factsFile: 'FACTS.json', profileFile: 'PROFILE.json', skillsDir: 'skills' },
        hooks: { bootMd: { enabled: false } },
        vectorMemory: { enabled: false, provider: 'simple', retentionDays: 90 },
    };
}

describe('ModelRouter task-type routing', () => {
    it('should route code tasks to codex model when OpenAI provider exists', () => {
        const router = new ModelRouter(createConfig());
        const route = router.getProviderForTaskType('code');

        expect(route).not.toBeNull();
        expect(route?.providerId).toBe('openai');
        expect(route?.model).toBe('gpt-5.3-codex');
    });

    it('should route plan tasks to thinking model', () => {
        const router = new ModelRouter(createConfig());
        const route = router.getProviderForTaskType('plan');

        expect(route).not.toBeNull();
        expect(route?.providerId).toBe('openai');
        expect(route?.model).toBe('gpt-5.1-thinking');
    });
});
