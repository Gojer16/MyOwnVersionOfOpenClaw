# Memory System Upgrade Implementation Plan - Part 2: Database Schema & Chunking

> **For Claude:** This is Part 2 of 6. Implement tasks sequentially with test-first approach.

**Goal:** Upgrade database schema to support hybrid search, chunking, and caching. Implement file chunking system with token-based splitting and overlap.

---

## Task 1: Database Schema V2

**Files:**
- Create: `src/memory/schema/v2.ts`
- Create: `src/memory/schema/migrations.ts`
- Test: `tests/memory/schema/migrations.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/schema/migrations.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrateToV2, getCurrentVersion } from '../../src/memory/schema/migrations.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Schema Migrations', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-memory-${Date.now()}.db`);
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should migrate from V1 to V2 schema', () => {
    // Create V1 schema (current Talon schema)
    db.exec(`
      CREATE TABLE IF NOT EXISTS vector_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        role TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Verify V1
    expect(getCurrentVersion(db)).toBe(1);

    // Migrate to V2
    migrateToV2(db);

    // Verify V2 tables exist
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('files');
    expect(tableNames).toContain('chunks');
    expect(tableNames).toContain('chunks_fts');
    expect(tableNames).toContain('embedding_cache');
    expect(tableNames).toContain('meta');

    // Verify version updated
    expect(getCurrentVersion(db)).toBe(2);
  });

  it('should preserve existing data during migration', () => {
    // Create V1 schema with data
    db.exec(`
      CREATE TABLE vector_messages (
        id INTEGER PRIMARY KEY,
        session_id TEXT,
        message_id TEXT,
        content TEXT,
        role TEXT,
        timestamp INTEGER
      );
      INSERT INTO vector_messages VALUES (1, 'sess1', 'msg1', 'Hello', 'user', 1000);
    `);

    migrateToV2(db);

    // Verify data preserved
    const row = db.prepare('SELECT * FROM vector_messages WHERE message_id = ?').get('msg1');
    expect(row).toBeDefined();
    expect(row.content).toBe('Hello');
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/schema/migrations.test.ts
```

Expected: FAIL with "Cannot find module 'migrations.js'"

### Step 3: Write V2 schema definition

```typescript
// src/memory/schema/v2.ts
import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 2;

export function createV2Schema(db: Database.Database): void {
  db.exec(`
    -- Files table: tracks indexed files
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK(source IN ('memory', 'sessions')),
      hash TEXT NOT NULL,
      mtime_ms REAL NOT NULL,
      size INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_files_source ON files(source);
    CREATE INDEX IF NOT EXISTS idx_files_indexed_at ON files(indexed_at);

    -- Chunks table: text chunks from files
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('memory', 'sessions')),
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      text TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
    CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);

    -- FTS5 table for keyword search
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      id UNINDEXED,
      text,
      content='chunks',
      content_rowid='rowid'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, id, text) VALUES (new.rowid, new.id, new.text);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
      DELETE FROM chunks_fts WHERE rowid = old.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON chunks BEGIN
      DELETE FROM chunks_fts WHERE rowid = old.rowid;
      INSERT INTO chunks_fts(rowid, id, text) VALUES (new.rowid, new.id, new.text);
    END;

    -- Embedding cache table
    CREATE TABLE IF NOT EXISTS embedding_cache (
      key TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cache_created_at ON embedding_cache(created_at);

    -- Meta table for schema version and config
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Insert schema version
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '2');
  `);
}

export function dropV2Schema(db: Database.Database): void {
  db.exec(`
    DROP TRIGGER IF EXISTS chunks_fts_update;
    DROP TRIGGER IF EXISTS chunks_fts_delete;
    DROP TRIGGER IF EXISTS chunks_fts_insert;
    DROP TABLE IF EXISTS chunks_fts;
    DROP TABLE IF EXISTS embedding_cache;
    DROP TABLE IF EXISTS chunks;
    DROP TABLE IF EXISTS files;
    DROP TABLE IF EXISTS meta;
  `);
}
```

### Step 4: Write migration logic

```typescript
// src/memory/schema/migrations.ts
import type Database from 'better-sqlite3';
import { createV2Schema, SCHEMA_VERSION } from './v2.js';
import { logger } from '../../utils/logger.js';

export function getCurrentVersion(db: Database.Database): number {
  try {
    // Check if meta table exists
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='meta'
    `).all() as Array<{ name: string }>;

    if (tables.length === 0) {
      // No meta table = V1 (old schema)
      return 1;
    }

    // Read version from meta
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as
      | { value: string }
      | undefined;

    return row ? parseInt(row.value, 10) : 1;
  } catch (error) {
    logger.warn({ error }, 'Failed to get schema version, assuming V1');
    return 1;
  }
}

export function migrateToV2(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db);

  if (currentVersion >= SCHEMA_VERSION) {
    logger.debug({ currentVersion }, 'Schema already up to date');
    return;
  }

  logger.info({ from: currentVersion, to: SCHEMA_VERSION }, 'Migrating database schema');

  db.exec('BEGIN TRANSACTION');

  try {
    if (currentVersion === 1) {
      // V1 → V2 migration
      logger.info('Migrating from V1 to V2');

      // Create new V2 tables
      createV2Schema(db);

      // Note: We don't migrate vector_messages to chunks
      // because the schema is fundamentally different.
      // Users will need to re-index their memory.
      // The old vector_messages table is left intact for reference.

      logger.info('V1 → V2 migration complete');
    }

    db.exec('COMMIT');
    logger.info({ version: SCHEMA_VERSION }, 'Schema migration successful');
  } catch (error) {
    db.exec('ROLLBACK');
    logger.error({ error }, 'Schema migration failed');
    throw error;
  }
}

