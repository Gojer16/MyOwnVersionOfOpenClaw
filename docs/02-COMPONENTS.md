# Talon — Component Specifications

This document provides detailed interface contracts and behavioral specifications for each Talon subsystem.

---

## 1. Gateway Server

### WebSocket Protocol

The Gateway exposes a single WebSocket endpoint at `ws://127.0.0.1:19789`.

**Message envelope:**

```typescript
interface WSMessage {
  id: string;                    // Unique message ID (nanoid)
  type: MessageType;
  timestamp: number;             // Unix ms
  payload: unknown;
}

type MessageType =
  | 'channel.message'            // Inbound user message from a channel
  | 'agent.response'             // Text chunk from agent
  | 'agent.response.end'         // Agent finished responding
  | 'tool.call'                  // Agent requests tool execution
  | 'tool.result'                // Tool execution result
  | 'tool.stream'                // Streaming tool output (e.g., shell)
  | 'shadow.ghost'               // Shadow Loop ghost message
  | 'session.created'            // New session started
  | 'session.resumed'            // Existing session loaded
  | 'config.updated'             // Configuration changed
  | 'error';                     // Error event
```

**Example messages:**

```jsonc
// Inbound from Telegram
{
  "id": "msg_abc123",
  "type": "channel.message",
  "timestamp": 1708070833000,
  "payload": {
    "channel": "telegram",
    "senderId": "user_12345",
    "senderName": "Orlando",
    "text": "List files in my Desktop",
    "media": null,
    "isGroup": false,
    "groupId": null
  }
}

// Agent tool call
{
  "id": "tc_def456",
  "type": "tool.call",
  "timestamp": 1708070834000,
  "payload": {
    "sessionId": "sess_xyz",
    "tool": "file_list",
    "args": { "path": "~/Desktop", "recursive": false }
  }
}
```

### HTTP Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Control UI (React SPA) |
| `GET` | `/chat` | WebChat interface |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/sessions` | List active sessions |
| `GET` | `/api/sessions/:id` | Session details + history |
| `POST` | `/api/sessions/:id/send` | Send message to session (REST alternative) |
| `GET` | `/api/config` | Current configuration |
| `PATCH` | `/api/config` | Update configuration (hot-reload) |
| `GET` | `/api/tools` | List registered tools |

---

## 2. Session Manager

### Session Lifecycle

```
         connect (new sender)
              │
              ▼
    ┌─────────────────┐
    │     CREATED      │ ── Session allocated, ID assigned
    └────────┬────────┘
             │ first message
             ▼
    ┌─────────────────┐
    │     ACTIVE       │ ── Receiving messages, agent processing
    └────────┬────────┘
             │ idle timeout (configurable, default 30min)
             ▼
    ┌─────────────────┐
    │     IDLE         │ ── Persisted to disk, memory freed
    └────────┬────────┘
             │ new message from same sender
             ▼
    ┌─────────────────┐
    │    RESUMED       │ ── History loaded, context rebuilt
    └────────┬────────┘
             │
             ▼
         (back to ACTIVE)
```

### Session Data Structure

```typescript
interface Session {
  id: string;                          // Unique session ID
  senderId: string;                    // Canonical user identity
  channel: string;                     // Primary channel
  state: 'created' | 'active' | 'idle';
  messages: Message[];                 // Conversation history
  metadata: {
    createdAt: number;
    lastActiveAt: number;
    messageCount: number;
    model: string;                     // Current model for this session
  };
  config: {                            // Per-session overrides
    model?: string;
    thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
    verboseLevel?: boolean;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: number;
  channel?: string;
}
```

### Session Routing Rules

| Scenario | Routing Rule |
|---|---|
| **DM (any channel)** | Map `senderId` → session. Create if new. |
| **Group chat** | Map `groupId` → session. Shared among all group members. |
| **Group activation** | `mention` mode: respond only when mentioned. `always` mode: respond to all. |
| **Cross-channel** | Same `senderId` across channels maps to same session (if identity linked in config). |

---

## 3. Agent Loop (State Machine)

### State Machine Interface

```typescript
interface AgentLoop {
  /** Run the full agent loop for a user message */
  run(session: Session, message: Message): AsyncIterable<AgentChunk>;

  /** Current state of the loop */
  getState(): LoopState;
}

type LoopState = {
  phase: 'planning' | 'deciding' | 'executing' | 'evaluating' | 'compressing' | 'done';
  iteration: number;        // Current loop iteration
  maxIterations: number;    // Safety limit (default: 10)
  goal: string;             // What we're trying to accomplish
  pending: string[];        // Sub-tasks still pending
  completed: string[];      // Sub-tasks completed
  totalTokensUsed: number;
  totalCost: number;
};

type AgentChunk =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: unknown }
  | { type: 'subagent_start'; agent: string; task: string }
  | { type: 'subagent_result'; agent: string; result: unknown }
  | { type: 'thinking'; content: string }
  | { type: 'error'; error: string }
  | { type: 'done' };
