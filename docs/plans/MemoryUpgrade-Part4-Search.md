# Memory System Upgrade Implementation Plan - Part 4: Hybrid Search

> **For Claude:** This is Part 4 of 6. Implement vector + keyword search with weighted merging.

**Goal:** Implement hybrid search combining vector similarity and keyword matching with configurable weights.

---

## Task 8: Keyword Search (FTS5)

**Files:**
- Create: `src/memory/search/keyword.ts`
- Test: `tests/memory/search/keyword.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/search/keyword.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { searchKeyword, buildFtsQuery } from '../../src/memory/search/keyword.js';
import { createV2Schema } from '../../src/memory/schema/v2.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Keyword Search', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-keyword-${Date.now()}.db`);
    db = new Database(dbPath);
    createV2Schema(db);

    // Insert test data
    db.prepare(`
      INSERT INTO chunks (id, file_path, source, start_line, end_line, text, tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('chunk1', 'test.md', 'memory', 1, 5, 'The quick brown fox jumps over the lazy dog', 10);

    db.prepare(`
      INSERT INTO chunks (id, file_path, source, start_line, end_line, text, tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('chunk2', 'test.md', 'memory', 6, 10, 'A fast red fox leaps across the sleepy canine', 10);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should search for exact keyword', async () => {
    const results = await searchKeyword({
      db,
      query: 'fox',
      limit: 10,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toContain('fox');
  });

  it('should rank results by BM25 score', async () => {
    const results = await searchKeyword({
      db,
      query: 'fox',
      limit: 10,
    });

    // Results should be sorted by score (descending)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('should build FTS query from natural language', () => {
    expect(buildFtsQuery('hello world')).toBe('hello AND world');
    expect(buildFtsQuery('quick fox')).toBe('quick AND fox');
    expect(buildFtsQuery('"exact phrase"')).toBe('"exact phrase"');
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/search/keyword.test.ts
```

Expected: FAIL

### Step 3: Write implementation

```typescript
// src/memory/search/keyword.ts
import type Database from 'better-sqlite3';
import type { MemorySource } from '../sync/types.js';

export interface KeywordSearchOptions {
  db: Database.Database;
  query: string;
  limit: number;
  sources?: MemorySource[];
}

export interface KeywordSearchResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: MemorySource;
  text: string;
  score: number;
}

/**
 * Convert BM25 rank to 0-1 score.
 * BM25 returns negative scores (lower = better).
 */
export function bm25RankToScore(rank: number): number {
  const normalized = Math.max(0, -rank);
  return Math.min(1, normalized / 10);
}

/**
 * Build FTS5 query from natural language.
 * Converts "hello world" to "hello AND world"
 */
export function buildFtsQuery(raw: string): string {
  // Handle quoted phrases
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw;
  }

  // Split into words and join with AND
  const words = raw
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return '';
  }

  return words.join(' AND ');
}

/**
 * Search chunks using FTS5 keyword search.
 */
export async function searchKeyword(
  options: KeywordSearchOptions,
): Promise<KeywordSearchResult[]> {
  const { db, query, limit, sources } = options;

  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) {
    return [];
  }

  let sql = `
    SELECT 
      c.id,
      c.file_path as path,
      c.start_line as startLine,
      c.end_line as endLine,
      c.source,
      c.text,
      bm25(fts.text) as rank
    FROM chunks_fts fts
    JOIN chunks c ON fts.id = c.id
    WHERE fts.text MATCH ?
  `;

  const params: any[] = [ftsQuery];

  // Filter by sources
  if (sources && sources.length > 0) {
    const placeholders = sources.map(() => '?').join(', ');
    sql += ` AND c.source IN (${placeholders})`;
    params.push(...sources);
  }

  sql += ` ORDER BY rank DESC LIMIT ?`;
  params.push(limit);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    startLine: row.startLine,
    endLine: row.endLine,
    source: row.source,
    text: row.text,
    score: bm25RankToScore(row.rank),
  }));
}
```

### Step 4: Run test to verify it passes

```bash
npm test tests/memory/search/keyword.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/memory/search/keyword.ts tests/memory/search/keyword.test.ts
git commit -m "feat(memory): add FTS5 keyword search with BM25 ranking"
```

---

## Task 9: Vector Search (Refactor)

**Files:**
- Create: `src/memory/search/vector.ts`
- Test: `tests/memory/search/vector.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/search/vector.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { searchVector } from '../../src/memory/search/vector.js';
import { createV2Schema } from '../../src/memory/schema/v2.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Vector Search', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-vector-${Date.now()}.db`);
    db = new Database(dbPath);
    createV2Schema(db);

    // Load sqlite-vec extension
    try {
      db.loadExtension('vec0');
    } catch (error) {
      console.log('sqlite-vec not available, skipping test');
      return;
    }

    // Create vector table
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[3]
      )
    `);

    // Insert test data
    db.prepare(`
      INSERT INTO chunks (id, file_path, source, start_line, end_line, text, tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('chunk1', 'test.md', 'memory', 1, 5, 'Hello world', 2);

    db.prepare(`
      INSERT INTO chunks_vec (id, embedding) VALUES (?, ?)
    `).run('chunk1', JSON.stringify([1.0, 0.0, 0.0]));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should search by vector similarity', async () => {
    const queryVec = [1.0, 0.0, 0.0];
    const results = await searchVector({
      db,
      queryVec,
      limit: 10,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/search/vector.test.ts
```

Expected: FAIL

### Step 3: Write implementation

```typescript
// src/memory/search/vector.ts
import type Database from 'better-sqlite3';
import type { MemorySource } from '../sync/types.js';

export interface VectorSearchOptions {
  db: Database.Database;
  queryVec: number[];
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
 * Search chunks using vector similarity (cosine distance).
 */
export async function searchVector(
  options: VectorSearchOptions,
): Promise<VectorSearchResult[]> {
  const { db, queryVec, limit, sources } = options;

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
    JOIN chunks c ON v.id = c.id
    WHERE 1=1
  `;

  const params: any[] = [JSON.stringify(queryVec)];

  // Filter by sources
  if (sources && sources.length > 0) {
    const placeholders = sources.map(() => '?').join(', ');
    sql += ` AND c.source IN (${placeholders})`;
    params.push(...sources);
  }

  sql += ` ORDER BY distance ASC LIMIT ?`;
  params.push(limit);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    startLine: row.startLine,
    endLine: row.endLine,
    source: row.source,
    text: row.text,
    score: 1 - row.distance, // Convert distance to similarity
  }));
}
```

### Step 4: Run test to verify it passes

```bash
npm test tests/memory/search/vector.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/memory/search/vector.ts tests/memory/search/vector.test.ts
git commit -m "feat(memory): add vector search with cosine similarity"
```

---

## Task 10: Hybrid Search Merge Algorithm

**Files:**
- Create: `src/memory/search/hybrid.ts`
- Test: `tests/memory/search/hybrid.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/search/hybrid.test.ts
import { describe, it, expect } from 'vitest';
import { mergeHybridResults } from '../../src/memory/search/hybrid.js';

