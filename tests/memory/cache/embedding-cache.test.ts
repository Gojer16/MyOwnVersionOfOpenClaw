import { describe, it, expect } from 'vitest';
import { EmbeddingCache } from '../../../src/memory/cache/embedding-cache.js';

describe('Embedding Cache', () => {
  it('should cache and retrieve embeddings', () => {
    const cache = new EmbeddingCache(10);
    const embedding = [0.1, 0.2, 0.3];

    cache.set('test', 'openrouter', 'model', embedding);
    const cached = cache.get('test', 'openrouter', 'model');

    expect(cached).toEqual(embedding);
  });

  it('should return undefined for cache miss', () => {
    const cache = new EmbeddingCache(10);

    const cached = cache.get('nonexistent', 'openrouter', 'model');

    expect(cached).toBeUndefined();
  });

  it('should evict oldest entry when at capacity', () => {
    const cache = new EmbeddingCache(2);

    cache.set('text1', 'openrouter', 'model', [1.0]);
    cache.set('text2', 'openrouter', 'model', [2.0]);
    cache.set('text3', 'openrouter', 'model', [3.0]); // Should evict text1

    expect(cache.get('text1', 'openrouter', 'model')).toBeUndefined();
    expect(cache.get('text2', 'openrouter', 'model')).toBeDefined();
    expect(cache.get('text3', 'openrouter', 'model')).toBeDefined();
  });

  it('should update LRU on access', () => {
    const cache = new EmbeddingCache(2);

    cache.set('text1', 'openrouter', 'model', [1.0]);
    cache.set('text2', 'openrouter', 'model', [2.0]);

    // Access text1 to make it recent
    cache.get('text1', 'openrouter', 'model');

    // Add text3, should evict text2 (oldest)
    cache.set('text3', 'openrouter', 'model', [3.0]);

    expect(cache.get('text1', 'openrouter', 'model')).toBeDefined();
    expect(cache.get('text2', 'openrouter', 'model')).toBeUndefined();
    expect(cache.get('text3', 'openrouter', 'model')).toBeDefined();
  });

  it('should clear cache', () => {
    const cache = new EmbeddingCache(10);

    cache.set('text1', 'openrouter', 'model', [1.0]);
    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('text1', 'openrouter', 'model')).toBeUndefined();
  });
});
