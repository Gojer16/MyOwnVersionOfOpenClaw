#!/usr/bin/env node

// ─── Talon Entry Point ────────────────────────────────────────────
// Boots the Gateway + Agent Brain: config → event bus → sessions → agent → server

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigReloader } from '../config/index.js';
import { EventBus } from './events.js';
import { SessionManager } from './sessions.js';
import { MessageRouter } from './router.js';
import { TalonServer } from './server.js';
import { ModelRouter } from '../agent/router.js';
import { AgentLoop } from '../agent/loop.js';
import { MemoryManager } from '../memory/manager.js';
import { MemoryCompressor } from '../memory/compressor.js';
import { registerAllTools } from '../tools/registry.js';
import { CliChannel } from '../channels/cli/index.js';
import { TelegramChannel } from '../channels/telegram/index.js';
import { WhatsAppChannel } from '../channels/whatsapp/index.js';
import { registerGateway, unregisterGateway } from './process-manager.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_TEMPLATE = path.resolve(__dirname, '../../templates/workspace');

// ─── Banner ───────────────────────────────────────────────────────

function printBanner(): void {
    console.log(`
  ╔══════════════════════════════════════╗
  ║                                      ║
  ║   🦅  T A L O N   v0.3.3            ║
  ║                                      ║
  ║   Personal AI Assistant              ║
  ║   Inspired by OpenClaw               ║
  ║                                      ║
  ╚══════════════════════════════════════╝
  `);
}

// ─── Boot ─────────────────────────────────────────────────────────

let isBooted = false;

