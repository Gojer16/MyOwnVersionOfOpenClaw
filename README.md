# Talon 🦅

> **A personal AI assistant that lives on your machine, sees your full desktop, and talks to you on the platforms you already use.**

Inspired by [OpenClaw](https://openclaw.ai/) — rebuilt from scratch as a privacy-first, single-user AI assistant with proactive intelligence.

---

## What is Talon?

Talon is a **local-first personal AI assistant** you run on your own Mac, PC, or server. It connects to your messaging apps (Telegram, Discord, WebChat), has full access to your filesystem and shell, can browse the web, and remembers everything about you across sessions.

### Key Features

| Feature | Description |
|---|---|
| 🔒 **Privacy First** | Runs locally — your data never leaves your machine |
| 💬 **Multi-Channel** | Telegram, Discord, WebChat, CLI — same AI everywhere |
| 📁 **Full System Access** | Read/write files, run commands, browse the web |
| 🧠 **Persistent Memory** | Remembers your preferences, projects, and context |
| 👻 **Shadow Loop** | Watches your filesystem and proactively suggests fixes |
| 🎭 **Evolving Persona** | A "Soul" that adapts to your style and values |
| 🔧 **Extensible** | Skills and plugins for custom capabilities |

---

## Architecture

```
Telegram · Discord · WebChat · CLI
               │
               ▼
     ┌─────────────────────┐
     │   Talon Gateway   │ ← ws://127.0.0.1:19789
     └──────────┬──────────┘
                │
    ┌───────────┼───────────────┐
    ▼           ▼               ▼
  Agent       Sub-Agent      Memory
  Loop        Manager        Manager
  (State      (Research,     (Compression
  Machine)    Planner,       + Context
    │         Writer,         Control)
    │         Critic)
    │
    ├── Model Router (cheapest model per task)
    ├── Tool Runner (Files · Shell · Browser · OS)
    └── Shadow Loop (Proactive observation)
```

---

## Documentation

| Document | Description |
|---|---|
| [Vision](docs/00-VISION.md) | Project identity, principles, and relationship to OpenClaw |
| [Architecture](docs/01-ARCHITECTURE.md) | System architecture, data flow, directory structure, tech stack |
| [Components](docs/02-COMPONENTS.md) | Detailed specs with TypeScript interfaces for every subsystem |
| [Tools & Capabilities](docs/03-TOOLS-AND-CAPABILITIES.md) | All 17 built-in tools with parameters and security notes |
| [Channels & Interfaces](docs/04-CHANNELS-AND-INTERFACES.md) | Channel specs, Web UI, chat commands, message formatting |
| [Memory & Persona](docs/05-MEMORY-AND-PERSONA.md) | 4-tier memory, Soul system, fact store, context management |
| [Security](docs/06-SECURITY.md) | Tool safety, access control, sandboxing, audit logging |
| [Configuration](docs/07-CONFIGURATION.md) | Full config reference, env vars, deployment patterns |
| [Roadmap](docs/08-ROADMAP.md) | 4-phase implementation plan with deliverables and decisions |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ |
| Language | TypeScript 5.5+ |
| LLM | Anthropic Claude (primary), OpenAI, Ollama |
| Telegram | grammY |
| Discord | discord.js v14 |
| Browser | Playwright |
| UI | React + Vite |
| Config | Zod validation |
| Storage | JSON files (MVP), SQLite (future) |

---

## Project Status
 
✅ **Phase 1 MVP Complete** — Core agent, memory, tools, and channels are implemented.
 
### Getting Started
 
1. **Setup:**
   ```bash
   npm install
   npm run setup
   ```
   Follow the wizard to configure your LLM provider (DeepSeek, OpenRouter, etc.) and workspace.
 
2. **Start:**
   ```bash
   npm start
   ```
   This launches the Gateway and the CLI REPL.
 
3. **Chat:**
   - Type in the CLI to talk to Talon.
   - Or connect via Telegram if configured.
 
See [docs/07-CONFIGURATION.md](docs/07-CONFIGURATION.md) for advanced config.

---

## License

TBD
