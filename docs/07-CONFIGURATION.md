# Talon — Configuration Reference

Complete reference for `~/.talon/config.json`.

---

## Full Configuration Schema

```jsonc
{
  // ─── Gateway ───────────────────────────────────────────────
  "gateway": {
    "host": "127.0.0.1",              // Bind address (default: loopback)
    "port": 19789,                     // WebSocket + HTTP port
    "auth": {
      "mode": "none",                  // "none" | "password" | "token"
      "password": "${TALON_PASSWORD}",
      "token": "${TALON_TOKEN}",
      "allowTailscale": false
    },
    "tailscale": {
      "mode": "off",                   // "off" | "serve" | "funnel"
      "resetOnExit": true
    },
    "cors": {
      "origins": ["http://127.0.0.1:*"]
    }
  },

  // ─── Agent ─────────────────────────────────────────────────
  "agent": {
    "model": "anthropic/claude-sonnet-4-20250514",  // Default model
    "providers": {
      "anthropic": {
        "apiKey": "${ANTHROPIC_API_KEY}",
        "models": [
          "claude-sonnet-4-20250514",
          "claude-opus-4-0"
        ]
      },
      "openai": {
        "apiKey": "${OPENAI_API_KEY}",
        "models": ["gpt-4o", "gpt-4o-mini"]
      },
      "ollama": {
        "baseUrl": "http://localhost:11434",
        "models": ["llama3.1:70b", "codellama:34b"]
      },
      "openrouter": {
        "apiKey": "${OPENROUTER_API_KEY}",
        "models": ["anthropic/claude-3.5-sonnet"]
      }
    },
    "failover": [                      // Model failover chain
      "anthropic/claude-sonnet-4-20250514",
      "openai/gpt-4o",
      "ollama/llama3.1:70b"
    ],
    "maxTokens": 4096,                 // Max response tokens
    "temperature": 0.7,
    "thinkingLevel": "medium"          // "off" | "low" | "medium" | "high"
  },

  // ─── Channels ──────────────────────────────────────────────
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "allowedUsers": [],              // Empty = allow all | Format: numeric user ID as string (e.g., "123456789")
      "allowedGroups": [],             // Empty = allow all groups | Format: group ID as string (e.g., "-987654321")
      "groupActivation": "mention"     // "mention" | "always"
    },
    "discord": {
      "enabled": false,
      "botToken": "${DISCORD_BOT_TOKEN}",
      "applicationId": "${DISCORD_APP_ID}",
      "allowedGuilds": [],
      "allowedUsers": [],
      "allowedChannels": []
    },
    "webchat": {
      "enabled": true,
      "requireAuth": false             // Require password for WebChat
    },
    "cli": {
      "enabled": true
    }
  },

  // ─── Tools ─────────────────────────────────────────────────
  "tools": {
    "files": {
      "enabled": true,
      "allowedPaths": ["~/"],
      "deniedPaths": ["~/.ssh", "~/.gnupg"],
      "maxFileSize": 10485760,         // 10MB
      "confirmOverwrite": true
    },
    "shell": {
      "enabled": true,
      "confirmDestructive": true,
      "blockedCommands": [],           // Additional blocked patterns
      "defaultTimeout": 30000,         // 30 seconds
      "maxOutputSize": 1048576         // 1MB output cap
    },
    "browser": {
      "enabled": true,
      "engine": "playwright",          // "playwright" | "puppeteer"
      "headless": true,
      "viewport": { "width": 1280, "height": 720 },
      "screenshotDir": "~/.talon/screenshots"
    },
    "os": {
      "enabled": true,
      "notifications": true,
      "clipboard": true
    }
  },

  // ─── Memory ────────────────────────────────────────────────
  "memory": {
    "enabled": true,
    "autoExtractFacts": true,
    "factDecayDays": 90,               // Days before fact confidence decays
    "session": {
      "idleTimeout": 1800000,          // 30 minutes
      "archiveAfterDays": 30,
      "maxMessagesBeforeCompact": 100
    },
    "compaction": {
      "enabled": true,
      "threshold": 0.8,
      "keepRecentMessages": 10,
      "summarizationModel": "openai/gpt-4o-mini"
    }
  },

  // ─── Shadow Loop ───────────────────────────────────────────
  "shadow": {
    "enabled": false,                  // Disabled by default (Phase 2)
    "watchers": {
      "filesystem": {
        "paths": ["~/projects"],
        "ignore": ["**/node_modules/**", "**/.git/**", "**/dist/**"],
        "events": ["change"]
      },
      "shell": {
        "watchErrors": true
      },
      "git": {
        "enabled": false
      }
    },
    "cooldown": 30000,                 // 30s between ghost messages
    "maxGhostsPerHour": 10
  },

  // ─── Security ──────────────────────────────────────────────
  "security": {
    "sandbox": {
      "mode": "off",                   // "off" | "non-main" | "always"
      "engine": "docker",
      "allowedTools": [],
      "deniedTools": []
    },
    "audit": {
      "enabled": true,
      "logFile": "~/.talon/logs/audit.jsonl",
      "retentionDays": 90
    }
  },

  // ─── UI ────────────────────────────────────────────────────
  "ui": {
    "theme": "dark",                   // "dark" | "light" | "system"
    "showToolCalls": true,
    "showTokenUsage": false,
    "streaming": true
  },

  // ─── Workspace ─────────────────────────────────────────────
  "workspace": {
    "root": "~/.talon/workspace",
    "soulFile": "SOUL.md",
    "factsFile": "FACTS.json",
    "skillsDir": "skills"
  }
}
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | OpenAI API key for GPT models |
| `OPENROUTER_API_KEY` | OpenRouter API key (multi-model) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `DISCORD_APP_ID` | Discord application ID |
| `TALON_PASSWORD` | Password for remote access auth |
| `TALON_TOKEN` | Bearer token for API auth |

---

## Channel Configuration Guide

### Telegram Setup

1. **Create a bot**: Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot
2. **Get bot token**: Copy the token provided by BotFather to `.env` as `TELEGRAM_BOT_TOKEN`
3. **Find your user ID**: Message [@userinfobot](https://t.me/userinfobot) to get your numeric ID
4. **Configure allowedUsers**: Add your numeric ID as a string (e.g., `"123456789"`)
   - Format: **Numeric user ID as string** — NOT usernames (e.g., use `"123456789"` NOT `"@john"`)
   - Empty array `[]` allows all users (not recommended for production)
5. **Group configuration** (optional):
   - Add bot to a group
   - Get group ID by forwarding a group message to @userinfobot
   - Add group ID to `allowedGroups` (e.g., `"-987654321"`)
   - Set `groupActivation`: `"mention"` (responds to @botname or /commands) or `"always"`

### WhatsApp Setup

1. **Install dependencies**: `npm install whatsapp-web.js qrcode-terminal`
2. **Enable in config**: Set `channels.whatsapp.enabled: true`
3. **Configure allowedUsers**: Add your phone number as string (e.g., `"1234567890"`)
   - Format: Phone number without country code prefix (e.g., `"584128449024"`)
4. **Scan QR code**: On startup, scan the QR code with WhatsApp on your phone
5. **Session persistence**: Auth data stored in `~/.talon/whatsapp-auth/`

---

## Deployment Patterns

### Pattern 1: Local Personal Use (Recommended)

```
Your Mac/PC
  └── Talon Gateway (127.0.0.1:19789)
        ├── Telegram bot
        ├── WebChat (localhost)
        └── CLI
