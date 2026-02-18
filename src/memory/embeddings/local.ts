import type { EmbeddingProvider } from './base.js';
import { normalizeEmbedding } from './base.js';
import { logger } from '../../utils/logger.js';

export interface LocalEmbeddingOptions {
  modelPath?: string;
  modelCacheDir?: string;
}

const DEFAULT_MODEL = 'embeddinggemma-300m-qat-Q8_0.gguf';
const EMBEDDING_DIMENSIONS = 256;

/**
 * Local embedding provider using llama.cpp via node-llama-cpp.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'local' as const;
  readonly model: string;
  readonly maxInputTokens = 512;

  private llama: any;
  private modelInstance: any;
  private context: any;

  private constructor(
    options: LocalEmbeddingOptions,
    llama: any,
    modelInstance: any,
    context: any,
  ) {
    this.llama = llama;
    this.modelInstance = modelInstance;
    this.context = context;
    this.model = DEFAULT_MODEL;
  }

  static async create(options: LocalEmbeddingOptions): Promise<LocalEmbeddingProvider> {
    try {
      // Dynamic import of node-llama-cpp
      const { getLlama } = await import('node-llama-cpp');

      const llama = await getLlama();

      // Load model (auto-downloads if not present)
      const modelPath = options.modelPath || DEFAULT_MODEL;
      logger.info({ modelPath }, 'Loading local embedding model');

      const model = await llama.loadModel({
        modelPath,
        // Auto-download from HuggingFace if not found
        onDownloadProgress: (progress: number) => {
          if (progress % 10 === 0) {
            logger.info({ progress }, 'Downloading embedding model');
          }
        },
      });

      // Create context for embeddings
      const context = await model.createEmbeddingContext();

      logger.info('Local embedding model loaded successfully');

      return new LocalEmbeddingProvider(options, llama, model, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'Failed to load local embeddings');
      throw new Error(
        `Local embeddings require node-llama-cpp package. Install with: npm install --save-optional node-llama-cpp\nError: ${message}`,
      );
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    try {
      const embedding = await this.context.getEmbeddingFor(text.slice(0, this.maxInputTokens * 4));

      if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Invalid embedding dimensions: ${embedding?.length}`);
      }

      return normalizeEmbedding(Array.from(embedding));
    } catch (error) {
      logger.error({ error }, 'Local embedding generation failed');
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Sequential processing for local embeddings
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.embedQuery(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Clean up resources.
   */
  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.dispose();
    }
    if (this.modelInstance) {
      await this.modelInstance.dispose();
    }
  }
}
