# 🔐 Repository Security Guide

## ⚠️ CRITICAL: Public Repository vs Private Data

This repository is designed to be **open source** and **public**, but your **personal data must remain private**.

## 📁 The Separation (Updated v0.3.3+)

### ✅ What's Safe to Commit (Public)

These are generic templates and source code:

```
templates/workspace/          # Generic template files (safe)
  ├── SOUL.md                # Template with frontmatter - users customize their own
  ├── USER.md                # Template with frontmatter - users fill in their info
  ├── IDENTITY.md            # Template with frontmatter - AI identity
  ├── BOOTSTRAP.md           # Template with frontmatter - first-run ritual
  ├── AGENTS.md              # Generic operating manual
  ├── MEMORY.md              # Empty memory template
  ├── FACTS.json             # Empty template
  └── ...

src/                         # Source code (safe)
docs/                        # Documentation (safe)
scripts/                     # Setup scripts (safe)
config.example.json          # Template config (safe)
.env.example                 # Template env vars (safe)
workspace/                   # Empty directory with README (safe)
```

### ❌ What's PRIVATE (Never Commit)

These contain YOUR personal data:

```
~/.talon/                    # Your personal data directory (GITIGNORED)
  ├── config.json            # Your API keys and settings
  ├── .env                   # Your secrets
  ├── workspace/             # YOUR AI's personality and memories
  │   ├── SOUL.md            # YOUR AI's evolving personality (NO frontmatter)
  │   ├── USER.md            # Information about YOU (NO frontmatter)
  │   ├── IDENTITY.md        # YOUR AI's chosen identity (NO frontmatter)
  │   ├── BOOTSTRAP.md       # Deleted after first run
  │   ├── FACTS.json         # Facts the AI learned about you
  │   ├── MEMORY.md          # YOUR conversation memories
  │   └── memory/            # Daily memory logs
  ├── sessions/              # Your chat history
  └── whatsapp-auth/         # WhatsApp session data

./workspace/                 # Local dev workspace (GITIGNORED)
  └── README.md              # Explanation only (safe to commit)
```

## 🔄 How Templates Work (v0.3.3+)

### Template Structure

Templates in `templates/workspace/` have **YAML frontmatter**:

```markdown
---
summary: "Agent identity record"
read_when:
  - Bootstrapping a workspace manually
---

# IDENTITY

Fill this in during your first conversation...
```

### First Run Process

1. **Setup runs**: `npm run setup` or `npm start` (first time)
2. **Templates copied**: Files copied from `templates/workspace/` → `~/.talon/workspace/`
3. **Frontmatter stripped**: YAML metadata removed, only content remains
4. **User customizes**: You fill in your personal information
5. **AI learns**: Files evolve with your interactions

### Security Benefits

- ✅ **Templates are generic**: No personal data in repository
- ✅ **Frontmatter stripped**: User files are clean markdown
- ✅ **Isolated storage**: User data in `~/.talon/` (gitignored)
- ✅ **Safe cloning**: Fresh clones get clean templates only

## 🚨 Why This Matters

### The Problem

Your AI learns about you over time:

1. **SOUL.md** starts generic, but evolves to reflect your AI's personality based on your interactions
2. **USER.md** contains personal information about you (name, preferences, projects)
3. **IDENTITY.md** contains your AI's chosen name, emoji, and personality
4. **FACTS.json** stores facts the AI learns ("User prefers dark mode", "User is working on X project")
5. **MEMORY.md** contains summaries of your private conversations
6. **Sessions** contain your chat history

If you commit these, you're sharing:
- Your identity and personal details
- Your AI's personality and identity
- Your private conversations
- Your preferences and habits
- Your projects and work

### Real Example

