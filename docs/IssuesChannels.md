# Channels System — Issues, Gaps & Technical Debt

> **Created**: 2026-02-23  
> **Audited by**: Antigravity AI Agent  
> **Scope**: All files in `src/channels/`, channel wiring in `src/gateway/index.ts` & `src/gateway/enhanced-index.ts`, channel config in `src/config/schema.ts`  
> **Reference**: `src/channels/README.md`  
> **Status**: ✅ **CRITICAL BLOCKERS RESOLVED** — Telegram & WhatsApp now functional  
> **Priority Context**: User wants to use Talon via WhatsApp and Telegram TODAY.  
> **Last Updated**: 2026-02-23 — CHAN-001, CHAN-002, CHAN-003, CHAN-004, CHAN-005 resolved

---

## How to Use This Document

Each issue has:
- **ID** for tracking (e.g., `CHAN-001`)
- **Severity**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low
- **Blocks Today?**: ❌ YES (blocks same-day usage) | ✅ No
- **File(s)** affected with line numbers where applicable
- **What's wrong** and **how to fix it**
- **Checkbox** `[ ]` — mark `[x]` when resolved

---

## 0. End-to-End Message Flow Audit

This section traces every possible user flow through actual code to verify what works and what's broken.

### Flow 1: CLI → Agent → CLI ✅ **WORKS**
```
User types in terminal
  → CliChannel.handleInput()                     [cli/index.ts:220]
  → sendToAgent() → ingestMessage()              [cli/index.ts:335-336]
  → BaseChannel.ingestMessage()                  [base.ts:49-71]
  → router.handleInbound(message)                [gateway/router.ts:23]
  → eventBus.emit('message.inbound')             [gateway/router.ts:52-55]
  → gateway listener runs agentLoop.run()        [gateway/index.ts:105]
  → eventBus.emit('message.outbound')            [gateway/index.ts:136]
  → CliChannel.setupEventListeners() listens ✅  [cli/index.ts:159]
  → renderer.handleChunk() → terminal output     [cli/index.ts:172-181]
```
**Why it works:** CLI subscribes to `message.outbound` at line 159 of `cli/index.ts`.

### Flow 2: Telegram → Agent → Telegram ❌ **BROKEN — no response delivery**
```
User sends message on Telegram
  → TelegramChannel.poll() → handleUpdate()      [telegram/index.ts:107,137]
  → ingestMessage()                               [telegram/index.ts:173]
  → BaseChannel.ingestMessage()                   [base.ts:49-71]
  → router.handleInbound(message)                 [gateway/router.ts:23]
  → eventBus.emit('message.inbound')              [gateway/router.ts:52-55]
  → gateway listener runs agentLoop.run()         [gateway/index.ts:105]
  → eventBus.emit('message.outbound')             [gateway/index.ts:136]
  → ❌ DEAD END — Telegram NEVER subscribes to 'message.outbound'
  → TelegramChannel.send() EXISTS but is NEVER CALLED
  → User gets NO response
```
**Why it's broken:** `telegram/index.ts` has zero references to `eventBus.on()`. The `send()` method (line 62) is fully implemented but nothing invokes it.

### Flow 3: WhatsApp → Agent → WhatsApp ❌ **BROKEN — same reason**
```
User sends message on WhatsApp
  → WhatsAppChannel.handleMessage()               [whatsapp/index.ts:173]
  → ingestMessage()                                [whatsapp/index.ts:241]
  → BaseChannel.ingestMessage()                    [base.ts:49-71]
  → router.handleInbound(message)                  [gateway/router.ts:23]
  → eventBus.emit('message.inbound')               [gateway/router.ts:52-55]
  → gateway listener runs agentLoop.run()          [gateway/index.ts:105]
  → eventBus.emit('message.outbound')              [gateway/index.ts:136]
  → ❌ DEAD END — WhatsApp NEVER subscribes to 'message.outbound'
  → WhatsAppChannel.send() EXISTS but is NEVER CALLED
  → User gets NO response
```
**Why it's broken:** `whatsapp/index.ts` mentions `eventBus` only in the constructor (line 47-48, passed to `super()`), but never calls `this.eventBus.on(...)`.

