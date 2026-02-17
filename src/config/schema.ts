// ─── Zod Schema for ~/.talon/config.json ──────────────────────────
// Matches docs/07-CONFIGURATION.md exactly

import { z } from 'zod';

// ─── Gateway ──────────────────────────────────────────────────────

const AuthSchema = z.object({
    mode: z.enum(['none', 'password', 'token']).default('none'),
    password: z.string().optional(),
    token: z.string().optional(),
    allowTailscale: z.boolean().default(false),
});

const TailscaleSchema = z.object({
    mode: z.enum(['off', 'serve', 'funnel']).default('off'),
    resetOnExit: z.boolean().default(true),
});

const CorsSchema = z.object({
    origins: z.array(z.string()).default(['http://127.0.0.1:*']),
});

const GatewaySchema = z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().min(1).max(65535).default(19789),
    auth: AuthSchema.default({}),
    tailscale: TailscaleSchema.default({}),
    cors: CorsSchema.default({}),
});

// ─── Agent ────────────────────────────────────────────────────────

const ProviderConfigSchema = z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    models: z.array(z.string()).default([]),
});

const AgentSchema = z.object({
    model: z.string().default('deepseek/deepseek-chat'),
    providers: z.record(z.string(), ProviderConfigSchema).default({ deepseek: {} }),
    failover: z.array(z.string()).default([]),
    maxTokens: z.number().int().min(1).default(4096),
    maxIterations: z.number().int().min(1).max(50).default(10),
    temperature: z.number().min(0).max(2).default(0.7),
    thinkingLevel: z.enum(['off', 'low', 'medium', 'high']).default('medium'),
});

// ─── Channels ─────────────────────────────────────────────────────

const TelegramChannelSchema = z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().optional(),
    allowedUsers: z.array(z.string()).default([]),
    allowedGroups: z.array(z.string()).default([]),
    groupActivation: z.enum(['mention', 'always']).default('mention'),
});

const DiscordChannelSchema = z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().optional(),
    applicationId: z.string().optional(),
    allowedGuilds: z.array(z.string()).default([]),
    allowedUsers: z.array(z.string()).default([]),
    allowedChannels: z.array(z.string()).default([]),
});

const WebchatChannelSchema = z.object({
    enabled: z.boolean().default(true),
    requireAuth: z.boolean().default(false),
});

const CliChannelSchema = z.object({
    enabled: z.boolean().default(true),
});

const WhatsAppChannelSchema = z.object({
    enabled: z.boolean().default(false),
    allowedUsers: z.array(z.string()).default([]),
    allowedGroups: z.array(z.string()).default([]),
    groupActivation: z.enum(['mention', 'always']).default('mention'),
    sessionName: z.string().default('Talon'),
});

const ChannelsSchema = z.object({
    telegram: TelegramChannelSchema.default({}),
    discord: DiscordChannelSchema.default({}),
    webchat: WebchatChannelSchema.default({}),
    cli: CliChannelSchema.default({}),
    whatsapp: WhatsAppChannelSchema.default({}),
});

// ─── Tools ────────────────────────────────────────────────────────

const FileToolsSchema = z.object({
    enabled: z.boolean().default(true),
    allowedPaths: z.array(z.string()).default(['~/']),
    deniedPaths: z.array(z.string()).default(['~/.ssh', '~/.gnupg']),
    maxFileSize: z.number().int().default(10_485_760), // 10MB
    confirmOverwrite: z.boolean().default(true),
});

const ShellToolsSchema = z.object({
    enabled: z.boolean().default(true),
    confirmDestructive: z.boolean().default(true),
    blockedCommands: z.array(z.string()).default([]),
    defaultTimeout: z.number().int().default(30_000),
    maxOutputSize: z.number().int().default(1_048_576), // 1MB
});

const BrowserToolsSchema = z.object({
    enabled: z.boolean().default(true),
    engine: z.enum(['playwright', 'puppeteer']).default('playwright'),
    headless: z.boolean().default(true),
    viewport: z.object({
        width: z.number().int().default(1280),
        height: z.number().int().default(720),
    }).default({}),
    screenshotDir: z.string().default('~/.talon/screenshots'),
});

const OsToolsSchema = z.object({
    enabled: z.boolean().default(true),
    notifications: z.boolean().default(true),
    clipboard: z.boolean().default(true),
});

