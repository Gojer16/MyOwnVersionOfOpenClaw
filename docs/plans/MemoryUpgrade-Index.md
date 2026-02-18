# Memory System Upgrade - Master Plan Index

> **Complete implementation plan for upgrading Talon's memory system to match OpenClaw's production-ready architecture**

**Created:** February 18, 2026  
**Status:** Ready for Implementation  
**Estimated Time:** 3 weeks (15 working days)

---

## 📋 Plan Overview

This comprehensive plan upgrades Talon's memory system with:
- ✅ Hybrid search (vector + keyword)
- ✅ Multiple embedding providers (OpenAI, Gemini, Local)
- ✅ Automatic file watching and sync
- ✅ Session memory integration
- ✅ Embedding cache with LRU eviction
- ✅ Production-ready features

---

## 📚 Plan Documents

### Part 1: Overview & Gap Analysis
**File:** `MemoryUpgrade-Part1-Overview.md`

**Contents:**
- Current state analysis
- Gap analysis (what's missing)
- Implementation strategy (5 phases)
- Success criteria
- Risk assessment
- Dependencies
- File structure
- Configuration schema
- Testing strategy

**Key Insights:**
- 7 critical gaps identified
- 4 important gaps
- 3 nice-to-have gaps
- Clear roadmap with priorities

---

### Part 2: Database Schema & Chunking
**File:** `MemoryUpgrade-Part2-Database.md`

**Tasks:**
- Task 1: Database Schema V2 (files, chunks, FTS5, cache, meta)
- Task 2: File Chunking System (token-based with overlap)
- Task 3: File Hash Utilities (SHA-256 hashing)

**Deliverables:**
- `src/memory/schema/v2.ts` - V2 schema definition
- `src/memory/schema/migrations.ts` - Migration logic
- `src/memory/sync/chunker.ts` - File chunking
- `src/memory/sync/types.ts` - Type definitions
- `src/memory/sync/hash.ts` - Hash utilities

**Estimated Time:** 3-4 days

---

### Part 3: Embedding Providers
**File:** `MemoryUpgrade-Part3-Providers.md`

**Tasks:**
- Task 4: Embedding Provider Base Interface
- Task 5: Gemini Embedding Provider
- Task 6: Local Embedding Provider (llama.cpp)
- Task 7: Provider Factory with Fallback

**Deliverables:**
- `src/memory/embeddings/base.ts` - Base interface
- `src/memory/embeddings/gemini.ts` - Gemini provider
- `src/memory/embeddings/local.ts` - Local provider
- `src/memory/embeddings/factory.ts` - Provider factory
- `src/memory/embeddings/openai.ts` - Refactored OpenAI provider

**Key Features:**
- Auto-selection (local → OpenAI → Gemini)
- Fallback chain on provider failure
- L2 normalization for embeddings

**Estimated Time:** 3-4 days

---

### Part 4: Hybrid Search
**File:** `MemoryUpgrade-Part4-Search.md`

**Tasks:**
- Task 8: Keyword Search (FTS5 with BM25)
- Task 9: Vector Search (Refactor)
- Task 10: Hybrid Search Merge Algorithm

**Deliverables:**
- `src/memory/search/keyword.ts` - FTS5 keyword search
- `src/memory/search/vector.ts` - Vector search
- `src/memory/search/hybrid.ts` - Hybrid merge

**Key Features:**
- BM25 ranking for keyword search
- Cosine similarity for vector search
- Weighted score merging (70% vector, 30% text)

**Estimated Time:** 2-3 days

---

### Part 5: Session Memory
**File:** `MemoryUpgrade-Part5-Session.md`

**Tasks:**
- Task 11: Session File Parser (JSONL)
- Task 12: LLM Slug Generator
- Task 13: Session-to-Memory Hook

**Deliverables:**
- `src/memory/session/parser.ts` - JSONL parser
- `src/memory/session/slug.ts` - LLM slug generation
- `src/memory/session/hook.ts` - Session-to-memory hook

**Key Features:**
- Automatic session indexing
- LLM-generated descriptive slugs
- Fallback to timestamp slugs

**Estimated Time:** 3-4 days

---

### Part 6: Polish & Integration
**File:** `MemoryUpgrade-Part6-Polish.md`

**Tasks:**
- Task 14: File Watcher with Debouncing
- Task 15: Embedding Cache with LRU
- Task 16: Unified Memory Manager
- Task 17: Update Configuration
- Task 18: Documentation

**Deliverables:**
- `src/memory/sync/watcher.ts` - File watcher
- `src/memory/cache/embedding-cache.ts` - Embedding cache
- `src/memory/index.ts` - Unified manager
- `docs/MEMORY.md` - Documentation

**Key Features:**
- Chokidar file watching
- LRU cache eviction
- Complete integration
- Production-ready

**Estimated Time:** 3-4 days

---

## 📊 Progress Tracking

### Phase 1: Core Infrastructure ⏳
- [ ] Task 1: Database Schema V2
- [ ] Task 2: File Chunking System
- [ ] Task 3: File Hash Utilities

### Phase 2: Embedding Providers ⏳
- [ ] Task 4: Embedding Provider Base
- [ ] Task 5: Gemini Provider
- [ ] Task 6: Local Provider
- [ ] Task 7: Provider Factory

### Phase 3: Hybrid Search ⏳
- [ ] Task 8: Keyword Search
- [ ] Task 9: Vector Search
- [ ] Task 10: Hybrid Merge

### Phase 4: Session Memory ⏳
- [ ] Task 11: Session Parser
- [ ] Task 12: LLM Slug Generator
- [ ] Task 13: Session Hook

### Phase 5: Polish & Integration ⏳
- [ ] Task 14: File Watcher
- [ ] Task 15: Embedding Cache
- [ ] Task 16: Unified Manager
- [ ] Task 17: Configuration
- [ ] Task 18: Documentation

---

## 🎯 Success Metrics

### Functional Requirements
- ✅ Hybrid search works (vector + keyword)
- ✅ Multiple providers work (OpenAI, Gemini, Local)
- ✅ Auto-selection tries local first
- ✅ Fallback chain works on failure
- ✅ File watching detects changes
- ✅ Session memory saves on `/new`
- ✅ LLM generates descriptive slugs
- ✅ Chunking preserves line numbers

### Performance Requirements
- ✅ Search latency < 500ms (cached)
- ✅ Sync time < 5s for 100 files
- ✅ Memory usage < 50MB base

### Reliability Requirements
- ✅ Provider failures trigger fallback
- ✅ Database errors don't crash gateway
- ✅ Transactional updates
- ✅ Graceful degradation

---

## 🔧 Technical Stack

### Required Dependencies
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
- Node.js 22+
- SQLite 3.41+
- sqlite-vec 0.1.0+
- 100MB+ disk space (for local models)

---

## 📁 File Structure

### New Files (50+)
```
src/memory/
├── embeddings/
│   ├── base.ts              # Base interface
│   ├── openai.ts            # OpenAI provider
│   ├── gemini.ts            # Gemini provider
│   ├── local.ts             # Local provider
│   └── factory.ts           # Provider factory
├── search/
│   ├── vector.ts            # Vector search
│   ├── keyword.ts           # Keyword search
│   ├── hybrid.ts            # Hybrid merge
│   └── types.ts             # Search types
├── sync/
│   ├── watcher.ts           # File watcher
│   ├── chunker.ts           # File chunking
│   ├── indexer.ts           # Sync manager
│   ├── hash.ts              # Hash utilities
│   └── types.ts             # Sync types
├── session/
│   ├── parser.ts            # JSONL parser
│   ├── hook.ts              # Session hook
│   └── slug.ts              # Slug generator
├── cache/
│   └── embedding-cache.ts   # Embedding cache
├── schema/
│   ├── migrations.ts        # Migrations
│   └── v2.ts                # V2 schema
└── index.ts                 # Unified manager
```

### Modified Files
```
src/memory/
├── manager.ts               # Refactor to use new components
├── vector.ts                # Extract to embeddings/
└── daily.ts                 # Integrate with sync

src/tools/
├── memory-tools.ts          # Update search API
└── memory-search-semantic-tool.ts  # Update hybrid

src/config/
└── schema.ts                # Add memory config

src/gateway/
└── index.ts                 # Initialize memory
```

---

## 🧪 Testing Strategy

### Unit Tests (30+ files)
- Schema migrations
- File chunking
- Hash utilities
- Embedding providers
- Search algorithms
- Session parsing
- Slug generation
- Cache eviction

### Integration Tests
- End-to-end search
- File watching + sync
- Session indexing
- Provider fallback

### Performance Tests
- Search latency
- Sync throughput
- Memory usage

**Target Coverage:** 80%+

---

## 📖 Documentation

### User Documentation
- `docs/MEMORY.md` - Complete memory system guide
- `README.md` - Updated with memory features
- Configuration examples
- Troubleshooting guide

### Developer Documentation
- API reference
- Architecture diagrams
- Migration guide
- Testing guide

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing (unit + integration)
- [ ] Documentation complete
- [ ] Configuration validated
- [ ] Performance benchmarks met

### Deployment
- [ ] Update package.json dependencies
- [ ] Run full test suite
- [ ] Update CHANGELOG.md
- [ ] Tag release v0.4.0
- [ ] Deploy to production

### Post-Deployment
- [ ] Monitor error logs
- [ ] Check API usage
- [ ] Verify search quality
- [ ] Gather user feedback

---

## 🎓 Learning Resources

### Reference Implementation
- **OpenClaw Memory:** `/Users/orlandoascanio/openclaw/src/memory/`
- **Analysis Document:** `memoryOpenclaw.md`

### Key Patterns
1. Singleton with cache
2. Mixin pattern for large classes
3. Graceful degradation
4. Debounced file watching
5. Progress reporting
6. Lazy loading
7. Transactional updates
8. Source filtering
9. Hybrid search weighting
10. Session delta tracking

---

## 💡 Implementation Tips

### Start Simple
1. Implement Phase 1 first (database + chunking)
2. Test thoroughly before moving to Phase 2
3. Use TDD approach (test-first)
4. Commit frequently

### Avoid Pitfalls
- Don't skip schema migrations
- Don't forget to normalize embeddings
- Don't ignore error handling
- Don't skip cache eviction logic

### Performance Tips
- Use transactions for batch updates
- Cache embeddings aggressively
- Debounce file watching
- Use prepared statements

---

## 🤝 Execution Options

### Option 1: Subagent-Driven (Recommended)
**Approach:** Execute in this session with subagents per task

**Pros:**
- Fast iteration
- Review between tasks
- Easy debugging

**Cons:**
- Requires active session
- Context switching

**Command:** Use `superpowers:subagent-driven-development`

### Option 2: Parallel Session
**Approach:** Open new session with executing-plans

**Pros:**
- Batch execution
- Checkpoints
- Independent

**Cons:**
- Less oversight
- Harder to debug

**Command:** Use `superpowers:executing-plans` in new session

---

## 📞 Support

### Questions?
- Review `memoryOpenclaw.md` for OpenClaw patterns
- Check individual part files for detailed steps
- Run tests to verify implementation

### Issues?
- Check logs for errors
- Verify dependencies installed
- Test with minimal config
- Review troubleshooting guide

---

**Plan Status:** ✅ Complete and Ready  
**Total Tasks:** 18 tasks across 6 parts  
**Total Files:** 50+ new files, 10+ modified  
**Total Tests:** 30+ test files  
**Total Lines:** ~5000 lines of code  
**Estimated Time:** 3 weeks (15 working days)

**Next Step:** Choose execution approach and begin implementation! 🚀
