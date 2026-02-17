// ─── Talon Setup Wizard ───────────────────────────────────────────
// Interactive CLI wizard inspired by OpenClaw's onboarding flow

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { select, input, password, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { PROVIDERS, checkModel, type CustomProviderConfig } from './providers.js';
import { TALON_HOME, ensureRuntimeDirs } from '../config/loader.js';

const CONFIG_PATH = path.join(TALON_HOME, 'config.json');
const ENV_PATH = path.join(TALON_HOME, '.env');

// ─── Types ────────────────────────────────────────────────────────

interface WizardResult {
    agent: {
        model: string;
        providers: Record<string, {
            apiKey?: string;
            baseUrl?: string;
            models?: string[];
        }>;
    };
    gateway: {
        host: string;
        port: number;
        auth: { mode: string };
    };
    channels: {
        telegram: { enabled: boolean; botToken?: string };
        discord: { enabled: boolean; botToken?: string; applicationId?: string };
    };
    workspace: { root: string };
    tools: {
        webSearch: {
            provider: string;
            apiKey?: string;
        };
    };
}

// ─── Banner ───────────────────────────────────────────────────────


function printBanner(): void {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    console.clear();
    console.log('');
    console.log(chalk.bold.hex('#FF4500')('  Hello! Good morning! 🦞'));
    console.log('');
    console.log(chalk.dim(`  It is ${timeString} on ${dateString}.`));
    console.log(chalk.dim('  I am connecting to your local Talon instance...'));
    console.log('');
    console.log(chalk.cyan('  connected | idle'));
    console.log('');
}

// ─── Step 0: Existing Config Detection ────────────────────────────

async function detectExistingConfig(): Promise<'fresh' | 'keep' | 'modify' | 'reset'> {
    if (!fs.existsSync(CONFIG_PATH)) {
        return 'fresh';
    }

    console.log(chalk.yellow('  ⚠  Existing config detected at ~/.talon/config.json'));
    console.log('');

    const action = await select({
        message: 'What would you like to do?',
        choices: [
            { name: 'Keep existing config', value: 'keep' as const },
            { name: 'Modify existing config', value: 'modify' as const },
            { name: 'Reset everything', value: 'reset' as const },
        ],
    });

    if (action === 'reset') {
        const scope = await select({
            message: 'Reset scope:',
            choices: [
                { name: 'Config only', value: 'config' as const },
                { name: 'Config + sessions', value: 'sessions' as const },
                { name: 'Full reset (config + sessions + workspace)', value: 'full' as const },
            ],
        });

        if (scope === 'config' || scope === 'sessions' || scope === 'full') {
            // Move to trash instead of rm (safer)
            const trashDir = path.join(os.tmpdir(), `talon-backup-${Date.now()}`);
            fs.mkdirSync(trashDir, { recursive: true });

            if (fs.existsSync(CONFIG_PATH)) {
                fs.renameSync(CONFIG_PATH, path.join(trashDir, 'config.json'));
            }
            if (fs.existsSync(ENV_PATH)) {
                fs.renameSync(ENV_PATH, path.join(trashDir, '.env'));
            }

            if (scope === 'sessions' || scope === 'full') {
                const sessionsDir = path.join(TALON_HOME, 'sessions');
                if (fs.existsSync(sessionsDir)) {
                    fs.renameSync(sessionsDir, path.join(trashDir, 'sessions'));
                }
            }

            if (scope === 'full') {
                const workspaceDir = path.join(TALON_HOME, 'workspace');
                if (fs.existsSync(workspaceDir)) {
                    fs.renameSync(workspaceDir, path.join(trashDir, 'workspace'));
                }
            }

            console.log(chalk.dim(`  Backup saved to: ${trashDir}`));
            console.log('');
        }
    }

    return action;
}

// ─── Step 1: Model & Auth ─────────────────────────────────────────

async function stepModelAuth(): Promise<WizardResult['agent']> {
    console.log(chalk.bold.cyan('\n  Step 1/5: Model & Auth\n'));

    const providerChoices = [
        ...PROVIDERS.map(p => ({
            name: `${p.name}  ${chalk.dim(p.description)}`,
            value: p.id,
        })),
        { name: `Custom Provider (OpenAI-compatible)  ${chalk.dim('Any provider with /v1/chat/completions')}`, value: 'custom-openai' },
        { name: `Custom Provider (Anthropic-compatible)  ${chalk.dim('Any provider with /v1/messages')}`, value: 'custom-anthropic' },
        { name: chalk.dim('Skip for now'), value: 'skip' },
    ];

    const providerId = await select({
        message: 'Choose your AI provider:',
        choices: providerChoices,
    });

    if (providerId === 'skip') {
        console.log(chalk.dim('  Skipping model setup — you can configure later in ~/.talon/config.json'));
        return {
            model: 'deepseek/deepseek-chat',
            providers: {},
        };
    }

    // Custom provider flow
    if (providerId === 'custom-openai' || providerId === 'custom-anthropic') {
        return await configureCustomProvider(
            providerId === 'custom-openai' ? 'openai-compatible' : 'anthropic-compatible',
        );
    }

    // Known provider flow
    const provider = PROVIDERS.find(p => p.id === providerId)!;

    // Check for existing env var
    const existingKey = process.env[provider.envVar];
    let apiKey: string;

    if (existingKey) {
        console.log(chalk.green(`  ✓ Found ${provider.envVar} in environment`));
        const useExisting = await confirm({
            message: `Use existing ${provider.envVar}?`,
            default: true,
        });
        apiKey = useExisting ? existingKey : await password({
            message: `Enter your ${provider.name} API key:`,
        });
    } else {
        apiKey = await password({
            message: `Enter your ${provider.name} API key:`,
        });
    }

    // Pick default model
    const modelId = await select({
        message: 'Choose default model:',
        choices: [
            ...provider.models.map(m => ({
                name: `${m.name}  ${chalk.dim(m.id)}`,
                value: m.id,
            })),
            { name: chalk.dim('Enter model ID manually'), value: '__custom__' },
        ],
    });

    let finalModel: string;
    if (modelId === '__custom__') {
        finalModel = await input({
            message: 'Enter model ID (e.g. deepseek-chat):',
        });
    } else {
        finalModel = modelId;
    }

    // Model check
    console.log(chalk.dim('\n  Testing model connectivity...'));
    const check = await checkModel(provider.baseUrl, apiKey, finalModel, provider.apiType);

    if (check.ok) {
        console.log(chalk.green('  ✓ Model check passed!\n'));
    } else {
        console.log(chalk.red(`  ✗ Model check failed: ${check.error}`));
        console.log(chalk.yellow('  Continuing anyway — you can fix this later.\n'));
    }

    const fullModelId = `${providerId}/${finalModel}`;

    return {
        model: fullModelId,
        providers: {
            [providerId]: {
                apiKey,
                baseUrl: provider.baseUrl,
                models: provider.models.map(m => m.id),
            },
        },
    };
}

async function configureCustomProvider(
    apiType: 'openai-compatible' | 'anthropic-compatible',
): Promise<WizardResult['agent']> {
    const endpointId = await input({
        message: 'Endpoint ID (e.g. "my-local-llm"):',
        default: 'custom',
    });

    const baseUrl = await input({
        message: 'Base URL:',
        default: apiType === 'openai-compatible'
            ? 'http://localhost:11434/v1'
            : 'https://api.example.com',
    });

    const apiKey = await password({
        message: 'API key (leave empty if none):',
    });

    const modelId = await input({
        message: 'Model ID:',
        default: 'llama3.1:70b',
    });

    // Test it
    console.log(chalk.dim('\n  Testing model connectivity...'));
    const check = await checkModel(baseUrl, apiKey, modelId, apiType);

    if (check.ok) {
        console.log(chalk.green('  ✓ Model check passed!\n'));
    } else {
        console.log(chalk.red(`  ✗ Model check failed: ${check.error}`));
        console.log(chalk.yellow('  Continuing anyway — you can fix this later.\n'));
    }

    return {
        model: `${endpointId}/${modelId}`,
        providers: {
            [endpointId]: {
                apiKey: apiKey || undefined,
                baseUrl,
                models: [modelId],
            },
        },
    };
}

// ─── Step 2: Workspace ────────────────────────────────────────────

async function stepWorkspace(): Promise<WizardResult['workspace']> {
    console.log(chalk.bold.cyan('\n  Step 2/5: Workspace\n'));

    const defaultWorkspace = path.join(TALON_HOME, 'workspace');
    const workspaceRoot = await input({
        message: 'Workspace location:',
        default: defaultWorkspace,
    });

    // Ensure directory exists
    const resolved = workspaceRoot.replace(/^~/, os.homedir());
    if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
    }

    // Seed template files
    const templateDir = path.resolve(
        new URL('.', import.meta.url).pathname,
        '../../workspace',
    );

    const templateFiles = [
        'SOUL.md',
        'FACTS.json',
        'USER.md',
        'IDENTITY.md',
        'BOOTSTRAP.md',
        'MEMORY.md',
        'AGENTS.md',
        'TOOLS.md',
        'HEARTBEAT.md',
    ];

    for (const file of templateFiles) {
        const target = path.join(resolved, file);
        const source = path.join(templateDir, file);
        if (!fs.existsSync(target) && fs.existsSync(source)) {
            fs.copyFileSync(source, target);
            console.log(chalk.green(`  ✓ Seeded ${file}`));
        } else if (fs.existsSync(target)) {
            console.log(chalk.dim(`  • ${file} already exists`));
        }
    }

    // Ensure skills dir
    const skillsDir = path.join(resolved, 'skills');
    if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
    }

    console.log(chalk.green('  ✓ Workspace ready\n'));

    return { root: workspaceRoot };
}

