# Talon — System Architecture

## High-Level Overview

Talon follows a **gateway-centric, multi-agent** architecture. A single Gateway process orchestrates all interactions, but the real intelligence comes from an **iterative agent loop** (state machine) that can **delegate to specialist sub-agents**, **route to different models by task complexity**, and **aggressively compress memory** to control cost.

```
                    ┌──────────────────────────────────────────┐
                    │              CHANNELS                     │
                    │  Telegram · Discord · WebChat · CLI       │
                    └────────────────────┬─────────────────────┘
                                         │ messages in/out
                                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              GATEWAY                                       │
│                         ws://127.0.0.1:19789                               │
│                                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Router     │  │   Session    │  │   Config     │  │   Event      │  │
│  │  (channel →  │  │   Manager    │  │   Manager    │  │    Bus       │  │
│  │   session)   │  │              │  │              │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  └──────┬───────┘  │
│         │                 │                                    │          │
│         └─────────────────┼────────────────────────────────────┘          │
│                           ▼                                               │
│           ┌────────────────────────────────────┐                         │
│           │    AGENT LOOP (State Machine)       │                         │
│           │                                    │                         │
│           │  ┌──────────────┐  ┌────────────┐  │                         │
│           │  │ Main Agent   │  │   Model    │  │                         │
│           │  │ (Controller) │  │   Router   │  │                         │
│           │  └──────┬───────┘  └────────────┘  │                         │
│           │         │                          │                         │
│           │         ├── Tool calls              │                         │
│           │         ├── Sub-agent delegation    │                         │
│           │         └── Memory compression      │                         │
│           └───────────────┬────────────────────┘                         │
│                           │                                               │
│         ┌─────────────────┼──────────────────────┐                       │
│         ▼                 ▼                      ▼                       │
│  ┌─────────────┐  ┌─────────────────┐  ┌──────────────┐                 │
│  │ Tool Runner │  │  Sub-Agent      │  │   Memory     │                 │
│  │ (fs, shell, │  │  Manager        │  │   Manager    │                 │
│  │  browser,   │  │ (Research,      │  │ (compression │                 │
│  │  OS)        │  │  Planner,       │  │  + context   │                 │
│  │             │  │  Writer,        │  │  control)    │                 │
│  │             │  │  Critic)        │  │              │                 │
│  └─────────────┘  └─────────────────┘  └──────────────┘                 │
│                                                                          │
│  ┌─────────────────┐                                                    │
│  │  Shadow Loop    │  (proactive background observation)                │
│  └─────────────────┘                                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Subsystem Breakdown

### 1. Gateway (Control Plane)

The Gateway is the **single long-running process** that owns:

| Responsibility | Description |
|---|---|
| **WebSocket Server** | Exposes `ws://127.0.0.1:19789` for all clients and tools |
| **HTTP Server** | Serves Web Control UI + WebChat on the same port |
| **Message Router** | Maps incoming channel messages → sessions (by sender + channel rules) |
| **Session Manager** | Creates, tracks, resumes, and prunes conversational sessions |
| **Config Manager** | Loads `~/.talon/config.json`, validates with Zod, supports hot-reload |
| **Event Bus** | Internal pub/sub for cross-component communication |

**Key design decisions:**
- Binds to **loopback only** by default (no network exposure).
- Single process — no separate microservices for MVP.
- All state lives in `~/.talon/` (file-system backed, no external DB for MVP).

### 2. Agent Loop (The Engine — State Machine)

The Agent Loop is the **core engine** of Talon. It's not a simple request→response — it's an iterative state machine that plans, executes, evaluates, and refines until the task is done.

