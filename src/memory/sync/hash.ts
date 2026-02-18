import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

/**
 * Hash text using SHA-256.
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Hash file content using SHA-256.
 */
export async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf8');
  return hashText(content);
}

/**
 * Compute cache key for embedding.
 */
export function computeCacheKey(text: string, provider: string, model: string): string {
  return hashText(`${provider}:${model}:${text}`);
}