// ─── Step 3: Gateway ──────────────────────────────────────────────

async function stepGateway(): Promise<WizardResult['gateway']> {
    console.log(chalk.bold.cyan('\n  Step 3/5: Gateway\n'));

    const port = await input({
        message: 'Gateway port:',
        default: '19789',
        validate: (v) => {
            const n = parseInt(v, 10);
            if (isNaN(n) || n < 1 || n > 65535) return 'Must be a valid port (1-65535)';
            return true;
        },
    });

    const host = await input({
        message: 'Bind address:',
        default: '127.0.0.1',
    });

    const authMode = await select({
        message: 'Auth mode:',
        choices: [
            { name: `None  ${chalk.dim('(localhost only, trusted network)')}`, value: 'none' },
            { name: `Password  ${chalk.dim('(required for remote access)')}`, value: 'password' },
            { name: `Token  ${chalk.dim('(bearer token auth)')}`, value: 'token' },
        ],
    });

    if (host !== '127.0.0.1' && host !== 'localhost' && authMode === 'none') {
        console.log(chalk.yellow('  ⚠  Non-loopback bind without auth is not recommended!'));
    }

    console.log(chalk.green('  ✓ Gateway configured\n'));

    return {
        host,
        port: parseInt(port, 10),
        auth: { mode: authMode },
    };
}

