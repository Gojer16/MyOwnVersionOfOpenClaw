# Talon 🦅 - Project Context

## Project Overview

**Talon** is a personal AI assistant that runs entirely on your machine with multi-channel communication support. It's local-first, privacy-focused, and inspired by OpenClaw but rebuilt from scratch.

**Version:** 0.4.0  
**Status:** Production-ready  
**Runtime:** Node.js 22+ with TypeScript 5.7+

### Key Features

- **Multi-Channel:** CLI (enhanced TUI), Telegram, WhatsApp
- **26+ Tools:** File operations, shell commands, web search, browser automation, Apple integrations (macOS)
- **5 Subagents:** Research, writer, planner, critic, summarizer (97% cost savings via delegation)
- **Persistent Memory:** SQLite-backed sessions with memory compression
- **Shadow Loop:** Proactive filesystem monitoring with intelligent suggestions
- **Vector Memory:** Semantic search over conversation history (optional)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INTERFACES                              │
│  Telegram · WhatsApp · CLI · (Web UI planned)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TALON GATEWAY                                │
│  Fastify HTTP Server (port 19789) · WebSocket · Event Bus       │
│  Session Management (SQLite) · Config Hot Reload                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AGENT CORE                                 │
│  Agent Loop (State Machine) · Model Router · Fallback System    │
│  Memory Manager · Memory Compressor · Context Guards            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│    TOOLS     │  │    MEMORY    │  │   PROVIDERS  │
│  26+ tools   │  │  SQLite +    │  │  DeepSeek    │
│  + 5 subagents│  │  Embeddings  │  │  OpenRouter  │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Source Structure

```
src/
├── agent/           # Agent loop, model router, fallback, providers
├── channels/        # CLI, Telegram, WhatsApp channel implementations
├── cli/             # Command-line interface entry point
├── config/          # Configuration loading with Zod validation
├── cron/            # Scheduled task system
├── gateway/         # Main server, sessions, events, protocol
├── memory/          # Memory manager, compressor, vector search
├── plugins/         # Plugin architecture (extensible)
├── protocol/        # WebSocket protocol definitions
├── shadow/          # Shadow Loop (proactive intelligence)
├── storage/         # SQLite database operations
├── subagents/       # 5 specialized subagents
├── tools/           # 26+ tool implementations
├── types/           # TypeScript type definitions
└── utils/           # Logger, helpers
```

## Building and Running

### Prerequisites

- **Node.js 22+** (required)
- **npm** (comes with Node)
- **Git**

### Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run setup wizard (configures API keys, channels)
npm run setup
```

### Development

```bash
# Start with hot reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx vitest run tests/unit/file-tools.test.ts
```

### Production

```bash
# Start Talon (builds first)
npm start

# Gateway-only mode (WebSocket server without CLI)
npm run gateway

# Health check
npm run health
```

### CLI Commands

```bash
talon setup          # First-time setup wizard
talon start          # Start with interactive CLI
talon start --daemon # Start in background
talon stop           # Stop all running gateways
talon restart        # Restart daemon
talon health         # Quick health check
talon status         # Detailed status
talon provider       # Add/change AI provider
talon switch         # Switch between models
talon tui            # Interactive TUI (connect to gateway)
talon service install   # Install as system service
talon service uninstall # Remove service
```

### Configuration

**Environment Variables** (`~/.talon/.env`):
```bash
# Required - LLM Providers
DEEPSEEK_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...

# Optional - Channels
TELEGRAM_BOT_TOKEN=123456:...
WHATSAPP_PHONE_NUMBER=1234567890
```

**Config File** (`~/.talon/config.json`):
- Generated by `npm run setup`
- See `config.example.json` for template
- Uses `${ENV_VAR}` syntax for secrets

## Development Conventions

### TypeScript

- **Strict mode** enabled in `tsconfig.json`
- **NodeNext** module resolution
- **ES2022** target
- All code must be TypeScript with strict typing

### Testing Practices

- **Framework:** Vitest 3.0+
- **Location:** `tests/unit/` for unit tests, `tests/integration/` for integration tests
- **Coverage:** Aim for 80%+ on critical paths
- **Pattern:** `*.test.ts` files

**Test Categories:**
| Category | Count | Status |
|----------|-------|--------|
| Core Components | 86 | ✅ 100% |
| Tools | 110+ | ✅ 100% |
| Channels | 25 | ✅ 100% |
| Integration | 56 | ✅ 100% |
| **Total** | **291+** | **✅ 100%** |

### Code Style

- **ES Modules** (`import`/`export`)
- **Zod validation** for all inputs (especially Apple tools with `BulletproofOutput`)
- **Structured logging** with Pino
- **Error handling** with try-catch and structured error responses
- **Type safety** - no `any` unless absolutely necessary

### Tool Implementation Pattern

Tools follow a consistent pattern:

```typescript
import { z } from 'zod';

