# Talon — Channels & Interfaces

This document specifies the communication channels and user interfaces that connect users to Talon.

---

## Channel Architecture

All channels implement the same `Channel` interface and are registered with the Gateway at startup:

```typescript
interface Channel {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(sessionId: string, message: OutboundMessage): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => void): void;
  formatMessage(text: string, options?: FormatOptions): string;
}

interface InboundMessage {
  senderId: string;               // Platform-specific user ID
  senderName: string;             // Display name
  text: string;                   // Message text
  media?: MediaAttachment[];      // Images, audio, video, files
  isGroup: boolean;
  groupId?: string;
  groupName?: string;
  replyTo?: string;               // ID of message being replied to
  raw: unknown;                   // Original platform message object
}

interface OutboundMessage {
  text: string;
  media?: MediaAttachment[];
  replyTo?: string;
  buttons?: Button[];             // Interactive buttons (where supported)
}

interface MediaAttachment {
  type: 'image' | 'audio' | 'video' | 'file';
  url?: string;
  buffer?: Buffer;
  mimeType: string;
  filename?: string;
  size: number;
}
```

---

## MVP Channels (Phase 1)

### 1. Telegram

| Property | Value |
|---|---|
| **Library** | grammY v1.x |
| **Features** | DMs, groups, inline keyboards, media, voice messages |
| **Auth** | Bot token via `@BotFather` |
| **Config key** | `channels.telegram` |

**Setup:**
1. Create a bot with `@BotFather` on Telegram
2. Set `channels.telegram.botToken` in config
3. Set `channels.telegram.allowedUsers` to restrict access (optional)

**Group behavior:**
- Default activation: `mention` (responds only when bot is @mentioned)
- Configurable to `always` for specific groups
- Supports `/commands` for session control

**Media handling:**
- Voice messages → transcribed to text (via Whisper API or local whisper.cpp)
- Images → forwarded to LLM if model supports vision
- Files → saved to temp directory, path passed to agent

---

### 2. Discord

| Property | Value |
|---|---|
| **Library** | discord.js v14 |
| **Features** | DMs, guilds, threads, slash commands, reactions |
| **Auth** | Bot token + application ID |
| **Config key** | `channels.discord` |

**Setup:**
1. Create application at Discord Developer Portal
2. Create bot user and get token
3. Set `channels.discord.botToken` and `channels.discord.applicationId`
4. Invite bot to server with appropriate permissions

**Guild behavior:**
- Default: respond in designated channel(s) only
- Configurable per-guild channel allowlist
- Thread support: bot can create and participate in threads

**Special features:**
- Slash commands (`/talon`, `/reset`, `/model`)
- Message reactions for tool confirmation (👍 = approve, 👎 = deny)
- Embed formatting for rich responses

---

### 3. WebChat

| Property | Value |
|---|---|
| **Framework** | React + WebSocket client |
| **Access** | `http://127.0.0.1:19789/chat` |
| **Auth** | Optional password (configurable) |
| **Config key** | `channels.webchat` |

**Features:**
- Real-time streaming responses
- Code syntax highlighting
- File upload/download
- Tool execution visualization
- Ghost message cards (from Shadow Loop)
- Session history sidebar

**Architecture:**
```
Browser (React SPA)
    │ WebSocket
    ▼
Gateway ws://127.0.0.1:19789
    │
    ▼
Agent Runtime
```

---

### 4. CLI (Terminal REPL)

| Property | Value |
|---|---|
| **Library** | Node.js `readline` + `chalk` |
| **Access** | `talon` command |
| **Auth** | Local user (no auth needed) |

**Features:**
- Interactive REPL with streaming output
- Syntax-highlighted code blocks
- Tool call visualization
- Slash commands: `/reset`, `/compact`, `/model`, `/tools`, `/history`, `/config`, `/exit`

**Session:**
The CLI channel creates its own session tagged `channel: "cli"`. History persists across CLI restarts.

---

## Future Channels (Phase 2–3)

| Channel | Library | Phase | Notes |
|---|---|---|---|
| **WhatsApp** | Baileys | Phase 2 | QR code pairing, media support |
| **Slack** | Bolt | Phase 2 | Workspace app, slash commands |
| **Signal** | signal-cli | Phase 3 | Privacy-focused platform |
| **iMessage** | BlueBubbles | Phase 3 | macOS only, requires BlueBubbles server |
| **Google Chat** | Chat API | Phase 3 | Google Workspace integration |
| **Microsoft Teams** | Bot Framework | Phase 3 | Enterprise scenarios |
| **Matrix** | matrix-js-sdk | Phase 3 | Decentralized, self-hosted |

---

## Web Control UI

The Control UI is a management dashboard served at `http://127.0.0.1:19789/`:

```
┌────────────────────────────────────────────────────────────┐
│  Talon Control Panel                              [⚙️]   │
├───────────┬────────────────────────────────────────────────┤
│           │                                                │
│  Sessions │  Session: Orlando (Telegram)                   │
│  ─────────│  ──────────────────────────────────────────     │
│  ● Orlando│  Model: claude-sonnet-4-20250514    Tokens: 12.4k │
│  ○ Group1 │  Status: active                                │
│  ○ CLI    │                                                │
│           │  [Messages]  [Tools]  [Memory]  [Config]       │
│  ─────────│                                                │
│  Config   │  User: Create a hello world server             │
│  Tools    │  Assistant: I'll create that for you...         │
│  Health   │  [Tool: file_write] server.js ✓                │
│  Logs     │  Assistant: Done! Server created at ./server.js│
│           │                                                │
├───────────┼────────────────────────────────────────────────┤
│  Status: Gateway running │ Channels: TG ✅ DC ✅ WC ✅    │
└───────────┴────────────────────────────────────────────────┘
```

**Pages:**
- **Sessions**: View/manage all active sessions, conversation history
- **Config**: Edit configuration with live validation
- **Tools**: Browse registered tools, test execution
- **Health**: Gateway stats, channel connection status, resource usage
- **Logs**: Real-time log viewer with filtering
- **Soul**: View/edit SOUL.md and FACTS.json

---

## Chat Commands

Available across all channels (prefixed with `/`):

| Command | Description |
|---|---|
| `/reset` | Clear conversation history, start fresh |
| `/compact` | Summarize and trim context window |
| `/model <name>` | Switch LLM model for current session |
| `/tools` | List available tools |
| `/status` | Show session info (model, tokens, cost) |
| `/usage` | Toggle usage footer (tokens/cost per response) |
| `/history` | Show recent conversation history |
| `/soul` | Display current Soul identity |
| `/remember <fact>` | Manually add a fact to long-term memory |
| `/forget <query>` | Remove a fact from memory |
| `/help` | Show available commands |

---

## Message Formatting

Each channel has platform-specific formatting rules:

| Feature | Telegram | Discord | WebChat | CLI |
|---|---|---|---|---|
| **Bold** | `*bold*` | `**bold**` | `**bold**` | ANSI bold |
| **Code inline** | `` `code` `` | `` `code` `` | `` `code` `` | ANSI dim |
| **Code block** | ` ```lang\n...\n``` ` | ` ```lang\n...\n``` ` | Syntax highlighted | Syntax highlighted |
| **Links** | Auto | Auto | Clickable | Plain URL |
| **Images** | Photo attachment | Embed | `<img>` | File path |
| **Buttons** | Inline keyboard | Reactions | HTML buttons | Numbered options |
| **Max length** | 4096 chars | 2000 chars | Unlimited | Terminal width |

Long messages are automatically **chunked** per platform limits, with continuation markers between chunks.
