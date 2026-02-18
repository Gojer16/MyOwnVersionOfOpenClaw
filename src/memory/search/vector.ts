import type Database from 'better-sqlite3';
import type { MemorySource } from '../sync/types.js';
import type { EmbeddingProvider } from '../embeddings/base.js';

export interface VectorSearchOptions {
  db: Database.Database;
  provider: EmbeddingProvider;
  query: string;
  limit: number;
  sources?: MemorySource[];
}

export interface VectorSearchResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: MemorySource;
  text: string;
  score: number;
}

/**
 * Search chunks using vector similarity (cosine similarity).
 * Uses sqlite-vec extension for efficient vector search.
 */
export async function searchVector(
  options: VectorSearchOptions,
): Promise<VectorSearchResult[]> {
  const { db, provider, query, limit, sources } = options;

  // Generate query embedding
  const queryEmbedding = await provider.embedQuery(query);

  // Check if chunks_vec table exists
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_vec'`)
    .all() as Array<{ name: string }>;

  if (tables.length === 0) {
    // No vector table yet, return empty results
    return [];
  }

  // Build SQL with optional source filter
  let sql = `
    SELECT
      c.id,
      c.file_path as path,
      c.start_line as startLine,
      c.end_line as endLine,
      c.source,
      c.text,
      vec_distance_cosine(v.embedding, ?) as distance
    FROM chunks_vec v
    JOIN chunks c ON v.chunk_id = c.id
  `;

  const params: any[] = [Buffer.from(new Float32Array(queryEmbedding).buffer)];

  if (sources && sources.length > 0) {
    const placeholders = sources.map(() => '?').join(',');
    sql += ` WHERE c.source IN (${placeholders})`;
    params.push(...sources);
  }

  sql += ` ORDER BY distance ASC LIMIT ?`;
  params.push(limit);

  try {
    const rows = db.prepare(sql).all(...params) as Array<{
      id: string;
      path: string;
      startLine: number;
      endLine: number;
      source: MemorySource;
      text: string;
      distance: number;
    }>;

    // Convert distance to similarity score (0-1)
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      startLine: row.startLine,
      endLine: row.endLine,
      source: row.source,
      text: row.text,
      score: Math.max(0, 1 - row.distance), // Cosine distance to similarity
    }));
  } catch (error) {
    // sqlite-vec not available or table not set up
    return [];
  }
}

/**
 * Store embedding for a chunk.
 */
export function storeEmbedding(
  db: Database.Database,
  chunkId: string,
  embedding: number[],
): void {
  // Create chunks_vec table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks_vec (
      chunk_id TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    )
  `);

  const buffer = Buffer.from(new Float32Array(embedding).buffer);

  db.prepare(`
    INSERT OR REPLACE INTO chunks_vec (chunk_id, embedding)
    VALUES (?, ?)
  `).run(chunkId, buffer);
}

