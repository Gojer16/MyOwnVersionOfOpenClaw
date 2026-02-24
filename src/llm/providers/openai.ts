import OpenAI from 'openai';
import type {
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions.js';
import type { LlmProvider, LlmGenerateInput, LlmGenerateOutput } from '../types.js';

interface OpenAILlmProviderOptions {
    apiKey?: string;
    baseUrl?: string;
    timeoutMs?: number;
    maxRetries?: number;
}

interface MappedProviderError {
    message: string;
    retryable: boolean;
}

export class OpenAILlmProvider implements LlmProvider {
    name = 'openai';
    private client: OpenAI;
    private timeoutMs: number;
    private maxRetries: number;

    constructor(options?: OpenAILlmProviderOptions) {
        const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
        const baseURL = options?.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

        this.client = new OpenAI({
            apiKey: apiKey || 'sk-placeholder',
            baseURL,
        });
        this.timeoutMs = options?.timeoutMs ?? 90_000;
        this.maxRetries = options?.maxRetries ?? 2;
    }

    async generate(input: LlmGenerateInput): Promise<LlmGenerateOutput> {
        let attempt = 0;
        let lastError: unknown;

        while (attempt <= this.maxRetries) {
            try {
                const toolChoice = input.toolChoice
                    ? (input.toolChoice as unknown as ChatCompletionToolChoiceOption)
                    : undefined;

                const response = await this.client.chat.completions.create({
                    model: input.model,
                    messages: input.messages as ChatCompletionMessageParam[],
                    max_tokens: input.maxTokens ?? 4096,
                    temperature: input.temperature ?? 0.7,
                    ...(input.tools ? { tools: input.tools as ChatCompletionTool[] } : {}),
                    ...(toolChoice ? { tool_choice: toolChoice } : {}),
                }, {
                    timeout: this.timeoutMs,
                });

                const choice = response.choices[0];
                const toolCalls = (choice?.message?.tool_calls ?? [])
                    .filter((toolCall): toolCall is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
                        toolCall.type === 'function',
                    )
                    .map(tc => ({
                        id: tc.id,
                        type: tc.type,
                        function: {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    }));

                for (const toolCall of toolCalls) {
                    try {
                        JSON.parse(toolCall.function.arguments || '{}');
                    } catch {
                        throw new Error(`Malformed JSON in tool call arguments for "${toolCall.function.name}"`);
                    }
                }

                return {
                    output: choice?.message?.content ?? '',
                    toolCalls,
                    usage: response.usage ? {
                        promptTokens: response.usage.prompt_tokens ?? 0,
                        completionTokens: response.usage.completion_tokens ?? 0,
                        totalTokens: response.usage.total_tokens ?? 0,
                    } : undefined,
                };
            } catch (error) {
                lastError = error;
                const mapped = this.mapError(error);
                if (!mapped.retryable || attempt >= this.maxRetries) {
                    throw new Error(mapped.message);
                }
                await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 400));
            }

            attempt++;
        }

        throw new Error(lastError instanceof Error ? lastError.message : 'Unknown OpenAI error');
    }

    private mapError(error: unknown): MappedProviderError {
        const anyErr = error as { status?: number; message?: string; code?: string; name?: string };
        const status = anyErr?.status;
        const message = anyErr?.message ?? 'Unknown error';
        const lower = message.toLowerCase();

        if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
            return { message: `OpenAI rate limit (429): ${message}`, retryable: true };
        }

        if (typeof status === 'number' && status >= 500) {
            return { message: `OpenAI server error (${status}): ${message}`, retryable: true };
        }

        if (lower.includes('malformed json') || lower.includes('unexpected token')) {
            return { message: `OpenAI malformed JSON response: ${message}`, retryable: true };
        }

        if (lower.includes('timeout') || anyErr?.name === 'AbortError' || anyErr?.code === 'ETIMEDOUT') {
            return { message: `OpenAI timeout: ${message}`, retryable: true };
        }

        if (status === 401 || status === 403 || lower.includes('api key') || lower.includes('unauthorized')) {
            return { message: `OpenAI authentication error: ${message}`, retryable: false };
        }

        return { message: `OpenAI error: ${message}`, retryable: false };
    }
}