```
                    User prompt arrives
                           │
                           ▼
                 ┌─────────────────────┐
                 │  PLAN               │  Main Agent receives:
                 │  What needs to      │  • System prompt
                 │  happen?            │  • Memory summary (≤800 tokens)
                 └──────────┬──────────┘  • Last 5–10 messages
                            │             • Tool descriptions
                            ▼
              ┌──────────────────────────┐
              │  DECIDE next action:      │
              │                          │
              │  a) Answer directly      │──► Stream text → done
              │  b) Call a tool          │──► Tool Runner → collect result
              │  c) Delegate to sub-agent│──► Sub-Agent Manager → collect result
              │  d) Loop again           │──► Back to DECIDE
              └──────────┬──────────────┘
                         │
                         ▼
              ┌──────────────────────────┐
              │  EVALUATE                │
              │  • Is the task complete?  │
              │  • Do I have what I need? │
              │  • Should I refine?       │
              └──────────┬──────────────┘
                         │
                    ┌────┴────┐
                    ▼         ▼
                 [done]    [loop]
                    │         │
                    ▼         └──► Back to DECIDE
              ┌─────────────────┐
              │ COMPRESS memory  │  Summarize what happened,
              │ Final answer     │  truncate tool logs,
              │ to user          │  update memory summary
              └─────────────────┘
```

**This loop is what makes Talon feel intelligent.** The "agentic effect" comes from:
- **plan → execute → evaluate → refine** (not one-shot)
- **delegation** to specialist sub-agents
- **tool usage** for real-world actions
- **iterative improvement** until the goal is met

**Important:** Each iteration of this loop burns tokens. The Memory Manager controls cost by aggressively compressing context between iterations.

### 3. Model Router (Cost Optimization)

Instead of sending everything to one expensive model, the Model Router selects the **cheapest model capable** of handling each task:

| Task Type | Model Selection | Rationale |
|---|---|---|
| **Simple chat / Q&A** | Cheap model (GPT-4o-mini, Gemini Flash Lite) | No reasoning needed |
| **Main Agent orchestration** | Mid-tier (Gemini Flash, Claude Haiku) | Needs tool calling but not deep reasoning |
| **Sub-agent work** | Cheapest available (GPT-4o-mini, Nano) | Receives focused task, small context |
| **Complex reasoning** | Premium (Claude Sonnet, DeepSeek V3) | Only when explicitly needed |
| **Memory summarization** | Cheapest (GPT-4o-mini) | Routine compression task |

```typescript
interface ModelRouter {
  /** Select the best model for a given task */
  selectModel(task: TaskContext): ModelConfig;

  /** Estimate cost before executing */
  estimateCost(task: TaskContext): CostEstimate;
}

interface TaskContext {
  type: 'chat' | 'orchestration' | 'subagent' | 'reasoning' | 'summarization';
  complexity: 'low' | 'medium' | 'high';
  inputTokens: number;
}
```

**Multi-provider support** via a unified `LLMClient` interface:

| Provider | SDK | Role |
|---|---|---|
| Anthropic | `@anthropic-ai/sdk` | Premium reasoning (Claude Sonnet/Opus) |
| OpenAI | `openai` | Cheap tasks (GPT-4o-mini), fallback (GPT-4o) |
| Ollama | HTTP REST | Free local models, offline mode |
| OpenRouter | HTTP REST | Access to any model via single API |

**Failover:** If a provider fails, the router automatically uses the next available model in the same cost tier.

### 4. Sub-Agent Manager (The Team)

Instead of one model doing everything, the Main Agent can **spawn specialist sub-agents** for focused tasks. Each sub-agent receives **minimal context** (just the task + relevant data) and returns a **structured result**.

```
 Main Agent (Controller)
       │
       ├──► ResearchAgent   →  "Search for X, summarize findings"
       │                        Returns: { summary, sources, key_facts }
       │
       ├──► PlannerAgent    →  "Create a plan for Y"
       │                        Returns: { steps, risks, timeline }
       │
       ├──► WriterAgent     →  "Write code/docs for Z"
       │                        Returns: { content, explanation }
       │
       ├──► CriticAgent     →  "Review this output"
       │                        Returns: { issues, suggestions, score }
       │
       └──► SummarizerAgent →  "Condense this into key points"
                                Returns: { summary, action_items }
```

