// ─── Context Window Guard ─────────────────────────────────────────
// Prevents the agent from exceeding the LLM's context limit
// Adapted from openclaw - essential for long conversations

import { logger } from '../utils/logger.js';
import { estimateTokens as estimateTextTokens } from '../utils/tokens.js';

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
 * Backward-compatible token estimator export for context-guard consumers.
 */
export const estimateTokens = estimateTextTokens;

/**
 * Estimate tokens in a message array.
 */
export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
    return messages.reduce((total, msg) => {
        // Base tokens per message (role + content structure)
        const baseTokens = 4;
        const contentTokens = estimateTextTokens(msg.content);
        return total + baseTokens + contentTokens;
    }, 0);
}

// ─── Context Window Resolution ────────────────────────────────────

/**
 * Get context window size for a model.
 */
export function resolveContextWindow(modelId: string): number {
    const normalized = modelId.toLowerCase();

    // Sort patterns by length (longest first) to match most specific first.
    // This prevents 'gpt-4o' from matching before 'gpt-4o-mini', or
    // 'deepseek-chat' from matching 'deepseek-chat-v3-0324' incorrectly.
    const sortedEntries = Object.entries(MODEL_CONTEXT_WINDOWS)
        .filter(([key]) => key !== 'default')
        .sort((a, b) => b[0].length - a[0].length);

    for (const [pattern, window] of sortedEntries) {
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
 * 
 * CRITICAL: Tool call/result messages are treated as atomic pairs.
 * An assistant message with tool_calls MUST be kept together with its
 * corresponding tool result messages. Orphaning either causes LLM errors:
 * "messages with role 'tool' must be a response to a preceding message with 'tool_calls'"
 */
export function truncateMessagesToFit<T extends { role: string; content: string; tool_calls?: unknown[] }>(
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

    // Group non-system messages into atomic chunks.
    // An assistant message with tool_calls + its following tool results = one chunk.
    const chunks: T[][] = [];
    let i = 0;
    while (i < nonSystemMessages.length) {
        const msg = nonSystemMessages[i];

        // Check if this is an assistant message with tool_calls
        const hasToolCalls = msg.role === 'assistant' &&
            Array.isArray((msg as any).tool_calls) &&
            (msg as any).tool_calls.length > 0;

        if (hasToolCalls) {
            // Collect this assistant message + all following tool results
            const group: T[] = [msg];
            let j = i + 1;
            while (j < nonSystemMessages.length && nonSystemMessages[j].role === 'tool') {
                group.push(nonSystemMessages[j]);
                j++;
            }
            chunks.push(group);
            i = j;
        } else {
            chunks.push([msg]);
            i++;
        }
    }

    // Keep recent chunks that fit (iterate newest to oldest)
    const keptMessages: T[] = [...systemMessages];
    let currentTokens = systemTokens;

    for (let ci = chunks.length - 1; ci >= 0; ci--) {
        const chunk = chunks[ci];
        const chunkTokens = estimateMessagesTokens(chunk);

        if (currentTokens + chunkTokens <= maxTokens) {
            // Insert at position after system messages to maintain order
            keptMessages.splice(systemMessages.length, 0, ...chunk);
            currentTokens += chunkTokens;
        } else {
            break;
        }
    }

    const dropped = messages.length - keptMessages.length;
    if (dropped > 0) {
        logger.info({ dropped, kept: keptMessages.length, maxTokens }, 'Truncated messages to fit context window');
    }

    return keptMessages;
}
