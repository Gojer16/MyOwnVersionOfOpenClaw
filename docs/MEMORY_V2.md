# Memory System V2 - User Guide

> **Hybrid search memory system with multiple embedding providers, automatic file watching, and session memory integration.**

## Overview

Memory V2 is a production-ready memory system that combines:

- **Hybrid Search** - Vector similarity + keyword matching (FTS5 + BM25)
- **Multiple Providers** - OpenRouter, Gemini, Local (llama.cpp)
- **Auto-Indexing** - File watcher with debouncing
- **Session Memory** - Automatic conversation indexing
- **Embedding Cache** - LRU cache for performance

## Quick Start

### 1. Enable Memory V2

Add to `~/.talon/config.json`:

```json
{
  "memoryV2": {
    "enabled": true,
    "embeddings": {
      "provider": "auto",
      "fallback": "gemini"
    }
  }
}
```

### 2. Set API Keys

Add to `~/.talon/.env`:

```bash
# OpenRouter (recommended)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Gemini (free fallback)
GEMINI_API_KEY=your-gemini-key-here
```

### 3. Start Talon

```bash
npm start
```

Memory V2 will automatically:
- Initialize database schema
- Select best embedding provider
- Start watching memory files
- Index existing files

## Configuration

### Full Config Schema

```json
{
  "memoryV2": {
    "enabled": true,
    
    "embeddings": {
      "provider": "auto",           // auto | openrouter | gemini | local
      "model": "openai/text-embedding-3-small",  // Optional
      "fallback": "gemini",         // Fallback provider
      "cacheSize": 1000             // LRU cache size
    },
    
    "chunking": {
      "tokens": 400,                // Chunk size in tokens
      "overlap": 80                 // Overlap between chunks
    },
    
    "search": {
      "vectorWeight": 0.7,          // Vector search weight (0-1)
      "keywordWeight": 0.3,         // Keyword search weight (0-1)
      "defaultLimit": 10            // Max results
    },
    
    "watcher": {
      "enabled": true,
      "debounceMs": 1500,           // Debounce file changes
      "paths": ["memory/**/*.md"],  // Watch patterns
      "ignore": ["**/node_modules/**"]
    },
    
    "indexSessions": true           // Auto-index conversations
  }
}
```

## Embedding Providers

### OpenRouter (Recommended)

**Pros:**
- Multiple models available
- Reliable API
- Good performance

**Cons:**
- Requires API key
- Costs $0.02 / 1M tokens

**Setup:**
```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key
```

### Gemini (Free)

**Pros:**
- Free with API key
- Good quality (768 dimensions)

**Cons:**
- Requires Google account
- Rate limits

**Setup:**
```bash
export GEMINI_API_KEY=your-gemini-key
```

### Local (llama.cpp)

**Pros:**
- 100% free
- No API calls
- Privacy-first

**Cons:**
- Requires node-llama-cpp
- Auto-downloads ~300MB model
- Slower than cloud

**Setup:**
```bash
npm install --save-optional node-llama-cpp
```

Config:
```json
{
  "memoryV2": {
    "embeddings": {
      "provider": "local"
    }
  }
}
```

### Auto-Selection

Set `provider: "auto"` to try providers in order:

1. **Local** (if available)
2. **OpenRouter** (if API key set)
3. **Gemini** (if API key set)

## Usage

### Search Memory

```typescript
import { MemoryManagerV2 } from './memory/manager-v2.js';

const manager = new MemoryManagerV2({
  config,
  workspaceRoot: '~/.talon/workspace',
});

await manager.initialize();

// Search
const results = await manager.search({
  query: 'How do I configure the agent?',
  limit: 5,
  sources: ['memory'], // Optional: filter by source
});

console.log(results);
// [
//   {
//     id: 'chunk-123',
//     path: 'memory/setup.md',
//     text: 'To configure the agent...',
//     score: 0.92,
//     vectorScore: 0.95,
//     keywordScore: 0.85
//   }
// ]
```

### Get Embeddings

```typescript
const embedding = await manager.getEmbedding('Hello world');
// [0.123, -0.456, 0.789, ...] (normalized vector)
```

## Database Schema

Memory V2 uses SQLite with the following tables:

### `files`
Tracks indexed files:
- `path` - Relative file path
- `source` - 'memory' or 'sessions'
- `hash` - SHA-256 content hash
- `mtime_ms` - Last modified time
- `indexed_at` - When indexed

### `chunks`
Text chunks from files:
- `id` - UUID
- `file_path` - Foreign key to files
- `source` - 'memory' or 'sessions'
- `start_line` / `end_line` - Line numbers
- `text` - Chunk content
- `tokens` - Estimated token count

### `chunks_fts`
FTS5 full-text search index:
- Automatically synced with `chunks` via triggers
- Supports BM25 ranking

