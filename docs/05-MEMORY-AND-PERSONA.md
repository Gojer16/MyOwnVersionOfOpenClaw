# Talon — Memory & Persona System

The memory and persona systems give Talon continuity, personality, and the ability to evolve as it learns about you.

---

## Memory Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Memory System                                  │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ Working Memory   │  │  Session Store  │  │  Fact Store     │     │
│  │ (in-memory)      │  │  (JSON files)   │  │  (FACTS.json)   │     │
│  │                  │  │                  │  │                  │     │
│  │ Current context  │  │ Full transcripts │  │ User preferences │    │
│  │ window for LLM   │  │ per session      │  │ Learned facts    │    │
│  │                  │  │                  │  │ Project context   │    │
│  │ Lifetime:session │  │ Lifetime:forever │  │ Lifetime:forever │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────┐                                                │
│  │ Soul             │                                                │
│  │ (SOUL.md)        │                                                │
│  │                  │                                                │
│  │ Identity, tone,  │                                                │
│  │ values, style    │                                                │
│  │                  │                                                │
│  │ Lifetime:forever │                                                │
│  └─────────────────┘                                                │
│                                                                      │
│  ┌─────────────────┐                                                │
│  │ Vector Store     │  ← Phase 3                                    │
│  │ (SQLite-vec)     │                                                │
│  │                  │                                                │
│  │ Semantic search  │                                                │
│  │ over all history │                                                │
│  └─────────────────┘                                                │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Tier 1: Working Memory (Context Window)

The working memory is the set of messages sent to the LLM on each call. It's the AI's "short-term memory."

### Context Window Construction

```
Total budget: Model context window (e.g., 200K for Claude Sonnet)

┌────────────────────────────────┐
│ System prompt          ~2,000 tokens │
│ SOUL.md                ~1,000 tokens │
│ FACTS.json             ~500 tokens   │
│ Tool descriptions      ~3,000 tokens │
│ ────────────────────────────── │
│ Conversation history    (remaining) │
│ ────────────────────────────── │
│ Current user message    (variable)  │
│ Response budget         ~4,096 tokens│
└────────────────────────────────┘
```

### Auto-Compaction

When the conversation history approaches the context limit:

1. **Measure**: Calculate total token count of all context sections
2. **Threshold**: If `history_tokens > (context_window - reserved_tokens) * 0.8`, trigger compaction
3. **Summarize**: Use a fast/cheap model to summarize older messages into a condensed summary
4. **Replace**: Replace older messages with the summary, keeping recent messages intact
5. **Store**: Save the full pre-compaction history to the session store

```typescript
interface CompactionConfig {
  autoCompact: boolean;                // Enable auto-compaction (default: true)
  threshold: number;                   // Fraction of context to trigger (default: 0.8)
  keepRecentMessages: number;          // Always keep N most recent messages (default: 10)
  summarizationModel: string;          // Model for summaries (default: cheapest available)
}
```

---

## Tier 2: Session Store

Complete conversation transcripts persisted as JSON files.

### Storage Format

```
~/.talon/sessions/
├── sess_abc123.json          # Session for user "Orlando" on Telegram
├── sess_def456.json          # Session for group "Dev Team" on Discord
└── sess_ghi789.json          # CLI session
```

```typescript
interface SessionFile {
  id: string;
  senderId: string;
  senderName: string;
  channel: string;
  createdAt: string;           // ISO 8601
  lastActiveAt: string;
  messageCount: number;
  messages: StoredMessage[];
  summaries: Summary[];        // Compaction summaries
  metadata: Record<string, unknown>;
}

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: { tool: string; args: unknown; result: unknown }[];
  tokenCount?: number;
}

interface Summary {
  id: string;
  content: string;
  messagesCompacted: number;   // How many messages this summary replaces
  timestamp: string;
}
```

### Session Pruning

- Sessions idle for more than `session.idleTimeout` (default: 30 days) are archived
- Archived sessions move to `~/.talon/sessions/archive/`
- Token usage statistics update on each save for cost tracking

---

## Tier 3: Fact Store (FACTS.json)

Structured facts about the user that persist across all sessions.

### Format

