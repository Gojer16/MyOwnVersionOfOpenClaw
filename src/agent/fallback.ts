// ─── Model Fallback System ────────────────────────────────────────
// When a provider fails, automatically retry with fallback providers
// Adapted from openclaw - essential for reliability

import { logger } from '../utils/logger.js';
import type { OpenAICompatibleProvider, LLMResponse, LLMMessage, LLMTool } from './providers/openai-compatible.js';

// ─── Types ────────────────────────────────────────────────────────

export interface FallbackProvider {
    id: string;
    provider: OpenAICompatibleProvider;
    model: string;
    priority: number; // Lower = higher priority
}

export interface FallbackAttempt {
    providerId: string;
    model: string;
    success: boolean;
    error?: string;
    latencyMs: number;
}

export interface FallbackResult {
    response: LLMResponse;
    providerId: string;
    model: string;
    attempts: FallbackAttempt[];
    totalLatencyMs: number;
}

export interface FallbackError {
    type: 'auth' | 'rate-limit' | 'timeout' | 'context-overflow' | 'billing' | 'unknown';
    message: string;
    retryable: boolean;
    providerId: string;
}

// ─── Error Classification ─────────────────────────────────────────

/**
 * Classify an error to determine if we should retry with fallback.
 */
export function classifyError(error: unknown, providerId: string): FallbackError {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();
    
    // Authentication errors - don't retry
    if (lowerMessage.includes('401') || 
        lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('invalid api key') ||
        lowerMessage.includes('authentication')) {
        return {
            type: 'auth',
            message: `Authentication failed for ${providerId}: ${message}`,
            retryable: false,
            providerId,
        };
    }
    
    // Rate limit - retry with fallback
    if (lowerMessage.includes('429') ||
        lowerMessage.includes('rate limit') ||
        lowerMessage.includes('too many requests')) {
        return {
            type: 'rate-limit',
            message: `Rate limited on ${providerId}: ${message}`,
            retryable: true,
            providerId,
        };
    }
    
    // Timeout - retry with fallback
    if (lowerMessage.includes('timeout') ||
        lowerMessage.includes('etimedout') ||
        lowerMessage.includes('econnreset')) {
        return {
            type: 'timeout',
            message: `Timeout on ${providerId}: ${message}`,
            retryable: true,
            providerId,
        };
    }
    
    // Context overflow - retry with compression, not fallback
    if (lowerMessage.includes('context') && 
        (lowerMessage.includes('too long') || lowerMessage.includes('maximum'))) {
        return {
            type: 'context-overflow',
            message: `Context overflow on ${providerId}: ${message}`,
            retryable: false, // Need compression, not fallback
            providerId,
        };
    }
    
    // Billing/quota errors - retry with fallback
    if (lowerMessage.includes('quota') ||
        lowerMessage.includes('billing') ||
        lowerMessage.includes('insufficient') ||
        lowerMessage.includes('exceeded')) {
        return {
            type: 'billing',
            message: `Billing/quota issue on ${providerId}: ${message}`,
            retryable: true,
            providerId,
        };
    }
    
    // Unknown errors - retry with fallback
    return {
        type: 'unknown',
        message: `Error on ${providerId}: ${message}`,
        retryable: true,
        providerId,
    };
}

// ─── Fallback Router ──────────────────────────────────────────────

export class FallbackRouter {
    private providers: FallbackProvider[] = [];
    private maxRetries: number;
    private retryDelayMs: number;

    constructor(options?: { maxRetries?: number; retryDelayMs?: number }) {
        this.maxRetries = options?.maxRetries ?? 2;
        this.retryDelayMs = options?.retryDelayMs ?? 1000;
    }

    /**
     * Register a provider for fallback.
     */
    registerProvider(provider: FallbackProvider): void {
        this.providers.push(provider);
        // Sort by priority (lower number = higher priority)
        this.providers.sort((a, b) => a.priority - b.priority);
        logger.info({ 
            providerId: provider.id, 
            model: provider.model,
            priority: provider.priority 
        }, 'Registered fallback provider');
    }

    /**
     * Execute chat with automatic fallback on failure.
     */
    async executeWithFallback(params: {
        messages: LLMMessage[];
        tools?: LLMTool[];
        preferredProviderId: string;
        onAttempt?: (attempt: FallbackAttempt) => void;
    }): Promise<FallbackResult> {
        const { messages, tools, preferredProviderId, onAttempt } = params;
        
        const attempts: FallbackAttempt[] = [];
        const startTime = Date.now();
        
        // Try providers in priority order, starting with preferred
        const orderedProviders = this.getProviderOrder(preferredProviderId);
        
        for (const providerInfo of orderedProviders) {
            const attemptStart = Date.now();
            
            try {
                logger.debug({ 
                    providerId: providerInfo.id, 
                    model: providerInfo.model 
                }, 'Attempting LLM call');
                
                const response = await providerInfo.provider.chat(messages, {
                    model: providerInfo.model,
                    tools,
                });
                
                const latencyMs = Date.now() - attemptStart;
                const attempt: FallbackAttempt = {
                    providerId: providerInfo.id,
                    model: providerInfo.model,
                    success: true,
                    latencyMs,
                };
                attempts.push(attempt);
                onAttempt?.(attempt);
                
                logger.info({
                    providerId: providerInfo.id,
                    model: providerInfo.model,
                    latencyMs,
                    attemptCount: attempts.length,
                }, 'LLM call succeeded');
                
                return {
                    response,
                    providerId: providerInfo.id,
                    model: providerInfo.model,
                    attempts,
                    totalLatencyMs: Date.now() - startTime,
                };
                
            } catch (error) {
                const latencyMs = Date.now() - attemptStart;
                const classified = classifyError(error, providerInfo.id);
                
                const attempt: FallbackAttempt = {
                    providerId: providerInfo.id,
                    model: providerInfo.model,
                    success: false,
                    error: classified.message,
                    latencyMs,
                };
                attempts.push(attempt);
                onAttempt?.(attempt);
                
                logger.warn({
                    providerId: providerInfo.id,
                    model: providerInfo.model,
                    errorType: classified.type,
                    retryable: classified.retryable,
                    latencyMs,
                }, 'LLM call failed');
                
                // Don't retry if error is not retryable
                if (!classified.retryable) {
                    throw new Error(classified.message);
                }
                
                // Small delay before trying next provider
                if (this.providers.indexOf(providerInfo) < orderedProviders.length - 1) {
                    await this.delay(this.retryDelayMs);
                }
            }
        }
        
        // All providers failed
        const totalLatencyMs = Date.now() - startTime;
        const errorMessage = attempts.map(a => 
            `${a.providerId}: ${a.error || 'unknown error'}`
        ).join('; ');
        
        throw new Error(`All providers failed after ${attempts.length} attempts: ${errorMessage}`);
    }

    /**
     * Get provider order with preferred provider first.
     */
    private getProviderOrder(preferredId: string): FallbackProvider[] {
        const preferred = this.providers.find(p => p.id === preferredId);
        const others = this.providers.filter(p => p.id !== preferredId);
        
        if (preferred) {
            return [preferred, ...others];
        }
        
        return this.providers;
    }

    /**
     * Delay helper.
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if any providers are registered.
     */
    hasProviders(): boolean {
        return this.providers.length > 0;
    }

    /**
     * Get all registered providers.
     */
    getProviders(): FallbackProvider[] {
        return [...this.providers];
    }
}
