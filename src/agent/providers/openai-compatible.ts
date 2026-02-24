// ─── OpenAI-Compatible LLM Provider ──────────────────────────────
// Works with DeepSeek, OpenRouter, OpenAI, and any OpenAI-compatible API
// This single provider covers ~90% of all models

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions.js';
import { logger } from '../../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
    }>;
}

export interface LLMTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface LLMResponse {
    content: string | null;
    toolCalls: Array<{
        id: string;
        name: string;
        args: Record<string, unknown>;
    }>;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    finishReason: string | null;
}

export interface LLMStreamChunk {
    type: 'text' | 'tool_call' | 'done';
    content?: string;
    toolCall?: {
        id: string;
        name: string;
        argsChunk: string;
    };
    usage?: LLMResponse['usage'];
}

export interface ProviderConfig {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    extraHeaders?: Record<string, string>;
    timeoutMs?: number;
    maxRetries?: number;
}

// ─── Provider ─────────────────────────────────────────────────────

export class OpenAICompatibleProvider {
    private client: OpenAI;
    private defaultModel: string;
    private timeoutMs: number;
    private maxRetries: number;

    constructor(config: ProviderConfig) {
        this.client = new OpenAI({
            apiKey: config.apiKey || 'sk-placeholder',
            baseURL: config.baseUrl,
            defaultHeaders: config.extraHeaders,
            dangerouslyAllowBrowser: true, // Allow empty/placeholder keys
        });
        this.defaultModel = config.defaultModel;
        this.timeoutMs = config.timeoutMs ?? 90_000;
        this.maxRetries = config.maxRetries ?? 2;
    }