```

**Config highlights:**
- `gateway.host`: `127.0.0.1`
- `gateway.auth.mode`: `none`
- `security.sandbox.mode`: `off`

### Pattern 2: Remote Server

```
Cloud VM / Home Server
  └── Talon Gateway (0.0.0.0:19789)
        ├── Telegram bot
        ├── Discord bot
        └── WebChat (via Tailscale Funnel)

Your Mac/PC
  └── SSH tunnel or Tailscale → WebChat / CLI
```

**Config highlights:**
- `gateway.host`: `0.0.0.0`
- `gateway.auth.mode`: `password`
- `gateway.tailscale.mode`: `funnel`

### Pattern 3: Hybrid (Future)

```
Remote Server
  └── Talon Gateway + channels + agent

Your Mac (node mode)
  └── Talon Node
        ├── Local file access
        ├── Shell execution
        ├── Browser control
        └── OS notifications
```

This pattern runs the Gateway remotely but delegates device-local actions to a node running on your Mac.

---

## Minimal Quick-Start Config

The smallest viable config to get started:

```json
{
  "agent": {
    "model": "anthropic/claude-sonnet-4-20250514",
    "providers": {
      "anthropic": { "apiKey": "${ANTHROPIC_API_KEY}" }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}"
    }
  }
}
```

Everything else uses defaults.