async function boot(): Promise<void> {
    if (isBooted) {
        logger.warn('Gateway already booted, ignoring duplicate boot() call');
        return;
    }
    isBooted = true;

    printBanner();

    // 1. Load configuration
    logger.info('Loading configuration...');
    const config = await loadConfig(WORKSPACE_TEMPLATE);

    // 2. Create core subsystems
    const eventBus = new EventBus();
    const sessionManager = new SessionManager(config, eventBus);
    const router = new MessageRouter(sessionManager, eventBus);

    // 3. Create agent brain
    const modelRouter = new ModelRouter(config);
    const memoryManager = new MemoryManager({
        workspaceRoot: config.workspace.root,
        maxContextTokens: 6000,
        maxSummaryTokens: 800,
        keepRecentMessages: config.memory.compaction.keepRecentMessages,
    });
    const memoryCompressor = new MemoryCompressor(modelRouter);
    const agentLoop = new AgentLoop(modelRouter, memoryManager, memoryCompressor, eventBus, {
        maxIterations: config.agent.maxIterations,
    });

    // Register fallback providers for reliability
    agentLoop.registerFallbackProviders();

    // Register tools
    registerAllTools(agentLoop, config);

    // 4. Create server (with agent loop reference)
    const server = new TalonServer(config, eventBus, sessionManager, router, agentLoop);

    // Register gateway process
    registerGateway('0.3.3');

    // 5. Wire: inbound messages → agent loop
    eventBus.on('message.inbound', async ({ message, sessionId }) => {
        const session = sessionManager.getSession(sessionId);
        if (!session) {
            logger.warn({ sessionId }, 'Session not found for inbound message');
            return;
        }

        // Only log if not CLI (CLI shows its own logs)
        if (message.channel !== 'cli') {
            logger.info({ sessionId, sender: message.senderName }, 'Running agent loop');
        }

        try {
            let responseEmitted = false;

            for await (const chunk of agentLoop.run(session)) {
                // Broadcast agent chunks to connected WebSocket clients
                server.broadcastToSession(sessionId, {
                    id: `ws_${Date.now().toString(36)}`,
                    type: chunk.type === 'text' ? 'agent.response'
                        : chunk.type === 'done' ? 'agent.response.end'
                            : chunk.type === 'tool_call' ? 'tool.call'
                                : chunk.type === 'tool_result' ? 'tool.result'
                                    : 'agent.response',
                    timestamp: Date.now(),
                    payload: chunk,
                });

                // Final response → only send when done
                if (chunk.type === 'done') {
                    // Get the last assistant message from session
                    const lastMsg = session.messages.filter(m => m.role === 'assistant').pop();
                    const responseText = lastMsg?.content || 'Done — tools executed successfully.';

                    // Build outbound message with usage metadata
                    const outbound = {
                        sessionId,
                        text: responseText,
                        metadata: {
                            usage: chunk.usage,
                            provider: chunk.providerId,
                            model: chunk.model,
                        },
                    };

                    logger.info({ sessionId, usage: chunk.usage }, 'Emitting message.outbound with usage');
                    eventBus.emit('message.outbound', { message: outbound, sessionId });
                    responseEmitted = true;
                }
            }

            // Safety net: if loop completed without any outbound message, send one
            if (!responseEmitted) {
                logger.warn({ sessionId }, 'Agent loop completed without emitting a response — sending fallback');
                const lastMsg = session.messages.filter(m => m.role === 'assistant').pop();
                const fallbackOutbound = {
                    sessionId,
                    text: lastMsg?.content || 'I finished processing but couldn\'t generate a response. Please try again.',
                    metadata: { error: false },
                };
                eventBus.emit('message.outbound', { message: fallbackOutbound, sessionId });
            }

            // Persist session after agent finishes
            sessionManager.persistSession(session);
        } catch (err) {
            logger.error({ err, sessionId }, 'Agent loop error');

            // Extract a user-friendly error message
            const rawError = err instanceof Error ? err.message : String(err);
            let userMessage: string;

            // Provide helpful error messages based on error type
            if (rawError.includes('tool_calls') && rawError.includes('tool messages')) {
                userMessage = "I'm having trouble with the conversation context. Let me reset and try again. You can type `/reset` to clear the session if this continues.";
            } else if (rawError.includes('billing') || rawError.includes('quota') || rawError.includes('insufficient')) {
                userMessage = "It looks like there's an issue with your API key or quota. Please check your API key and try again.";
            } else if (rawError.includes('429') || rawError.includes('rate limit')) {
                userMessage = "I'm being rate limited. Please wait a moment and try again.";
            } else if (rawError.includes('timeout') || rawError.includes('ETIMEDOUT')) {
                userMessage = "The request timed out. The AI provider might be slow. Please try again.";
            } else if (rawError.includes('network') || rawError.includes('ECONNREFUSED')) {
                userMessage = "Network error. Please check your internet connection and try again.";
            } else {
                userMessage = "I'm sorry, something went wrong. Please try again or type `/reset` to start fresh.";
            }

            // Create an outbound error message
            const errorOutbound = {
                sessionId,
                text: userMessage,
                metadata: {
                    error: true,
                    errorDetails: rawError,
                },
            };

            // Emit error message so CLI can display it
            eventBus.emit('message.outbound', { message: errorOutbound, sessionId });

            // Also broadcast to WebSocket clients
            server.broadcastToSession(sessionId, {
                id: `ws_${Date.now().toString(36)}`,
                type: 'error',
                timestamp: Date.now(),
                payload: {
                    error: userMessage,
                    details: rawError,
                    recoverable: true,
                },
            });

            // Persist session even on error (keep conversation history)
            sessionManager.persistSession(session);
        }
    });

    // 6. Start the server
    await server.setup();

    const hasProviders = modelRouter.hasProviders();
    logger.info({
        host: config.gateway.host,
        port: config.gateway.port,
        model: config.agent.model,
        providers: hasProviders ? 'configured' : 'none — run `talon setup`',
    }, 'Talon is ready');

    if (!hasProviders) {
        logger.warn('No LLM providers configured. Run `npm run setup` to configure one.');
    }

    // 6b. Start config hot reload (if enabled)
    const configReloader = new ConfigReloader();
    configReloader.onReload(async (newConfig) => {
        logger.info('Reloading configuration...');
        // For now, just log - full hot reload would reinitialize components
        // This is a placeholder for future component-specific reload
        eventBus.emit('config.reload', { path: 'all' });
    });
    configReloader.start();



    // 7. Start Channels
    const channels: any[] = [];

    // Check if CLI should be disabled (e.g., daemon mode)
    const cliEnabled = config.channels.cli.enabled && process.env.TALON_CLI_ENABLED !== 'false';

    if (cliEnabled) {
        const cli = new CliChannel(config, eventBus, sessionManager, router);
        await cli.start();
        channels.push(cli);
    }

    if (config.channels.telegram.enabled) {
        // Only start if token is present (safety check, though class checks it too)
        if (config.channels.telegram.botToken) {
            const telegram = new TelegramChannel(config, eventBus, sessionManager, router);
            // Don't await start() here because it starts polling loop!
            // Wait, start() for Telegram starts polling loop which is async but returns void?
            // My implementation of start() calls poll() which is async but doesn't await it.
            // So awaiting start() is fine, it just kicks off the loop.
            await telegram.start();
            channels.push(telegram);
            logger.info('Telegram channel started');
        } else {
            logger.warn('Telegram enabled but no bot token in config');
        }
    }

    if (config.channels.whatsapp?.enabled) {
        const whatsapp = new WhatsAppChannel(config, eventBus, sessionManager, router);
        await whatsapp.start();
        channels.push(whatsapp);
        logger.info('WhatsApp channel starting...');
    }

    // 8. Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down...`);

        // Unregister gateway
        unregisterGateway();

        // Stop channels first
        for (const channel of channels) {
            await channel.stop();
        }

        sessionManager.destroy();
        await server.stop();

        logger.info('Goodbye! 🦅');
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('unhandledRejection', (reason) => {
        logger.error({ reason }, 'Unhandled rejection');
    });

    process.on('uncaughtException', (err) => {
        logger.fatal({ err }, 'Uncaught exception — shutting down');
        shutdown('uncaughtException').catch(() => process.exit(1));
    });
}

// ─── Run ──────────────────────────────────────────────────────────

boot().catch((err) => {
    logger.fatal({ err }, 'Failed to start Talon');
    process.exit(1);
});
