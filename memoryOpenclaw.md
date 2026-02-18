# OpenClaw Memory System - Deep Dive Analysis

> **Purpose**: Comprehensive analysis of OpenClaw's memory architecture to inform Talon's memory implementation
> 
> **Date**: February 18, 2026
> 
> **Source**: `/Users/orlandoascanio/openclaw/src/memory/`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Memory Storage](#memory-storage)
4. [Embedding System](#embedding-system)
5. [Search & Retrieval](#search--retrieval)
6. [Session Memory](#session-memory)
7. [Sync & Indexing](#sync--indexing)
8. [Key Patterns & Lessons](#key-patterns--lessons)
9. [Implementation Recommendations for Talon](#implementation-recommendations-for-talon)

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    MEMORY SYSTEM                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │   Workspace  │      │   Sessions   │                    │
│  │   Files      │      │   Transcripts│                    │
│  │   (.md)      │      │   (.jsonl)   │                    │
│  └──────┬───────┘      └──────┬───────┘                    │
│         │                     │                             │
│         └──────────┬──────────┘                             │
│                    ▼                                         │
│         ┌──────────────────────┐                            │
│         │  File Watcher        │                            │
│         │  (chokidar)          │                            │
│         └──────────┬───────────┘                            │
│                    ▼                                         │
│         ┌──────────────────────┐                            │
│         │  Sync Manager        │                            │
│         │  - Detect changes    │                            │
│         │  - Chunk files       │                            │
│         │  - Track deltas      │                            │
│         └──────────┬───────────┘                            │
│                    ▼                                         │
│         ┌──────────────────────┐                            │
│         │  Embedding Provider  │                            │
│         │  - OpenAI            │                            │
│         │  - Gemini            │                            │
│         │  - Voyage            │                            │
│         │  - Local (llama.cpp) │                            │
│         └──────────┬───────────┘                            │
│                    ▼                                         │
│         ┌──────────────────────┐                            │
│         │  SQLite Database     │                            │
│         │  + sqlite-vec        │                            │
│         │  + FTS5              │                            │
│         └──────────┬───────────┘                            │
│                    ▼                                         │
│         ┌──────────────────────┐                            │
│         │  Search Manager      │                            │
│         │  - Vector search     │                            │
│         │  - Keyword search    │                            │
│         │  - Hybrid ranking    │                            │
│         └──────────────────────┘                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Local-First**: Everything stored in SQLite, no external database required
2. **Hybrid Search**: Combines vector similarity + full-text search for better results
3. **Automatic Sync**: File watcher detects changes and re-indexes automatically
4. **Provider Fallback**: Multiple embedding providers with automatic failover
5. **Session Integration**: Automatically indexes conversation history
6. **Caching**: Embedding cache to avoid re-computing unchanged content

---

## Core Components

### 1. MemoryIndexManager (`manager.ts`)

**Purpose**: Main orchestrator for the entire memory system

**Key Responsibilities**:
- Database initialization and schema management
- Embedding provider lifecycle
- Search coordination (vector + keyword)
- File watching and sync triggering
- Session memory integration
- Cache management

**Class Structure**:
```typescript
class MemoryIndexManager implements MemorySearchManager {
  // Configuration
  private readonly cfg: OpenClawConfig;
  private readonly agentId: string;
  private readonly workspaceDir: string;
  private readonly settings: ResolvedMemorySearchConfig;
  
  // Providers
  private provider: EmbeddingProvider;
  private openAi?: OpenAiEmbeddingClient;
  private gemini?: GeminiEmbeddingClient;
  private voyage?: VoyageEmbeddingClient;
  
  // Storage
  private db: DatabaseSync; // SQLite
  private readonly sources: Set<MemorySource>; // "memory" | "sessions"
  
  // State
  private watcher: FSWatcher | null;
  private dirty: boolean;
  private sessionsDirty: boolean;
  private syncing: Promise<void> | null;
  
  // Core Methods
  async search(query: string, opts?: SearchOptions): Promise<MemorySearchResult[]>
  async sync(params?: SyncParams): Promise<void>
  async readFile(params: ReadFileParams): Promise<{ text: string; path: string }>
  status(): MemoryProviderStatus
  async close(): Promise<void>
}
```

**Singleton Pattern**:
```typescript
// Uses a cache to ensure one manager per agent/workspace
static async get(params: {
  cfg: OpenClawConfig;
  agentId: string;
  purpose?: "default" | "status";
}): Promise<MemoryIndexManager | null>
```

### 2. QmdMemoryManager (`qmd-manager.ts`)

**Purpose**: Query-based memory dispatch system (43 KB - largest file!)

**What it does**:
- Provides an alternative backend to the built-in SQLite system
- Integrates with external query engines
- Handles scoped queries (by channel, chat type, etc.)
- Manages session export for external indexing

**Key Features**:
- Collection-based organization
- Session exporter with retention policies
- Scope filtering (channel, chat type)
- Fallback to built-in manager on failure

### 3. Search Manager (`search-manager.ts`)

**Purpose**: High-level search interface with fallback logic

**Key Pattern**:
```typescript
class FallbackMemoryManager implements MemorySearchManager {
  private fallback: MemorySearchManager | null = null;
  private primaryFailed = false;
  
  async search(query: string, opts?: SearchOptions) {
    if (!this.primaryFailed) {
      try {
        return await this.deps.primary.search(query, opts);
      } catch (err) {
        this.primaryFailed = true;
        // Switch to fallback
        await this.ensureFallback();
      }
    }
    return await this.fallback.search(query, opts);
  }
}
```

**Lesson**: Always have a fallback strategy for critical systems

---

## Memory Storage

### Database Schema

**Tables**:

1. **`files`** - Tracks indexed files
   ```sql
   CREATE TABLE files (
     path TEXT PRIMARY KEY,
     source TEXT NOT NULL,  -- "memory" | "sessions"
     hash TEXT NOT NULL,
     mtimeMs REAL NOT NULL,
     size INTEGER NOT NULL,
     indexed_at INTEGER NOT NULL
   )
   ```

2. **`chunks`** - Text chunks from files
   ```sql
   CREATE TABLE chunks (
     id TEXT PRIMARY KEY,
     file_path TEXT NOT NULL,
     source TEXT NOT NULL,
     start_line INTEGER NOT NULL,
     end_line INTEGER NOT NULL,
     text TEXT NOT NULL,
     FOREIGN KEY (file_path) REFERENCES files(path)
   )
   ```

3. **`chunks_vec`** - Vector embeddings (sqlite-vec virtual table)
   ```sql
   CREATE VIRTUAL TABLE chunks_vec USING vec0(
     id TEXT PRIMARY KEY,
     embedding FLOAT[1536]  -- Dimension varies by model
   )
   ```

4. **`chunks_fts`** - Full-text search index (FTS5)
   ```sql
   CREATE VIRTUAL TABLE chunks_fts USING fts5(
     id UNINDEXED,
     text,
     content='chunks',
     content_rowid='rowid'
   )
   ```

5. **`embedding_cache`** - Cache for embeddings
   ```sql
   CREATE TABLE embedding_cache (
     key TEXT PRIMARY KEY,
     embedding BLOB NOT NULL,
     created_at INTEGER NOT NULL
   )
   ```

6. **`meta`** - Metadata storage
   ```sql
   CREATE TABLE meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )
   ```

### Storage Location

- **Default**: `~/.openclaw/state/agents/{agentId}/memory.db`
- **Configurable**: Via `agents.defaults.memorySearch.store.path`

### File Sources

1. **`memory`** - Workspace markdown files
   - Location: `~/.openclaw/workspace/memory/*.md`
   - Watched for changes
   - User-created notes and facts

2. **`sessions`** - Conversation transcripts
   - Location: `~/.openclaw/state/sessions/{agentId}/*.jsonl`
   - Auto-indexed from chat history
   - Filtered to user/assistant messages only

---

## Embedding System

### Provider Architecture

**Interface**:
```typescript
type EmbeddingProvider = {
  id: string;
  model: string;
  maxInputTokens?: number;
  embedQuery: (text: string) => Promise<number[]>;
  embedBatch: (texts: string[]) => Promise<number[][]>;
};
```

### Supported Providers

1. **OpenAI** (`embeddings-openai.ts`)
   - Model: `text-embedding-3-small` (default)
   - Dimensions: 1536
   - Batch support: Yes
   - Cost: $0.02 / 1M tokens

2. **Gemini** (`embeddings-gemini.ts`)
   - Model: `gemini-embedding-001`
   - Dimensions: 768
   - Batch support: Yes
   - Cost: Free (with API key)

3. **Voyage** (`embeddings-voyage.ts`)
   - Model: `voyage-4-large`
   - Dimensions: 1024
   - Batch support: Yes
   - Cost: $0.12 / 1M tokens

4. **Local** (`embeddings.ts` + `node-llama.ts`)
   - Model: `embeddinggemma-300m-qat-Q8_0.gguf` (default)
   - Dimensions: 256
   - Batch support: Yes (sequential)
   - Cost: Free (runs locally via llama.cpp)

### Provider Selection Logic

```typescript
async function createEmbeddingProvider(
  options: EmbeddingProviderOptions
): Promise<EmbeddingProviderResult> {
  const requestedProvider = options.provider;
  const fallback = options.fallback;
  
  if (requestedProvider === "auto") {
    // Try local first if model file exists
    if (canAutoSelectLocal(options)) {
      try {
        return await createProvider("local");
      } catch (err) {
        // Fall through to remote providers
      }
    }
    
    // Try remote providers in order
    for (const provider of ["openai", "gemini", "voyage"]) {
      try {
        return await createProvider(provider);
      } catch (err) {
        if (isMissingApiKeyError(err)) {
          continue; // Try next provider
        }
        throw err; // Fatal error
      }
    }
  }
  
  // Try requested provider with fallback
  try {
    return await createProvider(requestedProvider);
  } catch (primaryErr) {
    if (fallback && fallback !== "none") {
      return await createProvider(fallback);
    }
    throw primaryErr;
  }
}
```

**Key Lessons**:
- Auto-detection tries local first (no API costs)
- Graceful fallback chain for remote providers
- Clear error messages for missing API keys

### Embedding Normalization

```typescript
function sanitizeAndNormalizeEmbedding(vec: number[]): number[] {
  // Replace NaN/Infinity with 0
  const sanitized = vec.map((value) => 
    Number.isFinite(value) ? value : 0
  );
  
  // L2 normalization
  const magnitude = Math.sqrt(
    sanitized.reduce((sum, value) => sum + value * value, 0)
  );
  
  if (magnitude < 1e-10) {
    return sanitized; // Avoid division by zero
  }
  
  return sanitized.map((value) => value / magnitude);
}
```

**Why normalize?**
- Ensures consistent similarity scores
- Prevents numerical instability
- Required for cosine similarity


---

## Search & Retrieval

### Hybrid Search Architecture

OpenClaw uses **hybrid search** combining vector similarity and keyword matching:

```typescript
async search(query: string, opts?: SearchOptions): Promise<MemorySearchResult[]> {
  // 1. Keyword search (FTS5)
  const keywordResults = hybrid.enabled
    ? await this.searchKeyword(cleaned, candidates)
    : [];
  
  // 2. Vector search (sqlite-vec)
  const queryVec = await this.embedQueryWithTimeout(cleaned);
  const vectorResults = hasVector
    ? await this.searchVector(queryVec, candidates)
    : [];
  
  // 3. Merge results with weighted scoring
  const merged = this.mergeHybridResults({
    vector: vectorResults,
    keyword: keywordResults,
    vectorWeight: 0.7,  // Configurable
    textWeight: 0.3,    // Configurable
  });
  
  // 4. Filter and limit
  return merged
    .filter((entry) => entry.score >= minScore)
    .slice(0, maxResults);
}
```

### Vector Search Implementation

**Query**:
```sql
SELECT 
  c.id,
  c.file_path as path,
  c.start_line as startLine,
  c.end_line as endLine,
  c.source,
  c.text,
  vec_distance_cosine(v.embedding, ?) as distance
FROM chunks c
JOIN chunks_vec v ON c.id = v.id
WHERE c.source IN (?, ?)  -- Filter by source
ORDER BY distance ASC
LIMIT ?
```

**Scoring**:
```typescript
// Convert distance to similarity score (0-1)
const score = 1 - distance;
```

### Keyword Search Implementation

**Query**:
```sql
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
WHERE fts.text MATCH ?  -- FTS5 query
  AND c.source IN (?, ?)
ORDER BY rank DESC
LIMIT ?
```

**BM25 Scoring**:
```typescript
function bm25RankToScore(rank: number): number {
  // BM25 returns negative scores (lower = better)
  // Convert to 0-1 scale
  const normalized = Math.max(0, -rank);
  return Math.min(1, normalized / 10);
}
```

### Hybrid Result Merging

**Algorithm**:
```typescript
function mergeHybridResults(params: {
  vector: Array<{ id: string; vectorScore: number; ... }>;
  keyword: Array<{ id: string; textScore: number; ... }>;
  vectorWeight: number;
  textWeight: number;
}): MemorySearchResult[] {
  const { vector, keyword, vectorWeight, textWeight } = params;
  
  // Index results by ID
  const byId = new Map<string, MemorySearchResult>();
  
  // Add vector results
  for (const result of vector) {
    byId.set(result.id, {
      ...result,
      score: result.vectorScore * vectorWeight,
    });
  }
  
  // Merge keyword results
  for (const result of keyword) {
    const existing = byId.get(result.id);
    if (existing) {
      // Combine scores
      existing.score += result.textScore * textWeight;
    } else {
      // Add new result
      byId.set(result.id, {
        ...result,
        score: result.textScore * textWeight,
      });
    }
  }
  
  // Sort by combined score
  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score);
}
```

**Why Hybrid?**
- Vector search: Semantic similarity (understands meaning)
- Keyword search: Exact matches (finds specific terms)
- Combined: Best of both worlds

### Search Configuration

```typescript
type ResolvedMemorySearchConfig = {
  query: {
    maxResults: number;        // Default: 6
    minScore: number;          // Default: 0.35
    hybrid: {
      enabled: boolean;        // Default: true
      vectorWeight: number;    // Default: 0.7
      textWeight: number;      // Default: 0.3
      candidateMultiplier: number; // Default: 4
    };
  };
};
```

**Tuning Tips**:
- Higher `vectorWeight`: Prioritize semantic similarity
- Higher `textWeight`: Prioritize exact keyword matches
- Higher `candidateMultiplier`: More thorough but slower
- Lower `minScore`: More results but lower quality

---

## Session Memory

### Session Memory Hook

**Purpose**: Automatically save conversation context to memory when starting a new session

**Trigger**: `/new` command

**Flow**:
```
User types /new
    ↓
Hook triggered (command:new event)
    ↓
Read last N messages from session transcript
    ↓
Generate descriptive slug via LLM
    ↓
Create memory file: YYYY-MM-DD-slug.md
    ↓
Notify user
```

### Implementation (`hooks/bundled/session-memory/handler.ts`)

```typescript
const saveSessionToMemory: HookHandler = async (event) => {
  if (event.type !== "command" || event.action !== "new") {
    return;
  }
  
  // 1. Resolve paths
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const memoryDir = path.join(workspaceDir, "memory");
  
  // 2. Read recent messages
  const sessionContent = await getRecentSessionContent(
    sessionFile,
    messageCount // Default: 15
  );
  
  // 3. Generate slug via LLM
  const slug = await generateSlugViaLLM({ sessionContent, cfg });
  
  // 4. Create memory file
  const filename = `${dateStr}-${slug}.md`;
  const entry = `
# Session: ${dateStr} ${timeStr} UTC

- **Session Key**: ${event.sessionKey}
- **Session ID**: ${sessionId}
- **Source**: ${source}

## Conversation Summary

${sessionContent}
`;
  
  await fs.writeFile(path.join(memoryDir, filename), entry);
};
```

### Session File Parsing

**Format**: JSONL (one JSON object per line)

**Structure**:
```json
{"type":"message","message":{"role":"user","content":"Hello"}}
{"type":"message","message":{"role":"assistant","content":"Hi there!"}}
{"type":"tool_use","tool":"file_read","args":{...}}
{"type":"tool_result","tool":"file_read","result":"..."}
```

**Extraction Logic**:
```typescript
function extractSessionText(content: unknown): string | null {
  if (typeof content === "string") {
    return normalizeSessionText(content);
  }
  
  if (!Array.isArray(content)) {
    return null;
  }
  
  // Extract text blocks from content array
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(normalizeSessionText(block.text));
    }
  }
  
  return parts.join(" ");
}
```

### Session Indexing

**Automatic Indexing**:
- Sessions are indexed as a separate source (`"sessions"`)
- Stored in same SQLite database as memory files
- Filtered to user/assistant messages only
- Tool calls and results excluded

**Delta Tracking**:
```typescript
private sessionDeltas = new Map<
  string,
  { 
    lastSize: number;
    pendingBytes: number;
    pendingMessages: number;
  }
>();
```

**Sync Triggers**:
1. **On session start**: `warmSession(sessionKey)`
2. **On search**: If `sessionsDirty` flag is set
3. **On file change**: File watcher detects `.jsonl` changes
4. **Periodic**: Interval timer (configurable)

**Configuration**:
```typescript
sync: {
  sessions: {
    deltaBytes: 100_000,    // Re-index after 100KB
    deltaMessages: 50,      // Re-index after 50 messages
  }
}
```

---

## Sync & Indexing

### File Watching

**Library**: `chokidar` (robust cross-platform file watcher)

**Setup**:
```typescript
private ensureWatcher(): void {
  if (this.watcher || !this.settings.sync.watch) {
    return;
  }
  
  const paths = [
    path.join(this.workspaceDir, "memory"),
    ...this.settings.extraPaths,
  ];
  
  this.watcher = chokidar.watch(paths, {
    ignored: (path) => shouldIgnoreMemoryWatchPath(path),
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });
  
  this.watcher.on("add", () => this.markDirty());
  this.watcher.on("change", () => this.markDirty());
  this.watcher.on("unlink", () => this.markDirty());
}
```

**Ignored Paths**:
```typescript
const IGNORED_MEMORY_WATCH_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".pnpm-store",
  ".venv",
  "venv",
  ".tox",
  "__pycache__",
]);
```

### Sync Process

**Debounced Sync**:
```typescript
private markDirty(): void {
  this.dirty = true;
  
  if (this.watchTimer) {
    clearTimeout(this.watchTimer);
  }
  
  this.watchTimer = setTimeout(() => {
    void this.sync({ reason: "watch" });
  }, this.settings.sync.watchDebounceMs); // Default: 1500ms
}
```

**Sync Implementation** (`manager-sync-ops.ts`):
```typescript
async runSync(params?: {
  reason?: string;
  force?: boolean;
  progress?: (update: MemorySyncProgressUpdate) => void;
}): Promise<void> {
  // 1. List files
  const memoryFiles = await listMemoryFiles(this.workspaceDir);
  const sessionFiles = await listSessionFilesForAgent(this.agentId);
  
  // 2. Detect changes
  const toIndex: FileEntry[] = [];
  const toDelete: string[] = [];
  
  for (const file of memoryFiles) {
    const existing = this.db
      .prepare("SELECT hash FROM files WHERE path = ?")
      .get(file.path);
    
    if (!existing || existing.hash !== file.hash) {
      toIndex.push(file);
    }
  }
  
  // 3. Chunk files
  const chunks: ChunkEntry[] = [];
  for (const file of toIndex) {
    const fileChunks = await chunkFile(file, {
      tokens: this.settings.chunking.tokens,
      overlap: this.settings.chunking.overlap,
    });
    chunks.push(...fileChunks);
  }
  
  // 4. Generate embeddings
  const texts = chunks.map((c) => c.text);
  const embeddings = await this.embedBatchWithRetry(texts);
  
  // 5. Update database
  this.db.exec("BEGIN TRANSACTION");
  try {
    // Delete old chunks
    for (const path of toDelete) {
      this.db.prepare("DELETE FROM files WHERE path = ?").run(path);
      this.db.prepare("DELETE FROM chunks WHERE file_path = ?").run(path);
    }
    
    // Insert new chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      
      this.db.prepare(`
        INSERT OR REPLACE INTO chunks (id, file_path, source, start_line, end_line, text)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(chunk.id, chunk.filePath, chunk.source, chunk.startLine, chunk.endLine, chunk.text);
      
      this.db.prepare(`
        INSERT OR REPLACE INTO chunks_vec (id, embedding)
        VALUES (?, ?)
      `).run(chunk.id, JSON.stringify(embedding));
    }
    
    this.db.exec("COMMIT");
  } catch (err) {
    this.db.exec("ROLLBACK");
    throw err;
  }
  
  this.dirty = false;
}
```

### Chunking Strategy

**Algorithm**:
```typescript
async function chunkFile(
  file: FileEntry,
  opts: { tokens: number; overlap: number }
): Promise<ChunkEntry[]> {
  const lines = file.content.split("\n");
  const chunks: ChunkEntry[] = [];
  
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let startLine = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line);
    
    if (currentTokens + lineTokens > opts.tokens && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        id: randomUUID(),
        filePath: file.path,
        source: file.source,
        startLine,
        endLine: i,
        text: currentChunk.join("\n"),
      });
      
      // Start new chunk with overlap
      const overlapLines = Math.floor(opts.overlap / (opts.tokens / currentChunk.length));
      currentChunk = currentChunk.slice(-overlapLines);
      currentTokens = currentChunk.reduce((sum, l) => sum + estimateTokens(l), 0);
      startLine = i - overlapLines + 1;
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
      text: currentChunk.join("\n"),
    });
  }
  
  return chunks;
}
```

**Configuration**:
```typescript
chunking: {
  tokens: 400,    // Default chunk size
  overlap: 80,    // Overlap between chunks (20%)
}
```

**Why Overlap?**
- Prevents context loss at chunk boundaries
- Improves search recall for queries spanning boundaries
- 20% overlap is a good balance

### Embedding Cache

**Purpose**: Avoid re-computing embeddings for unchanged content

**Key Generation**:
```typescript
function computeCacheKey(text: string, providerKey: string): string {
  return hashText(`${providerKey}:${text}`);
}
```

**Cache Lookup**:
```typescript
async embedBatchWithCache(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  const toEmbed: { index: number; text: string }[] = [];
  
  // Check cache
  for (let i = 0; i < texts.length; i++) {
    const key = computeCacheKey(texts[i], this.providerKey);
    const cached = this.db
      .prepare("SELECT embedding FROM embedding_cache WHERE key = ?")
      .get(key);
    
    if (cached) {
      results[i] = JSON.parse(cached.embedding);
    } else {
      toEmbed.push({ index: i, text: texts[i] });
    }
  }
  
  // Embed uncached texts
  if (toEmbed.length > 0) {
    const embeddings = await this.provider.embedBatch(
      toEmbed.map((e) => e.text)
    );
    
    // Store in cache
    for (let i = 0; i < toEmbed.length; i++) {
      const { index, text } = toEmbed[i];
      const embedding = embeddings[i];
      const key = computeCacheKey(text, this.providerKey);
      
      this.db.prepare(`
        INSERT OR REPLACE INTO embedding_cache (key, embedding, created_at)
        VALUES (?, ?, ?)
      `).run(key, JSON.stringify(embedding), Date.now());
      
      results[index] = embedding;
    }
  }
  
  return results;
}
```

**Cache Eviction**:
```typescript
// LRU eviction when cache exceeds maxEntries
if (this.cache.maxEntries) {
  const count = this.db
    .prepare("SELECT COUNT(*) as c FROM embedding_cache")
    .get().c;
  
  if (count > this.cache.maxEntries) {
    const toDelete = count - this.cache.maxEntries;
    this.db.prepare(`
      DELETE FROM embedding_cache
      WHERE key IN (
        SELECT key FROM embedding_cache
        ORDER BY created_at ASC
        LIMIT ?
      )
    `).run(toDelete);
  }
}
```


---

## Key Patterns & Lessons

### 1. Singleton with Cache

**Pattern**:
```typescript
const INDEX_CACHE = new Map<string, MemoryIndexManager>();