const ToolSchema = z.object({
    param: z.string().min(1),
    optional: z.number().optional(),
});

export function createTool() {
    return {
        name: 'tool_name',
        description: 'What the tool does',
        parameters: { /* JSON schema */ },
        async execute(args: Record<string, unknown>): Promise<string> {
            // Validate input
            const result = ToolSchema.safeParse(args);
            if (!result.success) {
                return JSON.stringify({ success: false, error: result.error.message });
            }
            
            // Execute logic
            // Return structured result
        },
    };
}
```

### Apple Tools Pattern (macOS only)

Apple tools use `BulletproofOutput` with Zod validation:

```typescript
import { z } from 'zod';
import { BulletproofOutput, safeExecAppleScript } from '../apple-shared.js';

const ToolSchema = z.object({ /* ... */ });

async function execute(args: Record<string, unknown>): Promise<string> {
    const validation = ToolSchema.safeParse(args);
    if (!validation.success) {
        return formatError('VALIDATION_ERROR', validation.error);
    }
    
    const output: BulletproofOutput = await safeExecAppleScript(script);
    return JSON.stringify(output);
}
```

### Git Workflow

- **Branch:** `main` (production-ready)
- **Commits:** Conventional commits preferred
- **Issues:** Tracked in `docs/Issues*.md` files
- **Documentation:** Update relevant README when making changes

### Key Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts, version |
| `tsconfig.json` | TypeScript configuration |
| `vitest.config.ts` | Test configuration |
| `config.example.json` | Configuration template |
| `.env.example` | Environment variable template |
| `docs/IssuesTools.md` | Tools system issue tracking |
| `docs/IssuesChannels.md` | Channels issue tracking |
| `CHANGELOG.md` | Version history |

### Recent Work (2026-02-23)

**Tools System - 34/35 Issues Resolved:**
- ✅ Subagent system wired up and functional
- ✅ Input validation added to all tools (Zod schemas)
- ✅ Error handling throughout (JSON parse, network, validation)
- ✅ Test coverage for notes, tasks, screenshot, scratchpad tools
- ✅ Vector memory semantic search enabled
- ⚠️ TOOL-029: Output format standardization (low priority)

**Channels - 24/24 Issues Resolved:**
- ✅ Response delivery to all channels
- ✅ Telegram/WhatsApp message chunking
- ✅ Typing indicators
- ✅ Auto-reconnection and rate limiting
- ✅ Exponential backoff for polling errors

## Common Tasks

### Adding a New Tool

1. Create file in `src/tools/your-tool.ts`
2. Follow the tool pattern with Zod validation
3. Register in `src/tools/registry.ts`
4. Add tests in `tests/unit/your-tool.test.ts`
5. Update `src/tools/README.md`

### Adding a New Channel

1. Create directory in `src/channels/your-channel/`
2. Implement channel interface
3. Register in gateway
4. Add to config schema
5. Add tests

### Running Specific Tests

```bash
# All tests
npm test

# Unit tests only
npx vitest run tests/unit/

# Integration tests only
npx vitest run tests/integration/

# Specific test file
npx vitest run tests/unit/file-tools.test.ts

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Debugging

```bash
# Enable debug logging
DEBUG=tools:* npm run dev
DEBUG=channels:* npm run dev
DEBUG=agent:* npm run dev

# View logs
pino-pretty logs.log
```

## External Resources

- [OpenClaw Inspiration](https://openclaw.ai/)
- [Fastify Documentation](https://www.fastify.io/)
- [Vitest Documentation](https://vitest.dev/)
- [Zod Documentation](https://zod.dev/)
- [Pino Logger](https://getpino.io/)