    /**
     * Non-streaming chat completion.
     */
    async chat(
        messages: LLMMessage[],
        options?: {
            model?: string;
            maxTokens?: number;
            temperature?: number;
            tools?: LLMTool[];
        },
    ): Promise<LLMResponse> {
        const model = options?.model ?? this.defaultModel;

        logger.debug({ model, messageCount: messages.length }, 'LLM chat request');
        let lastError: unknown;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const params: OpenAI.Chat.ChatCompletionCreateParams = {
                    model,
                    messages: messages as ChatCompletionMessageParam[],
                    max_tokens: options?.maxTokens ?? 4096,
                    temperature: options?.temperature ?? 0.7,
                };

                if (options?.tools && options.tools.length > 0) {
                    params.tools = options.tools as ChatCompletionTool[];
                    params.tool_choice = 'auto';
                }

                const response = await this.client.chat.completions.create(params, {
                    timeout: this.timeoutMs,
                });
                const choice = response.choices[0];

                const toolCalls = (choice?.message?.tool_calls ?? [])
                    .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } =>
                        tc.type === 'function',
                    )
                    .map(tc => {
                        let args: Record<string, unknown>;
                        try {
                            args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
                        } catch {
                            throw new Error(`Malformed JSON in tool call arguments for "${tc.function.name}"`);
                        }

                        return {
                            id: tc.id,
                            name: tc.function.name,
                            args,
                        };
                    });

                return {
                    content: choice?.message?.content ?? null,
                    toolCalls,
                    usage: response.usage ? {
                        promptTokens: response.usage.prompt_tokens ?? 0,
                        completionTokens: response.usage.completion_tokens ?? 0,
                        totalTokens: response.usage.total_tokens ?? 0,
                    } : undefined,
                    finishReason: choice?.finish_reason ?? null,
                };
            } catch (error) {
                lastError = error;
                const mapped = this.mapProviderError(error);
                if (!mapped.retryable || attempt >= this.maxRetries) {
                    throw new Error(mapped.message);
                }
                await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 400));
            }
        }

        throw new Error(lastError instanceof Error ? lastError.message : 'Unknown provider error');
    }

    /**
     * Streaming chat completion — yields chunks as they arrive.
     */
    async *chatStream(
        messages: LLMMessage[],
        options?: {
            model?: string;
            maxTokens?: number;
            temperature?: number;
            tools?: LLMTool[];
        },
    ): AsyncIterable<LLMStreamChunk> {
        const model = options?.model ?? this.defaultModel;

        logger.debug({ model, messageCount: messages.length }, 'LLM stream request');

        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            model,
            messages: messages as ChatCompletionMessageParam[],
            max_tokens: options?.maxTokens ?? 4096,
            temperature: options?.temperature ?? 0.7,
            stream: true,
            stream_options: { include_usage: true },
        };

        if (options?.tools && options.tools.length > 0) {
            params.tools = options.tools as ChatCompletionTool[];
            params.tool_choice = 'auto';
        }

        const stream = await this.client.chat.completions.create(params);

        const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta;

            // Text content
            if (delta?.content) {
                yield { type: 'text', content: delta.content };
            }

            // Tool calls (streamed in pieces)
            if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const index = tc.index;
                    if (!toolCallBuffers.has(index)) {
                        toolCallBuffers.set(index, {
                            id: tc.id ?? '',
                            name: tc.function?.name ?? '',
                            args: '',
                        });
                    }

                    const buffer = toolCallBuffers.get(index)!;
                    if (tc.id) buffer.id = tc.id;
                    if (tc.function?.name) buffer.name = tc.function.name;
                    if (tc.function?.arguments) buffer.args += tc.function.arguments;

                    yield {
                        type: 'tool_call',
                        toolCall: {
                            id: buffer.id,
                            name: buffer.name,
                            argsChunk: tc.function?.arguments ?? '',
                        },
                    };
                }
            }

            // Usage info (final chunk)
            if (chunk.usage) {
                yield {
                    type: 'done',
                    usage: {
                        promptTokens: chunk.usage.prompt_tokens,
                        completionTokens: chunk.usage.completion_tokens,
                        totalTokens: chunk.usage.total_tokens,
                    },
                };
            }
        }
    }

    /**
     * Get the complete tool calls after streaming finishes.
     */
    static parseToolCallBuffers(
        buffers: Map<number, { id: string; name: string; args: string }>,
    ): LLMResponse['toolCalls'] {
        return Array.from(buffers.values()).map(b => ({
            id: b.id,
            name: b.name,
            args: JSON.parse(b.args || '{}') as Record<string, unknown>,
        }));
    }

    private mapProviderError(error: unknown): { message: string; retryable: boolean } {
        const anyErr = error as { status?: number; message?: string; code?: string; name?: string };
        const status = anyErr?.status;
        const message = anyErr?.message ?? 'Unknown provider error';
        const lower = message.toLowerCase();

        if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
            return { message: `Rate limit error (429): ${message}`, retryable: true };
        }

        if (typeof status === 'number' && status >= 500) {
            return { message: `Provider server error (${status}): ${message}`, retryable: true };
        }

        if (lower.includes('malformed json') || lower.includes('unexpected token')) {
            return { message: `Malformed JSON response: ${message}`, retryable: true };
        }

        if (lower.includes('timeout') || anyErr?.name === 'AbortError' || anyErr?.code === 'ETIMEDOUT') {
            return { message: `Provider timeout: ${message}`, retryable: true };
        }

        if (status === 401 || status === 403 || lower.includes('unauthorized') || lower.includes('api key')) {
            return { message: `Authentication error: ${message}`, retryable: false };
        }

        return { message: `Provider error: ${message}`, retryable: false };
    }
}

// ─── Factory Functions ────────────────────────────────────────────

export function createOpenCodeProvider(apiKey: string, model?: string): OpenAICompatibleProvider {
    // OpenCode provides free models - use provided API key or placeholder
    // Note: big-pickle model works better without API key
    return new OpenAICompatibleProvider({
        apiKey: apiKey || 'sk-opencode-free-no-key-required',
        baseUrl: 'https://opencode.ai/zen/v1',
        defaultModel: model ?? 'minimax-m2.5-free',
    });
}

export function createDeepSeekProvider(apiKey: string, model?: string): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider({
        apiKey,
        baseUrl: 'https://api.deepseek.com',
        defaultModel: model ?? 'deepseek-chat',
    });
}

export function createOpenRouterProvider(apiKey: string, model?: string): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider({
        apiKey,
        baseUrl: 'https://openrouter.ai/api/v1',
        defaultModel: model ?? 'deepseek/deepseek-chat-v3-0324',
        extraHeaders: {
            'HTTP-Referer': 'https://github.com/talon-ai',
            'X-Title': 'Talon AI Assistant',
        },
    });
}

export function createOpenAIProvider(
    apiKey: string,
    model?: string,
    baseUrl?: string,
): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider({
        apiKey,
        baseUrl: baseUrl ?? 'https://api.openai.com/v1',
        defaultModel: model ?? 'gpt-4o',
    });
}

export function createCustomProvider(
    apiKey: string,
    baseUrl: string,
    model: string,
): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider({
        apiKey,
        baseUrl,
        defaultModel: model,
    });
}