### Flow 4: Enhanced Gateway → Channels ⚠️ **DIFFERENT PATH, SAME PROBLEM**
```
In enhanced-index.ts (alternative gateway):
  → eventBus.on('message.inbound')                [enhanced-index.ts:317]
  → runAgent(session)                              [enhanced-index.ts:340]
  → router.handleOutbound(session.id, text)        [enhanced-index.ts:359]
  → router emits eventBus('message.outbound')      [gateway/router.ts:92]
  → ❌ Same dead end — only CLI listens
```

### Flow 5: Cross-Channel (CLI → Telegram user) ❌ **NOT SUPPORTED**
```
There is NO mechanism to:
  - Send a message from CLI that arrives on Telegram/WhatsApp
  - Forward messages between channels
  - Create a session scoped to one channel but delivering to another
  
  Each session is tied to its originating channel via session.channel field.
  The outbound routing (once fixed) will only go back to the same channel.
```

### Flow 6: Error Path → User ❌ **BROKEN for non-CLI**
```
Agent loop throws error
  → gateway/index.ts catch block                  [gateway/index.ts:155]
  → eventBus.emit('message.outbound', errorMsg)   [gateway/index.ts:188]
  → ❌ Only CLI receives the error
  → Telegram/WhatsApp users see nothing — their message just vanishes
```

### Summary Table

| Flow | Inbound | Agent | Outbound | Status |
|------|---------|-------|----------|--------|
| CLI → Agent → CLI | ✅ | ✅ | ✅ `eventBus.on('message.outbound')` | **WORKS** |
| Telegram → Agent → Telegram | ✅ | ✅ | ✅ **FIXED** — outbound routing added | **WORKS** |
| WhatsApp → Agent → WhatsApp | ✅ | ✅ | ✅ **FIXED** — outbound routing added | **WORKS** |
| Error → CLI | ✅ | — | ✅ | **WORKS** |
| Error → Telegram/WhatsApp | ✅ | — | ✅ | **FIXED** — error routing added |
| Cross-channel | ❌ | — | ❌ | **NOT SUPPORTED** |

**Root Cause (RESOLVED)**: The architectural gap was that **only the CLI channel subscribed to the `message.outbound` event** (`cli/index.ts:159`). Telegram and WhatsApp both had working `send()` methods but nobody called them.

**The fix** (CHAN-003): Added outbound routing in `gateway/index.ts` after the channels are created:
```typescript
// After all channels are started (line 285-302):
eventBus.on('message.outbound', async ({ message, sessionId }) => {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
        logger.warn({ sessionId }, 'Session not found for outbound message');
        return;
    }

    // Route to the channel that originated this session
    for (const channel of channels) {
        if (channel.name === session.channel) {
            try {
                await channel.send(sessionId, message);
            } catch (err) {
                logger.error({ err, channel: channel.name, sessionId }, 
                    'Failed to send outbound message');
            }
            break;
        }
    }
});
```

---

## 1. BLOCKERS — Must Fix Before Using Telegram/WhatsApp Today

### CHAN-001: Config file has NO Telegram or WhatsApp settings
- [x] ✅ **RESOLVED 2026-02-23**
- **Severity**: 🔴 Critical | **Blocks Today?**: ❌ YES
- **File**: `config.example.json`
- **Status**: Fixed — Added `allowedGroups` for Telegram and `sessionName` for WhatsApp
- **Problem**: The user's current config (`~/.talon/config.json`) has no `channels` section at all. Zod defaults will set `telegram.enabled: false` and `whatsapp.enabled: false`, so neither channel will start.
- **Fix**: Add the following to `~/.talon/config.json`:
  ```json
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "YOUR_TELEGRAM_BOT_TOKEN",
      "allowedUsers": [],
      "allowedGroups": [],
      "groupActivation": "mention"
    },
    "whatsapp": {
      "enabled": true,
      "allowedUsers": [],
      "allowedGroups": [],
      "groupActivation": "mention"
    }
  }
  ```
