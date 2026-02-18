# Memory System Upgrade Implementation Plan - Part 3: Embedding Providers

> **For Claude:** This is Part 3 of 6. Focus on Gemini and Local providers with fallback chain.

**Goal:** Implement multiple embedding providers (Gemini, Local) with automatic fallback and provider factory.

---

## Task 4: Embedding Provider Base Interface

**Files:**
- Create: `src/memory/embeddings/base.ts`
- Test: `tests/memory/embeddings/base.test.ts`

### Step 1: Write types

```typescript
// src/memory/embeddings/base.ts
export type EmbeddingProviderId = 'openai' | 'gemini' | 'local';
export type EmbeddingProviderRequest = EmbeddingProviderId | 'auto';
export type EmbeddingProviderFallback = EmbeddingProviderId | 'none';

export interface EmbeddingProvider {
  id: EmbeddingProviderId;
  model: string;
  maxInputTokens?: number;
  embedQuery(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingProviderOptions {
  provider: EmbeddingProviderRequest;
  model?: string;
  fallback: EmbeddingProviderFallback;
  apiKey?: string;
  baseUrl?: string;
  local?: {
    modelPath?: string;
    modelCacheDir?: string;
  };
}

export interface EmbeddingProviderResult {
  provider: EmbeddingProvider;
  requestedProvider: EmbeddingProviderRequest;
  fallbackFrom?: EmbeddingProviderId;
  fallbackReason?: string;
}

/**
 * Sanitize and normalize embedding vector.
 * - Replace NaN/Infinity with 0
 * - L2 normalize for consistent similarity scores
 */
export function normalizeEmbedding(vec: number[]): number[] {
  const sanitized = vec.map((value) => (Number.isFinite(value) ? value : 0));
  const magnitude = Math.sqrt(sanitized.reduce((sum, value) => sum + value * value, 0));

  if (magnitude < 1e-10) {
    return sanitized;
  }

  return sanitized.map((value) => value / magnitude);
}
```

### Step 2: Commit

```bash
git add src/memory/embeddings/base.ts
git commit -m "feat(memory): add embedding provider base interface"
```

---

## Task 5: Gemini Embedding Provider

**Files:**
- Create: `src/memory/embeddings/gemini.ts`
- Test: `tests/memory/embeddings/gemini.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/embeddings/gemini.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiEmbeddingProvider } from '../../src/memory/embeddings/gemini.js';

describe('Gemini Embedding Provider', () => {
  let provider: GeminiEmbeddingProvider;

  beforeEach(() => {
    const apiKey = process.env.GEMINI_API_KEY || 'test-key';
    provider = new GeminiEmbeddingProvider({ apiKey });
  });

  it('should create provider with correct config', () => {
    expect(provider.id).toBe('gemini');
    expect(provider.model).toBe('text-embedding-004');
  });

  it('should embed single query', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.log('Skipping Gemini test (no API key)');
      return;
    }

    const embedding = await provider.embedQuery('Hello world');
    expect(embedding).toBeInstanceOf(Array);
    expect(embedding.length).toBe(768); // Gemini embedding dimensions
    expect(embedding.every((v) => typeof v === 'number')).toBe(true);
  });

  it('should embed batch of texts', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.log('Skipping Gemini test (no API key)');
      return;
    }

    const texts = ['Hello', 'World', 'Test'];
    const embeddings = await provider.embedBatch(texts);
    expect(embeddings).toHaveLength(3);
    expect(embeddings[0]).toHaveLength(768);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/embeddings/gemini.test.ts
```

Expected: FAIL

### Step 3: Install Gemini SDK

```bash
npm install @google/generative-ai
```

### Step 4: Write implementation

```typescript
// src/memory/embeddings/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { EmbeddingProvider } from './base.js';
import { normalizeEmbedding } from './base.js';
import { logger } from '../../utils/logger.js';

export interface GeminiEmbeddingOptions {
  apiKey: string;
  model?: string;
}

const DEFAULT_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'gemini' as const;
  readonly model: string;
  readonly maxInputTokens = 2048;

  private client: GoogleGenerativeAI;

  constructor(options: GeminiEmbeddingOptions) {
    this.model = options.model || DEFAULT_MODEL;
    this.client = new GoogleGenerativeAI(options.apiKey);
  }

  async embedQuery(text: string): Promise<number[]> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      const result = await model.embedContent(text);
      const embedding = result.embedding.values;

      if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Invalid embedding dimensions: ${embedding?.length}`);
      }

      return normalizeEmbedding(Array.from(embedding));
    } catch (error) {
      logger.error({ error, model: this.model }, 'Gemini embedding failed');
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      // Gemini supports batch embedding
      const results = await Promise.all(
        texts.map(async (text) => {
          const result = await model.embedContent(text);
          return Array.from(result.embedding.values);
        }),
      );

      return results.map((embedding) => normalizeEmbedding(embedding));
    } catch (error) {
      logger.error({ error, count: texts.length }, 'Gemini batch embedding failed');
      throw error;
    }
  }
}
```

### Step 5: Run test to verify it passes

```bash
npm test tests/memory/embeddings/gemini.test.ts
```

Expected: PASS (if GEMINI_API_KEY is set)

### Step 6: Commit

```bash
git add src/memory/embeddings/gemini.ts tests/memory/embeddings/gemini.test.ts
git commit -m "feat(memory): add Gemini embedding provider"
```

---

## Task 6: Local Embedding Provider (llama.cpp)

**Files:**
- Create: `src/memory/embeddings/local.ts`
- Test: `tests/memory/embeddings/local.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/embeddings/local.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalEmbeddingProvider } from '../../src/memory/embeddings/local.js';