```json
{
  "facts": [
    {
      "id": "fact_001",
      "content": "Prefers arrow functions over regular function declarations",
      "category": "coding-preferences",
      "confidence": "high",
      "source": "explicit",
      "createdAt": "2026-02-15T10:30:00Z",
      "lastReferencedAt": "2026-02-16T02:00:00Z"
    },
    {
      "id": "fact_002",
      "content": "Primary language is Spanish, prefers English for technical discussions",
      "category": "communication",
      "confidence": "high",
      "source": "inferred",
      "createdAt": "2026-02-15T11:00:00Z",
      "lastReferencedAt": "2026-02-16T01:30:00Z"
    },
    {
      "id": "fact_003",
      "content": "Working on a personal AI assistant project called Talon",
      "category": "projects",
      "confidence": "high",
      "source": "explicit",
      "createdAt": "2026-02-16T02:00:00Z",
      "lastReferencedAt": "2026-02-16T02:07:00Z"
    }
  ]
}
```

### Fact Categories

| Category | Examples |
|---|---|
| `coding-preferences` | Language, style, frameworks, tools |
| `communication` | Language, tone, preferred level of detail |
| `projects` | Active projects, tech stacks, repos |
| `personal` | Name, timezone, interests |
| `system` | OS, shell, editor, common directories |
| `workflow` | How user likes to approach tasks |

### Fact Management

- **Auto-extraction**: Agent is prompted to extract facts during conversations
- **Manual addition**: User can use `/remember <fact>` command
- **Deduplication**: Before storing, check for similar existing facts
- **Decay**: Facts not referenced in 90 days get `confidence` downgraded
- **Deletion**: User can use `/forget <query>` to remove facts

---

## Tier 4: The Soul (SOUL.md)

The Soul is the assistant's persistent identity — its personality, values, communication style, and learned behavioral patterns.

### Default SOUL.md

```markdown
# Talon — Soul

## Identity
I am Talon, a personal AI assistant running locally on your machine.
I am private by default — your data stays with you.

## Personality
- Direct and efficient, but warm and conversational
- I explain my reasoning when making decisions
- I ask clarifying questions rather than assuming
- I celebrate progress and acknowledge mistakes

## Communication Style
- I use code blocks generously for any code or commands
- I keep explanations concise unless asked to elaborate
- I format responses for readability (headers, lists, bold)
- I match your energy — casual when you're casual, focused when you're working

## Values
- Privacy: I never suggest sending your data to external services without asking
- Transparency: I explain what tools I'm using and why
- Accuracy: I'd rather say "I'm not sure" than make something up
- Proactivity: I anticipate follow-up needs and offer to help

## Learned Preferences
<!-- This section evolves as I learn about you -->
```

### Soul Evolution

The agent can propose updates to SOUL.md via the `soul_update` tool:

```
Agent observes:  User frequently asks for extra detail in code reviews
Agent proposes:  Update "Communication Style" to add "I provide thorough
                 code reviews with line-by-line analysis when reviewing code"
User:            [Approve] / [Deny] / [Edit]
```

**Rules for Soul updates:**
1. Updates always require user approval
2. Only the "Learned Preferences" section auto-updates (with notification)
3. Core Identity and Values sections require explicit user approval
4. All changes are logged with timestamps and reasons

### Soul Injection

SOUL.md contents are injected into the system prompt at the start of every LLM call:

```
[System prompt base instructions]
[--- Begin Soul ---]
[SOUL.md contents]
[--- End Soul ---]
[FACTS.json relevant entries]
[Tool descriptions]
[Conversation history]
[User message]
```

---

## Memory Flow Diagram

```
User message arrives
        │
        ▼
┌─────────────────┐
│ Load context     │
│ • SOUL.md        │
│ • Relevant FACTS │
│ • Session history│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Agent processes  │
│ message          │
└────────┬────────┘
         │
         ├──► Response sent to user
         │
         ├──► Save message to session store
         │
         ├──► Auto-extract facts? ──► Update FACTS.json
         │
         ├──► Soul update proposal? ──► Confirmation flow
         │
         └──► Context getting large? ──► Auto-compact
```