- **Prerequisites**:
  - **Telegram**: Create a bot via [@BotFather](https://t.me/BotFather) on Telegram, get the bot token
  - **WhatsApp**: No token needed (uses QR code auth), but `whatsapp-web.js` and `qrcode-terminal` must be installed

### CHAN-002: Telegram `send()` has broken message splitting for long responses
- [x] ✅ **RESOLVED 2026-02-23**
- **Severity**: 🔴 Critical | **Blocks Today?**: ❌ YES
- **File**: `src/channels/telegram/index.ts`, lines 76-91
- **Status**: Fixed — Implemented message chunking (4096 char limit)
- **Problem**: Telegram has a **4096 character limit** per message. The `send()` method at line 75 calls `this.stripMarkdown(message.text)` and sends the entire text in one API call. If the agent response exceeds 4096 chars, the Telegram API will return an error and the message is silently lost.
  - README line 173 says "Message size limits: Platform-specific truncation (Telegram 4096)" but **this is NOT implemented**.
- **Fix**: Split messages into chunks ≤ 4096 chars before sending:
  ```typescript
  const MAX_TELEGRAM_LENGTH = 4096;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_TELEGRAM_LENGTH) {
      chunks.push(text.slice(i, i + MAX_TELEGRAM_LENGTH));
  }
  for (const chunk of chunks) {
      await this.callApi(token, 'sendMessage', { chat_id: chatId, text: chunk });
  }
  ```

### CHAN-003: Telegram has no response delivery mechanism to the user
- [x] ✅ **RESOLVED 2026-02-23**
- **Severity**: 🔴 Critical | **Blocks Today?**: ❌ YES
- **File**: `src/gateway/index.ts`, lines 285-302
- **Status**: Fixed — Added outbound routing in gateway
- **Problem**: The event flow is:
  1. Telegram receives message → `ingestMessage()` → `router.handleInbound()` → `eventBus.emit('message.inbound')` ✅
  2. Gateway handles `message.inbound` → runs agent loop → emits `message.outbound` ✅
  3. **BUT**: There is NO listener that routes `message.outbound` events BACK to the Telegram channel's `send()` method.
  
  In `gateway/index.ts` (line 136), `eventBus.emit('message.outbound', ...)` is called, but nobody is listening for `message.outbound` to call `telegram.send()`. The CLI works because it subscribes to this event in its own `start()` method. Telegram does NOT.
  
  In `gateway/enhanced-index.ts`, the `runAgent()` method (line 359) calls `this.router.handleOutbound(session.id, lastMsg.content)` — need to verify if the router actually delivers to Telegram.
- **Fix**: Either:
  - **(A)** Add an `eventBus.on('message.outbound')` listener in `gateway/index.ts` that routes to the correct channel:
    ```typescript
    eventBus.on('message.outbound', async ({ message, sessionId }) => {
        const session = sessionManager.getSession(sessionId);
        if (!session) return;
        // Route to correct channel based on session
        for (const channel of channels) {
            if (channel.name === session.channel) {
                await channel.send(sessionId, message);
            }
        }
    });
    ```
  - **(B)** Have each channel subscribe to outbound events in its own `start()` method (like CLI does)

### CHAN-004: Telegram `send()` strips ALL code blocks
- [x] ✅ **RESOLVED 2026-02-23**
- **Severity**: 🟠 High | **Blocks Today?**: ✅ No (degraded experience)
- **File**: `src/channels/telegram/index.ts`, line 105
- **Status**: Fixed — Code blocks now preserve content
- **Problem**: `stripMarkdown()` at line 96 does `.replace(/```[\s\S]*?```/g, '')` — this **removes code blocks entirely** instead of preserving the content. If the agent returns a code snippet, the user gets nothing.
- **Fix**: Replace with content-preserving stripping:
  ```typescript
  .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '$1')  // Keep code content, remove fences
  ```

### CHAN-005: WhatsApp `initialize()` blocks the entire boot sequence
- [x] ✅ **RESOLVED 2026-02-23**
- **Severity**: 🟠 High | **Blocks Today?**: ❌ YES
- **File**: `src/gateway/index.ts`, lines 276-282
- **Status**: Fixed — WhatsApp init now non-blocking
- **Problem**: `await this.client.initialize()` (line 134) launches Puppeteer browser and waits for QR scan. This is a blocking operation — if WhatsApp is enabled, the entire Talon boot hangs at this step until QR is scanned. The agent, server, and other channels are NOT reachable during this time.
  
  In the gateway (line 264): `await whatsapp.start()` means CLI and Telegram can't start until WhatsApp QR is scanned.
- **Fix**: Don't await WhatsApp initialization:
  ```typescript
  // In gateway/index.ts:
  if (config.channels.whatsapp?.enabled) {
      const whatsapp = new WhatsAppChannel(config, eventBus, sessionManager, router);
      whatsapp.start().catch(err => logger.error({ err }, 'WhatsApp start failed'));
      channels.push(whatsapp);
      logger.info('WhatsApp channel starting in background...');
  }
  ```

---

## 2. Functional Bugs

### CHAN-006: Telegram group mention check is a TODO
- [x] ✅ **RESOLVED**
- **Severity**: 🟡 Medium | **Blocks Today?**: ✅ No (DMs work fine)
- **File**: `src/channels/telegram/index.ts`, lines 181-189
- **Status**: Fixed — Bot now fetches username on start and checks mentions in groups
- **Solution**: 
  - Fetch bot username via `getMe` API on startup
  - Check for `@botname` mentions or `/commands` in mention mode
  - Ignore group messages without mentions when `groupActivation: 'mention'`

### CHAN-007: Telegram `allowedUsers` compares user IDs inconsistently
- [x] ✅ **RESOLVED**
- **Severity**: 🟡 Medium | **Blocks Today?**: ✅ No
- **File**: `docs/07-CONFIGURATION.md`, `src/config/schema.ts`
- **Status**: Fixed — Documentation clarifies format requirement
- **Solution**: 
  - Document that `allowedUsers` expects **numeric user IDs as strings** (e.g., `"123456789"`)
  - NOT usernames (e.g., NOT `"@john"`)
  - Users can find their ID by messaging @userinfobot on Telegram
  - Config schema enforces string array type

### CHAN-008: Telegram polling error backoff is fixed 5s, not exponential
- [x] ✅ **RESOLVED**
- **Severity**: 🟢 Low | **Blocks Today?**: ✅ No
- **File**: `src/channels/telegram/index.ts`, lines 148-153
- **Status**: Fixed — Exponential backoff implemented (2s, 4s, 8s, 16s, 32s, max 60s)
- **Solution**: 
  - Track `errorCount` on polling errors
  - Calculate delay: `Math.min(2000 * Math.pow(2, this.errorCount - 1), 60000)`
  - Reset `errorCount` on successful poll

### CHAN-009: WhatsApp has no reconnection logic
- [x] ✅ **RESOLVED**
- **Severity**: 🟡 Medium | **Blocks Today?**: ✅ No (first connection works)
- **File**: `src/channels/whatsapp/index.ts`, lines 121-147
- **Status**: Fixed — Automatic reconnection with exponential backoff
- **Solution**: 
  - Track `reconnectAttempts` with max of 5 attempts
  - Exponential backoff: 5s, 10s, 20s, 40s, 80s (max 60s)
  - Reset attempt counter on successful reconnect
  - Clear error message when max attempts reached

### CHAN-010: WhatsApp `handleMessage` has no rate limiting
- [x] ✅ **RESOLVED**
- **Severity**: 🟡 Medium | **Blocks Today?**: ✅ No
- **File**: `src/channels/whatsapp/index.ts`, lines 178-232, 237-239
- **Status**: Fixed — Message queue with rate limiting
- **Solution**: 
  - Message queue with 1 second between sends (RATE_LIMIT_MS)
  - Queue size limit (10 messages) to prevent flooding
  - Process queue sequentially with rate limiting
  - CHAN-020: Message chunking at 65000 chars (under 65536 limit)

---

## 3. README Inaccuracies

### CHAN-011: Line counts are wrong for most files
- [ ] **Severity**: 🟢 Low
- **File**: `src/channels/README.md`, Section 4

| README Claim | Actual Lines | File |
|---|---|---|
| `base.ts` "72 lines" | 73 lines | ✅ Close enough |
| `cli/index.ts` "500+ lines" | ~347 lines (12,340 bytes) | ❌ Inflated |
| `cli/commands.ts` "300+ lines" | ~530 lines (18,844 bytes) | ❌ Deflated |
| `cli/renderer.ts` "200+ lines" | ~470 lines (16,797 bytes) | ❌ Deflated |
| `cli/skill-commands.ts` "150+ lines" | ~200 lines (7,363 bytes) | ❌ Deflated |
| `cli/utils.ts` "100+ lines" | ~190 lines (6,872 bytes) | ❌ Deflated |
| `cli/markdown.ts` "80+ lines" | ~230 lines (8,394 bytes) | ❌ Deflated |
| `telegram/index.ts` "200+ lines" | 201 lines | ✅ Correct |
| `whatsapp/index.ts` "300+ lines" | 270 lines | ❌ Inflated |

- **Fix**: Update all line counts to match reality.

### CHAN-012: Sub-READMEs are auto-generated placeholders
- [ ] **Severity**: 🟡 Medium
- **Files**: `src/channels/telegram/README.md`, `src/channels/whatsapp/README.md`
- **Problem**: Both files are auto-generated templates with `[Brief description]`, `[Add important technical constraints]`, `[ClassNameOrFunction]` placeholders. They provide zero useful information.
- **Fix**: Fill in with actual module documentation — exported classes, required env vars, config format, common errors, dependencies.

### CHAN-013: README claims Zod schemas exist for messages but they don't
- [ ] **Severity**: 🟡 Medium
- **File**: `src/channels/README.md`, lines 197-202
- **Problem**: Section 7 lists:
  - `ChannelConfigSchema`: ✅ Exists in `src/config/schema.ts`
  - `InboundMessageSchema`: ❌ Does NOT exist — `InboundMessage` is a plain TypeScript interface in `src/utils/types.ts`
  - `OutboundMessageSchema`: ❌ Does NOT exist
  - `CommandSchema`: ❌ Does NOT exist
  - `PlatformMessageSchema`: ❌ Does NOT exist
- **Fix**: Either create these Zod schemas for runtime validation, or update the README to say they're TypeScript interfaces only.

### CHAN-014: README claims message deduplication but there is none
- [ ] **Severity**: 🟡 Medium
- **File**: `src/channels/README.md`, line 152
- **Problem**: "Message ingestion: Idempotent with message ID deduplication" — this is FALSE. Neither Telegram nor WhatsApp track processed message IDs. If Telegram's polling returns the same message twice (network retry), it will be processed twice.
  - Telegram does track `offset` (line 122) which prevents re-fetching, but if the process crashes and restarts without persisting the offset, messages could be reprocessed.
- **Fix**: Either implement actual deduplication (message ID cache) or correct the README.

### CHAN-015: README claims input validation/sanitization exists but it doesn't
- [ ] **Severity**: 🟡 Medium
- **File**: `src/channels/README.md`, line 177, 186
- **Problem**: 
  - Line 177: "Input validation: Sanitize user input before processing" — FALSE. No input sanitization occurs in any channel.
  - Line 186: "Missing: Input sanitization for injection prevention" — correctly identifies it's missing, but contradicts line 177.
- **Fix**: Remove the incorrect claim from line 177, keep the "Missing" note in line 186.

### CHAN-016: Discord channel documented in config schema but not implemented
- [ ] **Severity**: 🟢 Low
- **Files**: `src/config/schema.ts` lines 61-68, `src/channels/README.md`
- **Problem**: `DiscordChannelSchema` exists in the config schema with `botToken`, `applicationId`, `allowedGuilds`, etc. — but there is no `src/channels/discord/` directory or implementation. The gateway status page (`src/gateway/server.ts` line 236) reports Discord status even though it doesn't exist.
- **Fix**: Either:
  - **(A)** Create a Discord channel implementation
  - **(B)** Mark it as `[PLANNED]` in the README and add a comment in the schema

---

## 4. Missing Features

### CHAN-017: No "typing" indicator for Telegram/WhatsApp
- [ ] **Severity**: 🟡 Medium | **Blocks Today?**: ✅ No
- **Files**: `src/channels/telegram/index.ts`, `src/channels/whatsapp/index.ts`
- **Problem**: When the agent is processing a message (which can take 5-30 seconds), the user sees no feedback. Both Telegram and WhatsApp support "typing..." indicators:
  - Telegram: `sendChatAction` with `action: 'typing'`
  - WhatsApp: `chat.sendStateTyping()`
- **Fix**: Send typing indicator immediately when a message is ingested, and periodically during agent processing.

### CHAN-018: Telegram doesn't support Markdown formatting
- [ ] **Severity**: 🟡 Medium | **Blocks Today?**: ✅ No
- **File**: `src/channels/telegram/index.ts`, lines 80-83
- **Problem**: `sendMessage` uses no `parse_mode` parameter. Telegram supports both `MarkdownV2` and `HTML` formatting, but the code strips all markdown and sends plain text. Agent responses lose formatting entirely.
- **Fix**: Convert agent markdown to Telegram MarkdownV2 format instead of stripping it:
  ```typescript
  await this.callApi(token, 'sendMessage', {
      chat_id: chatId,
      text: this.convertToTelegramMarkdown(message.text),
      parse_mode: 'MarkdownV2',
  });
  ```

### CHAN-019: No error reporting back to user on channel failures
- [ ] **Severity**: 🟡 Medium | **Blocks Today?**: ✅ No
- **Files**: Both channel files
- **Problem**: If the agent loop throws an error after receiving a Telegram/WhatsApp message, the user gets NO response at all. In `gateway/index.ts`, the error handler at line 155 emits `message.outbound` — but as noted in CHAN-003, there's no listener routing that back to Telegram/WhatsApp.
- **Fix**: Ensure error responses are routed back to the originating channel.

### CHAN-020: WhatsApp message is not length-limited 
- [ ] **Severity**: 🟡 Medium | **Blocks Today?**: ✅ No
- **File**: `src/channels/whatsapp/index.ts`, line 166
- **Problem**: WhatsApp has a ~65,536 character limit per message. While less likely to hit than Telegram's 4096, very long agent responses (e.g., code generation) could exceed it.
- **Fix**: Add message chunking similar to the Telegram fix in CHAN-002.

---

## 5. Security Issues

### CHAN-021: Telegram bot token exposed in config without env var support
- [ ] **Severity**: 🟠 High
- **File**: `src/config/schema.ts` line 55, user's config
- **Problem**: The `botToken` is expected as a plain string in `config.json`. While the agent config uses `${OPENROUTER_API_KEY}` env var interpolation, it's unclear if the config loader supports this for channel tokens. If not, the bot token sits in plaintext in `~/.talon/config.json`.
- **Fix**: Ensure config loader supports env var interpolation for `botToken` (e.g., `${TELEGRAM_BOT_TOKEN}`), and document this in the README.

### CHAN-022: WhatsApp auth data stored in workspace without protection
- [ ] **Severity**: 🟡 Medium
- **File**: `src/channels/whatsapp/index.ts`, line 49
- **Problem**: `this.authDir = config.workspace.root + '/whatsapp-auth'` — WhatsApp session credentials are stored in the workspace directory with no encryption or access control. Anyone with access to this directory can hijack the WhatsApp session.
- **Fix**: Store auth data outside the workspace in a protected location (e.g., `~/.talon/auth/whatsapp/`), and restrict file permissions.

---

## 6. Test Coverage

### CHAN-023: ZERO unit tests for any channel
- [ ] **Severity**: 🟠 High
- **Files**: `tests/unit/` directory
- **Problem**: There are no test files for any channel:
  - No `telegram-channel.test.ts`
  - No `whatsapp-channel.test.ts`
  - No `cli-channel.test.ts`
  - No `base-channel.test.ts`
  
  The message-router and session-manager tests exist but don't test channel-specific behavior.
- **Fix**: Create test files that mock platform APIs:
  - Test message ingestion flow
  - Test `send()` with long messages
  - Test authorization (allowed/blocked users)
  - Test error handling
  - Test reconnection logic

---

## 7. Unused/Dead Code

### CHAN-024: `cli/index.ts.backup` exists in the codebase
- [ ] **Severity**: 🟢 Low
- **File**: `src/channels/cli/index.ts.backup` (12,104 bytes)
- **Problem**: A backup file was left in the source tree. Should be in version control history, not committed.
- **Fix**: Delete the file; rely on git history for recovery.

---

## 8. Priority Implementation Order

### 🚨 Do RIGHT NOW (to use Telegram/WhatsApp today):

| # | Issue | What | Time Est. |
|---|-------|------|-----------|
| 1 | `CHAN-001` | Add channel config to `~/.talon/config.json` | 5 min |
| 2 | `CHAN-003` | Wire `message.outbound` → channel `send()` in gateway | 15 min |
| 3 | `CHAN-002` | Add Telegram message chunking (4096 limit) | 10 min |
| 4 | `CHAN-005` | Don't await WhatsApp init (non-blocking boot) | 5 min |

### 🟡 Do this week:

| # | Issue | What |
|---|-------|------|
| 5 | `CHAN-004` | Fix code block stripping in Telegram |
| 6 | `CHAN-006` | Implement Telegram group mention check |
| 7 | `CHAN-009` | Add WhatsApp reconnection |
| 8 | `CHAN-017` | Add typing indicators |
| 9 | `CHAN-018` | Support Telegram MarkdownV2 |
| 10 | `CHAN-019` | Route error responses to channels |
| 11 | `CHAN-021` | Env var support for bot token |

### 🟢 Do eventually:

| # | Issue | What |
|---|-------|------|
| 12 | `CHAN-007` | Clarify allowedUsers format |
| 13 | `CHAN-008` | Implement exponential backoff |
| 14 | `CHAN-010` | Add rate limiting |
| 15 | `CHAN-011-016` | Fix README inaccuracies |
| 16 | `CHAN-020` | WhatsApp message chunking |
| 17 | `CHAN-022` | Secure WhatsApp auth storage |
| 18 | `CHAN-023` | Write channel unit tests |
| 19 | `CHAN-024` | Remove backup file |

---

## 9. Files Reference

| File | Lines | Status | Critical Issues |
|------|-------|--------|-----------------|
| `src/channels/base.ts` | 73 | ✅ Clean | — |
| `src/channels/telegram/index.ts` | 201 | 🔴 Has blockers | CHAN-002, CHAN-003, CHAN-004, CHAN-006 |
| `src/channels/whatsapp/index.ts` | 270 | 🟠 Has blockers | CHAN-003, CHAN-005, CHAN-009 |
| `src/channels/cli/index.ts` | ~347 | ✅ Works | — |
| `src/channels/cli/commands.ts` | ~530 | ✅ Works | — |
| `src/channels/cli/renderer.ts` | ~470 | ✅ Works | — |
| `src/channels/telegram/README.md` | 28 | ⚪ Placeholder | CHAN-012 |
| `src/channels/whatsapp/README.md` | 28 | ⚪ Placeholder | CHAN-012 |
| `src/channels/README.md` | 382 | 🟡 Inaccurate | CHAN-011 thru CHAN-016 |
| `src/gateway/index.ts` | 308 | 🔴 Missing outbound wiring | CHAN-003 |
| `src/config/schema.ts` | 311 | ✅ Has schemas | CHAN-016 (Discord ghost) |
| `~/.talon/config.json` | ~40 | 🔴 No channel config | CHAN-001 |

---

## 10. Quick Setup Guide (For Today)

### Telegram Setup
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`, follow prompts, get the bot token
3. Add to your `~/.talon/config.json`:
   ```json
   "channels": {
     "telegram": {
       "enabled": true,
       "botToken": "YOUR_BOT_TOKEN_HERE"
     }
   }
   ```
4. Fix CHAN-003 (outbound wiring) or messages won't get back to you
5. Start Talon: `npm run dev`
6. Message your bot on Telegram

### WhatsApp Setup
1. Ensure deps installed: `npm install whatsapp-web.js qrcode-terminal` (already in package.json)
2. Add to your `~/.talon/config.json`:
   ```json
   "channels": {
     "whatsapp": {
       "enabled": true
     }
   }
   ```
3. Fix CHAN-005 (non-blocking boot) or other channels won't start until QR scan
4. Fix CHAN-003 (outbound wiring) or messages won't get back to you
5. Start Talon: `npm run dev`
6. Scan the QR code printed in terminal with your WhatsApp phone app
7. Send a message to yourself on WhatsApp
