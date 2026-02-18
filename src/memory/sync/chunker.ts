import { randomUUID } from 'node:crypto';
import type { FileEntry, ChunkEntry, ChunkingConfig } from './types.js';

/**
 * Estimate tokens using ~4 chars per token heuristic.
 * Good enough for chunking decisions.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk a file into token-sized pieces with overlap.
 *
 * Algorithm:
 * 1. Split file into lines
 * 2. Accumulate lines until token limit
 * 3. Create chunk with overlap from previous chunk
 * 4. Repeat until all lines processed
 */
export function chunkFile(file: FileEntry, config: ChunkingConfig): ChunkEntry[] {
  const lines = file.content.split('\n');
  const chunks: ChunkEntry[] = [];

  if (lines.length === 0) {
    return chunks;
  }

  let currentChunk: string[] = [];
  let currentTokens = 0;
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line);

    // Check if adding this line would exceed limit
    if (currentTokens + lineTokens > config.tokens && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        id: randomUUID(),
        filePath: file.path,
        source: file.source,
        startLine,
        endLine: i,
        text: currentChunk.join('\n'),
        tokens: currentTokens,
      });

      // Calculate overlap lines
      const avgTokensPerLine = currentTokens / currentChunk.length;
      const overlapLines = Math.floor(config.overlap / avgTokensPerLine);
      const actualOverlap = Math.min(overlapLines, currentChunk.length);

      // Start new chunk with overlap
      currentChunk = currentChunk.slice(-actualOverlap);
      currentTokens = currentChunk.reduce((sum, l) => sum + estimateTokens(l), 0);
      startLine = i - actualOverlap + 1;
    }

    currentChunk.push(line);
    currentTokens += lineTokens;
  }

  // Save final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      id: randomUUID(),
      filePath: file.path,
      source: file.source,
      startLine,
      endLine: lines.length,
      text: currentChunk.join('\n'),
      tokens: currentTokens,
    });
  }

  return chunks;
}

/**
 * Chunk multiple files in batch.
 */
export function chunkFiles(files: FileEntry[], config: ChunkingConfig): ChunkEntry[] {
  const allChunks: ChunkEntry[] = [];

  for (const file of files) {
    const chunks = chunkFile(file, config);
    allChunks.push(...chunks);
  }

  return allChunks;
}
