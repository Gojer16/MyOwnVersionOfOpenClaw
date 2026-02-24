// ─── Model Router ─────────────────────────────────────────────────
// Selects the cheapest capable model for each task type

import type { TalonConfig } from '../config/schema.js';
import {
    OpenAICompatibleProvider,
    createDeepSeekProvider,
    createOpenRouterProvider,
    createOpenAIProvider,
    createCustomProvider,
    type ProviderConfig,
} from './providers/openai-compatible.js';
import { OpenCodeProvider, createOpenCodeProviderNoAuth } from './providers/opencode.js';
import { LlmTaskRouter, type TaskType } from '../llm/router.js';
import { logger } from '../utils/logger.js';

// ─── Task Complexity Levels ───────────────────────────────────────

export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'summarize';

// ─── Router ───────────────────────────────────────────────────────

export class ModelRouter {
    private providers = new Map<string, OpenAICompatibleProvider | OpenCodeProvider>();
    private defaultModel: string;
    private taskRouter = new LlmTaskRouter();

    constructor(private config: TalonConfig) {
        this.defaultModel = config.agent.model;
        this.initializeProviders();
    }

    /**
     * Initialize provider instances from config.
     */
    private initializeProviders(): void {
        for (const [id, provConfig] of Object.entries(this.config.agent.providers)) {
            const apiKey = provConfig.apiKey
                ?? (id === 'openai' ? process.env.OPENAI_API_KEY : undefined)
                ?? '';

            // OpenCode doesn't require API key and uses special provider
            if (id === 'opencode') {
                const provider = createOpenCodeProviderNoAuth();
                this.providers.set(id, provider);
                logger.info({ provider: id }, 'OpenCode provider initialized (no auth)');
                continue;
            }

            if (!apiKey || apiKey.startsWith('${')) {
                logger.debug({ provider: id }, 'Skipping provider — no API key');
                continue;
            }

            let provider: OpenAICompatibleProvider;

            switch (id) {
                case 'deepseek':
                    provider = createDeepSeekProvider(apiKey);
                    break;
                case 'openrouter':
                    provider = createOpenRouterProvider(apiKey);
                    break;
                case 'openai':
                    provider = createOpenAIProvider(
                        apiKey,
                        provConfig.models?.[0] ?? undefined,
                        provConfig.baseUrl ?? process.env.OPENAI_BASE_URL,
                    );
                    break;
                default:
                    // Custom provider
                    provider = createCustomProvider(
                        apiKey,
                        provConfig.baseUrl ?? 'http://localhost:11434/v1',
                        provConfig.models?.[0] ?? 'llama3.1',
                    );
                    break;
            }

            this.providers.set(id, provider);
            logger.info({ provider: id }, 'Provider initialized');
        }

        if (this.providers.size === 0) {
            logger.warn('No LLM providers configured — agent will not be able to respond');
        }
    }

    /**
     * Get the best provider + model for a given task complexity.
     *
     * Strategy:
     * - simple/summarize → cheapest available (DeepSeek Chat, GPT-4o-mini)
     * - moderate → default model
     * - complex → best available (reasoning models)
     */
    getProviderForTask(complexity: TaskComplexity): {
        provider: OpenAICompatibleProvider | OpenCodeProvider;
        model: string;
        providerId: string;
    } | null {
        const defaultProviderId = this.defaultModel.split('/')[0];
        const defaultModelName = this.defaultModel.split('/').slice(1).join('/') || this.defaultModel;

        // If only one provider, always use it
        if (this.providers.size === 1) {
            const [id, provider] = [...this.providers.entries()][0];
            const models = this.config.agent.providers[id]?.models ?? [];
            const model = this.selectModelByComplexity(id, models, complexity) ?? defaultModelName;

            return { provider, model, providerId: id };
        }

        // Multiple providers — route by complexity
        switch (complexity) {
            case 'simple':
            case 'summarize': {
                // Prefer cheapest: deepseek > openrouter > openai
                const cheapProvider = this.findCheapestProvider();
                if (cheapProvider) {
                    const models = this.config.agent.providers[cheapProvider.id]?.models ?? [];
                    const model = this.selectModelByComplexity(cheapProvider.id, models, complexity);
                    return {
                        provider: cheapProvider.provider,
                        model: model ?? defaultModelName,
                        providerId: cheapProvider.id,
                    };
                }
                break;
            }

            case 'complex': {
                // Use the best available model
                const bestProvider = this.findBestProvider();
                if (bestProvider) {
                    const models = this.config.agent.providers[bestProvider.id]?.models ?? [];
                    const model = this.selectModelByComplexity(bestProvider.id, models, complexity);
                    return {
                        provider: bestProvider.provider,
                        model: model ?? defaultModelName,
                        providerId: bestProvider.id,
                    };
                }
                break;
            }

            case 'moderate':
            default:
                break;
        }

        // Fallback: use default provider
        const defaultProvider = this.providers.get(defaultProviderId);
        if (defaultProvider) {
            return {
                provider: defaultProvider,
                model: defaultModelName,
                providerId: defaultProviderId,
            };
        }

        // Last resort: any provider
        const first = [...this.providers.entries()][0];
        if (first) {
            return {
                provider: first[1],
                model: defaultModelName,
                providerId: first[0],
            };
        }

        return null;
    }