```

### Loop Lifecycle

Each iteration of the loop:
1. **PLAN** — Main Agent analyzes the goal and current state
2. **DECIDE** — Choose: answer directly, call a tool, delegate to sub-agent, or loop again
3. **EXECUTE** — Run the chosen action
4. **EVALUATE** — Check if the goal is met or more work is needed
5. **COMPRESS** — Truncate tool logs, compress context, update memory summary

**Safety limit:** Maximum 10 iterations per user message (configurable). Prevents infinite loops.

---

## 3a. Model Router

### Interface

```typescript
interface ModelRouter {
  /** Select the optimal model for a task type */
  selectModel(task: TaskContext): ModelConfig;

  /** Estimate cost for a task */
  estimateCost(task: TaskContext): CostEstimate;

  /** Get all available models grouped by tier */
  getModelTiers(): Record<string, ModelConfig[]>;
}

interface TaskContext {
  type: 'chat' | 'orchestration' | 'subagent' | 'reasoning' | 'summarization';
  complexity: 'low' | 'medium' | 'high';
  inputTokens: number;
}

interface ModelConfig {
  id: string;               // e.g., "anthropic/claude-sonnet-4-20250514"
  provider: string;          // "anthropic" | "openai" | "ollama" | "openrouter"
  tier: 'cheap' | 'mid' | 'premium';
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
}

interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;     // USD
  model: string;
}
```

### Routing Rules

| Task | Tier | Example Models |
|---|---|---|
| **Simple Q&A** | `cheap` | GPT-4o-mini, Gemini Flash Lite |
| **Main Agent orchestration** | `mid` | Gemini Flash, Claude Haiku |
| **Sub-agent tasks** | `cheap` | GPT-4o-mini (focused task, tiny context) |
| **Complex reasoning** | `premium` | Claude Sonnet, DeepSeek V3 |
| **Memory summarization** | `cheap` | GPT-4o-mini |

---

## 3b. Sub-Agent Manager

### Interface

```typescript
class SubAgentManager {
  /** Spawn a sub-agent with a focused task */
  async spawn(task: SubAgentTask): Promise<SubAgentResult>;

  /** Spawn multiple sub-agents in parallel */
  async spawnParallel(tasks: SubAgentTask[]): Promise<SubAgentResult[]>;

  /** Get registered sub-agent definitions */
  getAgents(): SubAgentDef[];
}

interface SubAgentDef {
  name: string;              // "ResearchAgent", "PlannerAgent", etc.
  systemPrompt: string;      // Focused role instructions
  defaultModel: string;      // Usually cheapest tier
  outputSchema?: object;     // Expected JSON structure
}

interface SubAgentTask {
  agent: string;             // Which sub-agent to use
  description: string;       // What to do
  context: string;           // Minimal context (NOT full chat history)
  outputSchema?: object;     // Override default schema
}

interface SubAgentResult {
  agent: string;
  result: Record<string, unknown>;  // Structured JSON
  tokensUsed: number;
  cost: number;
  duration: number;          // ms
}
```

### Built-in Sub-Agents

| Name | Purpose | Output |
|---|---|---|
| `ResearchAgent` | Web search, data gathering | `{ summary, sources, key_facts }` |
| `PlannerAgent` | Create plans and strategies | `{ steps, risks, timeline }` |
| `WriterAgent` | Generate code or content | `{ content, explanation }` |
| `CriticAgent` | Review and evaluate output | `{ issues, suggestions, score }` |
| `SummarizerAgent` | Condense information | `{ summary, action_items }` |

**Key principle:** Sub-agents receive only the task + relevant context (~500 tokens), never the full conversation history.

---

## 3c. Memory Manager

### Interface

```typescript
class MemoryManager {
  /** Build the context window for an LLM call */
  buildContext(session: Session): ContextWindow;

  /** Compress old messages into a summary */
  compress(session: Session): Promise<MemorySummary>;

  /** Get current memory stats */
  getStats(session: Session): MemoryStats;

  /** Truncate tool output to fit budget */
  truncateToolOutput(output: string, maxTokens: number): string;
}

interface ContextWindow {
  systemPrompt: string;        // ~500 tokens
  memorySummary: string;       // ≤800 tokens (compressed history)
  recentMessages: Message[];   // Last 5–10 messages
  toolDescriptions: string;    // ~1500 tokens
  totalTokens: number;         // Should be ~5000–6000
}

