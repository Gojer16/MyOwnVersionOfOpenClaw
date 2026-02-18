/**
 * LRU cache for embeddings.
 */
export class EmbeddingCache {
  private cache: Map<string, { embedding: number[]; timestamp: number }>;
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get cached embedding.
   */
  get(text: string, provider: string, model: string): number[] | undefined {
    const key = this.makeKey(text, provider, model);
    const entry = this.cache.get(key);

    if (entry) {
      // Move to end (most recent) by deleting and re-adding
      this.cache.delete(key);
      this.cache.set(key, {
        embedding: entry.embedding,
        timestamp: Date.now(),
      });
      return entry.embedding;
    }

    return undefined;
  }

  /**
   * Set cached embedding.
   */
  set(text: string, provider: string, model: string, embedding: number[]): void {
    const key = this.makeKey(text, provider, model);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size.
   */
  size(): number {
    return this.cache.size;
  }

  private makeKey(text: string, provider: string, model: string): string {
    return `${provider}:${model}:${text.slice(0, 100)}`;
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