// ─── Step 4: Channels ─────────────────────────────────────────────

async function stepChannels(): Promise<WizardResult['channels']> {
    console.log(chalk.bold.cyan('\n  Step 4/5: Channels\n'));

    // Telegram
    const enableTelegram = await confirm({
        message: 'Enable Telegram?',
        default: false,
    });

    let telegramToken: string | undefined;
    if (enableTelegram) {
        const existingToken = process.env.TELEGRAM_BOT_TOKEN;
        if (existingToken) {
            console.log(chalk.green('  ✓ Found TELEGRAM_BOT_TOKEN in environment'));
            const useExisting = await confirm({
                message: 'Use existing token?',
                default: true,
            });
            telegramToken = useExisting ? existingToken : await password({
                message: 'Telegram bot token (from @BotFather):',
            });
        } else {
            telegramToken = await password({
                message: 'Telegram bot token (from @BotFather):',
            });
        }
    }

    // Discord
    const enableDiscord = await confirm({
        message: 'Enable Discord?',
        default: false,
    });

    let discordToken: string | undefined;
    let discordAppId: string | undefined;
    if (enableDiscord) {
        discordToken = await password({
            message: 'Discord bot token:',
        });
        discordAppId = await input({
            message: 'Discord application ID:',
        });
    }

    console.log(chalk.green('  ✓ Channels configured\n'));

    return {
        telegram: { enabled: enableTelegram, botToken: telegramToken },
        discord: { enabled: enableDiscord, botToken: discordToken, applicationId: discordAppId },
    };
}