interface MemorySummary {
  content: string;             // The compressed summary text
  messagesCompressed: number;  // How many messages were summarized
  tokensUsed: number;          // Summary token count
  createdAt: string;
}

interface MemoryStats {
  contextWindowTokens: number;
  memorySummaryTokens: number;
  recentMessagesCount: number;
  totalSessionMessages: number;
  compressionRatio: number;    // e.g., 0.05 = 95% compression
}
```

### Context Budget (per LLM call)

```
System prompt       :  ~500 tokens  (fixed)
Memory summary      :  ≤800 tokens  (compressed old history)
Recent messages     : ~2000 tokens  (last 5–10 turns)
Tool results        :  ~500 tokens  (truncated, NOT full output)
Tool descriptions   : ~1500 tokens  (fixed)
═══════════════════════════════════
Target total input  : ~5000–6000 tokens
```

**Rule: NEVER send full chat history. NEVER send full tool logs.**

### LLM Provider Interface

```typescript
interface LLMClient {
  /** Send messages and get streaming response */
  chat(params: ChatParams): AsyncIterable<LLMChunk>;

  /** Count tokens for a string */
  countTokens(text: string): number;

  /** Get model info */
  getModelInfo(): ModelConfig;
}

interface ChatParams {
  model: string;
  messages: LLMMessage[];
  tools?: LLMToolDef[];
  maxTokens?: number;
  temperature?: number;
  stream: boolean;
}
```

---

## 4. Tool Registry

### Registration

```typescript
class ToolRegistry {
  /** Register a tool */
  register(tool: Tool): void;

  /** Get all tools as LLM tool descriptions */
  getToolDescriptions(): LLMToolDef[];

  /** Execute a tool call */
  execute(name: string, args: Record<string, unknown>): Promise<ToolResult>;

  /** Check if a tool is allowed for a session */
  isAllowed(name: string, session: Session): boolean;
}
```

### Tool Result

```typescript
interface ToolResult {
  success: boolean;
  output: string;              // Text output for the LLM
  metadata?: {
    executionTime: number;     // ms
    truncated?: boolean;       // Output was too long, truncated
    confirmation?: string;     // Requires user confirmation before proceeding
  };
}
```

### Confirmation Flow

Some tools require user confirmation before executing:

```
Agent calls shell_execute("rm -rf node_modules")
    │
    ▼
Tool Registry detects: destructive command
    │
    ▼
Gateway sends confirmation request to channel:
  "⚠️ The assistant wants to run: rm -rf node_modules
   [Allow] [Deny]"
    │
    ▼
User clicks Allow → Tool executes
User clicks Deny  → Agent receives "denied by user" result
```

---

## 5. Shadow Loop

### Watcher Configuration

```typescript
interface ShadowConfig {
  enabled: boolean;
  watchers: {
    filesystem: {
      paths: string[];           // Paths to watch
      ignore: string[];          // Glob patterns to ignore
      events: ('add' | 'change' | 'unlink')[];
    };
    shell: {
      historyFile: string;       // e.g., ~/.zsh_history
      watchErrors: boolean;      // Watch for non-zero exit codes
    };
    git: {
      enabled: boolean;          // Watch for git events
      events: ('commit' | 'push' | 'merge-conflict')[];
    };
  };
  cooldown: number;              // Min ms between ghost messages (default: 30000)
  maxGhostsPerHour: number;      // Rate limit (default: 10)
}
```

### Ghost Message Interface

```typescript
interface GhostMessage {
  id: string;
  trigger: string;               // What caused this ("file changed: App.tsx")
  observation: string;           // What the AI noticed ("Syntax error on line 42")
  proposal: string;              // What it suggests ("Want me to fix the missing bracket?")
  confidence: 'low' | 'medium' | 'high';
  actions: GhostAction[];        // Quick-action buttons
}

interface GhostAction {
  label: string;                 // "Fix it" / "Run tests" / "Dismiss"
  type: 'approve' | 'dismiss' | 'custom';
  payload?: unknown;
}
```

---

## 6. Event Bus

The internal event bus enables decoupled communication between subsystems:

```typescript
interface EventBus {
  emit(event: string, data: unknown): void;
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;
  once(event: string, handler: (data: unknown) => void): void;
}

// Key events:
// 'message.inbound'     — New message from a channel
// 'message.outbound'    — Response ready to send
// 'tool.execute'        — Tool execution requested
// 'tool.complete'       — Tool execution finished
// 'shadow.event'        — Shadow Loop detected something
// 'shadow.ghost'        — Ghost message ready to deliver
// 'session.created'     — New session started
// 'session.idle'        — Session went idle
// 'config.changed'      — Config was updated
// 'agent.thinking'      — Agent is processing (for typing indicators)
```