class MemoryIndexManager {
  static async get(params: GetParams): Promise<MemoryIndexManager | null> {
    const key = buildCacheKey(params);
    const existing = INDEX_CACHE.get(key);
    if (existing) {
      return existing;
    }
    
    const manager = new MemoryIndexManager(params);
    INDEX_CACHE.set(key, manager);
    return manager;
  }
}
```

**Why?**
- Prevents multiple managers for same agent/workspace
- Shares file watcher and database connection
- Reduces memory footprint

### 2. Mixin Pattern for Large Classes

**Pattern**:
```typescript
// manager.ts
class MemoryIndexManager {
  // Core methods only
}

// manager-sync-ops.ts
class MemoryManagerSyncOps {
  // Sync-related methods
}

// manager-embedding-ops.ts
class MemoryManagerEmbeddingOps {
  // Embedding-related methods
}

// Apply mixins
applyPrototypeMixins(
  MemoryIndexManager.prototype,
  MemoryManagerSyncOps,
  MemoryManagerEmbeddingOps
);
```

**Why?**
- Keeps files manageable (manager.ts is 18KB, not 60KB)
- Logical separation of concerns
- Easier to navigate and maintain

### 3. Graceful Degradation

**Pattern**:
```typescript
// Try primary provider
try {
  return await primaryProvider.embed(text);
} catch (primaryErr) {
  // Try fallback provider
  if (fallback && fallback !== "none") {
    try {
      return await fallbackProvider.embed(text);
    } catch (fallbackErr) {
      throw new Error(
        `Primary failed: ${primaryErr.message}\n` +
        `Fallback failed: ${fallbackErr.message}`
      );
    }
  }
  throw primaryErr;
}
```

**Why?**
- System remains functional even if preferred provider fails
- Clear error messages when all options exhausted
- User doesn't need to manually switch providers

### 4. Debounced File Watching

**Pattern**:
```typescript
private markDirty(): void {
  this.dirty = true;
  
  if (this.watchTimer) {
    clearTimeout(this.watchTimer);
  }
  
  this.watchTimer = setTimeout(() => {
    void this.sync({ reason: "watch" });
  }, DEBOUNCE_MS);
}
```

**Why?**
- Prevents sync storms when multiple files change
- Batches changes for efficiency
- Reduces embedding API calls

### 5. Progress Reporting

**Pattern**:
```typescript
async sync(params?: {
  progress?: (update: MemorySyncProgressUpdate) => void;
}): Promise<void> {
  const progress = params?.progress;
  
  // Report progress
  progress?.({ completed: 0, total: files.length, label: "Scanning files" });
  
  for (let i = 0; i < files.length; i++) {
    await processFile(files[i]);
    progress?.({ completed: i + 1, total: files.length });
  }
}
```

**Why?**
- User feedback for long operations
- Helps debug stuck syncs
- Improves perceived performance

### 6. Lazy Loading

**Pattern**:
```typescript
// Don't import node-llama-cpp at module level
async function createLocalEmbeddingProvider(): Promise<EmbeddingProvider> {
  // Import only when needed
  const { getLlama, resolveModelFile } = await import("node-llama-cpp");
  
  // Initialize lazily
  let llama: Llama | null = null;
  const ensureContext = async () => {
    if (!llama) {
      llama = await getLlama();
    }
    return llama;
  };
  
  return {
    embedQuery: async (text) => {
      const ctx = await ensureContext();
      return await ctx.embed(text);
    },
  };
}
```

**Why?**
- Faster startup (node-llama-cpp is heavy)
- Only loads when local embeddings are used
- Reduces memory footprint

### 7. Transactional Updates

**Pattern**:
```typescript
this.db.exec("BEGIN TRANSACTION");
try {
  // Multiple operations
  this.db.prepare("DELETE FROM chunks WHERE file_path = ?").run(path);
  this.db.prepare("INSERT INTO chunks ...").run(...);
  this.db.prepare("INSERT INTO chunks_vec ...").run(...);
  
  this.db.exec("COMMIT");
} catch (err) {
  this.db.exec("ROLLBACK");
  throw err;
}
```

**Why?**
- Ensures database consistency
- All-or-nothing updates
- Prevents partial state on errors

### 8. Source Filtering

**Pattern**:
```typescript
private buildSourceFilter(alias?: string): { sql: string; params: string[] } {
  if (this.sources.size === 0) {
    return { sql: "", params: [] };
  }
  
  const prefix = alias ? `${alias}.` : "";
  const placeholders = Array.from(this.sources).map(() => "?").join(", ");
  
  return {
    sql: ` AND ${prefix}source IN (${placeholders})`,
    params: Array.from(this.sources),
  };
}

