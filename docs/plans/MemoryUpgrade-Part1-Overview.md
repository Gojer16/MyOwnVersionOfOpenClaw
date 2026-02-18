# Memory System Upgrade Implementation Plan - Part 1: Overview

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Talon's memory system to match OpenClaw's production-ready architecture with hybrid search, multiple embedding providers, session memory integration, and intelligent sync.

**Architecture:** Modular memory system with SQLite + sqlite-vec + FTS5, multiple embedding providers (OpenAI, Gemini, Local), hybrid search (vector + keyword), automatic file watching, session memory integration, and embedding cache.

**Tech Stack:**
- `better-sqlite3` - SQLite database
- `sqlite-vec` - Vector extension
- `chokidar` - File watcher
- `openai` - OpenAI embeddings
- `@google/generative-ai` - Gemini embeddings
- `node-llama-cpp` - Local embeddings (optional)

---

## Current State Analysis

### What Talon Has ✅

1. **Basic Memory Manager** (`src/memory/manager.ts`)
   - Context building for LLM
   - Token estimation and truncation
   - Memory compression
   - System prompt loading

2. **Vector Memory** (`src/memory/vector.ts`)
   - SQLite + sqlite-vec integration
   - OpenAI embedding provider
   - Simple embedding provider (fallback)
   - Vector search with cosine similarity
   - Message indexing

3. **Daily Memory** (`src/memory/daily.ts`)
   - Daily memory file creation
   - Workspace file management

4. **Memory Compressor** (`src/memory/compressor.ts`)
   - Session history compression
   - Summary generation

### What's Missing ❌

1. **Hybrid Search**
   - No keyword search (FTS5)
   - No result merging algorithm
   - No weighted scoring

2. **Multiple Embedding Providers**
   - Only OpenAI supported
   - No Gemini provider
   - No local embeddings (llama.cpp)
   - No provider fallback chain
   - No auto-selection

3. **File Watching & Sync**
   - No automatic file watching
   - No debounced sync
   - No change detection
   - No delta tracking

4. **Session Memory Integration**
   - No session-to-memory hook
   - No LLM-generated slugs
   - No automatic session indexing
   - No session file parsing

5. **Embedding Cache**
   - No cache table
   - No LRU eviction
   - No provider-specific keys

6. **Chunking System**
   - No file chunking
   - No overlap strategy
   - No token-based splitting

7. **Advanced Features**
   - No progress reporting
   - No source filtering (memory vs sessions)
   - No batch embedding operations
   - No transactional updates

---

## Gap Analysis

### Critical Gaps (Must Have)

| Feature | OpenClaw | Talon | Priority |
|---------|----------|-------|----------|
| **Hybrid Search** | ✅ Vector + Keyword | ❌ Vector only | 🔴 Critical |
| **Provider Fallback** | ✅ 4 providers + auto | ❌ 1 provider | 🔴 Critical |
| **File Watching** | ✅ chokidar + debounce | ❌ None | 🔴 Critical |
| **Session Memory** | ✅ Auto-index + hook | ❌ None | 🔴 Critical |
| **Chunking** | ✅ Token-based + overlap | ❌ None | 🔴 Critical |

### Important Gaps (Should Have)

| Feature | OpenClaw | Talon | Priority |
|---------|----------|-------|----------|
| **Embedding Cache** | ✅ LRU cache | ❌ None | 🟡 Important |
| **Batch Operations** | ✅ Batch embed | ❌ Single only | 🟡 Important |
| **Progress Reporting** | ✅ Sync progress | ❌ None | 🟡 Important |
| **Source Filtering** | ✅ Memory + Sessions | ❌ None | 🟡 Important |

### Nice to Have Gaps

| Feature | OpenClaw | Talon | Priority |
|---------|----------|-------|----------|
| **QMD Backend** | ✅ Optional | ❌ None | 🟢 Nice to have |
| **Multiple Models** | ✅ Per provider | ❌ Fixed | 🟢 Nice to have |
| **Custom Paths** | ✅ Extra paths | ❌ Fixed | 🟢 Nice to have |

---

## Implementation Strategy

### Phase 1: Core Infrastructure (Week 1)
**Goal:** Establish foundation for advanced features

**Tasks:**
1. Database schema upgrade (add FTS5, cache, chunks tables)
2. File chunking system (token-based with overlap)
3. File watcher integration (chokidar)
4. Basic sync manager

**Estimated Time:** 3-4 days

### Phase 2: Embedding Providers (Week 1-2)
**Goal:** Multiple providers with fallback

**Tasks:**
1. Gemini embedding provider
2. Local embedding provider (llama.cpp)
3. Provider factory with auto-selection
4. Fallback chain implementation
5. Embedding cache

**Estimated Time:** 3-4 days