**❌ BAD (Don't do this):**
```json
// FACTS.json (committed to public git)
{
  "user": {
    "name": "Orlando Ascanio",
    "email": "orlando@example.com",
    "company": "MyRealCompany Inc"
  },
  "learned_facts": [
    "User is working on a secret project called 'Project X'",
    "User's wife's name is Maria",
    "User has meeting with CEO tomorrow about funding"
  ]
}
```

**✅ GOOD (Template in repo):**
```json
// FACTS.json (template - safe to commit)
{
  "_comment": "TEMPLATE - Copy to ~/.talon/workspace/FACTS.json",
  "user": {
    "name": null,
    "preferences": {}
  },
  "learned_facts": []
}
```

## 🛡️ How It Works

### 1. First Run Setup

When you run Talon for the first time:

```bash
npm run setup:secure
# or
npm start
```

The system:
1. Copies `templates/workspace/*` → `~/.talon/workspace/`
2. Creates `~/.talon/config.json` from template
3. Creates `~/.talon/.env` for your secrets

### 2. Data Evolution

Over time, your AI updates these files:
- **SOUL.md** → Becomes unique to your AI's personality
- **USER.md** → Fills in details about you
- **FACTS.json** → Accumulates learned facts
- **MEMORY.md** → Stores conversation summaries

### 3. Git Protection

The `.gitignore` file ensures these are never committed:

```gitignore
# User data - NEVER commit
~/.talon/
.talon/
/workspace/           # Ignores local workspace/
!templates/workspace/ # But allows templates/workspace/
memory/
*.memory.md
```

## 🔄 If You're Forking/Sharing This Repo

### For Repository Owners (You)

**Before making this repo public:**

1. **Check what's currently tracked:**
   ```bash
   git ls-files | grep -E "workspace/|FACTS|SOUL|USER|MEMORY"
   # Should show NOTHING or only templates/workspace/
   ```

2. **If personal files are tracked, remove them:**
   ```bash
   # Remove from git but keep files
   git rm -r --cached workspace/
   git rm --cached workspace/SOUL.md workspace/USER.md etc.
   
   # Commit the removal
   git commit -m "Remove personal data files - use templates instead"
   ```

3. **Verify .gitignore is correct:**
   ```bash
   cat .gitignore | grep workspace
   # Should show:
   # /workspace/
   # !templates/workspace/
   ```

### For Users (People Using Your Repo)

When someone clones your repo:

1. They get the **templates** (generic, safe)
2. On first run, templates are copied to `~/.talon/`
3. They fill in their own data
4. Their personal data stays in `~/.talon/` (gitignored)
5. They can safely push code changes without exposing personal data

## 🔄 Migrating from Older Versions (v0.3.2 and earlier)

If you're upgrading from an older version where workspace files were in `./workspace/`:

### Automatic Migration

Run the migration script:

```bash
./scripts/migrate-workspace.sh
```

This will:
1. ✅ Backup existing `~/.talon/workspace/` (if it exists)
2. ✅ Copy files from `./workspace/` → `~/.talon/workspace/`
3. ✅ Clean `./workspace/` directory (keeps it empty)
4. ✅ Preserve all your personal data

### Manual Migration

If you prefer to migrate manually:

```bash
# 1. Create backup
cp -r ~/.talon/workspace ~/.talon/workspace-backup-$(date +%Y%m%d)

# 2. Copy files
cp -r ./workspace/* ~/.talon/workspace/

# 3. Clean repo workspace
rm -rf ./workspace/*

# 4. Verify
ls ~/.talon/workspace/
```

### After Migration

1. **Test the agent**: `npm start`
2. **Verify it remembers you**: Check if it knows your name
3. **Check files**: `ls ~/.talon/workspace/`
4. **Commit the cleanup**: `git status` should show no workspace files

## 📋 Checklist Before Making Repo Public

- [ ] `git ls-files | grep workspace` shows only `templates/workspace/`
- [ ] `git ls-files | grep FACTS.json` shows only `templates/workspace/FACTS.json`
- [ ] `.gitignore` contains `/workspace/` and `!templates/workspace/`
- [ ] `~/.talon/` is in `.gitignore`
- [ ] `config.json` is in `.gitignore` (but `config.example.json` exists)
- [ ] `.env` is in `.gitignore` (but `.env.example` exists)
- [ ] No hardcoded API keys in source code
- [ ] No personal phone numbers in source code
- [ ] No email addresses in source code
- [ ] No real names in source code

## 🆘 Emergency: Accidentally Committed Personal Data

If you accidentally committed personal files:

### Step 1: Stop the leak
```bash
# Remove from git tracking
git rm -r --cached workspace/
git rm --cached .env config.json

# Commit removal
git commit -m "Remove accidentally committed personal data"
```

### Step 2: Purge from history (destructive!)
```bash
# Install git-filter-repo if needed
# brew install git-filter-repo  # macOS

# Remove file from ALL history
git filter-repo --path workspace/SOUL.md --invert-paths

# Force push (overwrites history)
git push origin --force --all
```

### Step 3: Rotate secrets
- Change all API keys that were exposed
- Regenerate tokens
- Update passwords

## 📝 Summary

| What | Location | In Git? | Contains |
|------|----------|---------|----------|
| **Templates** | `templates/workspace/` | ✅ Yes | Generic starters |
| **Your Data** | `~/.talon/workspace/` | ❌ NO | Personal info, memories |
| **Config Template** | `config.example.json` | ✅ Yes | Placeholder structure |
| **Your Config** | `~/.talon/config.json` | ❌ NO | Your API keys |
| **Env Template** | `.env.example` | ✅ Yes | Variable names |
| **Your Secrets** | `~/.talon/.env` | ❌ NO | Actual keys |

## 🎯 Remember

**The Golden Rule:**
> If the file would be different for another user, it belongs in `~/.talon/`, not in the repo.

**Templates** = Generic, safe, committed
**User Data** = Personal, private, gitignored

---

**When in doubt: Don't commit it!** 🔐