describe('Local Embedding Provider', () => {
  it('should create provider with default model', async () => {
    const provider = await LocalEmbeddingProvider.create({});
    expect(provider.id).toBe('local');
    expect(provider.model).toContain('embeddinggemma');
  });

  it('should embed single query', async () => {
    const provider = await LocalEmbeddingProvider.create({});
    const embedding = await provider.embedQuery('Hello world');
    expect(embedding).toBeInstanceOf(Array);
    expect(embedding.length).toBeGreaterThan(0);
    expect(embedding.every((v) => typeof v === 'number')).toBe(true);
  });

  it('should embed batch of texts', async () => {
    const provider = await LocalEmbeddingProvider.create({});
    const texts = ['Hello', 'World'];
    const embeddings = await provider.embedBatch(texts);
    expect(embeddings).toHaveLength(2);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/embeddings/local.test.ts
```

Expected: FAIL

### Step 3: Install node-llama-cpp (optional dependency)

```bash
npm install --save-optional node-llama-cpp
```

### Step 4: Write implementation

```typescript
// src/memory/embeddings/local.ts
import type { EmbeddingProvider } from './base.js';
import { normalizeEmbedding } from './base.js';
import { logger } from '../../utils/logger.js';

export interface LocalEmbeddingOptions {
  modelPath?: string;
  modelCacheDir?: string;
}

const DEFAULT_MODEL = 'hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf';

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'local' as const;
  readonly model: string;
  readonly maxInputTokens = 2048;

  private llama: any = null;
  private embeddingModel: any = null;
  private embeddingContext: any = null;

  private constructor(options: LocalEmbeddingOptions) {
    this.model = options.modelPath || DEFAULT_MODEL;
  }

  static async create(options: LocalEmbeddingOptions): Promise<LocalEmbeddingProvider> {
    const provider = new LocalEmbeddingProvider(options);
    await provider.initialize(options);
    return provider;
  }

  private async initialize(options: LocalEmbeddingOptions): Promise<void> {
    try {
      // Lazy-load node-llama-cpp
      const { getLlama, resolveModelFile, LlamaLogLevel } = await import('node-llama-cpp');

      this.llama = await getLlama({ logLevel: LlamaLogLevel.error });

      const resolved = await resolveModelFile(this.model, options.modelCacheDir);
      this.embeddingModel = await this.llama.loadModel({ modelPath: resolved });
      this.embeddingContext = await this.embeddingModel.createEmbeddingContext();

      logger.info({ model: this.model }, 'Local embedding model loaded');
    } catch (error) {
      logger.error({ error }, 'Failed to load local embedding model');
      throw new Error(`Local embeddings unavailable: ${error}`);
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!this.embeddingContext) {
      throw new Error('Local embedding context not initialized');
    }

    try {
      const embedding = await this.embeddingContext.getEmbeddingFor(text);
      return normalizeEmbedding(Array.from(embedding.vector));
    } catch (error) {
      logger.error({ error }, 'Local embedding failed');
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.embeddingContext) {
      throw new Error('Local embedding context not initialized');
    }

    try {
      const embeddings = await Promise.all(
        texts.map(async (text) => {
          const embedding = await this.embeddingContext.getEmbeddingFor(text);
          return normalizeEmbedding(Array.from(embedding.vector));
        }),
      );
      return embeddings;
    } catch (error) {
      logger.error({ error, count: texts.length }, 'Local batch embedding failed');
      throw error;
    }
  }
}
```

### Step 5: Run test to verify it passes

```bash
npm test tests/memory/embeddings/local.test.ts
```

Expected: PASS (if node-llama-cpp is installed)

### Step 6: Commit

```bash
git add src/memory/embeddings/local.ts tests/memory/embeddings/local.test.ts
git commit -m "feat(memory): add local embedding provider with llama.cpp"
```

---

## Task 7: Provider Factory with Fallback

**Files:**
- Create: `src/memory/embeddings/factory.ts`
- Test: `tests/memory/embeddings/factory.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/embeddings/factory.test.ts
import { describe, it, expect } from 'vitest';
import { createEmbeddingProvider } from '../../src/memory/embeddings/factory.js';

describe('Embedding Provider Factory', () => {
  it('should create OpenAI provider', async () => {
    const result = await createEmbeddingProvider({
      provider: 'openai',
      fallback: 'none',
      apiKey: 'test-key',
    });

    expect(result.provider.id).toBe('openai');
    expect(result.requestedProvider).toBe('openai');
    expect(result.fallbackFrom).toBeUndefined();
  });

  it('should fallback from OpenAI to Gemini on error', async () => {
    const result = await createEmbeddingProvider({
      provider: 'openai',
      fallback: 'gemini',
      apiKey: 'invalid-key',
    });

    // Should fallback to Gemini
    expect(result.provider.id).toBe('gemini');
    expect(result.fallbackFrom).toBe('openai');
    expect(result.fallbackReason).toBeDefined();
  });

  it('should auto-select provider', async () => {
    const result = await createEmbeddingProvider({
      provider: 'auto',
      fallback: 'none',
    });

    expect(result.provider.id).toMatch(/openai|gemini|local/);
    expect(result.requestedProvider).toBe('auto');
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/embeddings/factory.test.ts
```

Expected: FAIL

### Step 3: Write implementation

```typescript
// src/memory/embeddings/factory.ts
import type {
  EmbeddingProvider,
  EmbeddingProviderOptions,
  EmbeddingProviderResult,
  EmbeddingProviderId,
} from './base.js';
import { OpenAIEmbeddingProvider } from './openai.js';
import { GeminiEmbeddingProvider } from './gemini.js';
import { LocalEmbeddingProvider } from './local.js';
import { logger } from '../../utils/logger.js';

const REMOTE_PROVIDERS: EmbeddingProviderId[] = ['openai', 'gemini'];

function isMissingApiKeyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.toLowerCase().includes('api key');
}

async function createProvider(
  id: EmbeddingProviderId,
  options: EmbeddingProviderOptions,
): Promise<EmbeddingProvider> {
  if (id === 'openai') {
    return new OpenAIEmbeddingProvider({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
      model: options.model,
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

export async function createEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<EmbeddingProviderResult> {
  const requestedProvider = options.provider;
  const fallback = options.fallback;

  // Auto-selection mode
  if (requestedProvider === 'auto') {
    const missingKeyErrors: string[] = [];

    // Try local first (no API costs)
    try {
      const provider = await createProvider('local', options);
      return { provider, requestedProvider };
    } catch (err) {
      logger.debug({ error: err }, 'Local provider unavailable');
    }

    // Try remote providers
    for (const providerId of REMOTE_PROVIDERS) {
      try {
        const provider = await createProvider(providerId, options);
        return { provider, requestedProvider };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isMissingApiKeyError(err)) {
          missingKeyErrors.push(`${providerId}: ${message}`);
          continue;
        }
        throw err;
      }
    }

    throw new Error(`No embedding provider available:\n${missingKeyErrors.join('\n')}`);
  }

  // Try requested provider
  try {
    const provider = await createProvider(requestedProvider, options);
    return { provider, requestedProvider };
  } catch (primaryErr) {
    const reason = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    // Try fallback
    if (fallback && fallback !== 'none' && fallback !== requestedProvider) {
      try {
        const provider = await createProvider(fallback, options);
        return {
          provider,
          requestedProvider,
          fallbackFrom: requestedProvider,
          fallbackReason: reason,
        };
      } catch (fallbackErr) {
        const fallbackReason = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        throw new Error(
          `Primary provider (${requestedProvider}) failed: ${reason}\n` +
            `Fallback provider (${fallback}) failed: ${fallbackReason}`,
        );
      }
    }

    throw primaryErr;
  }
}
```

### Step 4: Refactor OpenAI provider

```typescript
// src/memory/embeddings/openai.ts
import type { EmbeddingProvider } from './base.js';
import { normalizeEmbedding } from './base.js';
import { logger } from '../../utils/logger.js';

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai' as const;
  readonly model: string;
  readonly maxInputTokens = 8191;

  private apiKey: string;
  private baseUrl: string;

  constructor(options: OpenAIEmbeddingOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || DEFAULT_MODEL;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text.slice(0, this.maxInputTokens * 4),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error }, 'OpenAI embedding failed');
      throw new Error(`OpenAI embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Invalid embedding dimensions: ${embedding?.length}`);
    }

    return normalizeEmbedding(embedding);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts.map((t) => t.slice(0, this.maxInputTokens * 4)),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error }, 'OpenAI batch embedding failed');
      throw new Error(`OpenAI batch embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.map((item: any) => normalizeEmbedding(item.embedding));
  }
}
```

### Step 5: Run test to verify it passes

```bash
npm test tests/memory/embeddings/factory.test.ts
```

Expected: PASS

### Step 6: Commit

```bash
git add src/memory/embeddings/ tests/memory/embeddings/
git commit -m "feat(memory): add provider factory with auto-selection and fallback"
```

---

## Progress Tracker

### Completed ✅
- [x] Task 4: Embedding Provider Base Interface
- [x] Task 5: Gemini Embedding Provider
- [x] Task 6: Local Embedding Provider
- [x] Task 7: Provider Factory with Fallback

### Next Steps
- Continue to Part 4: Hybrid Search
- Implement keyword search (FTS5)
- Implement hybrid merge algorithm
- Implement weighted scoring

---

**Part 3 Status:** Complete ✅  
**Next:** Part 4 - Hybrid Search System  
**Estimated Time:** 2-3 days
