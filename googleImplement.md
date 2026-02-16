# Google Assistant - Personalized Persona AI Architecture

> **Vision**: A high-agency, proactive personal assistant that lives on your machine. It utilizes a "Soul" (dynamic persona) and a "Shadow Loop" (proactive observation) to anticipate your needs and execute tasks with full PC access.

---

## 1. Core Architecture: The "Three-Layer" Brain

The assistant is structured into three distinct layers that separate raw system events, high-level reasoning, and long-term personality.

### Layer 1: The Soul (`SOUL.md`)
- **Dynamic Persona**: A markdown-based "constitution" that defines the assistant's identity, communication style, and core values.
- **Self-Evolution**: The assistant can propose updates to its own `SOUL.md` as it learns more about your preferences and "vibe."
- **Persistence**: Unlike a session prompt, the Soul is permanent and shared across all interaction channels.

### Layer 2: The Shadow Loop (Proactive Reflexes)
- **Background Observer**: A local service monitoring the filesystem (`chokidar`), shell history, and terminal errors.
- **Event-Driven Intelligence**: Instead of waiting for a prompt, it detects system events and uses local heuristics to filter "interesting" moments.
- **Proactive Proposals**: When an event is caught (e.g., a failed build or a saved file), the assistant proposes a fix or action via a non-intrusive notification.

### Layer 3: The Cortex (OpenRouter LLM)
- **High-Level Reasoning**: Powered by elite models (Claude 3.5, GPT-4o, Gemini Pro) via OpenRouter.
- **Tool Orchestration**: Plans and executes multi-step operations using the local toolset.
- **Semantic Memory**: Uses vector search to recall past conversations and learned facts.

---

## 2. Full PC Access & Toolset

Since this is a local-first implementation for personal use, the assistant has direct, non-sandboxed access to the host machine.

### Core Tool Categories
| Category | Tools | Description |
|----------|-------|-------------|
| **Filesystem** | `file_read`, `file_write`, `file_patch`, `file_search` | Direct manipulation of your code and docs. |
| **Shell** | `shell_exec` | Runs commands in your native ZSH/Bash environment. |
| **Browser** | `browser_cdp` | Controls Chrome/Chromium via Playwright/Puppeteer. |
| **OS** | `os_notify`, `clipboard_sync`, `screen_capture` | Interacts with your macOS/Windows/Linux environment. |
| **Persona** | `soul_update`, `memory_save_fact` | Manages the assistant's evolving personality. |

### Safety Model
- **Confirmation-Required**: High-impact or destructive actions (e.g., `rm`, `git push`, deleting files) trigger a `[Y/n]` prompt in the UI.
- **Privacy Alerts**: Reading sensitive directories (like `.ssh` or `.env`) requires explicit user permission.

---

## 3. The Shadow Loop Implementation

The "Shadow Loop" ensures the assistant is always one step ahead.

1. **Ingest**: File watchers detect a change (e.g., `App.tsx` saved).
2. **Local Filter**: A lightweight check determines if the change is significant (e.g., "Is there a syntax error?").
3. **Ghost Message**: If significant, the assistant sends a "Ghost Message" to the Gateway: *"I noticed a potential bug in your recent change to the auth hook. Want me to run the tests?"*
4. **Action**: Upon user approval (click/keypress), the assistant executes the fix.

---

## 4. Memory & Knowledge Tiers

| Tier | Format | Purpose |
|------|--------|---------|
| **Working Memory** | JSON/In-memory | Current session context and active tasks. |
| **The Soul** | `SOUL.md` | Core personality, tone, and identity. |
| **Fact Store** | `FACTS.json` | Structured facts about you (e.g., "Prefers dark mode"). |
| **Long-term Ledger** | SQLite/Vector | Searchable history of every interaction ever had. |

---

## 5. Intelligence & Memory Strategy (The "OpenClaw Killer")

To ensure high performance and low cost, the assistant follows a strict memory and routing protocol.

### A. Context Management
- **The "Context Slimming" Rule**: Never send the full chat history. The input context is strictly limited to:
  1. System Prompt (Soul + Identity)
  2. Memory Summary (Max 800 tokens, dynamically updated)
  3. Last 5-10 User Messages
  4. Truncated Tool Results
- **Memory Compression**: Every time the conversation exceeds a threshold, a "Worker Agent" summarizes the oldest messages into the `Memory Summary` and prunes the raw history.

### B. Routing & Model Selection
| Agent Tier | Model | Responsibility |
|------------|-------|----------------|
| **Main Orchestrator** | Gemini Flash Lite | Default interaction, planning, and personality. |
| **Subagents (Workers)** | GPT-5 Nano | Tool execution, summarization, and data extraction. |
| **Reasoning Engine** | DeepSeek V3.2 | Complex logic, bug root-cause analysis, and architecture. |

### C. Subagent Design
- **Task-Specific**: Subagents receive a task and minimal context, returning only structured JSON.
- **Example Flow**: `Main Agent` -> `Research Subagent` -> `JSON Result` -> `Main Agent`.

---

## 6. Project Structure (The "Personal" Monolith)

To keep development fast and avoid the complexity of a monorepo, the project uses a streamlined monolithic structure.

```text
/PersonalOpenClawVersion/
├── src/                    # Core logic
│   ├── gateway/            # WebSocket server & message routing
│   ├── agent/              # OpenRouter integration & Brain logic
│   │   ├── memory.ts       # SQLite/Vector storage logic
│   │   └── persona.ts      # Soul.md parsing & update logic
│   ├── shadow/             # The "Proactive" loop
│   │   ├── watcher.ts      # Filesystem (chokidar) integration
│   │   └── heuristics.ts   # Rules for "Ghost Messages"
│   └── tools/              # Individual tool implementations
│       ├── shell.ts        # Executing bash
│       ├── fs.ts           # Reading/Writing files
│       └── browser.ts      # Playwright/Puppeteer
├── ui/                     # Frontend (React/Next.js)
│   ├── components/         # Chat bubbles & Canvas widgets
│   └── hooks/              # WebSocket connection management
├── workspace/              # Your personal data (The Assistant's "Home")
│   ├── SOUL.md             # The assistant's identity
│   ├── FACTS.json          # Structured facts about you
│   └── skills/             # Folder for custom scripts/plugins
├── .env                    # OpenRouter API Key & local paths
├── package.json            # Simple dependency management
└── tsconfig.json           # TypeScript configuration
```

---

## 7. Implementation Roadmap (4-Week Deliberate Practice)

### Week 1: The Core Loop
- Set up Node.js Gateway + OpenRouter.
- Implement basic tool calling support (Shell, FS).
- Create the "Main Agent" loop with real-time logging and debug output.

### Week 2: Memory & Compression
- Build the `Memory Summary` system and context trimming logic.
- Implement the "Fact Extraction" loop to update `FACTS.json` automatically.
- Ensure the assistant can "summarize its way out" of long conversations.

### Week 3: Subagents & Core Tools
- Implement the Subagent routing logic for `ResearchAgent` and `WriterAgent`.
- Build core productivity tools: `notes_save/search`, `web_search/open`, and `task_list`.
- Integrate the "Shadow Loop" filesystem watcher for proactive suggestions.

### Week 4: Routing & Budget Mode
- Configure model tiering: Gemini Flash Lite for main, GPT-5 Nano for subagents, DeepSeek for reasoning.
- Build a "Budget/Power" mode toggle to control which models are used.
- Finalize the WebChat UI and "Canvas" for side-by-side execution view.