// Usage
const filter = this.buildSourceFilter("c");
const results = this.db.prepare(`
  SELECT * FROM chunks c
  WHERE 1=1${filter.sql}
`).all(...filter.params);
```

**Why?**
- Flexible source filtering (memory, sessions, or both)
- Prevents SQL injection
- Reusable across queries

### 9. Hybrid Search Weighting

**Pattern**:
```typescript
const merged = mergeHybridResults({
  vector: vectorResults,
  keyword: keywordResults,
  vectorWeight: 0.7,  // Semantic similarity
  textWeight: 0.3,    // Keyword matching
});
```

**Why?**
- Balances semantic and lexical search
- Configurable per use case
- Better results than either alone

### 10. Session Delta Tracking

**Pattern**:
```typescript
private sessionDeltas = new Map<string, {
  lastSize: number;
  pendingBytes: number;
  pendingMessages: number;
}>();

private checkSessionDelta(sessionFile: string): boolean {
  const stat = fs.statSync(sessionFile);
  const delta = this.sessionDeltas.get(sessionFile) || {
    lastSize: 0,
    pendingBytes: 0,
    pendingMessages: 0,
  };
  
  const newBytes = stat.size - delta.lastSize;
  delta.pendingBytes += newBytes;
  delta.lastSize = stat.size;
  
  // Trigger sync if threshold exceeded
  if (delta.pendingBytes >= this.settings.sync.sessions.deltaBytes) {
    delta.pendingBytes = 0;
    return true;
  }
  
  return false;
}
```

**Why?**
- Avoids re-indexing entire session on every message
- Batches updates for efficiency
- Configurable thresholds

---

## Implementation Recommendations for Talon

### Phase 1: Core Memory System (MVP)

**Goal**: Basic memory storage and retrieval

**Components**:
1. **SQLite Database**
   - Schema: `files`, `chunks`, `meta`
   - Location: `~/.talon/state/memory.db`

2. **File Watcher**
   - Watch: `~/.talon/workspace/memory/*.md`
   - Library: `chokidar`
   - Debounce: 1500ms

3. **Chunking**
   - Strategy: Fixed token size with overlap
   - Size: 400 tokens
   - Overlap: 80 tokens (20%)

4. **Basic Search**
   - Keyword-only (FTS5)
   - No embeddings yet

**Estimated Effort**: 2-3 days

### Phase 2: Vector Search

**Goal**: Add semantic search with embeddings

**Components**:
1. **Embedding Provider**
   - Start with OpenAI (simplest)
   - Model: `text-embedding-3-small`
   - Fallback: None (for now)

2. **Vector Storage**
   - Library: `sqlite-vec`
   - Table: `chunks_vec`
   - Dimensions: 1536

3. **Vector Search**
   - Cosine similarity
   - Top-K retrieval

**Estimated Effort**: 2-3 days

### Phase 3: Hybrid Search

**Goal**: Combine vector and keyword search

**Components**:
1. **Merge Algorithm**
   - Weighted scoring
   - Deduplication by chunk ID

2. **Configuration**
   - `vectorWeight`: 0.7
   - `textWeight`: 0.3
   - `minScore`: 0.35

**Estimated Effort**: 1 day

### Phase 4: Session Memory

**Goal**: Automatically index conversation history

**Components**:
1. **Session Indexing**
   - Source: `~/.talon/state/sessions/*.jsonl`
   - Filter: User/assistant messages only
   - Delta tracking

2. **Session Memory Hook**
   - Trigger: `/new` command
   - Action: Save summary to memory
   - Slug generation: LLM-based

**Estimated Effort**: 2-3 days

### Phase 5: Advanced Features

**Goal**: Production-ready memory system

**Components**:
1. **Multiple Providers**
   - OpenAI, Gemini, Voyage, Local
   - Auto-selection
   - Fallback chain

2. **Embedding Cache**
   - Table: `embedding_cache`
   - LRU eviction
   - Provider-specific keys

3. **Progress Reporting**
   - Sync progress UI
   - Status endpoint

4. **QMD Backend** (Optional)
   - External query engine
   - Collection-based organization

**Estimated Effort**: 3-5 days

### Recommended Tech Stack

**Database**:
- `better-sqlite3` - Synchronous SQLite bindings (faster than node:sqlite)
- `sqlite-vec` - Vector extension for SQLite

**File Watching**:
- `chokidar` - Cross-platform file watcher

**Embeddings**:
- `openai` - Official OpenAI SDK
- `@google/generative-ai` - Gemini SDK
- `voyageai` - Voyage SDK
- `node-llama-cpp` - Local embeddings (optional)

**Utilities**:
- `tiktoken` - Token counting (OpenAI tokenizer)
- `crypto` - Hashing for cache keys

### Configuration Schema

```typescript
type MemoryConfig = {
  enabled: boolean;
  
  sources: Array<"memory" | "sessions">;
  
  store: {
    path: string;  // Default: ~/.talon/state/memory.db
    vector: {
      enabled: boolean;
      extensionPath?: string;
    };
  };
  
  provider: "openai" | "gemini" | "voyage" | "local" | "auto";
  model: string;
  fallback: "openai" | "gemini" | "voyage" | "local" | "none";
  
  chunking: {
    tokens: number;    // Default: 400
    overlap: number;   // Default: 80
  };
  
  sync: {
    watch: boolean;
    watchDebounceMs: number;  // Default: 1500
    onSessionStart: boolean;
    onSearch: boolean;
    intervalMinutes: number;
    sessions: {
      deltaBytes: number;      // Default: 100000
      deltaMessages: number;   // Default: 50
    };
  };
  
  query: {
    maxResults: number;  // Default: 6
    minScore: number;    // Default: 0.35
    hybrid: {
      enabled: boolean;
      vectorWeight: number;  // Default: 0.7
      textWeight: number;    // Default: 0.3
    };
  };
  
  cache: {
    enabled: boolean;
    maxEntries?: number;
  };
};
```

### API Design

```typescript
interface MemoryManager {
  // Search
  search(
    query: string,
    opts?: {
      maxResults?: number;
      minScore?: number;
      sessionKey?: string;
    }
  ): Promise<MemorySearchResult[]>;
  
  // File operations
  readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }>;
  
  // Sync
  sync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void>;
  
  // Status
  status(): MemoryProviderStatus;
  
  // Lifecycle
  close(): Promise<void>;
}

type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: "memory" | "sessions";
  citation?: string;
};
```

### Testing Strategy

**Unit Tests**:
- Chunking algorithm
- Embedding normalization
- Hybrid merge algorithm
- Cache key generation

**Integration Tests**:
- File watching and sync
- Database operations
- Provider fallback
- Session indexing

**E2E Tests**:
- Full search flow
- Memory hook trigger
- Multi-source search

### Performance Considerations

**Optimization Targets**:
1. **Startup Time**: < 100ms (lazy load providers)
2. **Search Latency**: < 500ms (with cache)
3. **Sync Time**: < 5s for 100 files
4. **Memory Usage**: < 50MB (excluding embeddings)

**Bottlenecks**:
- Embedding generation (API latency)
- File I/O (use async operations)
- Database writes (use transactions)

**Caching Strategy**:
- Embedding cache (persistent)
- Search result cache (in-memory, TTL)
- File hash cache (persistent)

### Security Considerations

**Path Validation**:
```typescript
function validateMemoryPath(relPath: string, workspaceDir: string): boolean {
  const absPath = path.resolve(workspaceDir, relPath);
  const normalized = path.relative(workspaceDir, absPath);
  
  // Prevent directory traversal
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return false;
  }
  
  // Only allow .md files
  if (!absPath.endsWith(".md")) {
    return false;
  }
  
  return true;
}
```

**Sensitive Data**:
- Redact API keys from logs
- Don't index `.env` files
- Exclude sensitive directories (`.ssh`, `.aws`, etc.)

**API Keys**:
- Store in environment variables
- Never commit to git
- Use separate keys per environment

---

## Comparison: OpenClaw vs Talon

### Similarities

| Feature | OpenClaw | Talon |
|---------|----------|-------|
| **Storage** | SQLite + sqlite-vec | SQLite + sqlite-vec |
| **Search** | Hybrid (vector + keyword) | Hybrid (vector + keyword) |
| **Sources** | Memory files + sessions | Memory files + sessions |
| **Providers** | OpenAI, Gemini, Voyage, Local | OpenAI, DeepSeek, OpenRouter |
| **Chunking** | Token-based with overlap | Token-based with overlap |
| **Sync** | File watcher + debounce | File watcher + debounce |

### Differences

| Aspect | OpenClaw | Talon |
|--------|----------|-------|
| **Backend** | Built-in + QMD (optional) | Built-in only |
| **Providers** | 4 providers + auto-select | 3 providers + fallback |
| **Session Hook** | LLM-generated slugs | Manual slugs (for now) |
| **Batch Embeddings** | Yes (with retry) | Not yet |
| **Cache** | LRU with max entries | Not yet |
| **Progress UI** | Yes | Not yet |

### What Talon Can Learn

1. **Provider Fallback Chain**: OpenClaw's auto-selection is robust
2. **Mixin Pattern**: Keeps large classes manageable
3. **Session Delta Tracking**: Efficient session indexing
4. **Embedding Cache**: Significant cost savings
5. **Hybrid Search**: Better results than vector-only
6. **Transactional Updates**: Ensures database consistency
7. **Progress Reporting**: Better UX for long operations
8. **Lazy Loading**: Faster startup times

### What Talon Does Better

1. **Simpler Architecture**: No QMD complexity
2. **Unified Provider System**: DeepSeek + OpenRouter integration
3. **Cost Optimization**: Subagent delegation (97% savings)
4. **Gateway Design**: Cleaner separation of concerns

---

## Conclusion

OpenClaw's memory system is a **production-ready, feature-rich implementation** that balances:
- **Performance**: Fast search with caching and indexing
- **Reliability**: Fallback providers and transactional updates
- **Usability**: Automatic sync and progress reporting
- **Flexibility**: Multiple providers and configurable search

**Key Takeaways for Talon**:

1. **Start Simple**: Implement Phase 1 (keyword search) first
2. **Add Vector Search**: Phase 2 unlocks semantic search
3. **Hybrid is Better**: Phase 3 combines best of both worlds
4. **Session Memory**: Phase 4 makes the AI truly contextual
5. **Polish Later**: Phase 5 adds production features

**Estimated Timeline**:
- **MVP (Phases 1-2)**: 1 week
- **Production (Phases 3-4)**: 1 week
- **Polish (Phase 5)**: 1 week
- **Total**: 3 weeks for full feature parity

**Next Steps**:
1. Review this document with the team
2. Prioritize phases based on user needs
3. Set up development environment
4. Implement Phase 1 (MVP)
5. Iterate based on feedback

---

## References

### OpenClaw Source Files

- `src/memory/manager.ts` - Main memory manager (18 KB)
- `src/memory/qmd-manager.ts` - Query-based dispatch (43 KB)
- `src/memory/embeddings.ts` - Embedding providers (9 KB)
- `src/memory/search-manager.ts` - Search interface (7 KB)
- `src/memory/manager-sync-ops.ts` - Sync operations (34 KB)
- `src/memory/manager-embedding-ops.ts` - Embedding operations (25 KB)
- `src/memory/hybrid.ts` - Hybrid search (3 KB)
- `src/memory/session-files.ts` - Session parsing (4 KB)
- `src/hooks/bundled/session-memory/handler.ts` - Session hook (7 KB)

### External Resources

- [sqlite-vec](https://github.com/asg017/sqlite-vec) - Vector extension for SQLite
- [chokidar](https://github.com/paulmillr/chokidar) - File watcher
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) - Local embeddings
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings) - API docs
- [BM25](https://en.wikipedia.org/wiki/Okapi_BM25) - Keyword ranking algorithm

---

**Document Version**: 1.0  
**Last Updated**: February 18, 2026  
**Author**: Talon Development Team  
**Status**: Complete