**Why sub-agents beat one big model:**

| Aspect | Single Model | Sub-Agent Delegation |
|---|---|---|
| **Context size** | Huge (entire conversation + all tool logs) | Tiny (just the sub-task) |
| **Cost** | Expensive (premium model for everything) | Cheap (sub-agents use cheapest model) |
| **Quality** | Distracted by irrelevant context | Focused on one specific task |
| **Parallelism** | Sequential | Can run multiple sub-agents concurrently |

**Sub-agent protocol:**

```typescript
interface SubAgent {
  name: string;           // e.g., "ResearchAgent"
  systemPrompt: string;   // Focused instructions
  model: string;          // Usually cheapest available
}

interface SubAgentTask {
  description: string;    // What to do
  context: string;        // Minimal relevant context (NOT full history)
  outputSchema?: object;  // Expected JSON structure
}

interface SubAgentResult {
  agent: string;
  result: Record<string, unknown>;  // Structured JSON output
  tokensUsed: number;
  cost: number;
}
```

The Main Agent receives sub-agent results and **combines them** into a cohesive answer.

### 5. Tool Runner (The Hands)

Tools are functions the agent calls to interact with the real world. The Tool Runner executes them and returns results.

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ParameterSchema>;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
```

| Category | Tools | Notes |
|---|---|---|
| **Filesystem** | `file_read`, `file_write`, `file_edit`, `file_list`, `file_search` | Path-restricted, confirmation for destructive ops |
| **Shell** | `shell_execute` | Configurable command allowlist/denylist |
| **Browser** | `browser_navigate`, `browser_click`, `browser_type`, `browser_extract`, `browser_screenshot` | Dedicated Chromium via Playwright CDP |
| **Memory** | `memory_recall`, `memory_remember` | Agent-accessible memory tools |
| **OS** | `os_notify`, `clipboard_read`, `clipboard_write`, `screen_capture` | macOS/Linux system integration |
| **Persona** | `soul_update` | Agent can propose updates to its own Soul |

**Critical:** Tool output is always **truncated** before being sent back to the LLM. Full output goes to the session log, but only the first N tokens enter the context window. This is a major cost control lever.

### 6. Memory Manager (THE MOST IMPORTANT COMPONENT)

The Memory Manager is the difference between a $0.10/day assistant and a $50/day assistant. It controls **what context gets sent to the LLM** on every single call.

**The golden rule: NEVER send full chat history.**

Instead, every LLM call receives exactly this:

```
┌────────────────────────────────────┐
│ 1. System prompt          ~500 tk │
│ 2. Memory summary         ≤800 tk │  ← Compressed history
│ 3. Last 5–10 messages    ~2000 tk │  ← Recent context
│ 4. Tool results (truncated) ~500 tk│  ← NOT full logs
│ 5. Tool descriptions      ~1500 tk│
│ 6. Current user message            │
│────────────────────────────────────│
│ Total input: ~5000–6000 tokens     │  ← Instead of 100K+
└────────────────────────────────────┘
```

**Memory compression happens continuously:**

```
Conversation grows beyond threshold
         │
         ▼
┌──────────────────────┐
│ Take old messages    │
│ + tool logs          │
│ + sub-agent results  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Summarize into a     │  ← Uses CHEAPEST model
│ "memory summary"     │
│ (max 800 tokens)     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Delete old messages  │
│ from context window  │
│ (keep in session log)│
└──────────────────────┘
```

**Example memory summary (what the LLM actually sees):**

```
User Profile:
- Name: Orlando
- Goal: build personal agent system
- Prefers direct advice, not fluff

Current Task:
- Building Talon personal AI assistant
- Architecture docs complete, moving to implementation

Decisions Made:
- Sub-agents use cheapest model available
- Main agent uses mid-tier model
- JSON storage for MVP