export function ensureSchema(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db);

  if (currentVersion < SCHEMA_VERSION) {
    migrateToV2(db);
  } else if (currentVersion === SCHEMA_VERSION) {
    // Schema exists, verify integrity
    logger.debug('Schema version correct, verifying integrity');
  } else {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${SCHEMA_VERSION}`,
    );
  }
}
```

### Step 5: Run test to verify it passes

```bash
npm test tests/memory/schema/migrations.test.ts
```

Expected: PASS

### Step 6: Commit

```bash
git add src/memory/schema/ tests/memory/schema/
git commit -m "feat(memory): add V2 schema with FTS5 and cache tables"
```

---

## Task 2: File Chunking System

**Files:**
- Create: `src/memory/sync/chunker.ts`
- Create: `src/memory/sync/types.ts`
- Test: `tests/memory/sync/chunker.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/sync/chunker.test.ts
import { describe, it, expect } from 'vitest';
import { chunkFile, estimateTokens } from '../../src/memory/sync/chunker.js';
import type { FileEntry } from '../../src/memory/sync/types.js';

describe('File Chunker', () => {
  it('should chunk file into token-sized pieces', () => {
    const file: FileEntry = {
      path: 'test.md',
      absPath: '/workspace/test.md',
      source: 'memory',
      hash: 'abc123',
      mtimeMs: Date.now(),
      size: 1000,
      content: Array(100).fill('This is a test line with about ten words.').join('\n'),
    };

    const chunks = chunkFile(file, {
      tokens: 100,
      overlap: 20,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].tokens).toBeLessThanOrEqual(100);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].filePath).toBe('test.md');
    expect(chunks[0].source).toBe('memory');
  });

  it('should create overlapping chunks', () => {
    const file: FileEntry = {
      path: 'test.md',
      absPath: '/workspace/test.md',
      source: 'memory',
      hash: 'abc123',
      mtimeMs: Date.now(),
      size: 1000,
      content: Array(50).fill('Line with content.').join('\n'),
    };

    const chunks = chunkFile(file, {
      tokens: 50,
      overlap: 10,
    });

    if (chunks.length >= 2) {
      // Check that chunks overlap
      const chunk1End = chunks[0].endLine;
      const chunk2Start = chunks[1].startLine;
      expect(chunk2Start).toBeLessThan(chunk1End);
    }
  });

  it('should handle small files (single chunk)', () => {
    const file: FileEntry = {
      path: 'small.md',
      absPath: '/workspace/small.md',
      source: 'memory',
      hash: 'def456',
      mtimeMs: Date.now(),
      size: 100,
      content: 'Short file.',
    };

    const chunks = chunkFile(file, {
      tokens: 400,
      overlap: 80,
    });

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe('Short file.');
  });

  it('should estimate tokens correctly', () => {
    expect(estimateTokens('Hello world')).toBeGreaterThan(0);
    expect(estimateTokens('A'.repeat(400))).toBeCloseTo(100, -1);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/sync/chunker.test.ts
```

Expected: FAIL with "Cannot find module 'chunker.js'"

### Step 3: Write types

```typescript
// src/memory/sync/types.ts
export type MemorySource = 'memory' | 'sessions';

export type FileEntry = {
  path: string;        // Relative path
  absPath: string;     // Absolute path
  source: MemorySource;
  hash: string;
  mtimeMs: number;
  size: number;
  content: string;
};

export type ChunkEntry = {
  id: string;
  filePath: string;
  source: MemorySource;
  startLine: number;
  endLine: number;
  text: string;
  tokens: number;
};

export type ChunkingConfig = {
  tokens: number;    // Target chunk size
  overlap: number;   // Overlap in tokens
};
```

### Step 4: Write chunking implementation

```typescript
// src/memory/sync/chunker.ts
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
```

### Step 5: Run test to verify it passes

```bash
npm test tests/memory/sync/chunker.test.ts
```

Expected: PASS

### Step 6: Commit

```bash
git add src/memory/sync/ tests/memory/sync/
git commit -m "feat(memory): add file chunking with token-based splitting and overlap"
```

---

## Task 3: File Hash Utilities

**Files:**
- Create: `src/memory/sync/hash.ts`
- Test: `tests/memory/sync/hash.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/sync/hash.test.ts
import { describe, it, expect } from 'vitest';
import { hashText, hashFile } from '../../src/memory/sync/hash.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Hash Utilities', () => {
  it('should hash text consistently', () => {
    const text = 'Hello, world!';
    const hash1 = hashText(text);
    const hash2 = hashText(text);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it('should produce different hashes for different text', () => {
    const hash1 = hashText('Hello');
    const hash2 = hashText('World');
    expect(hash1).not.toBe(hash2);
  });

  it('should hash file content', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'Test content');

    const hash = await hashFile(tmpFile);
    expect(hash).toHaveLength(64);

    fs.unlinkSync(tmpFile);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/sync/hash.test.ts
```

Expected: FAIL

### Step 3: Write implementation

```typescript
// src/memory/sync/hash.ts
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
```

### Step 4: Run test to verify it passes

```bash
npm test tests/memory/sync/hash.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/memory/sync/hash.ts tests/memory/sync/hash.test.ts
git commit -m "feat(memory): add hash utilities for file and text hashing"
```

---

## Progress Tracker

### Completed ✅
- [x] Task 1: Database Schema V2
- [x] Task 2: File Chunking System
- [x] Task 3: File Hash Utilities

### Next Steps
- Continue to Part 3: Embedding Providers
- Implement Gemini provider
- Implement Local provider
- Implement Provider factory

---

**Part 2 Status:** Complete ✅  
**Next:** Part 3 - Embedding Providers  
**Estimated Time:** 3-4 days
