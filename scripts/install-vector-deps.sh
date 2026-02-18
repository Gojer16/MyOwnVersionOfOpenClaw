#!/bin/bash
# Install vector memory dependencies

echo "═══════════════════════════════════════════════════════════"
echo "  Installing Vector Memory Dependencies"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "📦 Installing better-sqlite3..."
npm install better-sqlite3 @types/better-sqlite3

echo ""
echo "⚠️  NOTE: sqlite-vec extension required for vector search"
echo ""
echo "To enable vector search, install sqlite-vec:"
echo "  macOS: brew install asg017/sqlite-vec/sqlite-vec"
echo "  Linux: Download from https://github.com/asg017/sqlite-vec/releases"
echo ""
echo "Without sqlite-vec, semantic search will be disabled but"
echo "Talon will continue to work normally."
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Dependencies installed!"
echo "═══════════════════════════════════════════════════════════"