describe('Hybrid Search Merge', () => {
  it('should merge vector and keyword results', () => {
    const vectorResults = [
      { id: 'chunk1', path: 'test.md', startLine: 1, endLine: 5, source: 'memory' as const, text: 'Hello', score: 0.9 },
      { id: 'chunk2', path: 'test.md', startLine: 6, endLine: 10, source: 'memory' as const, text: 'World', score: 0.7 },
    ];

    const keywordResults = [
      { id: 'chunk2', path: 'test.md', startLine: 6, endLine: 10, source: 'memory' as const, text: 'World', score: 0.8 },
      { id: 'chunk3', path: 'test.md', startLine: 11, endLine: 15, source: 'memory' as const, text: 'Test', score: 0.6 },
    ];

    const merged = mergeHybridResults({
      vector: vectorResults,
      keyword: keywordResults,
      vectorWeight: 0.7,
      textWeight: 0.3,
    });

    // chunk2 should be first (appears in both)
    expect(merged[0].id).toBe('chunk2');
    expect(merged[0].score).toBeGreaterThan(vectorResults[0].score);
  });

  it('should handle empty results', () => {
    const merged = mergeHybridResults({
      vector: [],
      keyword: [],
      vectorWeight: 0.7,
      textWeight: 0.3,
    });

    expect(merged).toEqual([]);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/search/hybrid.test.ts
```

Expected: FAIL

### Step 3: Write implementation

```typescript
// src/memory/search/hybrid.ts
import type { VectorSearchResult } from './vector.js';
import type { KeywordSearchResult } from './keyword.js';

export interface HybridSearchResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: 'memory' | 'sessions';
  text: string;
  score: number;
}

export interface HybridMergeOptions {
  vector: VectorSearchResult[];
  keyword: KeywordSearchResult[];
  vectorWeight: number;
  textWeight: number;
}

/**
 * Merge vector and keyword search results with weighted scoring.
 *
 * Algorithm:
 * 1. Index results by ID
 * 2. For each result, compute weighted score
 * 3. If result appears in both, combine scores
 * 4. Sort by combined score
 */
export function mergeHybridResults(options: HybridMergeOptions): HybridSearchResult[] {
  const { vector, keyword, vectorWeight, textWeight } = options;

  const byId = new Map<string, HybridSearchResult>();

  // Add vector results
  for (const result of vector) {
    byId.set(result.id, {
      ...result,
      score: result.score * vectorWeight,
    });
  }

  // Merge keyword results
  for (const result of keyword) {
    const existing = byId.get(result.id);
    if (existing) {
      // Combine scores
      existing.score += result.score * textWeight;
    } else {
      // Add new result
      byId.set(result.id, {
        ...result,
        score: result.score * textWeight,
      });
    }
  }

  // Sort by combined score (descending)
  return Array.from(byId.values()).sort((a, b) => b.score - a.score);
}
```

### Step 4: Run test to verify it passes

```bash
npm test tests/memory/search/hybrid.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/memory/search/hybrid.ts tests/memory/search/hybrid.test.ts
git commit -m "feat(memory): add hybrid search merge with weighted scoring"
```

---

## Progress Tracker

### Completed ✅
- [x] Task 8: Keyword Search (FTS5)
- [x] Task 9: Vector Search (Refactor)
- [x] Task 10: Hybrid Search Merge Algorithm

### Next Steps
- Continue to Part 5: Session Memory
- Implement session file parser
- Implement session-to-memory hook
- Implement LLM slug generation

---

**Part 4 Status:** Complete ✅  
**Next:** Part 5 - Session Memory Integration  
**Estimated Time:** 3-4 days
