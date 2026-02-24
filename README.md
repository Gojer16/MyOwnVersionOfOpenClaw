# Talon 🦅

> **A personal AI assistant that lives on your machine, sees your full desktop, and talks to you on the platforms you already use.**

Inspired by [OpenClaw](https://openclaw.ai/) — rebuilt from scratch as a privacy-first, single-user AI assistant with proactive intelligence.

**Version:** 0.4.0
**Status:** Production-ready with Shadow Loop, subagents, browser control, productivity tools & full system access
**Channels:** ✅ CLI, ✅ Telegram, ✅ WhatsApp (all production-ready)

---

## 📊 Quick Stats

- **70 Source Files** - Enterprise-grade architecture
- **26+ Tools** - File, shell, web, browser, productivity, Apple integrations
- **5 Subagents** - Research, writer, planner, critic, summarizer
- **8 Apple Tools** - Native Notes, Reminders, Calendar, Mail integration (macOS)
- **323 Tests** - 100% passing with comprehensive coverage
- **3 Channels** - CLI, Telegram, WhatsApp
- **97% Cost Savings** - Via intelligent subagent delegation

---

## ✨ What Makes Talon Different

Unlike cloud-based AI assistants, Talon:
- 🔒 **Runs entirely on your machine** — your data never leaves
- 💬 **Integrates with your existing apps** — Telegram, WhatsApp, CLI, Apple apps
- 🧠 **Remembers everything** — persistent memory across sessions
- 🛠️ **Has full system access** — files, shell, browser, calendar, notes (with your permission)
- 📱 **Works everywhere** — same AI on all your devices
- 🤖 **Delegates intelligently** — uses cheap models for specialized tasks
- 👁️ **Watches proactively** — Shadow Loop observes and suggests

---

## 🚀 Features

### Multi-Channel Communication

Talk to Talon wherever you are:

| Channel | Status | Features |
|---------|--------|----------|
| **💻 CLI** | ✅ Enhanced | Interactive terminal with real-time streaming, tool visualization |
| **📱 WhatsApp** | ✅ Production Ready | Full WhatsApp Web integration, QR auth, groups, auto-reconnect, rate limiting |
| **✈️ Telegram** | ✅ Production Ready | Bot integration, polling, user/group authorization, mention detection, message chunking |
| **🌐 Web UI** | 🚧 Planned | Browser dashboard (coming in v0.4.0) |

**Recent Channel Fixes (2026-02-23):**
- ✅ Response delivery to all channels (CHAN-003)
- ✅ Telegram message chunking for 4096 char limit (CHAN-002)
- ✅ WhatsApp non-blocking initialization (CHAN-005)
- ✅ Telegram group mention detection (CHAN-006)
- ✅ WhatsApp auto-reconnection (CHAN-009)
- ✅ Rate limiting for WhatsApp (CHAN-010)
- ✅ Exponential backoff for Telegram polling (CHAN-008)

See [docs/IssuesChannels.md](docs/IssuesChannels.md) for complete issue tracking.

### 🎨 Enhanced CLI

**Terminal Interface:**

```bash
talon tui          # Interactive TUI
talon tui-legacy   # Legacy readline TUI
```

**Features:**
- 📊 Real-time streaming with smooth updates
- 🛠️  Rich tool visualization (expandable results)
- 💬 Session management with history
- 🎨 Syntax-highlighted code blocks
- ⌨️  Keyboard shortcuts
- 📈 Token usage display
- 🎭 Markdown rendering

**Keyboard Shortcuts:**
| Shortcut | Action |
|----------|--------|
| `Ctrl+L` | Clear screen |
| `Ctrl+D` | Exit |
| `Ctrl+C` | Cancel/Interrupt |

### 🏗️ Core Architecture

#### Health Checks
- **Basic Health** (`GET /api/health`) - Version, uptime, sessions, WebSocket clients
- **Deep Probe** (`GET /api/health/deep`) - Component-level health checks
- **Ready Check** (`GET /api/ready`) - For load balancers

#### Config Hot Reload
- **Automatic Reload** - Watches config file for changes
- **Debounced Updates** - 300ms debounce prevents rapid reloads
- **Event Emission** - Notifies components on config change

#### Daemon Mode
- **Background Running** - Run as system service
- **PID File Management** - Track running process
- **Platform Support** - macOS (launchd), Linux (systemd)
- **Service Generation** - Auto-generate service files

#### Gateway Server
- **Fastify HTTP** - REST API on port 19789
- **WebSocket** - Real-time messaging at `/ws`
- **Session Management** - Create, resume, persist sessions
- **Event Bus** - Pub/sub for internal communication

#### Shadow Loop (Proactive Intelligence)
- **Filesystem Watching** - Monitors file changes with chokidar
- **Smart Heuristics** - Filters interesting events (new files, changes, test updates)
- **Ghost Messages** - Proactive suggestions before you ask
- **Configurable** - Custom paths, ignore patterns, cooldown periods
- **Non-intrusive** - Observes without interrupting your workflow

### AI Agent Capabilities

- **100% FREE Models** — OpenCode integration with 4 free models (no API key needed!)
- **Smart Model Routing** — Uses cheapest capable model (OpenCode → DeepSeek → OpenRouter → OpenAI)
- **Automatic Fallback** — If one provider fails, seamlessly switches to another
- **Context Window Protection** — Prevents crashes from token overflow
- **Subagent Delegation** — Delegates specialized tasks to cheap models (97% cost savings)
- **Tool Use** — Files, shell commands, web search, browser automation, subagents
- **Persistent Memory** — Remembers your preferences, projects, context
- **State Machine** — PLAN → DECIDE → EXECUTE → EVALUATE → RESPOND

### Tools Available

| Tool | Description | Safety |
|------|-------------|--------|
| 📁 **File** | Read, write, search files | Path validation, size limits |
| 🐚 **Shell** | Execute commands | Timeout, blocked commands, confirmation |
| 🌐 **Web Search** | DeepSeek, OpenRouter, Tavily, DuckDuckGo | - |
| 📄 **Web Fetch** | Extract content from URLs | Content cleaning |
| 🧠 **Memory** | Read/write to memory system | User-controlled |
| 🤖 **Subagents** | Delegate to specialized agents (research, writer, planner, critic, summarizer) | Cost-optimized |
| 🌐 **Browser** | Navigate, click, type, screenshot, extract content | Puppeteer automation |
| 📝 **Notes** | Save and search notes in markdown | Local storage |
| ✅ **Tasks** | Todo list management with priorities | Local storage |
| 🍎 **Apple Notes** | Create and search Apple Notes (macOS) | Native integration |
| ⏰ **Apple Reminders** | Manage Apple Reminders (macOS) | Native integration |
| 📅 **Apple Calendar** | Create and manage calendar events (macOS) | Native integration |
| 📧 **Apple Mail** | Read and manage emails (macOS) | Native integration |

### Productivity Tools

**Local Tools:**
- **notes_save** - Save notes with tags to `~/.talon/workspace/notes/`
- **notes_search** - Search notes by keyword or tag
- **tasks_add** - Add tasks with priority levels (low/medium/high)
- **tasks_list** - List tasks filtered by status
- **tasks_complete** - Mark tasks as done

**Apple Integrations (macOS only):**
- **apple_notes_create** - Create notes in Apple Notes app
- **apple_notes_search** - Search Apple Notes
- **apple_reminders_add** - Add reminders with due dates and priority
- **apple_reminders_list** - List reminders by list name
- **apple_reminders_complete** - Mark reminders as complete
- **apple_calendar_create_event** - Create calendar events with location and notes
- **apple_calendar_list_events** - List upcoming events
- **apple_calendar_delete_event** - Delete events by title
- **📧 Apple Mail (macOS)**:
- **apple_mail_list_emails** - List emails from mailbox (inbox, sent, etc.)
- **apple_mail_read_email** - Read email content by message ID
- **apple_mail_send_email** - Send new emails with recipient, subject, body

### Subagent System

Talon can delegate specialized tasks to lightweight subagents using cheap models:

| Subagent | Purpose | Output Format |
|----------|---------|---------------|
| 🔍 **Research** | Gather information with sources | Findings + sources |
| ✍️ **Writer** | Produce content (markdown/code/text) | Content + word count |
| 📋 **Planner** | Create actionable plans | Steps + risks + timeline |
| 🎯 **Critic** | Review work with feedback | Rating + strengths/weaknesses |
| 📝 **Summarizer** | Compress information | Summary + key points |

**Cost Savings:** Main agent uses gpt-4o ($5/1M tokens), subagents use gpt-4o-mini ($0.15/1M tokens) = **97% savings**

**Configuration:** Set `agent.subagentModel` in config to use any model:
- `openrouter/openai/gpt-4o-mini` - OpenRouter (reliable)
- `openrouter/google/gemini-flash-1.5` - Google (fastest, $0.075/1M)
- `deepseek/deepseek-chat` - DeepSeek (cheapest, $0.14/1M)

See [docs/SUBAGENT_CONFIGURATION.md](docs/SUBAGENT_CONFIGURATION.md) for details.

### Browser Control

Talon can control browsers with Puppeteer:

| Tool | Description |
|------|-------------|
| **browser_navigate** | Open URLs in browser |
| **browser_click** | Click elements by selector |
| **browser_type** | Type text into inputs |
| **browser_screenshot** | Capture page screenshots |
| **browser_extract** | Extract page content |

**Features:**
- Headless/headed mode
- Custom viewport sizes
- Auto-launch browser
- Full page automation

### CLI Features

```bash
# Service Management
talon service install    # Install as system service (LaunchAgent/systemd)
talon service uninstall  # Remove service
talon service start      # Start service
talon service stop       # Stop service temporarily
talon service restart    # Restart running service
talon service status     # Check if installed/running

# Provider Management
talon provider           # Add/change AI provider (saves API key to .env)
talon switch             # Switch between configured models

# Interactive TUI
talon tui                # Connect to running gateway with beautiful interface

# TUI Features:
  ✓ Connected to gateway
  ⚡ Model: openrouter/gpt-4o
  📍 Workspace: ~/.talon/workspace
  
  You > Hello!
    ⏳ Talon is thinking...
    🛠️  file_read → IDENTITY.md
  ╭─ Talon ─────────────────────
  │ Hey! 👋 How can I help?
  │ 
  │ • Clean formatting (no ** markdown)
  │ • Colored bullet points for readability
  ╰─────────────────────────────
  
  # Slash commands
  /help        Show available commands
  /model       Show current model
  /config      View configuration
  /version     Show version info
  /clear       Clear screen
  /exit        Exit TUI
  
  # Bash execution
  !ls -la      Execute shell commands

Session:
  /help        Show available commands
  /status      Show session status and metrics
  /reset       Clear session history
  /new         Alias for /reset
  /tokens      Show estimated token usage
  /compact     Trigger memory compression
  /clear       Clear screen
  /memory      View recent memory files

Skills:
  /time        Show current date and time
  /echo        Echo back input text
  /calc        Simple calculator (e.g., /calc 2+2)

# Bash execution
You > !ls -la
$ ls -la
drwxr-xr-x  24 user  staff   768 Feb 16 17:01 .

# Regular chat with tool usage
You > What's the weather in Tokyo?
🦅 Talon > Let me check that for you...
  🛠️  Using web_search...
🦅 Talon > The weather in Tokyo is currently 18°C and sunny...
💰 150 → 200 = 350 tokens (DeepSeek)

# Check configuration
You > /config
⚙️  Talon Configuration
  Workspace:   /Users/orlando/.talon/workspace
  Model:       deepseek/deepseek-chat
  Gateway:     127.0.0.1:19789
  Channels:    CLI ✅, Telegram ❌, WhatsApp ❌, WebChat ✅

# Check version
You > /version
🦅 Talon
  Version:    0.3.0
  Name:       talon
  Node:       v22.10.0
  Platform:   darwin arm64
  Uptime:     2h 35m
  Providers:   ✅ DeepSeek, OpenRouter
  Sessions:    5 active
  Gateway:     ✅ Running

# Command suggestions for mistyped commands
You > /helpp
🦅 Did you mean /help? Type /help to see all commands.

# Clear screen with welcome banner
You > /clear

╔══════════════════════════════════════╗
║                                      ║
║   🦅  T A L O N   v0.3.3            ║
║                                      ║
║   Personal AI Assistant              ║
║   Inspired by OpenClaw               ║
║                                      ║
╚══════════════════════════════════════╝

# When errors occur, Talon handles them gracefully with specific messages:
# • "I'm having trouble with the conversation context..." - Context issues
# • "It looks like there's an issue with your API key..." - Billing/quota
# • "I'm being rate limited..." - Rate limit errors
# • "The request timed out..." - Timeout errors
# • "Network error..." - Connection issues
# • Generic fallback message for other errors
╔══════════════════════════════════════╗
║                                      ║
║   🦅  T A L O N   v0.3.3            ║
║                                      ║
║   Personal AI Assistant              ║
║   Inspired by OpenClaw               ║
║                                      ║
╚══════════════════════════════════════╝

# Skill commands example
You > /time
📅 Current time: Monday, February 16, 2026, 22:52:00 GMT-4

You > /calc 15 * 3
🧮 Result: 45

You > /echo Hello World!
📢 Hello World!
```

### 🚀 Boot Hook (BOOT.md)

Run custom instructions on gateway startup:

```markdown
# ~/.talon/workspace/BOOT.md
Good morning! Today is {{DATE}}.

Please check:
1. Any urgent notifications?
2. What's on my calendar?
3. Pending tasks from yesterday?

If all clear, just say "All clear!"
```

- Executes through agent loop with full tool access
- Can send messages, run commands, check files
- Enable in setup wizard or config: `hooks.bootMd.enabled: true`

### Security & Privacy

- **Local First** — Everything runs on your machine
- **Secure Config** — API keys in `.env`, never committed
- **Data Separation** — Personal data in `~/.talon/` (gitignored)
- **Template System** — Clean templates with frontmatter, user data isolated
- **Workspace Isolation** — Templates in `templates/workspace/`, user data in `~/.talon/workspace/`
- **Authorization** — Whitelist users/channels per platform
- **Sandboxing** — Optional Docker sandbox for dangerous operations

**🔐 Important**: Your personal data (name, memories, AI personality) is stored in `~/.talon/workspace/` and **never committed to git**. See [Security Guide](docs/REPOSITORY_SECURITY.md) for details.

---

## 📦 Installation

### Prerequisites

- **Node.js 22+** ([download](https://nodejs.org/))
- **npm** (comes with Node)
- **Git** ([download](https://git-scm.com/))

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/talon.git
cd talon

# Install dependencies
npm install

# Install WhatsApp support (optional, heavy)
npm install whatsapp-web.js qrcode-terminal

# Run secure setup wizard
npm run setup:secure

# Start Talon
npm start
```

### Setup Wizard

The setup wizard will:
1. Create `~/.talon/.env` for your API keys
2. Create `~/.talon/config.json` for configuration
3. Copy template files to `~/.talon/workspace/`
4. Configure your preferred LLM provider

### CLI Commands

```bash
talon setup          # First-time setup wizard (auto-detects running gateways)
talon start          # Start with interactive CLI (prevents duplicates)
talon start --daemon # Start in background
talon stop           # Stop all running gateways (safe process detection)
talon restart        # Restart daemon
talon health         # Quick health check
talon status         # Detailed status
talon provider       # Add/change AI provider
talon switch         # Switch between models
talon tui            # Interactive TUI (connect to gateway)
```

**Cron (TUI slash commands):**
```
/cron list                # List jobs
/cron add                 # Interactive wizard
/cron show <jobId>         # Full job details
/cron edit <jobId>         # Edit job via menu
/cron enable <jobId>       # Enable job
/cron disable <jobId>      # Disable job
/cron remove <jobId>       # Remove job
```

### Cron Quickstart

1. Set your default channel in `~/.talon/workspace/PROFILE.json`:
```json
{
  "name": "Orlando",
  "preferredName": "Gojer",
  "timezone": "America/New_York",
  "channels": {
    "default": "telegram"
  }
}
```

2. Create a job in the TUI:
```
/cron add
```

Example prompt for an agent action:
```
Generate my 6am routine. Include a short Russian phrase and a podcast suggestion.
```

This will run daily and send the result to your default channel.
5. Set up your phone number for WhatsApp

---

## ⚙️ Configuration

### Environment Variables (`~/.talon/.env`)

```bash
# LLM Providers (required)
DEEPSEEK_API_KEY=sk-your-key-here
OPENROUTER_API_KEY=sk-or-your-key-here

# Channels (optional)
TELEGRAM_BOT_TOKEN=123456:ABC-your-token
WHATSAPP_PHONE_NUMBER=1234567890

# Security (optional)
TALON_TOKEN=your-auth-token
```

### Config File (`~/.talon/config.json`)

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
    "whatsapp": {
      "enabled": true,
      "allowedUsers": ["${WHATSAPP_PHONE_NUMBER}"]
    },
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}"
    }
  }
}
```

**Note:** Use `${ENV_VAR}` syntax for secrets. They'll be replaced at runtime.

---

## 📱 Channel Setup Guide

### Telegram Setup (5 minutes)

1. **Create a bot**: Message [@BotFather](https://t.me/BotFather) on Telegram
   - Send `/newbot` and follow prompts
   - Copy the bot token (e.g., `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

2. **Find your user ID**: Message [@userinfobot](https://t.me/userinfobot)
   - It will reply with your numeric ID (e.g., `123456789`)

3. **Add to `.env`**:
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
   ```

4. **Update `~/.talon/config.json`**:
   ```json
   "telegram": {
     "enabled": true,
     "botToken": "${TELEGRAM_BOT_TOKEN}",
     "allowedUsers": ["123456789"]
   }
   ```

5. **Restart Talon**: `npm start`

### WhatsApp Setup (2 minutes)

1. **Install dependencies**:
   ```bash
   npm install whatsapp-web.js qrcode-terminal
   ```

2. **Find your phone number**: Include country code, no `+` (e.g., `584128449024`)

3. **Add to `.env`**:
   ```bash
   WHATSAPP_PHONE_NUMBER=584128449024
   ```

4. **Update `~/.talon/config.json`**:
   ```json
   "whatsapp": {
     "enabled": true,
     "allowedUsers": ["${WHATSAPP_PHONE_NUMBER}"]
   }
   ```

5. **Restart Talon**: `npm start`
   - Scan the QR code displayed in terminal with your WhatsApp phone app
   - Session persists across restarts

### WhatsApp Business API (Enterprise Alternative)

For enterprise users who need official WhatsApp Business API integration:

**Requirements:**
- WhatsApp Business API account via Meta or provider (Twilio, MessageBird, etc.)
- Business phone number (cannot use personal WhatsApp)
- Monthly fees apply (varies by provider and message volume)

**Setup with Twilio:**
1. **Create Twilio account** at [twilio.com](https://twilio.com)
2. **Get WhatsApp sandbox** or production number
3. **Install Twilio CLI**:
   ```bash
   npm install twilio
   ```
4. **Add to `.env`**:
   ```bash
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_WHATSAPP_NUMBER=+14155238886
   ```
5. **Update `config.json`**:
   ```json
   "whatsapp": {
     "enabled": true,
     "provider": "twilio",
     "accountSid": "${TWILIO_ACCOUNT_SID}",
     "authToken": "${TWILIO_AUTH_TOKEN}",
     "whatsappNumber": "${TWILIO_WHATSAPP_NUMBER}",
     "allowedUsers": ["+1234567890"]
   }
   ```

**Benefits of Business API:**
- ✅ Official Meta support
- ✅ Higher message limits
- ✅ Verified business profile
- ✅ Analytics and insights
- ✅ Multi-agent support

**Limitations:**
- ❌ Monthly costs ($0.005-$0.10 per message)
- ❌ Approval process required
- ❌ Business use only (no personal accounts)

**Note**: The default `whatsapp-web.js` integration is FREE and recommended for personal use. Business API is only needed for enterprise scenarios.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Vision](docs/00-VISION.md) | Project identity and principles |
| [Architecture](docs/01-ARCHITECTURE.md) | System design and data flow |
| [Architecture Enhancements](docs/ARCHITECTURE_ENHANCEMENTS.md) | **🏗️ v0.3.3 architecture overview** |
| [Components](docs/02-COMPONENTS.md) | Detailed component specs |
| [Tools](docs/03-TOOLS-AND-CAPABILITIES.md) | All 17+ built-in tools |
| [Channels](docs/04-CHANNELS-AND-INTERFACES.md) | Channel configuration |
| [Memory](docs/05-MEMORY-AND-PERSONA.md) | Memory system and persona |
| [Security](docs/SECURITY.md) | **🔐 Secure configuration guide** |
| [Repo Security](docs/REPOSITORY_SECURITY.md) | Open source security |
| [Config](docs/07-CONFIGURATION.md) | Full configuration reference |
| [Roadmap](docs/08-ROADMAP.md) | Future plans |
| [Changelog](CHANGELOG.md) | Version history |
| [Features](docs/TALON_FEATURES.md) | Complete feature catalog |
| [OpenClaw Comparison](docs/OPENCLAW_FEATURES.md) | Comparison with OpenClaw |

---

## 🏗️ Architecture (v0.3.3)

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INTERFACES                              │
│  Telegram · WhatsApp · CLI · Plugins · (Web UI coming soon)     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PROTOCOL LAYER                               │
│  WebSocket · REST API · Gateway Frames · Zod Validation         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TALON GATEWAY                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │   Server     │ │   Sessions   │ │    Events    │            │
│  │  (Fastify)   │ │  (Key Store) │ │    (Bus)     │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │   Plugins    │ │     Cron     │ │   Protocol   │            │
│  │   (Loader)   │ │  (Scheduler) │ │   (Handler)  │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AGENT CORE                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Agent Loop  │  │ Model Router │  │Context Guard │          │
│  │(State Machine│  │ (Fallback)   │  │(Token Mgmt)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│    TOOLS     │  │    MEMORY    │  │   PROVIDERS  │
│  · File      │  │ · Short-term │  │ · DeepSeek   │
│  · Shell     │  │ · Long-term  │  │ · OpenRouter │
│  · Web       │  │ · Facts      │  │ · OpenAI     │
│  · Memory    │  │ · Compress   │  │ · Custom     │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 22+ |
| **Language** | TypeScript 5.7+ |
| **Server** | Fastify 5.x |
| **Protocol** | WebSocket, Zod validation |
| **AI/LLM** | OpenAI SDK, custom providers |
| **Validation** | Zod (schemas + runtime) |
| **Logging** | Pino |
| **Terminal** | Chalk, Inquirer |
| **Testing** | Vitest |
| **Channels** | whatsapp-web.js, node-fetch |
| **Plugins** | Dynamic loader, hot reload |
| **Cron** | Native scheduler |

---

## 📝 Commands

```bash
# Development
npm run dev              # Start with hot reload
npm run build            # Compile TypeScript
npm test                 # Run tests

# CLI Commands
npm start                # Start Talon gateway + CLI
npm run setup            # Interactive setup wizard
npm run setup:secure     # Secure setup with env vars
npm run health           # Check gateway health

# Options
npm start -- --daemon    # Run in background
npm start -- --port 8080 # Custom port
```

---

## 🔐 Security First

**Before you start**, read:
- [docs/SECURITY.md](docs/SECURITY.md) — How to configure securely
- [docs/REPOSITORY_SECURITY.md](docs/REPOSITORY_SECURITY.md) — Open source safety

**Key Points:**
- API keys go in `~/.talon/.env` (never committed)
- Personal data goes in `~/.talon/workspace/` (gitignored)
- Templates in `templates/workspace/` are generic and safe
- Each user gets their own copy of workspace files
- Structured profile lives in `~/.talon/workspace/PROFILE.json`

---

## 🗺️ Roadmap

### ✅ v0.3.3 (Current) - Enterprise Architecture
- **Protocol Layer** - Structured message protocol with Zod validation
- **Session Key System** - Sophisticated session identification and management
- **Plugin Architecture** - Dynamic loading, channel plugins, tool extensions
- **Cron Scheduler** - Background tasks, job scheduling, event-driven execution
- **Enhanced Gateway** - 8-phase boot, comprehensive status reporting
- Multi-channel (Telegram, WhatsApp, CLI, Plugin Channels)
- Model fallback system with automatic retries
- Context window protection with smart truncation
- Secure configuration with data separation

### 🚧 v0.4.0 (Planned)
- Web dashboard UI (React-based)
- Multi-agent support
- Browser automation tools
- Advanced memory features

### 🔮 v1.0.0 (Future)
- Stable API
- Plugin marketplace
- Mobile apps
- Enterprise features
 - Calendar integration
 - Email integration
 - SQLite memory storage

See [docs/08-ROADMAP.md](docs/08-ROADMAP.md) for full details.

---

## 🤝 Contributing

This is a personal project, but suggestions and feedback are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

**Note:** Never commit personal data. See [security guide](docs/REPOSITORY_SECURITY.md).

---

## 📄 License

MIT License - See LICENSE file

---

## 🙏 Acknowledgments

- Inspired by [OpenClaw](https://openclaw.ai/)
- Built with [Node.js](https://nodejs.org/), [TypeScript](https://www.typescriptlang.org/), [Fastify](https://www.fastify.io/)
- WhatsApp integration via [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)

---

**Made with ❤️ for personal AI freedom**

[Changelog](CHANGELOG.md) · [Documentation](docs/) · [Issues](https://github.com/yourusername/talon/issues)
