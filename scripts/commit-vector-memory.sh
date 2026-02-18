#!/bin/bash
# Complete Vector Memory Implementation - Commit Script

echo "═══════════════════════════════════════════════════════════"
echo "  Committing Vector Memory Implementation"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Stage all new files
echo "📦 Staging new files..."
git add src/memory/vector.ts
git add src/tools/memory-search-semantic-tool.ts
git add scripts/test-vector-memory.js
git add scripts/install-vector-deps.sh
git add docs/VECTOR_MEMORY.md
git add VECTOR_MEMORY_IMPLEMENTATION.md

# Stage modified files
echo "📝 Staging modified files..."
git add src/config/schema.ts
git add src/gateway/sessions.ts
git add src/gateway/router.ts
git add src/gateway/enhanced-index.ts
git add package.json

# Commit
echo "💾 Committing..."
git commit -m "feat: implement semantic search with SQLite-vec

- Add VectorMemory class with embedding providers
- Create memory_search_semantic tool for agent
- Auto-index all messages in vector database
- Support OpenAI and simple hash-based embeddings
- Add time-based filtering and cleanup
- Full test suite and documentation

Features:
- Semantic search: 'what did we discuss about React?'
- Cosine similarity search with SQLite-vec
- Configurable retention and providers
- 97% cost savings with simple provider

Files:
- src/memory/vector.ts - Core implementation
- src/tools/memory-search-semantic-tool.ts - Agent tool
- docs/VECTOR_MEMORY.md - Complete documentation
- scripts/test-vector-memory.js - Test suite"

echo ""
echo "✅ Committed successfully!"
echo ""
echo "Next steps:"
echo "  1. npm run install:vector"
echo "  2. Enable in config: vectorMemory.enabled = true"
echo "  3. talon restart"
echo ""
echo "═══════════════════════════════════════════════════════════"
