// ─── OpenCode Provider (No Auth Header) ──────────────────────────
// Special provider for OpenCode that doesn't send Authorization header
// This is needed because some models (big-pickle) are disabled when auth is sent

import type { LLMMessage, LLMResponse, LLMTool } from './openai-compatible.js';
import { logger } from '../../utils/logger.js';

export class OpenCodeProvider {
    private baseUrl: string;
    private defaultModel: string;

    constructor(model?: string) {
        this.baseUrl = 'https://opencode.ai/zen/v1';
        this.defaultModel = model ?? 'minimax-m2.5-free';
    }

    /**
     * Chat completion without Authorization header
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

        const body = {
            model,
            messages,
            max_tokens: options?.maxTokens ?? 4096,
            temperature: options?.temperature ?? 0.7,
            ...(options?.tools ? { tools: options.tools } : {}),
        };

        // Add timeout to prevent hanging on slow/unresponsive API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // NO Authorization header - this is the key difference
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        } catch (err) {
            clearTimeout(timeoutId);
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`OpenCode API timeout: request took longer than 60 seconds`);
            }
            throw err;
        }
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenCode API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as any;

        // Parse response
        const choice = data.choices?.[0];
        const message = choice?.message;

        return {
            content: message?.content || message?.reasoning_content || '',
            toolCalls: message?.tool_calls?.map((tc: any) => {
                let args: Record<string, unknown> = {};
                try {
                    args = JSON.parse(tc.function.arguments || '{}');
                } catch {
                    logger.warn({ toolName: tc.function?.name }, 'Failed to parse tool call arguments from OpenCode');
                    args = {};
                }
                return {
                    id: tc.id,
                    name: tc.function.name,
                    args,
                };
            }) || [],
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens ?? 0,
                completionTokens: data.usage.completion_tokens ?? 0,
                totalTokens: data.usage.total_tokens ?? 0,
            } : undefined,
            finishReason: choice?.finish_reason || null,
        };
    }

    /**
     * Streaming not implemented for OpenCode (not needed for free tier)
     */
    async *chatStream(): AsyncGenerator<any> {
        throw new Error('Streaming not supported for OpenCode provider');
    }
}

export function createOpenCodeProviderNoAuth(model?: string): OpenCodeProvider {
    return new OpenCodeProvider(model);
}
