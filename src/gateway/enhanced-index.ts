// ─── Enhanced Gateway with Plugin & Cron Support ──────────────────
// Integrates new architectural components:
// - Protocol layer
// - Session keys
// - Plugin system
// - Cron service

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { loadConfig } from '../config/index.js';
import { EventBus } from './events.js';
import { SessionManager } from './sessions.js';
import { MessageRouter } from './router.js';
import { TalonServer } from './server.js';
import { ModelRouter } from '../agent/router.js';
import { AgentLoop } from '../agent/loop.js';
import { MemoryManager } from '../memory/manager.js';
import { MemoryCompressor } from '../memory/compressor.js';
import { registerAllTools } from '../tools/registry.js';
import { SessionKeyStore, generateSessionId } from './session-keys.js';
import { PluginLoader, PluginAPI, pluginRegistry } from '../plugins/index.js';
import { cronService } from '../cron/index.js';
import { logger } from '../utils/logger.js';
import type { TalonConfig } from '../config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_TEMPLATE = path.resolve(__dirname, '../../templates/workspace');

// ─── Enhanced Gateway Class ───────────────────────────────────────

export class TalonGateway {
    private config!: TalonConfig;
    private eventBus!: EventBus;
    private sessionManager!: SessionManager;
    private sessionKeyStore!: SessionKeyStore;
    private router!: MessageRouter;
    private server!: TalonServer;
    private modelRouter!: ModelRouter;
    private memoryManager!: MemoryManager;
    private memoryCompressor!: MemoryCompressor;
    private agentLoop!: AgentLoop;
    private pluginLoader!: PluginLoader;
    private pluginAPI!: PluginAPI;
    private channels: Array<{ stop(): Promise<void> }> = [];
    private isBooted = false;

    /**
     * Boot the complete Talon gateway
     */
    async boot(): Promise<void> {
        if (this.isBooted) {
            logger.warn('Gateway already booted');
            return;
        }

        this.printBanner();

        // Phase 1: Configuration
        logger.info('╔════════════════════════════════════╗');
        logger.info('║  Phase 1: Loading Configuration   ║');
        logger.info('╚════════════════════════════════════╝');
        this.config = await loadConfig(WORKSPACE_TEMPLATE);

        // Phase 2: Core Infrastructure
        logger.info('╔════════════════════════════════════╗');
        logger.info('║  Phase 2: Core Infrastructure     ║');
        logger.info('╚════════════════════════════════════╝');
        this.eventBus = new EventBus();
        this.sessionKeyStore = new SessionKeyStore();
        this.sessionManager = new SessionManager(this.config, this.eventBus);
        this.router = new MessageRouter(this.sessionManager, this.eventBus);

        // Phase 3: AI Brain
        logger.info('╔════════════════════════════════════╗');
        logger.info('║  Phase 3: AI Brain Initialization ║');
        logger.info('╚════════════════════════════════════╝');
        this.modelRouter = new ModelRouter(this.config);
        this.memoryManager = new MemoryManager({
            workspaceRoot: this.config.workspace.root,
            maxContextTokens: 6000,
            maxSummaryTokens: 800,
            keepRecentMessages: this.config.memory.compaction.keepRecentMessages,
        });
        this.memoryCompressor = new MemoryCompressor(this.modelRouter);
        this.agentLoop = new AgentLoop(
            this.modelRouter,
            this.memoryManager,
            this.memoryCompressor,
            this.eventBus,
            { maxIterations: this.config.agent.maxIterations }
        );
        this.agentLoop.registerFallbackProviders();
        
        // Initialize subagents (TODO: Not yet implemented)
        // await this.initializeSubagents();
        
        registerAllTools(this.agentLoop, this.config);

        // Phase 4: Plugin System
        logger.info('╔════════════════════════════════════╗');
        logger.info('║  Phase 4: Plugin System           ║');
        logger.info('╚════════════════════════════════════╝');
        await this.initializePlugins();

        // Phase 5: HTTP Server
        logger.info('╔════════════════════════════════════╗');
        logger.info('║  Phase 5: HTTP Server             ║');
        logger.info('╚════════════════════════════════════╝');
        this.server = new TalonServer(
            this.config,
            this.eventBus,
            this.sessionManager,
            this.router,
            this.agentLoop
        );
        await this.server.setup();

        // Phase 6: Cron Service
        logger.info('╔════════════════════════════════════╗');
        logger.info('║  Phase 6: Cron Service            ║');
        logger.info('╚════════════════════════════════════╝');
        this.initializeCron();

        // Phase 7: Event Wiring
        logger.info('╔════════════════════════════════════╗');
        logger.info('║  Phase 7: Event Wiring            ║');
        logger.info('╚════════════════════════════════════╝');
        this.wireEvents();

        // Phase 8: Channels
        logger.info('╔════════════════════════════════════╗');
        logger.info('║  Phase 8: Channel Initialization  ║');
        logger.info('╚════════════════════════════════════╝');
        await this.initializeChannels();

        this.isBooted = true;

        // Print status
        this.printStatus();

        // Run boot hook if enabled
        await this.runBootHook();

        // Setup shutdown handlers
        this.setupShutdownHandlers();
    }