    /**
     * Get the default provider (used for the main agent loop).
     */
    getDefaultProvider(): {
        provider: OpenAICompatibleProvider | OpenCodeProvider;
        model: string;
        providerId: string;
    } | null {
        return this.getProviderForTask('moderate');
    }

    /**
     * Route by explicit task type (plan/code/docs) with Codex-first defaults.
     */
    getProviderForTaskType(taskType: TaskType): {
        provider: OpenAICompatibleProvider | OpenCodeProvider;
        model: string;
        providerId: string;
    } | null {
        const policy = this.taskRouter.chooseRoute(taskType);
        const provider = this.providers.get(policy.provider);

        if (provider) {
            const configuredModels = this.config.agent.providers[policy.provider]?.models ?? [];
            const matchedModel = configuredModels.find(model => model === policy.model || model.includes(policy.model));

            return {
                provider,
                model: matchedModel ?? policy.model,
                providerId: policy.provider,
            };
        }

        logger.debug({ taskType }, 'Task-type route provider unavailable, falling back to default routing');
        return this.getDefaultProvider();
    }

    /**
     * Select the right model from a provider's model list based on complexity.
     */
    private selectModelByComplexity(
        providerId: string,
        models: string[],
        complexity: TaskComplexity,
    ): string | null {
        if (models.length === 0) return null;

        switch (complexity) {
            case 'simple':
            case 'summarize':
                // Pick from known cheap models
                const cheapModels = [
                    'minimax-m2.5-free',
                    'big-pickle',
                    'glm-5-free',
                    'deepseek-chat',
                    'gpt-4o-mini',
                    'deepseek/deepseek-chat-v3-0324',
                ];
                return models.find(m => cheapModels.some(cm => m.includes(cm))) ?? models[0];

            case 'complex':
                // Pick from known reasoning models
                const reasoningModels = ['deepseek-reasoner', 'o3-mini', 'claude-opus', 'gpt-4o'];
                return models.find(m => reasoningModels.some(rm => m.includes(rm))) ?? models[0];

            case 'moderate':
            default:
                return models[0];
        }
    }

    /**
     * Provider cost ranking (cheapest first).
     */
    private findCheapestProvider(): { id: string; provider: OpenAICompatibleProvider | OpenCodeProvider } | null {
        const costOrder = ['opencode', 'deepseek', 'openrouter', 'openai', 'anthropic'];
        for (const id of costOrder) {
            const provider = this.providers.get(id);
            if (provider) return { id, provider };
        }
        // Custom providers as fallback
        const first = [...this.providers.entries()][0];
        return first ? { id: first[0], provider: first[1] } : null;
    }

    /**
     * Provider quality ranking (best first).
     */
    private findBestProvider(): { id: string; provider: OpenAICompatibleProvider | OpenCodeProvider } | null {
        const qualityOrder = ['anthropic', 'openai', 'openrouter', 'deepseek', 'opencode'];
        for (const id of qualityOrder) {
            const provider = this.providers.get(id);
            if (provider) return { id, provider };
        }
        const first = [...this.providers.entries()][0];
        return first ? { id: first[0], provider: first[1] } : null;
    }

    /**
     * Check if any provider is available.
     */
    hasProviders(): boolean {
        return this.providers.size > 0;
    }

    /**
     * Get all providers for fallback routing.
     */
    getAllProviders(): Array<{ id: string; provider: OpenAICompatibleProvider | OpenCodeProvider; model: string }> {
        const result: Array<{ id: string; provider: OpenAICompatibleProvider | OpenCodeProvider; model: string }> = [];

        for (const [id, provider] of this.providers.entries()) {
            const models = this.config.agent.providers[id]?.models ?? [];
            const model = models[0] ?? 'unknown';
            result.push({ id, provider, model });
        }

        return result;
    }
}