### Phase 3: Hybrid Search (Week 2)
**Goal:** Vector + keyword search with merging

**Tasks:**
1. FTS5 keyword search
2. BM25 scoring
3. Hybrid merge algorithm
4. Weighted result ranking

**Estimated Time:** 2-3 days

### Phase 4: Session Memory (Week 2-3)
**Goal:** Automatic session indexing

**Tasks:**
1. Session file parser
2. Session-to-memory hook
3. LLM slug generation
4. Delta tracking
5. Automatic indexing

**Estimated Time:** 3-4 days

### Phase 5: Polish & Testing (Week 3)
**Goal:** Production-ready features

**Tasks:**
1. Progress reporting
2. Source filtering
3. Batch operations
4. Comprehensive tests
5. Documentation

**Estimated Time:** 3-4 days

---

## Success Criteria

### Functional Requirements

✅ **Hybrid Search**
- Vector search returns semantic matches
- Keyword search returns exact matches
- Merged results ranked by weighted score
- Configurable weights (vector: 0.7, text: 0.3)

✅ **Multiple Providers**
- OpenAI embeddings work
- Gemini embeddings work
- Local embeddings work (optional)
- Auto-selection tries local → OpenAI → Gemini
- Fallback chain works on provider failure

✅ **File Watching**
- Detects new files in workspace/memory
- Detects file changes
- Debounces rapid changes (1500ms)
- Triggers sync automatically

✅ **Session Memory**
- `/new` command saves session to memory
- LLM generates descriptive slug
- Session messages indexed automatically
- Delta tracking prevents full re-index

✅ **Chunking**
- Files split into 400-token chunks
- 20% overlap between chunks
- Line numbers preserved
- Handles markdown files

### Performance Requirements

✅ **Search Latency**
- < 500ms for cached queries
- < 2s for uncached queries
- < 100ms for keyword-only search

✅ **Sync Time**
- < 5s for 100 files
- < 30s for 1000 files
- Progress reporting every 10 files

✅ **Memory Usage**
- < 50MB base memory
- < 200MB with embeddings loaded
- < 500MB with local model

### Reliability Requirements

✅ **Error Handling**
- Provider failures trigger fallback
- Database errors don't crash gateway
- Sync errors logged but don't block
- Graceful degradation on missing features

✅ **Data Integrity**
- Transactional database updates
- No orphaned embeddings
- No duplicate chunks
- Consistent file hashes

---

## Risk Assessment

### High Risk 🔴

1. **sqlite-vec Extension Loading**
   - **Risk:** Extension may not load on all platforms
   - **Mitigation:** Graceful fallback to keyword-only search
   - **Test:** Verify on macOS, Linux, Windows

2. **Local Embeddings (llama.cpp)**
   - **Risk:** Heavy dependency, may fail to install
   - **Mitigation:** Make optional, clear error messages
   - **Test:** Test with and without node-llama-cpp

3. **File Watcher Performance**
   - **Risk:** High CPU on large workspaces
   - **Mitigation:** Ignore patterns, debouncing
   - **Test:** Test with 1000+ files

### Medium Risk 🟡

1. **Embedding API Costs**
   - **Risk:** High costs with frequent re-indexing
   - **Mitigation:** Embedding cache, delta tracking
   - **Test:** Monitor API usage in tests

2. **Database Size Growth**
   - **Risk:** Database grows unbounded
   - **Mitigation:** Cleanup old entries, configurable retention
   - **Test:** Test with 10,000+ chunks

3. **Session File Parsing**
   - **Risk:** JSONL parsing errors
   - **Mitigation:** Robust error handling, skip invalid lines
   - **Test:** Test with malformed JSONL

### Low Risk 🟢

1. **Configuration Complexity**
   - **Risk:** Too many config options
   - **Mitigation:** Sensible defaults, validation
   - **Test:** Test with minimal config

2. **Migration from Old Schema**
   - **Risk:** Breaking existing databases
   - **Mitigation:** Schema version tracking, migrations
   - **Test:** Test upgrade from v0.3.3

---

## Dependencies

