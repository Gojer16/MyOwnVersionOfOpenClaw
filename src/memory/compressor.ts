// ─── Memory Compressor ────────────────────────────────────────────
// Uses the cheapest model to summarize old messages into ≤800 token summary

import type { ModelRouter } from '../agent/router.js';
import type { Message } from '../utils/types.js';
import { buildCompressionPrompt } from '../agent/prompts.js';
import { logger } from '../utils/logger.js';

export class MemoryCompressor {
    constructor(private modelRouter: ModelRouter) { }

    /**
     * Compress old messages into a summary using the cheapest model.
     */
    async compress(
        oldSummary: string,
        messages: Message[],
        formatFn: (messages: Message[]) => string,
    ): Promise<string> {
        const route = this.modelRouter.getProviderForTask('summarize');

        if (!route) {
            logger.warn('No provider available for memory compression');
            return oldSummary;
        }

        const formattedMessages = formatFn(messages);
        const prompt = buildCompressionPrompt(oldSummary, formattedMessages);

        logger.debug({
            provider: route.providerId,
            model: route.model,
            messageCount: messages.length,
        }, 'Compressing memory');

        try {
            const response = await route.provider.chat(
                [
                    { role: 'system', content: 'You are a memory compression agent. Return ONLY the updated summary.' },
                    { role: 'user', content: prompt },
                ],
                {
                    model: route.model,
                    maxTokens: 1000, // Summary should be ≤800 tokens, give some margin
                    temperature: 0.3, // Low creativity for factual summarization
                },
            );

            const summary = response.content?.trim() ?? oldSummary;

            logger.debug({
                provider: route.providerId,
                model: route.model,
                inputMessages: messages.length,
                summaryTokens: response.usage?.completionTokens,
                totalCost: response.usage?.totalTokens,
            }, 'Memory compressed');

            return summary;
        } catch (err) {
            logger.error({ err }, 'Memory compression failed — keeping old summary');
            return oldSummary;
        }
    }
}