// ─── Step 5: Tools ─────────────────────────────────────────────────

async function stepTools(): Promise<WizardResult['tools']> {
    console.log(chalk.bold.cyan('\n  Step 5/6: Tools Configuration\n'));

    // Web Search Provider
    const useMainModel = await confirm({
        message: 'Use the same LLM provider for web search?',
        default: true,
    });

    let webSearchProvider = 'deepseek';
    let webSearchApiKey: string | undefined;

    if (!useMainModel) {
        webSearchProvider = await select({
            message: 'Choose web search provider:',
            choices: [
                { name: 'DeepSeek API (cheap, recommended)', value: 'deepseek' },
                { name: 'OpenRouter (via DeepSeek/Grok)', value: 'openrouter' },
                { name: 'Tavily (free tier available)', value: 'tavily' },
                { name: 'DuckDuckGo (free, unreliable)', value: 'duckduckgo' },
            ],
        });

        if (webSearchProvider === 'deepseek') {
            const existingKey = process.env.DEEPSEEK_API_KEY;
            if (existingKey) {
                console.log(chalk.green('  ✓ Found DEEPSEEK_API_KEY'));
                const useExisting = await confirm({ message: 'Use existing key?', default: true });
                webSearchApiKey = useExisting ? existingKey : await password({ message: 'DeepSeek API key:' });
            } else {
                webSearchApiKey = await password({ message: 'DeepSeek API key:' });
            }
        } else if (webSearchProvider === 'openrouter') {
            const existingKey = process.env.OPENROUTER_API_KEY;
            if (existingKey) {
                console.log(chalk.green('  ✓ Found OPENROUTER_API_KEY'));
                const useExisting = await confirm({ message: 'Use existing key?', default: true });
                webSearchApiKey = useExisting ? existingKey : await password({ message: 'OpenRouter API key:' });
            } else {
                webSearchApiKey = await password({ message: 'OpenRouter API key:' });
            }
        } else if (webSearchProvider === 'tavily') {
            const existingKey = process.env.TAVILY_API_KEY;
            if (existingKey) {
                console.log(chalk.green('  ✓ Found TAVILY_API_KEY'));
                const useExisting = await confirm({ message: 'Use existing key?', default: true });
                webSearchApiKey = useExisting ? existingKey : await password({ message: 'Tavily API key:' });
            } else {
                webSearchApiKey = await password({ message: 'Tavily API key (get free at tavily.com):' });
            }
        }
    }

    console.log(chalk.green('  ✓ Tools configured\n'));

    return {
        webSearch: {
            provider: webSearchProvider,
            apiKey: webSearchApiKey,
        },
    };
}

// ─── Step 6: Health Check ─────────────────────────────────────────

async function stepHealthCheck(config: WizardResult): Promise<void> {
    console.log(chalk.bold.cyan('\n  Step 6/6: Health Check\n'));

    // Verify config was written
    if (fs.existsSync(CONFIG_PATH)) {
        console.log(chalk.green('  ✓ Config saved to ~/.talon/config.json'));
    }

    // Verify workspace
    const wsRoot = config.workspace.root.replace(/^~/, os.homedir());
    if (fs.existsSync(path.join(wsRoot, 'SOUL.md'))) {
        console.log(chalk.green('  ✓ Workspace seeded with SOUL.md'));
    }

    // Check if model info is configured
    if (config.agent.model && Object.keys(config.agent.providers).length > 0) {
        console.log(chalk.green(`  ✓ Model configured: ${config.agent.model}`));
    } else {
        console.log(chalk.yellow('  ⚠  No model configured — set up later in config'));
    }

    if (config.channels.telegram.enabled) {
        console.log(chalk.green('  ✓ Telegram enabled'));
    }
    if (config.channels.discord.enabled) {
        console.log(chalk.green('  ✓ Discord enabled'));
    }

    console.log('');
}

// ─── Save Config ──────────────────────────────────────────────────

