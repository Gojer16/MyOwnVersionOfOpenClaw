# Memory Upgrade Plan - OpenRouter Configuration

> **Note:** This plan uses **OpenRouter** instead of OpenAI for embedding generation.

## Key Changes from Standard Plan

### Provider Configuration

**Default Provider:** OpenRouter (instead of OpenAI)

```json
{
  "memory": {
    "provider": "openrouter",
    "model": "openai/text-embedding-3-small",
    "fallback": "gemini"
  }
}
```

### Environment Variables

```bash
# Required for OpenRouter
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Optional fallback
GEMINI_API_KEY=your-gemini-key-here
```

### Provider Priority (Auto Mode)

When using `provider: "auto"`, the system tries:

1. **Local** (if model exists) - Free, no API calls
2. **OpenRouter** - $0.02 / 1M tokens, multiple models available
3. **Gemini** - Free with API key

### OpenRouter Implementation

**File:** `src/memory/embeddings/openrouter.ts`

```typescript
export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openrouter' as const;
  readonly model: string;
  readonly maxInputTokens = 8191;

  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  async embedQuery(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://talon.ai',
        'X-Title': 'Talon Memory System',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    const data = await response.json();
    return normalizeEmbedding(data.data[0].embedding);
  }
}
```

### Available Models via OpenRouter

OpenRouter provides access to multiple embedding models:

- `openai/text-embedding-3-small` (1536 dims) - **Recommended**
- `openai/text-embedding-3-large` (3072 dims) - Higher quality
- `openai/text-embedding-ada-002` (1536 dims) - Legacy

### Cost Comparison

| Provider | Model | Cost per 1M tokens | Dimensions |
|----------|-------|-------------------|------------|
| **OpenRouter** | text-embedding-3-small | $0.02 | 1536 |
| Gemini | text-embedding-004 | Free | 768 |
| Local | embeddinggemma-300m | Free | 256 |

### Configuration Examples

#### Minimal (OpenRouter only)

```json
{
  "memory": {
    "enabled": true,
    "provider": "openrouter"
  }
}
```

#### With Fallback

```json
{
  "memory": {
    "enabled": true,
    "provider": "openrouter",
    "fallback": "gemini"
  }
}
```

#### Auto-Select (Recommended)

```json
{
  "memory": {
    "enabled": true,
    "provider": "auto",
    "fallback": "none"
  }
}
```

This tries local first, then OpenRouter, then Gemini automatically.

### Implementation Changes

When implementing the plan, replace all references to:

- `'openai'` → `'openrouter'`
- `OpenAIEmbeddingProvider` → `OpenRouterEmbeddingProvider`
- `OPENAI_API_KEY` → `OPENROUTER_API_KEY`
- `https://api.openai.com/v1` → `https://openrouter.ai/api/v1`

### Testing

```typescript
// Test OpenRouter provider
const provider = new OpenRouterEmbeddingProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'openai/text-embedding-3-small',
});

const embedding = await provider.embedQuery('Hello world');
expect(embedding).toHaveLength(1536);
```

### Benefits of OpenRouter

1. **Multiple Models** - Access to various embedding models
2. **Unified API** - Single API key for multiple providers
3. **Cost Tracking** - Built-in usage tracking
4. **Reliability** - Automatic failover between providers
5. **Compatibility** - OpenAI-compatible API

### Migration from OpenAI

If you have existing OpenAI embeddings:

1. They remain compatible (same dimensions)
2. No need to re-index
3. Just update API key and base URL
4. Embeddings are interchangeable

---

**Summary:** Use OpenRouter as the primary provider with Gemini as fallback. Local embeddings remain available for offline use. All plan documents reference "OpenAI" but should be read as "OpenRouter" for your implementation.