Important Facts:
- Token cost is dominated by input tokens
- Tool logs must be truncated before re-injection

Recent Actions:
- Created 9 architecture docs
- Revised to include multi-agent design
```

**This is what makes Talon affordable.** Full history stays in the session log on disk; the LLM only ever sees a compressed summary + recent messages.

### 7. Shadow Loop (Proactive Reflexes)

The Shadow Loop is a **background observation system** that runs independently of the agent loop:

```
┌─────────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Watchers           │     │  Heuristic Filter │     │  Ghost Messages    │
│                     │────►│                    │────►│                    │
│  • chokidar (fs)    │     │  • Is this         │     │  "I noticed X.     │
│  • shell history    │     │    significant?    │     │   Want me to Y?"   │
│  • terminal errors  │     │  • Syntax error?   │     │                    │
│  • git changes      │     │  • Build fail?     │     │  → User approves   │
│                     │     │  • New dependency?  │     │    or dismisses    │
└─────────────────────┘     └──────────────────┘     └────────────────────┘
```

The Shadow Loop is **not** part of the agent's tool calls — it's a separate event-driven pipeline that injects "Ghost Messages" into the user's chat when something interesting happens.

### 8. Channel Layer (Transport)

Channels are thin adapters. See [Channels & Interfaces](04-CHANNELS-AND-INTERFACES.md).

---

## Data Flow: End-to-End (with Agent Loop)

```
1. User sends "Research React Server Components and give me an implementation plan"
2. Telegram channel adapter receives message
3. Router identifies/creates session for this sender
4. Memory Manager builds context:
   • System prompt + SOUL.md
   • Memory summary (compressed history, ≤800 tokens)
   • Last 5 messages
   • Tool descriptions
   • Current user message
5. Main Agent (PLAN): "I need research + planning. I'll delegate."
6. Agent Loop — Iteration 1:
   • Model Router selects: cheap model for sub-agents
   • Spawn ResearchAgent: "Search for React Server Components best practices"
   • ResearchAgent calls web_search tool → gets results → returns summary JSON
7. Agent Loop — Iteration 2:
   • Spawn PlannerAgent: "Create implementation plan based on research"
   • PlannerAgent returns structured plan JSON
8. Agent Loop — Iteration 3:
   • Main Agent (EVALUATE): "I have research + plan. Task complete."
   • Combines sub-agent results into final response
9. Memory Manager:
   • Truncates tool logs to first 200 tokens each
   • Compresses sub-agent exchanges into summary
   • Stores full log to session file on disk
10. Response routed back through Telegram adapter to user
```

**Key difference from a naive implementation:** Steps 6–8 each use **minimal context** (not the full conversation), and the Memory Manager ensures context never balloons.

---

## Directory Structure

```
~/.talon/                          # Runtime data (auto-created)
├── config.json                      # User configuration
├── workspace/                       # Agent's workspace root
│   ├── SOUL.md                      # Personality + identity
│   ├── FACTS.json                   # Learned user facts
│   ├── TOOLS.md                     # Tool descriptions (injected into prompt)
│   └── skills/                      # Installed skills
│       └── <skill-name>/
│           └── SKILL.md
├── sessions/                        # Conversation history
│   └── <session-id>.json
├── memory/                          # Long-term memory entries
│   └── memories.json
└── logs/                            # Application logs
    └── talon.log

