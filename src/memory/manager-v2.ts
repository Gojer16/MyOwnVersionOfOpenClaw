/**
 * Unified Memory Manager V2
 * Integrates hybrid search, embeddings, and file watching.
 */

import Database from 'better-sqlite3';
import type { TalonConfig } from '../config/schema.js';
import { ensureSchema } from './schema/migrations.js';
import { createEmbeddingProvider, type EmbeddingProvider } from './embeddings/factory.js';
import { searchKeyword } from './search/keyword.js';
import { searchVector } from './search/vector.js';
import { mergeHybridResults } from './search/hybrid.js';
import { FileWatcher } from './sync/watcher.js';
import { EmbeddingCache } from './cache/embedding-cache.js';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import os from 'node:os';

export interface MemoryManagerV2Options {
  config: TalonConfig;
  workspaceRoot: string;
  dbPath?: string;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  sources?: Array<'memory' | 'sessions'>;
}

export class MemoryManagerV2 {
  private db: Database.Database;
  private provider?: EmbeddingProvider;
  private watcher?: FileWatcher;
  private cache: EmbeddingCache;
  private config: TalonConfig;
  private workspaceRoot: string;

  constructor(options: MemoryManagerV2Options) {
    this.config = options.config;
    this.workspaceRoot = options.workspaceRoot;

    // Initialize database
    const dbPath =
      options.dbPath || path.join(os.homedir(), '.talon', 'workspace', 'memory-v2.db');
    this.db = new Database(dbPath);

    // Run migrations
    ensureSchema(this.db);

    // Initialize cache
    this.cache = new EmbeddingCache(this.config.memoryV2.embeddings.cacheSize);

    logger.info({ dbPath }, 'Memory Manager V2 initialized');
  }

  /**
   * Initialize embedding provider and file watcher.
   */
  async initialize(): Promise<void> {
    if (!this.config.memoryV2.enabled) {
      logger.info('Memory V2 disabled in config');
      return;
    }

    // Initialize embedding provider
    try {
      const result = await createEmbeddingProvider({
        provider: this.config.memoryV2.embeddings.provider,
        fallback: this.config.memoryV2.embeddings.fallback,
        model: this.config.memoryV2.embeddings.model,
      });

      this.provider = result.provider;

      logger.info(
        {
          provider: result.provider.id,
          model: result.provider.model,
          fallback: result.fallbackFrom,
        },
        'Embedding provider initialized',
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize embedding provider');
      throw error;
    }

    // Initialize file watcher
    if (this.config.memoryV2.watcher.enabled) {
      const watchPaths = this.config.memoryV2.watcher.paths.map((p) =>
        path.join(this.workspaceRoot, p),
      );

      this.watcher = new FileWatcher({
        paths: watchPaths,
        ignore: this.config.memoryV2.watcher.ignore,
        debounceMs: this.config.memoryV2.watcher.debounceMs,
      });

      this.watcher.on('change', (event) => {
        logger.info({ event }, 'File change detected');
        // TODO: Index file
      });

      this.watcher.start();
    }
  }

  /**
   * Search memory using hybrid search (vector + keyword).
   */
  async search(options: SearchOptions) {
    if (!this.provider) {
      throw new Error('Memory Manager V2 not initialized');
    }

    const limit = options.limit || this.config.memoryV2.search.defaultLimit;

    // Parallel search
    const [vectorResults, keywordResults] = await Promise.all([
      searchVector({
        db: this.db,
        provider: this.provider,
        query: options.query,
        limit,
        sources: options.sources,
      }),
      searchKeyword({
        db: this.db,
        query: options.query,
        limit,
        sources: options.sources,
      }),
    ]);

    // Merge results
    const merged = mergeHybridResults(
      vectorResults,
      keywordResults,
      {
        vector: this.config.memoryV2.search.vectorWeight,
        keyword: this.config.memoryV2.search.keywordWeight,
      },
      limit,
    );

    logger.debug(
      {
        query: options.query,
        vectorResults: vectorResults.length,
        keywordResults: keywordResults.length,
        merged: merged.length,
      },
      'Hybrid search complete',
    );

    return merged;
  }

  /**
   * Get embedding with caching.
   */
  async getEmbedding(text: string): Promise<number[]> {
    if (!this.provider) {
      throw new Error('Memory Manager V2 not initialized');
    }

    // Check cache
    const cached = this.cache.get(text, this.provider.id, this.provider.model);
    if (cached) {
      return cached;
    }

    // Generate embedding
    const embedding = await this.provider.embedQuery(text);

    // Cache it
    this.cache.set(text, this.provider.id, this.provider.model, embedding);

    return embedding;
  }

  /**
   * Clean up resources.
   */
  async dispose(): Promise<void> {
    if (this.watcher) {
      await this.watcher.stop();
    }

    if (this.provider && 'dispose' in this.provider) {
      await (this.provider as any).dispose();
    }

    this.db.close();

    logger.info('Memory Manager V2 disposed');
  }
}