function saveConfig(result: WizardResult): void {
    ensureRuntimeDirs();

    // Build config object (only non-default values)
    const config: Record<string, unknown> = {};

    // Agent
    const agentConfig: Record<string, unknown> = {
        model: result.agent.model,
    };

    // Build providers with env var references for API keys
    const providers: Record<string, unknown> = {};
    for (const [id, p] of Object.entries(result.agent.providers)) {
        const providerDef = PROVIDERS.find(pr => pr.id === id);
        const envVar = providerDef?.envVar ?? `${id.toUpperCase()}_API_KEY`;

        providers[id] = {
            apiKey: `\${${envVar}}`,
            ...(p.baseUrl && { baseUrl: p.baseUrl }),
            ...(p.models && { models: p.models }),
        };

        // Save the actual API key to .env file
        if (p.apiKey) {
            saveEnvVar(envVar, p.apiKey);
        }
    }

    if (Object.keys(providers).length > 0) {
        agentConfig.providers = providers;
    }
    config.agent = agentConfig;

    // Gateway
    config.gateway = {
        host: result.gateway.host,
        port: result.gateway.port,
        auth: result.gateway.auth,
    };

    // Channels
    const channels: Record<string, unknown> = {};
    if (result.channels.telegram.enabled) {
        channels.telegram = {
            enabled: true,
            botToken: '${TELEGRAM_BOT_TOKEN}',
        };
        if (result.channels.telegram.botToken) {
            saveEnvVar('TELEGRAM_BOT_TOKEN', result.channels.telegram.botToken);
        }
    }
    if (result.channels.discord.enabled) {
        channels.discord = {
            enabled: true,
            botToken: '${DISCORD_BOT_TOKEN}',
            applicationId: result.channels.discord.applicationId,
        };
        if (result.channels.discord.botToken) {
            saveEnvVar('DISCORD_BOT_TOKEN', result.channels.discord.botToken);
        }
    }
    if (Object.keys(channels).length > 0) {
        config.channels = channels;
    }

    // Tools
    if (result.tools?.webSearch) {
        const webSearchProvider = result.tools.webSearch.provider;
        const webSearchApiKey = result.tools.webSearch.apiKey;

        if (webSearchApiKey) {
            const envVar = webSearchProvider === 'deepseek' ? 'DEEPSEEK_API_KEY'
                : webSearchProvider === 'openrouter' ? 'OPENROUTER_API_KEY'
                : webSearchProvider === 'tavily' ? 'TAVILY_API_KEY'
                : null;

            if (envVar) {
                saveEnvVar(envVar, webSearchApiKey);
            }
        }

        config.tools = {
            web: {
                search: {
                    enabled: true,
                    provider: webSearchProvider,
                },
            },
        };
    }

    // Workspace
    config.workspace = { root: result.workspace.root };

    // Write config
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function saveEnvVar(key: string, value: string): void {
    let envContent = '';
    if (fs.existsSync(ENV_PATH)) {
        envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    }

    // Replace or append
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
        envContent += `${key}=${value}\n`;
    }

    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
}

// ─── Main Wizard ──────────────────────────────────────────────────

export async function runWizard(): Promise<void> {
    printBanner();

    // Step 0: Check existing config
    const action = await detectExistingConfig();
    if (action === 'keep') {
        console.log(chalk.green('\n  ✓ Keeping existing config. Run `talon start` to begin.\n'));
        return;
    }

    // Run all steps
    const agent = await stepModelAuth();
    const workspace = await stepWorkspace();
    const gateway = await stepGateway();
    const channels = await stepChannels();
    const tools = await stepTools();

    const result: WizardResult = { agent, gateway, channels, workspace, tools };

    // Save
    saveConfig(result);

    // Health check
    await stepHealthCheck(result);

    // Done!
    console.log(chalk.bold.cyan('  ─────────────────────────────────'));
    console.log(chalk.bold.green('  🦅 Talon is configured!'));
    console.log('');
    console.log(chalk.dim('  Next steps:'));
    console.log(`    ${chalk.cyan('talon start')}   Start the gateway`);
    console.log(`    ${chalk.cyan('talon health')}  Check system health`);
    console.log(`    ${chalk.cyan('talon setup')}   Re-run this wizard`);
    console.log('');
}