### `chunks_vec`
Vector embeddings (optional, requires sqlite-vec):
- `chunk_id` - Foreign key to chunks
- `embedding` - Float32 vector blob

### `embedding_cache`
LRU cache for embeddings:
- `key` - Hash of (provider, model, text)
- `embedding` - Cached vector
- `created_at` - Timestamp

### `meta`
System metadata:
- `schema_version` - Current schema version

## File Watching

Memory V2 automatically watches files and re-indexes on changes.

### How It Works

1. **Chokidar** watches configured paths
2. **Debouncing** prevents rapid re-indexing (1500ms default)
3. **Change detection** triggers re-indexing
4. **Hash comparison** skips unchanged files

### Configure Watching

```json
{
  "memoryV2": {
    "watcher": {
      "enabled": true,
      "debounceMs": 1500,
      "paths": [
        "memory/**/*.md",
        "docs/**/*.md"
      ],
      "ignore": [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**"
      ]
    }
  }
}
```

## Session Memory

Automatically index conversation history.

### How It Works

1. Sessions saved as JSONL files
2. On `/new` command, session is indexed
3. LLM generates descriptive slug
4. Chunks stored in `chunks` table with `source='sessions'`

### Search Sessions

```typescript
const results = await manager.search({
  query: 'previous discussion about API',
  sources: ['sessions'], // Only search sessions
});
```

## Performance

### Benchmarks

| Operation | Time | Notes |
|-----------|------|-------|
| Keyword search | <50ms | FTS5 + BM25 |
| Vector search | <200ms | With cache |
| Hybrid search | <250ms | Parallel execution |
| File indexing | ~100ms/file | Includes chunking |
| Embedding generation | ~500ms | OpenRouter |

### Optimization Tips

1. **Increase cache size** for frequently searched terms
2. **Adjust chunk size** based on content type
3. **Use local embeddings** for offline/privacy
4. **Filter by source** to reduce search space

## Troubleshooting

### "No embedding provider available"

**Cause:** No API keys configured

**Fix:**
```bash
export OPENROUTER_API_KEY=your-key
# or
export GEMINI_API_KEY=your-key
```

### "Local embeddings require node-llama-cpp"

**Cause:** Optional dependency not installed

**Fix:**
```bash
npm install --save-optional node-llama-cpp
```

### "FOREIGN KEY constraint failed"

**Cause:** Trying to insert chunk without file entry

**Fix:** Ensure file is inserted before chunks

### Slow search performance

**Causes:**
- Large database
- No vector index
- Cold cache

**Fixes:**
- Increase cache size
- Use source filtering
- Enable sqlite-vec extension

## Migration from V1

Memory V2 runs alongside V1 (no breaking changes).

### Differences

| Feature | V1 | V2 |
|---------|----|----|
| Search | Vector only | Hybrid (vector + keyword) |
| Providers | OpenAI only | OpenRouter, Gemini, Local |
| Indexing | Manual | Automatic (file watcher) |
| Sessions | No | Yes |
| Cache | No | Yes (LRU) |

### Gradual Migration

1. Enable V2 in config
2. Both systems run in parallel
3. Test V2 search quality
4. Disable V1 when ready

## API Reference

### MemoryManagerV2

```typescript
class MemoryManagerV2 {
  constructor(options: MemoryManagerV2Options)
  
  async initialize(): Promise<void>
  async search(options: SearchOptions): Promise<HybridSearchResult[]>
  async getEmbedding(text: string): Promise<number[]>
  async dispose(): Promise<void>
}
```

### SearchOptions

```typescript
interface SearchOptions {
  query: string;
  limit?: number;
  sources?: Array<'memory' | 'sessions'>;
}
```

### HybridSearchResult

```typescript
interface HybridSearchResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: 'memory' | 'sessions';
  text: string;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
}
```

## Advanced Usage

### Custom Chunking

```json
{
  "memoryV2": {
    "chunking": {
      "tokens": 600,    // Larger chunks
      "overlap": 100    // More overlap
    }
  }
}
```

### Adjust Search Weights

```json
{
  "memoryV2": {
    "search": {
      "vectorWeight": 0.8,   // Favor semantic similarity
      "keywordWeight": 0.2
    }
  }
}
```

### Multiple Watch Paths

```json
{
  "memoryV2": {
    "watcher": {
      "paths": [
        "memory/**/*.md",
        "docs/**/*.md",
        "notes/**/*.txt"
      ]
    }
  }
}
```

## Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/talon/issues)
- **Docs:** [Full Documentation](../README.md)
- **Config:** [Configuration Guide](07-CONFIGURATION.md)

---

**Memory V2 Status:** ✅ Production Ready  
**Version:** 0.4.0  
**Last Updated:** February 18, 2026
