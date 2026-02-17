# 🔐 Secure Configuration Guide

This guide explains how to configure Talon **securely** without committing sensitive data like API keys or phone numbers to Git.

## 🚨 Security First

**NEVER commit these files:**
- `~/.talon/config.json` (contains API keys)
- `~/.talon/.env` (contains secrets)
- `~/.talon/whatsapp-auth/` (WhatsApp session data)

**Why?** These files contain your personal data (API keys, phone numbers, tokens). If committed to Git, anyone can see them.

## 📁 Secure File Structure

```
~/.talon/
├── config.json          # ❌ NEVER COMMIT - Your personal config
├── .env                 # ❌ NEVER COMMIT - Your secrets
├── whatsapp-auth/       # ❌ NEVER COMMIT - WhatsApp session
├── sessions/            # ❌ NEVER COMMIT - Chat history
└── workspace/           # ❌ NEVER COMMIT - AI memory
```

## 🚀 Quick Setup

### Step 1: Create Your .env File

Create `~/.talon/.env` with your secrets:

```bash
# Create the directory
mkdir -p ~/.talon

# Create .env file
cat > ~/.talon/.env << 'EOF'
# ─── LLM Providers ────────────────────────────────────────
DEEPSEEK_API_KEY=sk-your-actual-deepseek-key-here
OPENROUTER_API_KEY=sk-or-your-actual-openrouter-key-here

# ─── Channels ─────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=123456:ABC-your-actual-telegram-token

# ─── WhatsApp ─────────────────────────────────────────────
# Your phone number (international format, no + or spaces)
# Example: 584128449024 for +58 412-844-9024
WHATSAPP_PHONE_NUMBER=584128449024
EOF
```

### Step 2: Create Your Config

Copy the example and customize:

```bash
# Copy example config
cp config.example.json ~/.talon/config.json

# Edit it (use your favorite editor)
nano ~/.talon/config.json
# or
vim ~/.talon/config.json
# or
code ~/.talon/config.json
```

### Step 3: Enable WhatsApp

In your `~/.talon/config.json`, enable WhatsApp:

```json
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowedUsers": ["${WHATSAPP_PHONE_NUMBER}"],
      "allowedGroups": [],
      "groupActivation": "mention"
    }
  }
}
```

The `${WHATSAPP_PHONE_NUMBER}` will be replaced with your actual number from `.env`.

## 🔄 How It Works

### Environment Variable Substitution

Talon uses `${ENV_VAR}` syntax in `config.json`. At runtime, these are replaced with values from:

1. `~/.talon/.env` file (loaded automatically)
2. Actual environment variables

Example:
```json
{
  "agent": {
    "providers": {
      "deepseek": {
        "apiKey": "${DEEPSEEK_API_KEY}"
      }
    }
  }
}
```

If `.env` contains:
```
DEEPSEEK_API_KEY=sk-abc123
```

At runtime, Talon sees:
```json
{
  "agent": {
    "providers": {
      "deepseek": {
        "apiKey": "sk-abc123"
      }
    }
  }
}
```

## 🛡️ Git Safety

The `.gitignore` file ensures these are never committed:

```gitignore
# Environment variables
.env
.env.local

# Talon user data
~/.talon/
.talon/
config.json
workspace/
sessions/
whatsapp-auth/
```

## 📋 Files You CAN Commit

These are safe to commit (they contain no secrets):

- `config.example.json` - Template with placeholder values
- `.env.example` - Template showing required variables
- Source code (`src/`)
- Documentation

## 🆘 Recovery

If you accidentally committed secrets:

1. **Immediately rotate (change) all exposed credentials:**
   - Regenerate API keys
   - Revoke and recreate tokens
   - Change passwords

2. **Remove from Git history:**
   ```bash
   # Remove file from history
   git filter-branch --force --index-filter \
   'git rm --cached --ignore-unmatch ~/.talon/config.json' \
   --prune-empty --tag-name-filter cat -- --all
   
   # Force push
   git push origin --force --all
   ```

3. **Update .gitignore** to prevent future accidents

## ✅ Verification

Before committing, verify no secrets:

```bash
# Check what files will be committed
git status

# Check for common secrets in staged files
git diff --cached | grep -E "(api.?key|token|password|secret)" -i

# Make sure config.json is ignored
git check-ignore ~/.talon/config.json
# Should output: ~/.talon/config.json
```

## 📝 Example Complete Setup

### 1. ~/.talon/.env
```bash
DEEPSEEK_API_KEY=sk-live-xxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER=584128449024
```

### 2. ~/.talon/config.json
```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "providers": {
      "deepseek": {
        "apiKey": "${DEEPSEEK_API_KEY}",
        "models": ["deepseek-chat"]
      }
    }
  },
  "channels": {
    "cli": { "enabled": true },
    "whatsapp": {
      "enabled": true,
      "allowedUsers": ["${WHATSAPP_PHONE_NUMBER}"],
      "groupActivation": "mention"
    }
  }
}
```

### 3. Start Talon
```bash
npm start
```

## 🎯 Best Practices

1. **Never** commit real credentials
2. **Always** use environment variables for secrets
3. **Rotate** keys regularly
4. **Use** separate API keys for dev/prod
5. **Audit** your commits before pushing

## 🔗 Related Files

- `.env.example` - Template for environment variables
- `config.example.json` - Template for configuration
- `src/config/loader.ts` - How env vars are resolved

---

**Remember: Your secrets are YOUR responsibility. Keep them safe!** 🔐