PersonalOpenClawVersion/             # Source code
├── src/
│   ├── gateway/                     # Gateway core
│   │   ├── index.ts                 # Entry point
│   │   ├── server.ts                # WebSocket + HTTP server
│   │   ├── router.ts                # Channel → session routing
│   │   ├── sessions.ts              # Session lifecycle
│   │   ├── config.ts                # Config loading + validation
│   │   └── events.ts                # Internal event bus
│   ├── agent/                       # Agent runtime
│   │   ├── loop.ts                  # Agent loop state machine
│   │   ├── orchestrator.ts          # Main Agent (controller)
│   │   ├── router.ts                # Model router (cost optimization)
│   │   ├── subagents/               # Sub-agent definitions
│   │   │   ├── manager.ts           # Sub-agent spawning + collection
│   │   │   ├── research.ts          # ResearchAgent
│   │   │   ├── planner.ts           # PlannerAgent
│   │   │   ├── writer.ts            # WriterAgent
│   │   │   ├── critic.ts            # CriticAgent
│   │   │   └── summarizer.ts        # SummarizerAgent
│   │   ├── providers/               # LLM provider implementations
│   │   │   ├── anthropic.ts
│   │   │   ├── openai.ts
│   │   │   └── ollama.ts
│   │   └── prompts.ts               # System prompt templates
│   ├── tools/                       # Tool implementations
│   │   ├── registry.ts              # Tool discovery + dispatch
│   │   ├── file.ts                  # Filesystem operations
│   │   ├── shell.ts                 # Command execution
│   │   ├── browser.ts               # CDP browser control
│   │   ├── memory.ts                # Memory read/write tools
│   │   └── os.ts                    # OS-level tools (notify, clipboard)
│   ├── shadow/                      # Shadow Loop
│   │   ├── watcher.ts               # Filesystem watcher (chokidar)
│   │   ├── heuristics.ts            # Event significance filter
│   │   └── ghost.ts                 # Ghost Message generation
│   ├── memory/                      # Memory management
│   │   ├── manager.ts               # Memory Manager (context control)
│   │   ├── compressor.ts            # Memory compression (summarization)
│   │   ├── store.ts                 # Session persistence (full logs)
│   │   ├── facts.ts                 # FACTS.json management
│   │   ├── soul.ts                  # SOUL.md parsing + updates
│   │   └── search.ts               # (Future) Semantic search
│   ├── channels/                    # Channel adapters
│   │   ├── telegram/
│   │   │   └── index.ts             # grammY integration
│   │   ├── discord/
│   │   │   └── index.ts             # discord.js integration
│   │   ├── webchat/
│   │   │   └── index.ts             # WebSocket-based chat
│   │   └── cli/
│   │       └── index.ts             # Terminal REPL
│   ├── config/                      # Configuration
│   │   ├── schema.ts                # Zod validation schemas
│   │   └── defaults.ts              # Default config values
│   └── utils/                       # Shared utilities
│       ├── logger.ts
│       └── errors.ts
├── ui/                              # Web interfaces
│   ├── control/                     # Control Panel (React)
│   └── chat/                        # WebChat (React)
├── workspace/                       # Default workspace template
│   ├── SOUL.md
│   ├── FACTS.json
│   └── skills/
├── docs/                            # This documentation
├── package.json
├── tsconfig.json
└── README.md
```

---

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Runtime** | Node.js 22+ | Async event loop, same as OpenClaw |
| **Language** | TypeScript 5.5+ | Type safety, great IDE support |
| **WebSocket** | `ws` | Lightweight, battle-tested |
| **HTTP** | Fastify | High performance, plugin ecosystem |
| **Telegram** | grammY | TypeScript-first, excellent docs |
| **Discord** | discord.js v14 | Most mature Discord library |
| **Browser** | Playwright | More reliable than Puppeteer, multi-browser |
| **LLM (Anthropic)** | `@anthropic-ai/sdk` | Official SDK with streaming |
| **LLM (OpenAI)** | `openai` | Official SDK |
| **File watcher** | chokidar | Cross-platform, efficient |
| **Config validation** | Zod | Runtime type checking |
| **UI** | React + Vite | Fast development, hot reload |
| **Styling** | Tailwind CSS 4 | Rapid UI development |
| **Storage (MVP)** | JSON files | Zero dependencies |
| **Storage (Future)** | SQLite + sqlite-vec | Structured data + vector search |
