// ─── Agent Loop State Machine ─────────────────────────────────────
// The core brain: PLAN → DECIDE → EXECUTE → EVALUATE → COMPRESS → RESPOND
// Enhanced with context window guard and model fallback from openclaw

import type { Session, Message } from '../utils/types.js';
import type { EventBus } from '../gateway/events.js';
import type { ModelRouter } from './router.js';
import type { MemoryManager } from '../memory/manager.js';
import type { MemoryCompressor } from '../memory/compressor.js';
import type { LLMTool, LLMResponse, LLMStreamChunk } from './providers/openai-compatible.js';
import { FallbackRouter, type FallbackAttempt } from './fallback.js';
import { evaluateContextWindow, logContextWindowStatus, truncateMessagesToFit } from './context-guard.js';
import { LlmTaskRouter, type TaskType } from '../llm/router.js';
import { LlmCallLogger } from '../llm/call-logger.js';
import { logger } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────

export type LoopState =
    | 'idle'
    | 'thinking'     // Building context, deciding approach
    | 'executing'    // Making LLM call (possibly with tools)
    | 'evaluating'   // Checking if result is complete
    | 'compressing'  // Memory compression
    | 'responding'   // Sending final response
    | 'error';

// Valid state transitions — prevents invalid jumps
const ALLOWED_TRANSITIONS: Record<LoopState, LoopState[]> = {
    'idle': ['thinking'],
    'thinking': ['executing', 'compressing', 'error'],
    'executing': ['evaluating', 'error'],
    'evaluating': ['responding', 'executing', 'thinking', 'error'],
    'compressing': ['thinking', 'error'],
    'responding': ['idle'],
    'error': ['idle'],
};

export interface AgentChunk {
    type: 'thinking' | 'text' | 'tool_call' | 'tool_result' | 'done' | 'error';
    content?: string;
    toolCall?: { id: string; name: string; args: Record<string, unknown> };
    toolResult?: { id: string; output: string; success: boolean };
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    providerId?: string;
    model?: string;
    iteration?: number;
}

interface ToolHandler {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>, session?: Session) => Promise<string>;
}

// ─── Agent Loop ───────────────────────────────────────────────────

export class AgentLoop {
    private state: LoopState = 'idle';
    private tools = new Map<string, ToolHandler>();
    private maxIterations: number;
    private fallbackRouter: FallbackRouter;
    private sessionId: string | null = null;
    private llmCallLogger = new LlmCallLogger();


    // Rate limiting for tool calls
    private lastToolCallTime = 0;
    private minToolCallInterval = 500; // Minimum 500ms between tool calls

    constructor(
        private modelRouter: ModelRouter,
        private memoryManager: MemoryManager,
        private memoryCompressor: MemoryCompressor,
        private eventBus: EventBus,
        options?: { maxIterations?: number; fallbackRouter?: FallbackRouter },
    ) {
        this.maxIterations = options?.maxIterations ?? 10;
        this.fallbackRouter = options?.fallbackRouter ?? new FallbackRouter();
    }

    /**
     * Transition to a new state with validation.
     * Logs a warning if the transition is unexpected.
     */
    private transition(to: LoopState): void {
        if (!ALLOWED_TRANSITIONS[this.state]?.includes(to)) {
            logger.warn({ from: this.state, to }, 'Unexpected state transition');
        }
        this.state = to;
    }

    /**
     * Register providers for fallback routing.
     */
    registerFallbackProviders(): void {
        // Get all available providers from router
        const providers = this.modelRouter.getAllProviders?.() || [];

        for (const provider of providers) {
            this.fallbackRouter.registerProvider({
                id: provider.id,
                provider: provider.provider,
                model: provider.model,
                priority: this.getProviderPriority(provider.id),
            });
        }
    }

    /**
     * Get all registered tools.
     */
    getRegisteredTools(): ToolHandler[] {
        return Array.from(this.tools.values());
    }

