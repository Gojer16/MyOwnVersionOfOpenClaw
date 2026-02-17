# Talon Features Guide

> Complete reference of all features in Talon v0.2.1

---

## Table of Contents

1. [Channels](#channels)
2. [AI Agent](#ai-agent)
3. [Tools](#tools)
4. [Memory System](#memory-system)
5. [Configuration](#configuration)
6. [Security](#security)
7. [Providers](#providers)

---

## Channels

Talk to Talon from anywhere.

### CLI (Command Line Interface)

Interactive terminal interface with rich features:

| Feature | Description |
|---------|-------------|
| **Slash Commands** | `/help`, `/status`, `/reset`, `/tokens`, `/exit`, `/model`, `/compact`, `/new`, `/quit` |
| **Bash Execution** | `!ls`, `!pwd` - run shell commands directly |
| **Tab Completion** | Auto-complete slash commands |
| **Session Resumption** | Resume previous conversations on startup |
| **Colored Output** | Chalk-based formatting for responses |
| **Token Display** | Shows token usage after each response |
| **First Run Bootstrap** | Auto-initializes on first use |

**Example:**
```
You > /help
🦅 Talon CLI Commands
─────────────────────
  /help        Show available commands
  /status      Show session status and token usage
  /reset       Reset the current session
  ...

You > !ls -la
$ ls -la
drwxr-xr-x  24 user  staff   768 Feb 16 17:01 .

You > What's the weather?
🦅 Talon > Let me check...
💰 150 → 200 = 350 tokens
```

### Telegram

Bot integration via long-polling:

| Feature | Description |
|---------|-------------|
| **Long Polling** | Fetch updates via Telegram Bot API |
| **User Authorization** | Whitelist specific users |
| **Group Support** | Join groups with mention gating |
| **Message Types** | Text messages, commands |

**Configuration:**
```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "allowedUsers": ["123456"],
      "allowedGroups": ["-100123456"],
      "groupActivation": "mention"
    }
  }
}
```

### WhatsApp

Full WhatsApp Web integration:

| Feature | Description |
|---------|-------------|
| **QR Authentication** | Scan QR code to connect |
| **Session Persistence** | Save login for auto-reconnect |
| **Direct Messages** | Personal chats |
| **Group Chat** | Group message support |
| **Mention Gating** | Only respond when mentioned (configurable) |
| **Media Handling** | Receive images, documents |

**Requires:**
```bash
npm install whatsapp-web.js qrcode-terminal
```

### WebChat

Browser-based UI (future planned):

| Feature | Description |
|---------|-------------|
| **WebSocket** | Real-time communication |
| **Authentication** | Optional password/token auth |

---

## AI Agent

The brain that powers Talon.

### State Machine

The agent loop follows a clear workflow:

```
idle → thinking → executing → evaluating → responding → idle
```

| State | Description |
|-------|-------------|
| **idle** | Waiting for input |
| **thinking** | Building context, deciding approach |
| **executing** | Making LLM call with tools |
| **evaluating** | Checking if result is complete |
| **compressing** | Running memory compression |
| **responding** | Sending final response |
| **error** | Something went wrong |

### Context Window Guard

Prevents token overflow crashes:

- **Token Estimation**: ~4 chars/token
- **Auto-Truncation**: Truncates messages when context fills
- **Compression Trigger**: Automatically triggers memory compression
- **Multiple Window Sizes**: Supports various model context limits

### Model Fallback System

Automatic failover when providers fail:

| Error Type | Behavior |
|------------|----------|
| **Auth (401)** | Don't retry - bad key |
| **Rate Limit (429)** | Retry with fallback |
| **Timeout** | Retry with fallback |
| **Context Overflow** | Compress memory, retry |
| **Billing** | Retry with fallback |

**Provider Priority:**
1. DeepSeek (cheapest)
2. OpenRouter (good fallback)
3. OpenAI (reliable)
4. Anthropic (best quality)

### Tool Execution

- **Parallel Execution**: Multiple tools per turn
- **Result Handling**: Tool outputs fed back to LLM
- **Max Iterations**: Prevents infinite loops (default: 10)
- **Event Bus**: Real-time updates on tool execution

---

## Tools

What Talon can do.

### File Tools

Read, write, and manage files:

| Tool | Description |
|------|-------------|
| **file_read** | Read file contents with optional line range |
| **file_write** | Create or overwrite files |
| **file_list** | List directory contents |
| **file_search** | Search files by pattern |

**Security Features:**
- Path validation (allowed/denied paths)
- Max file size limits (default: 10MB)
- Expansion of `~` to home directory

**Configuration:**
```json
{
  "tools": {
    "files": {
      "enabled": true,
      "allowedPaths": ["~/"],
      "deniedPaths": ["~/.ssh", "~/.gnupg"],
      "maxFileSize": 10485760
    }
  }
}
```

### Shell Tools

Execute commands:

| Tool | Description |
|------|-------------|
| **shell_execute** | Run shell commands |

**Safety Features:**
- Command blocking (configurable)
- Destructive command detection (`rm -rf`, `mkfs`, etc.)
- Timeout support (default: 30s)
- Output truncation (default: 1MB)
- Confirmation for dangerous operations

**Configuration:**
```json
{
  "tools": {
    "shell": {
      "enabled": true,
      "confirmDestructive": true,
      "blockedCommands": ["sudo rm", "mkfs"],
      "defaultTimeout": 30000,
      "maxOutputSize": 1048576
    }
  }
}
```

### Web Tools

Search and fetch web content:

| Tool | Description |
|------|-------------|
| **web_search** | Search the web |
| **web_fetch** | Fetch and extract URL content |

**Web Search Providers:**

| Priority | Provider | API | Cost |
|----------|----------|-----|------|
| 1 | DeepSeek | `api.deepseek.com` | ~$0.14/1M tokens |
| 2 | OpenRouter | `openrouter.ai` | Via models |
| 3 | Tavily | `api.tavily.com` | 100/month free |
| 4 | DuckDuckGo | HTML scraping | Free |

**Web Fetch Features:**
- JSDOM-based HTML parsing
- Content cleaning (removes ads, nav, footers)
- Max characters limit (default: 50KB)
- Timeout support

**Configuration:**
```json
{
  "tools": {
    "web": {
      "search": {
        "enabled": true,
        "provider": "deepseek",
        "model": "deepseek-chat"
      },
      "fetch": {
        "enabled": true,
        "maxChars": 50000,
        "timeoutSeconds": 30
      }
    }
  }
}
```

**Environment Variables:**
```bash
DEEPSEEK_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
TAVILY_API_KEY=...
```

### Memory Tools

Manage persistent memory:

| Tool | Description |
|------|-------------|
| **memory_append** | Add entry to MEMORY.md |
| **memory_read** | Read memory files |
| **memory_search** | Search across memory files |
| **soul_update** | Update SOUL.md (personality) |
| **facts_update** | Update FACTS.json (user facts) |

---

## Memory System

How Talon remembers things.

### Memory Manager

- **Context Building**: Constructs prompts from memory + session
- **Message Tracking**: Counts tokens, manages history
- **System Prompt Injection**: Adds persona/context to each request
- **SOUL.md Loading**: Defines agent personality

### Memory Compressor

Summarizes old messages to save tokens:

- **Threshold-based**: Triggers at 80% context fill
- **Recent Messages**: Keeps last N messages intact
- **Summary Generation**: Uses LLM to create summary

### Memory Files

| File | Purpose |
|------|---------|
| **SOUL.md** | Agent personality & identity |
| **USER.md** | User profile & preferences |
| **IDENTITY.md** | Agent identity details |
| **MEMORY.md** | Long-term memories |
| **FACTS.json** | Structured user facts |
| **BOOTSTRAP.md** | First-run initialization |
| **memory/*.md** | Additional memory files |

---

## Configuration

### Setup Wizard

Interactive configuration (`talon setup`):

```
Step 1/6: Model & Auth
  → Choose provider (DeepSeek, OpenRouter, OpenAI, Anthropic)
  → Enter API key
  → Select model

Step 2/6: Workspace
  → Workspace location (~/.talon/workspace)
  → Seed template files

Step 3/6: Gateway
  → Port (default: 19789)
  → Host (default: 127.0.0.1)
  → Auth mode (none/password/token)

Step 4/6: Channels
  → Telegram (enable, bot token)
  → Discord (enable, bot token)

Step 5/6: Tools Configuration
  → Web search provider
  → API keys

Step 6/6: Health Check
  → Verify everything works
```

### Config File

`~/.talon/config.json`:

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "providers": {
      "deepseek": {
        "apiKey": "${DEEPSEEK_API_KEY}",
        "models": ["deepseek-chat"]
      }
    },
    "maxIterations": 10,
    "temperature": 0.7
  },
  "gateway": {
    "host": "127.0.0.1",
    "port": 19789,
    "auth": { "mode": "none" }
  },
  "channels": {
    "cli": { "enabled": true },
    "telegram": { "enabled": false },
    "whatsapp": { "enabled": false }
  },
  "tools": {
    "files": { "enabled": true },
    "shell": { "enabled": true },
    "web": {
      "search": { "provider": "deepseek" },
      "fetch": { "enabled": true }
    }
  },
  "workspace": {
    "root": "~/.talon/workspace"
  }
}
```

### Environment Variables

`~/.talon/.env`:

```bash
# Required for LLM
DEEPSEEK_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...

# Optional Channels
TELEGRAM_BOT_TOKEN=123456:ABC-...
DISCORD_BOT_TOKEN=...

# Optional Tools
TAVILY_API_KEY=...

# Security
TALON_TOKEN=your-auth-token
```

---

## Security

### Path Safety (File Tools)

- **Allowed Paths**: Restrict accessible directories
- **Denied Paths**: Block sensitive areas
- Default denied: `~/.ssh`, `~/.gnupg`

### Command Safety (Shell Tools)

- **Destructive Detection**: Blocks `rm -rf`, `mkfs`, `dd`, etc.
- **Blocked Commands**: Custom blocklist
- **Confirmation**: Prompt for dangerous ops

### Data Separation

| Directory | Purpose | Gitignored |
|-----------|---------|------------|
| `~/.talon/` | All user data | ✅ Yes |
| `templates/workspace/` | Generic templates | ❌ No |
| `src/` | Source code | ❌ No |

### Authentication

| Mode | Description |
|------|-------------|
| **none** | Localhost only |
| **password** | Simple password |
| **token** | Bearer token |

---

## Providers

### Supported Providers

| Provider | Base URL | Models |
|----------|----------|--------|
| **DeepSeek** | `api.deepseek.com` | deepseek-chat, deepseek-reasoner |
| **OpenRouter** | `openrouter.ai/api/v1` | 200+ models |
| **OpenAI** | `api.openai.com/v1` | GPT-4o, GPT-4o-mini, o3-mini |
| **Anthropic** | `api.anthropic.com` | Claude Sonnet, Claude Opus |
| **Custom** | Any /v1 endpoint | Any model |

### Model Routing

- **Cost-based**: Cheapest for simple tasks
- **Quality-based**: Best for complex tasks
- **Fallback**: Auto-switch on failure

### Provider Priority

Configurable in code:
```typescript
const priorities = {
  'deepseek': 1,    // Cheapest
  'openrouter': 2,  // Good fallback
  'openai': 3,      // Reliable
  'anthropic': 4,    // Best quality
};
```

---

## CLI Commands Reference

| Command | Alias | Description |
|---------|-------|-------------|
| `/help` | - | Show available commands |
| `/status` | - | Session status & tokens |
| `/reset` | `/new` | Clear session history |
| `/tokens` | - | Show token usage |
| `/model` | - | Show current model |
| `/compact` | - | Force memory compression |
| `/exit` | `/quit` | Exit Talon |

### Bash Shortcuts

| Input | Example | Description |
|-------|---------|-------------|
| `!command` | `!ls -la` | Execute bash command |

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | For DeepSeek | Get at deepseek.com |
| `OPENROUTER_API_KEY` | For OpenRouter | Get at openrouter.ai |
| `OPENAI_API_KEY` | For OpenAI | Get at platform.openai.com |
| `ANTHROPIC_API_KEY` | For Anthropic | Get at anthropic.com |
| `TELEGRAM_BOT_TOKEN` | For Telegram | Get from @BotFather |
| `DISCORD_BOT_TOKEN` | For Discord | Dev portal |
| `TAVILY_API_KEY` | Optional | Get at tavily.com |
| `TALON_TOKEN` | Optional | Custom auth token |

---

## Roadmap (Planned)

### v0.3.0
- Web dashboard UI
- Skills system (plugins)
- Calendar integration
- Email integration
- SQLite memory

### v1.0.0
- Stable API
- Plugin marketplace
- Mobile apps
- Enterprise features

---

*Last updated: 2026-02-16*
*Version: 0.2.1*