### Required NPM Packages

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "chokidar": "^4.0.0",
    "openai": "^4.0.0",
    "@google/generative-ai": "^0.21.0"
  },
  "optionalDependencies": {
    "node-llama-cpp": "^3.0.0"
  }
}
```

### System Requirements

- **Node.js:** 22+ (for node:sqlite support)
- **SQLite:** 3.41+ (for FTS5 and JSON support)
- **sqlite-vec:** 0.1.0+ (for vector search)
- **Disk Space:** 100MB+ for local models (optional)

### Platform Support

- ✅ **macOS:** Full support (including local embeddings)
- ✅ **Linux:** Full support (including local embeddings)
- ⚠️ **Windows:** Partial support (local embeddings may fail)

---

## File Structure

### New Files to Create

```
src/memory/
├── embeddings/
│   ├── base.ts              # EmbeddingProvider interface
│   ├── openai.ts            # OpenAI provider (refactor existing)
│   ├── gemini.ts            # NEW: Gemini provider
│   ├── local.ts             # NEW: Local llama.cpp provider
│   └── factory.ts           # NEW: Provider factory with fallback
├── search/
│   ├── vector.ts            # Vector search (refactor existing)
│   ├── keyword.ts           # NEW: FTS5 keyword search
│   ├── hybrid.ts            # NEW: Hybrid merge algorithm
│   └── types.ts             # Search result types
├── sync/
│   ├── watcher.ts           # NEW: File watcher
│   ├── chunker.ts           # NEW: File chunking
│   ├── indexer.ts           # NEW: Sync manager
│   └── delta.ts             # NEW: Delta tracking
├── session/
│   ├── parser.ts            # NEW: JSONL parser
│   ├── hook.ts              # NEW: Session-to-memory hook
│   ├── slug.ts              # NEW: LLM slug generator
│   └── indexer.ts           # NEW: Session indexer
├── cache/
│   ├── embedding-cache.ts   # NEW: Embedding cache
│   └── lru.ts               # NEW: LRU eviction
├── schema/
│   ├── migrations.ts        # NEW: Schema migrations
│   └── v2.ts                # NEW: V2 schema definition
└── index.ts                 # NEW: Unified memory manager
```

### Files to Modify

```
src/memory/
├── manager.ts               # Refactor to use new components
├── vector.ts                # Extract to embeddings/openai.ts
└── daily.ts                 # Integrate with sync manager

src/tools/
├── memory-tools.ts          # Update to use new search API
└── memory-search-semantic-tool.ts  # Update to use hybrid search

src/config/
└── schema.ts                # Add memory config section

src/gateway/
└── index.ts                 # Initialize memory system
```

---

## Configuration Schema

### New Config Section

```typescript
type MemoryConfig = {
  enabled: boolean;
  
  // Sources
  sources: Array<"memory" | "sessions">;
  extraPaths?: string[];
  
  // Storage
  store: {
    path: string;  // Default: ~/.talon/state/memory.db
    vector: {
      enabled: boolean;
      extensionPath?: string;
    };
  };
  
  // Embedding Provider
  provider: "openai" | "gemini" | "local" | "auto";
  model: string;
  fallback: "openai" | "gemini" | "local" | "none";
  
  // Chunking
  chunking: {
    tokens: number;    // Default: 400
    overlap: number;   // Default: 80 (20%)
  };
  
  // Sync
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
  
  // Search
  query: {
    maxResults: number;  // Default: 6
    minScore: number;    // Default: 0.35
    hybrid: {
      enabled: boolean;
      vectorWeight: number;  // Default: 0.7
      textWeight: number;    // Default: 0.3
    };
  };
  
  // Cache
  cache: {
    enabled: boolean;
    maxEntries?: number;
  };
};
```

---

## Testing Strategy

### Unit Tests

**Coverage Target:** 80%+

```
tests/memory/
├── embeddings/
│   ├── openai.test.ts
│   ├── gemini.test.ts
│   ├── local.test.ts
│   └── factory.test.ts
├── search/
│   ├── vector.test.ts
│   ├── keyword.test.ts
│   └── hybrid.test.ts
├── sync/
│   ├── watcher.test.ts
│   ├── chunker.test.ts
│   └── indexer.test.ts
├── session/
│   ├── parser.test.ts
│   └── indexer.test.ts
└── cache/
    └── embedding-cache.test.ts
```

### Integration Tests

```
tests/integration/
├── memory-search.test.ts      # End-to-end search
├── memory-sync.test.ts        # File watching + sync
├── session-memory.test.ts     # Session indexing
└── provider-fallback.test.ts  # Provider chain
```

### Performance Tests

```
tests/performance/
├── search-latency.test.ts     # Search speed
├── sync-throughput.test.ts    # Sync performance
└── memory-usage.test.ts       # Memory footprint
```

---

## Next Steps

**Continue to Part 2:** Database Schema & Chunking System

**Files:**
- `MemoryUpgrade-Part2-Database.md` - Schema, migrations, chunking
- `MemoryUpgrade-Part3-Providers.md` - Embedding providers
- `MemoryUpgrade-Part4-Search.md` - Hybrid search
- `MemoryUpgrade-Part5-Session.md` - Session memory
- `MemoryUpgrade-Part6-Polish.md` - Testing, docs, deployment

---

**Plan Status:** Part 1 Complete ✅  
**Next:** Part 2 - Database Schema & Chunking System  
**Estimated Total Time:** 3 weeks (15 working days)