    /**
     * Execute a tool directly.
     */
    async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }
        const { normalizeToolExecution } = await import('../tools/normalize.js');
        return await normalizeToolExecution(toolName, tool.execute.bind(tool), args);
    }

    /**
     * Execute a tool directly with a session context.
     */
    async executeToolWithSession(
        toolName: string,
        args: Record<string, unknown>,
        session: Session,
    ): Promise<string> {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }
        const { normalizeToolExecution } = await import('../tools/normalize.js');
        return await normalizeToolExecution(
            toolName,
            (toolArgs) => tool.execute(toolArgs, session),
            args,
        );
    }

    /**
     * Assign priority to providers (lower = higher priority).
     */
    private getProviderPriority(providerId: string): number {
        // Prioritize by cost/reliability for personal use
        const priorities: Record<string, number> = {
            'deepseek': 1,      // Cheapest
            'openrouter': 2,    // Good fallback
            'openai': 3,        // Reliable but expensive
            'anthropic': 4,     // Best quality
        };
        return priorities[providerId] ?? 5;
    }

    // ─── Tool Registration ──────────────────────────────────────

    registerTool(tool: ToolHandler): void {
        this.tools.set(tool.name, tool);
        logger.info({ tool: tool.name }, 'Tool registered');
    }

    getToolDefinitions(): LLMTool[] {
        return Array.from(this.tools.values()).map(t => ({
            type: 'function' as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));
    }

    // ─── Main Loop ──────────────────────────────────────────────

    /**
     * Run the agent loop for a user message.
     * Yields AgentChunks as the agent thinks, calls tools, and responds.
     */
    async *run(session: Session): AsyncIterable<AgentChunk> {
        this.transition('thinking');
        this.sessionId = session.id;
        this.eventBus.emit('agent.thinking', { sessionId: session.id });

        // Check if we need memory compression first
        if (this.memoryManager.needsCompression(session)) {
            yield* this.compressMemory(session);
        }

        // Route provider/model based on the latest user task type
        const taskType = this.detectTaskType(session);
        const route = this.modelRouter.getProviderForTaskType(taskType) ?? this.modelRouter.getDefaultProvider();
        if (!route) {
            this.transition('error');
            yield {
                type: 'error',
                content: 'No LLM provider configured. Run `talon setup` to configure one.',
            };
            return;
        }

        // Set available tools for the system prompt
        this.memoryManager.setAvailableTools(
            Array.from(this.tools.values()).map(t => `${t.name}: ${t.description}`),
        );

        let iteration = 0;
        let usedProviderId = route.providerId;
        let usedModel = route.model;
        let pendingToolResults: Array<{ name: string; output: string; success: boolean }> = [];

        while (iteration < this.maxIterations) {
            iteration++;
            this.transition('executing');

            logger.info({
                sessionId: session.id,
                iteration,
                taskType,
                provider: route.providerId,
                model: route.model,
            }, 'Agent loop iteration');

            yield { type: 'thinking', content: `Iteration ${iteration}...`, iteration };

            // Build context (Memory Manager controls what the LLM sees)
            let context = this.memoryManager.buildContext(session);

            // Check context window before sending
            const contextStatus = evaluateContextWindow({
                modelId: route.model,
                messages: context,
            });
            logContextWindowStatus(contextStatus);

            // Truncate if needed to fit
            if (contextStatus.shouldBlock) {
                logger.warn('Context window critical — truncating messages');
                context = truncateMessagesToFit(context, contextStatus.contextWindow * 0.8);

                // Also trigger compression for next iteration
                if (!this.memoryManager.needsCompression(session)) {
                    this.memoryManager.markForCompression?.(session);
                }
            }

            // Make LLM call with fallback support + timeout to prevent hanging
            let response: LLMResponse;
            let llmLatencyMs = 0;

            // Reset to default provider for this iteration
            usedProviderId = route.providerId;
            usedModel = route.model;

            // Helper: race the LLM call against a timeout
            const LLM_TIMEOUT_MS = 90_000; // 90 seconds max per LLM call
            const llmCallWithTimeout = async (): Promise<LLMResponse> => {
                let timeoutId: NodeJS.Timeout;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(
                        `LLM call timed out after ${LLM_TIMEOUT_MS / 1000}s — the AI provider may be overloaded`
                    )), LLM_TIMEOUT_MS);
                });

                const llmPromise = (async () => {
                    if (this.fallbackRouter.hasProviders()) {
                        const failedProviders: string[] = [];

                        const fallbackResult = await this.fallbackRouter.executeWithFallback({
                            messages: context,
                            tools: this.tools.size > 0 ? this.getToolDefinitions() : undefined,
                            preferredProviderId: route.providerId,
                            onAttempt: (attempt: FallbackAttempt) => {
                                if (!attempt.success) {
                                    failedProviders.push(attempt.providerId);
                                }
                            },
                        });

                        // Report any fallbacks that were used
                        if (failedProviders.length > 0) {
                            // Note: can't yield from inside async function, log instead
                            logger.info({ failedProviders }, 'Some providers failed, used fallback');
                        }

                        usedProviderId = fallbackResult.providerId;
                        usedModel = fallbackResult.model;

                        if (fallbackResult.attempts.length > 1) {
                            logger.info({
                                attempts: fallbackResult.attempts.length,
                                successfulProvider: usedProviderId,
                                totalLatencyMs: fallbackResult.totalLatencyMs,
                            }, 'Fallback succeeded');
                        }

                        return fallbackResult.response;
                    } else {
                        return await route.provider.chat(context, {
                            model: route.model,
                            tools: this.tools.size > 0 ? this.getToolDefinitions() : undefined,
                        });
                    }
                })();

                return Promise.race([
                    llmPromise.finally(() => clearTimeout(timeoutId)),
                    timeoutPromise,
                ]);
            };

            try {
                const llmStart = Date.now();
                response = await llmCallWithTimeout();
                llmLatencyMs = Date.now() - llmStart;
            } catch (err) {
                this.transition('error');
                const message = err instanceof Error ? err.message : String(err);
                logger.error({ err, iteration }, 'All LLM providers failed');
                await this.llmCallLogger.log({
                    provider: usedProviderId,
                    model: usedModel,
                    latencyMs: llmLatencyMs,
                    taskType,
                    ok: false,
                    error: message,
                });

                // If we have pending tool results, surface them to the user
                // so they can see what the tools returned before the LLM crashed
                if (pendingToolResults.length > 0) {
                    const toolSummary = pendingToolResults
                        .map(tr => `**${tr.name}**: ${tr.success ? tr.output : `Error: ${tr.output}`}`)
                        .join('\n\n');

                    // Add as assistant message so user sees the tool outputs
                    const toolSummaryMsg = `Here are the tool results I gathered before the error:\n\n${toolSummary}`;
                    session.messages.push({
                        id: `msg_${Date.now().toString(36)}_toolsummary`,
                        role: 'assistant',
                        content: toolSummaryMsg,
                        timestamp: Date.now(),
                    });

                    yield {
                        type: 'text',
                        content: toolSummaryMsg,
                        iteration,
                    };

                    pendingToolResults = [];
                }

                yield {
                    type: 'error',
                    content: `LLM error: ${message}\n\nAll providers failed. Please check your API keys and try again.`
                };
                return;
            }

            // Log usage with actual provider used (debug level to avoid cluttering console)
            if (response.usage) {
                logger.debug({
                    iteration,
                    provider: usedProviderId,
                    model: usedModel,
                    promptTokens: response.usage.promptTokens,
                    completionTokens: response.usage.completionTokens,
                    totalTokens: response.usage.totalTokens,
                }, 'LLM usage');
            }

            await this.llmCallLogger.log({
                provider: usedProviderId,
                model: usedModel,
                latencyMs: llmLatencyMs,
                usage: response.usage,
                taskType,
                ok: true,
            });

            // Emit model used event
            if (this.sessionId) {
                this.eventBus.emit('agent.model.used', {
                    sessionId: this.sessionId,
                    provider: usedProviderId,
                    model: usedModel,
                    iteration,
                });
            }

            // ─── Handle Tool Calls ────────────────────────────────

            if (response.toolCalls.length > 0) {
                // Add assistant message with tool calls to history
                const assistantMsg: Message = {
                    id: `msg_${Date.now().toString(36)}_${iteration}`,
                    role: 'assistant',
                    content: response.content ?? '',
                    toolCalls: response.toolCalls.map(tc => ({
                        id: tc.id,
                        tool: tc.name,
                        args: tc.args,
                    })),
                    timestamp: Date.now(),
                };
                session.messages.push(assistantMsg);

                // Execute each tool call
                for (const tc of response.toolCalls) {
                    yield {
                        type: 'tool_call',
                        toolCall: { id: tc.id, name: tc.name, args: tc.args },
                        iteration,
                    };

                    // Rate limiting: enforce minimum delay between tool calls
                    const now = Date.now();
                    const timeSinceLastCall = now - this.lastToolCallTime;
                    if (timeSinceLastCall < this.minToolCallInterval) {
                        const delay = this.minToolCallInterval - timeSinceLastCall;
                        logger.debug({ tool: tc.name, delay }, 'Rate limiting tool execution');
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    this.lastToolCallTime = Date.now();

                    const toolHandler = this.tools.get(tc.name);
                    let output: string;
                    let success: boolean;

                    if (toolHandler) {
                        try {
                            this.eventBus.emit('tool.execute', {
                                sessionId: session.id,
                                tool: tc.name,
                                args: tc.args,
                            });

                            output = await toolHandler.execute(tc.args, session);
                            success = true;

                            this.eventBus.emit('tool.complete', {
                                sessionId: session.id,
                                tool: tc.name,
                                result: {
                                    success: true,
                                    output,
                                    metadata: { executionTime: 0 },
                                },
                            });
                        } catch (err) {
                            // Preserve full error context for debugging
                            const errorDetails = err instanceof Error
                                ? {
                                    message: err.message,
                                    stack: err.stack,
                                    name: err.name,
                                }
                                : { error: err };

                            logger.error({
                                tool: tc.name,
                                args: tc.args,
                                error: errorDetails,
                            }, 'Tool execution failed');

                            output = JSON.stringify({
                                success: false,
                                error: {
                                    code: 'EXECUTION_ERROR',
                                    message: err instanceof Error ? err.message : String(err),
                                    details: errorDetails,
                                },
                            }, null, 2);
                            success = false;
                        }
                    } else {
                        output = `Error: Unknown tool "${tc.name}"`;
                        success = false;
                    }

                    yield {
                        type: 'tool_result',
                        toolResult: { id: tc.id, output, success },
                        iteration,
                    };

                    // Track tool results in case the next LLM call fails
                    pendingToolResults.push({ name: tc.name, output: output.slice(0, 2000), success });

                    // Add tool result to session history
                    const toolMsg: Message = {
                        id: `msg_${Date.now().toString(36)}_tool`,
                        role: 'tool',
                        content: output,
                        toolResults: [{
                            success,
                            output,
                            metadata: {
                                executionTime: 0,
                                confirmation: tc.id,
                            },
                        }],
                        timestamp: Date.now(),
                    };
                    session.messages.push(toolMsg);
                }

                // Continue loop — let the LLM see tool results and decide next action
                continue;
            }

            // ─── No Tool Calls → Final Response ───────────────────

            this.transition('evaluating');

            // If the LLM returned empty content but we had tool results,
            // DO NOT synthesize from tool results - this creates ugly output.
            // Instead, let the renderer handle it with a clean message.
            let finalContent = response.content;
            if (!finalContent && pendingToolResults.length > 0) {
                logger.warn({ iteration, toolCount: pendingToolResults.length },
                    'LLM returned empty content after tool calls — NOT synthesizing (clean UX)');

                // Clear pending results without showing them
                pendingToolResults = [];

                // Return empty - renderer will show helpful message
                finalContent = '';
            }

            pendingToolResults = []; // Clear after use

            if (finalContent) {
                // Add assistant response to session history
                session.messages.push({
                    id: `msg_${Date.now().toString(36)}_resp`,
                    role: 'assistant',
                    content: finalContent,
                    timestamp: Date.now(),
                });

                session.metadata.messageCount++;

                // Stream the response
                yield {
                    type: 'text',
                    content: finalContent,
                    iteration,
                };
            }

            // Done!
            this.transition('responding');
            yield {
                type: 'done',
                usage: response.usage,
                providerId: usedProviderId,
                model: usedModel,
                iteration,
            };

            this.transition('idle');
            return;
        }

        // Max iterations reached
        this.transition('idle');
        logger.warn({
            sessionId: session.id,
            maxIterations: this.maxIterations,
        }, 'Max iterations reached');

        // Surface any pending tool results before the max-iterations message
        let maxIterMessage = 'I reached my maximum iteration limit. Here\'s what I have so far — let me know if you\'d like me to continue.';
        if (pendingToolResults.length > 0) {
            const toolSummary = pendingToolResults
                .map(tr => tr.success ? `**${tr.name}:**\n${tr.output}` : `**${tr.name}:** ⚠️ ${tr.output}`)
                .join('\n\n');
            maxIterMessage = `${toolSummary}\n\n---\n${maxIterMessage}`;

            // Save to session
            session.messages.push({
                id: `msg_${Date.now().toString(36)}_maxiter`,
                role: 'assistant',
                content: maxIterMessage,
                timestamp: Date.now(),
            });
        }

        yield {
            type: 'text',
            content: maxIterMessage,
            iteration,
        };
        yield { type: 'done', providerId: usedProviderId, model: usedModel, iteration };
    }

    // ─── Memory Compression ─────────────────────────────────────

    private async *compressMemory(session: Session): AsyncIterable<AgentChunk> {
        this.transition('compressing');

        logger.info({ sessionId: session.id }, 'Starting memory compression');

        try {
            const messagesToCompress = this.memoryManager.getMessagesForCompression(session);

            if (messagesToCompress.length === 0) return;

            const formatted = this.memoryManager.formatMessagesForCompression(messagesToCompress);

            const newSummary = await this.memoryCompressor.compress(
                session.memorySummary,
                messagesToCompress,
                () => formatted,
            );

            this.memoryManager.applyCompression(session, newSummary);

            yield {
                type: 'thinking',
                content: `Compressed ${messagesToCompress.length} old messages into memory summary`,
            };
        } catch (err) {
            logger.error({ err, sessionId: session.id }, 'Memory compression failed — continuing without compression');
            yield {
                type: 'thinking',
                content: 'Memory compression skipped (will retry later)',
            };
        }
    }

    // ─── State ──────────────────────────────────────────────────

    getState(): LoopState {
        return this.state;
    }

    private detectTaskType(session: Session): TaskType {
        const lastUserMessage = [...session.messages].reverse().find(message => message.role === 'user');
        if (!lastUserMessage) {
            return 'plan';
        }

        return LlmTaskRouter.inferTaskType({
            channel: lastUserMessage.channel,
            text: lastUserMessage.content,
        });
    }
}
