export type {
  EmbeddingProvider,
  EmbeddingProviderOptions,
  EmbeddingProviderResult,
} from './base.js';
import type {
  EmbeddingProvider,
  EmbeddingProviderOptions,
  EmbeddingProviderResult,
} from './base.js';
import { OpenRouterEmbeddingProvider } from './openrouter.js';
import { GeminiEmbeddingProvider } from './gemini.js';
import { LocalEmbeddingProvider } from './local.js';
import { logger } from '../../utils/logger.js';

type EmbeddingProviderId = 'openrouter' | 'gemini' | 'local';

const REMOTE_PROVIDERS: EmbeddingProviderId[] = ['openrouter', 'gemini'];

function isMissingApiKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('API key') || message.includes('required');
}

async function createProvider(
  id: EmbeddingProviderId,
  options: EmbeddingProviderOptions,
): Promise<EmbeddingProvider> {
  if (id === 'openrouter') {
    return new OpenRouterEmbeddingProvider({
      apiKey: options.apiKey || process.env.OPENROUTER_API_KEY || '',
      model: options.model || 'openai/text-embedding-3-small',
      baseUrl: options.baseUrl,
    });
  }

  if (id === 'gemini') {
    return new GeminiEmbeddingProvider({
      apiKey: options.apiKey || process.env.GEMINI_API_KEY || '',
      model: options.model,
    });
  }

  if (id === 'local') {
    return await LocalEmbeddingProvider.create({
      modelPath: options.local?.modelPath,
      modelCacheDir: options.local?.modelCacheDir,
    });
  }

  throw new Error(`Unknown provider: ${id}`);
}

/**
 * Create embedding provider with automatic fallback.
 */
export async function createEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<EmbeddingProviderResult> {
  const requestedProvider = options.provider;
  const fallback = options.fallback || 'none';

  // If specific provider requested, try it first
  if (requestedProvider !== 'auto') {
    try {
      const provider = await createProvider(requestedProvider as EmbeddingProviderId, options);
      logger.info({ provider: requestedProvider }, 'Embedding provider created');
      return { provider, requestedProvider };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ provider: requestedProvider, error: message }, 'Provider creation failed');

      // Try fallback if configured
      if (fallback !== 'none' && fallback !== requestedProvider) {
        try {
          const provider = await createProvider(fallback, options);
          logger.info(
            { from: requestedProvider, to: fallback },
            'Fell back to alternative provider',
          );
          return {
            provider,
            requestedProvider,
            fallbackFrom: requestedProvider,
            fallbackReason: message,
          };
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          throw new Error(
            `Both ${requestedProvider} and fallback ${fallback} failed: ${message}, ${fallbackMessage}`,
          );
        }
      }

      throw error;
    }
  }

  // Auto-selection: try local first, then remote providers
  const missingKeyErrors: string[] = [];

  // Try local first (no API key needed)
  try {
    const provider = await createProvider('local', options);
    logger.info('Auto-selected local embedding provider');
    return { provider, requestedProvider: 'auto' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug({ error: message }, 'Local provider not available');
  }

  // Try remote providers (OpenRouter, then Gemini)
  for (const providerId of REMOTE_PROVIDERS) {
    try {
      const provider = await createProvider(providerId, options);
      logger.info({ provider: providerId }, 'Auto-selected embedding provider');
      return { provider, requestedProvider: 'auto' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMissingApiKeyError(err)) {
        missingKeyErrors.push(`${providerId}: ${message}`);
        continue;
      }
      throw err;
    }
  }

  // All providers failed
  throw new Error(
    `No embedding provider available. Missing API keys:\n${missingKeyErrors.join('\n')}`,
  );
}