const WebSearchSchema = z.object({
    enabled: z.boolean().default(true),
    provider: z.enum(['deepseek', 'openrouter', 'tavily', 'duckduckgo']).default('deepseek'),
    model: z.string().default('deepseek-chat'),
    apiKey: z.string().optional(),
    maxResults: z.number().int().min(1).max(10).default(5),
    timeoutSeconds: z.number().int().default(30),
});

const WebFetchSchema = z.object({
    enabled: z.boolean().default(true),
    maxChars: z.number().int().default(50_000),
    timeoutSeconds: z.number().int().default(30),
    maxRedirects: z.number().int().min(0).max(5).default(3),
});

const WebToolsSchema = z.object({
    search: WebSearchSchema.default({}),
    fetch: WebFetchSchema.default({}),
});

const ToolsSchema = z.object({
    files: FileToolsSchema.default({}),
    shell: ShellToolsSchema.default({}),
    browser: BrowserToolsSchema.default({}),
    os: OsToolsSchema.default({}),
    web: WebToolsSchema.default({}),
});

// ─── Memory ───────────────────────────────────────────────────────

const CompactionSchema = z.object({
    enabled: z.boolean().default(true),
    threshold: z.number().min(0).max(1).default(0.8),
    keepRecentMessages: z.number().int().min(1).default(10),
    summarizationModel: z.string().default('deepseek/deepseek-chat'),
});

const SessionMemorySchema = z.object({
    idleTimeout: z.number().int().default(1_800_000),  // 30 min
    archiveAfterDays: z.number().int().default(30),
    maxMessagesBeforeCompact: z.number().int().default(100),
});

const MemorySchema = z.object({
    enabled: z.boolean().default(true),
    autoExtractFacts: z.boolean().default(true),
    factDecayDays: z.number().int().default(90),
    session: SessionMemorySchema.default({}),
    compaction: CompactionSchema.default({}),
});

// ─── Shadow Loop ──────────────────────────────────────────────────

const ShadowSchema = z.object({
    enabled: z.boolean().default(false),
    watchers: z.object({
        filesystem: z.object({
            paths: z.array(z.string()).default(['~/projects']),
            ignore: z.array(z.string()).default([
                '**/node_modules/**',
                '**/.git/**',
                '**/dist/**',
            ]),
            events: z.array(z.enum(['add', 'change', 'unlink'])).default(['change']),
        }).default({}),
        shell: z.object({
            watchErrors: z.boolean().default(true),
        }).default({}),
        git: z.object({
            enabled: z.boolean().default(false),
        }).default({}),
    }).default({}),
    cooldown: z.number().int().default(30_000),
    maxGhostsPerHour: z.number().int().default(10),
});

// ─── Security ─────────────────────────────────────────────────────

const SecuritySchema = z.object({
    sandbox: z.object({
        mode: z.enum(['off', 'non-main', 'always']).default('off'),
        engine: z.enum(['docker', 'firejail']).default('docker'),
        allowedTools: z.array(z.string()).default([]),
        deniedTools: z.array(z.string()).default([]),
    }).default({}),
    audit: z.object({
        enabled: z.boolean().default(true),
        logFile: z.string().default('~/.talon/logs/audit.jsonl'),
        retentionDays: z.number().int().default(90),
    }).default({}),
});

// ─── UI ───────────────────────────────────────────────────────────

const UISchema = z.object({
    theme: z.enum(['dark', 'light', 'system']).default('dark'),
    showToolCalls: z.boolean().default(true),
    showTokenUsage: z.boolean().default(false),
    streaming: z.boolean().default(true),
});

// ─── Workspace ────────────────────────────────────────────────────

const WorkspaceSchema = z.object({
    root: z.string().default('~/.talon/workspace'),
    soulFile: z.string().default('SOUL.md'),
    factsFile: z.string().default('FACTS.json'),
    skillsDir: z.string().default('skills'),
});

// ─── Root Config ──────────────────────────────────────────────────

export const TalonConfigSchema = z.object({
    gateway: GatewaySchema.default({}),
    agent: AgentSchema.default({}),
    channels: ChannelsSchema.default({}),
    tools: ToolsSchema.default({}),
    memory: MemorySchema.default({}),
    shadow: ShadowSchema.default({}),
    security: SecuritySchema.default({}),
    ui: UISchema.default({}),
    workspace: WorkspaceSchema.default({}),
});

export type TalonConfig = z.infer<typeof TalonConfigSchema>;