    /**
     * Initialize plugin system
     */
    private async initializePlugins(): Promise<void> {
        // Create plugin API
        this.pluginAPI = {
            config: this.config,
            events: this.eventBus,
            agent: this.agentLoop,
            logger,
            getConfig: <T>(key: string, defaultValue?: T) => {
                const parts = key.split('.');
                let value: unknown = this.config;
                for (const part of parts) {
                    value = (value as Record<string, unknown>)?.[part];
                }
                return (value ?? defaultValue) as T;
            },
            setConfig: (key: string, value: unknown) => {
                // In a real implementation, this would persist config
                logger.warn({ key }, 'setConfig not implemented - would update config');
            },
        };

        // Load plugins
        const pluginDirs = [
            path.join(this.config.workspace.root, 'plugins'),
            path.join(process.cwd(), 'plugins'),
        ];

        this.pluginLoader = new PluginLoader(pluginDirs, this.pluginAPI);
        
        const plugins = await this.pluginLoader.loadAll();
        logger.info({ count: plugins.length }, 'Plugins loaded');

        // Activate plugins
        await this.pluginLoader.activateAll();

        // Register built-in channels as plugins
        this.registerBuiltInChannels();
    }

    /**
     * Initialize subagent system (TODO: Not yet implemented)
     */
    private async initializeSubagents(): Promise<void> {
        // TODO: Implement subagent system
        // Tests written in tests/unit/subagents.test.ts
        logger.info('Subagent system not yet implemented');
    }

    /**
     * Register built-in channels with plugin registry
     */
    private registerBuiltInChannels(): void {
        // This allows channels to be managed like plugins
        logger.info('Built-in channels registered');
    }

    /**
     * Initialize cron service
     */
    private initializeCron(): void {
        // Start cron service
        cronService.start();

        // Add default heartbeat job
        cronService.addJob({
            name: 'Session Cleanup',
            schedule: '0 */6 * * *', // Every 6 hours
            command: 'cleanup-sessions',
            args: [],
            enabled: true,
            timeout: 60000,
            retryCount: 3,
        });

        // Listen for cron events
        cronService.on('jobStarted', (job) => {
            logger.info({ jobId: job.id, name: job.name }, 'Cron job started');
        });

        cronService.on('jobCompleted', (job, log) => {
            logger.info({ jobId: job.id, duration: log.duration }, 'Cron job completed');
        });

        cronService.on('jobFailed', (job, log, err) => {
            logger.error({ jobId: job.id, err }, 'Cron job failed');
        });

        // Wire cron execution to agent
        cronService.on('executeCommand', async (job) => {
            logger.info({ jobId: job.id, command: job.command }, 'Executing cron command');
            // In a real implementation, this would route to the agent
        });

        logger.info({ jobCount: cronService.getStatus().jobCount }, 'Cron service initialized');
    }

