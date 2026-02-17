// ─── Context Window Guard ─────────────────────────────────────────
// Prevents the agent from exceeding the LLM's context limit
// Adapted from openclaw - essential for long conversations

import { logger } from '../utils/logger.js';

// ─── Constants ────────────────────────────────────────────────────

export const CONTEXT_WINDOW_HARD_MIN = 16_000;   // Block if below this
export const CONTEXT_WINDOW_WARN_BELOW = 32_000; // Warn if below this
export const DEFAULT_CONTEXT_WINDOW = 128_000;   // Default for most models

// Known model context windows
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    // OpenAI
    'gpt-4o': 128_000,
    'gpt-4o-mini': 128_000,
    'o3-mini': 200_000,
    'o1': 200_000,
    // Anthropic
    'claude-3-opus': 200_000,
    'claude-3-sonnet': 200_000,
    'claude-3-haiku': 200_000,
    // DeepSeek
    'deepseek-chat': 64_000,
    'deepseek-reasoner': 64_000,
    // Default
    'default': 128_000,
};

// ─── Types ────────────────────────────────────────────────────────

export interface ContextWindowStatus {
    contextWindow: number;
    usedTokens: number;
    remainingTokens: number;
    usagePercent: number;
    shouldWarn: boolean;
    shouldBlock: boolean;
}

// ─── Token Estimation ─────────────────────────────────────────────

/**
 * Estimate tokens in a string (~4 chars per token for English).
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens in a message array.
 */
export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
    return messages.reduce((total, msg) => {
        // Base tokens per message (role + content structure)
        const baseTokens = 4;
        const contentTokens = estimateTokens(msg.content);
        return total + baseTokens + contentTokens;
    }, 0);
}

// ─── Context Window Resolution ────────────────────────────────────

/**
 * Get context window size for a model.
 */
export function resolveContextWindow(modelId: string): number {
    const normalized = modelId.toLowerCase();
    
    // Check for exact match or partial match
    for (const [pattern, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
        if (normalized.includes(pattern.toLowerCase())) {
            return window;
        }
    }
    
    return MODEL_CONTEXT_WINDOWS.default;
}

// ─── Guard Evaluation ─────────────────────────────────────────────

/**
 * Evaluate context window status and return warnings/block signals.
 */
export function evaluateContextWindow(params: {
    modelId: string;
    messages: Array<{ role: string; content: string }>;
    reserveTokens?: number; // Reserve tokens for response
}): ContextWindowStatus {
    const { modelId, messages, reserveTokens = 4000 } = params;
    
    const contextWindow = resolveContextWindow(modelId);
    const usedTokens = estimateMessagesTokens(messages);
    const remainingTokens = contextWindow - usedTokens - reserveTokens;
    const usagePercent = (usedTokens / contextWindow) * 100;
    
    const shouldWarn = remainingTokens < CONTEXT_WINDOW_WARN_BELOW;
    const shouldBlock = remainingTokens < CONTEXT_WINDOW_HARD_MIN;
    
    return {
        contextWindow,
        usedTokens,
        remainingTokens,
        usagePercent,
        shouldWarn,
        shouldBlock,
    };
}

/**
 * Log context window status for debugging.
 */
export function logContextWindowStatus(status: ContextWindowStatus): void {
    if (status.shouldBlock) {
        logger.error({
            usedTokens: status.usedTokens,
            contextWindow: status.contextWindow,
            remaining: status.remainingTokens,
            percent: `${status.usagePercent.toFixed(1)}%`,
        }, 'Context window critical — need compression');
    } else if (status.shouldWarn) {
        logger.warn({
            usedTokens: status.usedTokens,
            contextWindow: status.contextWindow,
            remaining: status.remainingTokens,
            percent: `${status.usagePercent.toFixed(1)}%`,
        }, 'Context window running low');
    } else {
        logger.debug({
            usedTokens: status.usedTokens,
            contextWindow: status.contextWindow,
            remaining: status.remainingTokens,
            percent: `${status.usagePercent.toFixed(1)}%`,
        }, 'Context window OK');
    }
}

// ─── Truncation Helpers ───────────────────────────────────────────

/**
 * Truncate messages to fit within token budget.
 * Keeps system messages and recent messages, removes oldest.
 */
export function truncateMessagesToFit<T extends { role: string; content: string }>(
    messages: T[],
    maxTokens: number,
): T[] {
    const estimated = estimateMessagesTokens(messages);

    if (estimated <= maxTokens) {
        return messages;
    }

    // Keep system messages and most recent, drop oldest non-system
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const systemTokens = estimateMessagesTokens(systemMessages);

    // Keep recent messages that fit
    const keptMessages: T[] = [...systemMessages];
    let currentTokens = systemTokens;

    // Iterate from newest to oldest
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
        const msg = nonSystemMessages[i];
        const msgTokens = estimateMessagesTokens([msg]);

        if (currentTokens + msgTokens <= maxTokens) {
            keptMessages.unshift(msg); // Add to front to maintain order
            currentTokens += msgTokens;
        } else {
            break;
        }
    }

    return keptMessages;
}
