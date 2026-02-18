#!/bin/bash
# ─── Workspace Migration Script ───────────────────────────────────
# Migrates workspace files from ./workspace/ to ~/.talon/workspace/
# Preserves your personal data while cleaning up the repository

set -e

REPO_WORKSPACE="./workspace"
TALON_WORKSPACE="$HOME/.talon/workspace"
BACKUP_DIR="$HOME/.talon/workspace-backup-$(date +%Y%m%d-%H%M%S)"

echo "🦅 Talon Workspace Migration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if repo workspace exists
if [ ! -d "$REPO_WORKSPACE" ]; then
    echo "✅ No ./workspace/ directory found - nothing to migrate"
    exit 0
fi

# Check if it's empty
if [ -z "$(ls -A $REPO_WORKSPACE)" ]; then
    echo "✅ ./workspace/ is empty - nothing to migrate"
    exit 0
fi

echo "📂 Found workspace files in ./workspace/"
echo ""

# Create backup of existing ~/.talon/workspace if it exists
if [ -d "$TALON_WORKSPACE" ]; then
    echo "⚠️  Existing ~/.talon/workspace/ found"
    echo "   Creating backup at: $BACKUP_DIR"
    cp -r "$TALON_WORKSPACE" "$BACKUP_DIR"
    echo "   ✅ Backup created"
    echo ""
fi

# Create target directory
mkdir -p "$TALON_WORKSPACE"

# Copy files
echo "📦 Migrating files..."
cp -r "$REPO_WORKSPACE"/* "$TALON_WORKSPACE/"
echo "   ✅ Files copied to ~/.talon/workspace/"
echo ""

# List migrated files
echo "📋 Migrated files:"
ls -1 "$TALON_WORKSPACE" | sed 's/^/   - /'
echo ""

# Clean up repo workspace (keep directory but remove contents)
echo "🧹 Cleaning repository workspace..."
rm -rf "$REPO_WORKSPACE"/*
echo "   ✅ ./workspace/ cleaned (directory kept for gitignore)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Migration complete!"
echo ""
echo "Your personal data is now in: ~/.talon/workspace/"
echo "Repository workspace is clean and safe to commit."
echo ""
if [ -d "$BACKUP_DIR" ]; then
    echo "Backup available at: $BACKUP_DIR"
    echo ""
fi
echo "You can now run: npm start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