    /**
     * Wire up all event handlers
     */
    private wireEvents(): void {
        // Session key tracking
        this.eventBus.on('session.created', ({ session }) => {
            this.sessionKeyStore.register(
                session.id,
                session.id,
                { channel: session.channel }
            );
        });

        // Message handling
        this.eventBus.on('message.inbound', async ({ message, sessionId }) => {
            const session = this.sessionManager.getSession(sessionId);
            if (!session) {
                logger.warn({ sessionId }, 'Session not found for inbound message');
                return;
            }

            // Update session key store
            this.sessionKeyStore.touch(sessionId);

            // Run agent
            await this.runAgent(session);
        });

        // Tool events
        this.eventBus.on('tool.execute', ({ sessionId, tool }) => {
            logger.info({ sessionId, tool }, 'Tool executed');
        });
    }

    /**
     * Run agent loop for a session
     */
    private async runAgent(session: any): Promise<void> {
        try {
            for await (const chunk of this.agentLoop.run(session)) {
                // Broadcast to WebSocket clients
                this.server.broadcastToSession(session.id, {
                    id: `ws_${Date.now().toString(36)}`,
                    type: chunk.type === 'text' ? 'agent.response'
                        : chunk.type === 'done' ? 'agent.response.end'
                        : chunk.type === 'tool_call' ? 'tool.call'
                        : chunk.type === 'tool_result' ? 'tool.result'
                        : 'agent.response',
                    timestamp: Date.now(),
                    payload: chunk,
                });

                // Send final response
                if (chunk.type === 'done') {
                    const lastMsg = session.messages.filter((m: any) => m.role === 'assistant').pop();
                    if (lastMsg?.content) {
                        this.router.handleOutbound(session.id, lastMsg.content);
                    }
                }
            }

            // Persist session
            this.sessionManager.persistSession(session);
            this.sessionKeyStore.incrementMessageCount(session.id);

        } catch (err) {
            logger.error({ err, sessionId: session.id }, 'Agent loop error');
            this.server.broadcastToSession(session.id, {
                id: `ws_${Date.now().toString(36)}`,
                type: 'error',
                timestamp: Date.now(),
                payload: { error: err instanceof Error ? err.message : 'Unknown error' },
            });
        }
    }

    /**
     * Initialize channels
     */
    private async initializeChannels(): Promise<void> {
        const { CliChannel } = await import('../channels/cli/index.js');
        const { TelegramChannel } = await import('../channels/telegram/index.js');
        const { WhatsAppChannel } = await import('../channels/whatsapp/index.js');

        // CLI
        if (this.config.channels.cli.enabled) {
            const cliEnabled = this.config.channels.cli.enabled && process.env.TALON_CLI_ENABLED !== 'false';
            if (cliEnabled) {
                const cli = new CliChannel(this.config, this.eventBus, this.sessionManager, this.router);
                await cli.start();
                this.channels.push(cli);
            }
        }

        // Telegram
        if (this.config.channels.telegram.enabled && this.config.channels.telegram.botToken) {
            const telegram = new TelegramChannel(this.config, this.eventBus, this.sessionManager, this.router);
            await telegram.start();
            this.channels.push(telegram);
            logger.info('Telegram channel started');
        }

        // WhatsApp
        if (this.config.channels.whatsapp?.enabled) {
            const whatsapp = new WhatsAppChannel(this.config, this.eventBus, this.sessionManager, this.router);
            await whatsapp.start();
            this.channels.push(whatsapp);
            logger.info('WhatsApp channel started');
        }

        // Plugin channels
        for (const channel of pluginRegistry.getAllChannels()) {
            await channel.initialize(this.pluginAPI);
            await channel.start();
            this.channels.push({
                stop: async () => { await channel.stop(); },
            });
            logger.info({ channelId: channel.id }, 'Plugin channel started');
        }
    }

    /**
     * Setup shutdown handlers
     */
    private setupShutdownHandlers(): void {
        const shutdown = async (signal: string) => {
            logger.info(`Received ${signal}, shutting down gracefully...`);

            // Stop channels
            for (const channel of this.channels) {
                await channel.stop();
            }

            // Stop cron
            cronService.stop();

            // Deactivate plugins
            await this.pluginLoader.deactivateAll();

            // Persist sessions
            this.sessionManager.destroy();

            // Stop server
            await this.server.stop();

            logger.info('Goodbye! 🦅');
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        process.on('unhandledRejection', (reason) => {
            logger.error({ reason }, 'Unhandled rejection');
        });

        process.on('uncaughtException', (err) => {
            logger.fatal({ err }, 'Uncaught exception');
            shutdown('uncaughtException').catch(() => process.exit(1));
        });
    }

    /**
     * Print startup banner
     */
    private printBanner(): void {
        console.log(`
  ╔══════════════════════════════════════════════════╗
  ║                                                  ║
  ║   🦅  T A L O N   v0.3.0   -   Enhanced         ║
  ║                                                  ║
  ║   Personal AI Assistant                          ║
  ║   Protocol • Plugins • Cron • Session Keys      ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
  `);
    }

    /**
     * Run boot hook if enabled
     */
    private async runBootHook(): Promise<void> {
        if (!this.config.hooks?.bootMd?.enabled) {
            return;
        }

        const bootMdPath = path.join(this.config.workspace.root, 'BOOT.md');
        
        if (!fs.existsSync(bootMdPath)) {
            logger.warn({ path: bootMdPath }, 'BOOT.md not found, skipping boot hook');
            return;
        }

        try {
            logger.info('Running BOOT.md hook...');
            const bootContent = fs.readFileSync(bootMdPath, 'utf-8').trim();
            
            if (!bootContent) {
                logger.warn('BOOT.md is empty, skipping');
                return;
            }

            // Replace {{DATE}} placeholder with current date
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            const processedContent = bootContent.replace(/\{\{DATE\}\}/g, dateStr);

            // Build boot prompt (similar to OpenClaw)
            const bootPrompt = [
                'You are running a boot check. Follow BOOT.md instructions exactly.',
                '',
                'BOOT.md:',
                processedContent,
                '',
                'If BOOT.md asks you to do something, execute it now.',
                'If nothing needs attention, simply acknowledge with "Boot complete."',
            ].join('\n');

            // Create a temporary boot session
            const bootSession = this.sessionManager.createSession(
                'system',
                'boot-hook',
                'Boot Hook'
            );

            // Add boot prompt as user message
            bootSession.messages.push({
                id: `boot_${Date.now()}`,
                role: 'user',
                content: bootPrompt,
                timestamp: Date.now(),
            });

            // Run through agent loop
            logger.info('Executing BOOT.md through agent...');
            for await (const chunk of this.agentLoop.run(bootSession)) {
                if (chunk.type === 'done') {
                    logger.info('✓ BOOT.md executed successfully');
                    console.log(chalk.green('  ✓ BOOT.md executed'));
                    break;
                }
            }

            // Don't persist boot session - it's temporary
            
        } catch (err) {
            logger.error({ err, path: bootMdPath }, 'Failed to run BOOT.md');
            console.log(chalk.yellow('  ⚠ BOOT.md execution failed'));
        }
    }

    /**
     * Print status summary
     */
    private printStatus(): void {
        const status = {
            providers: this.modelRouter.hasProviders() ? 'configured' : 'none',
            plugins: this.pluginLoader.count,
            cronJobs: cronService.getStatus().jobCount,
            sessions: this.sessionKeyStore.count,
        };

        console.log('\n  📊 Status:');
        console.log(`     • Providers: ${status.providers}`);
        console.log(`     • Plugins: ${status.plugins}`);
        console.log(`     • Cron Jobs: ${status.cronJobs}`);
        console.log(`     • Active Sessions: ${status.sessions}`);
        console.log(`\n  🚀 Talon is ready!\n`);

        logger.info(status, 'Gateway boot complete');
    }

    /**
     * Get gateway status
     */
    getStatus(): {
        booted: boolean;
        plugins: number;
        sessions: number;
        cronJobs: number;
    } {
        return {
            booted: this.isBooted,
            plugins: this.pluginLoader?.count ?? 0,
            sessions: this.sessionKeyStore?.count ?? 0,
            cronJobs: cronService.getStatus().jobCount,
        };
    }
}

// ─── Legacy Boot Function ─────────────────────────────────────────

let gatewayInstance: TalonGateway | null = null;

export async function boot(): Promise<void> {
    if (!gatewayInstance) {
        gatewayInstance = new TalonGateway();
    }
    await gatewayInstance.boot();
}

export function getGateway(): TalonGateway | null {
    return gatewayInstance;
}
