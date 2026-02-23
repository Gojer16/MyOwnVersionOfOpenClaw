# Feature: Talon Channels System

## 1. Purpose
- Provides multi-channel communication interfaces (CLI, Telegram, WhatsApp) for user interaction.
- Solves the problem of accessing Talon from different platforms and interfaces.
- Exists as the "front door" of Talon that receives user input and delivers agent responses.
- Does NOT handle: AI reasoning (agent), session management (gateway), memory compression (memory), or tool execution (tools).

## 2. Scope Boundaries
- Belongs inside: Channel-specific protocol handling, user input ingestion, response delivery, platform authentication.
- Must NEVER contain: AI model logic, session state management, memory algorithms, or tool implementations.
- Dependencies: gateway/ (for message routing), config/ (for channel settings), utils/ (for logging).
- Ownership boundaries: Channels own platform-specific communication. Gateway owns message routing. Agent owns response generation.

## 3. Architecture Overview
```
User → Channel → Ingest → Router → Session → Agent → Response → Channel → User
  ↑      ↑         ↑         ↑         ↑        ↑        ↑         ↑       ↑
CLI   Platform  Message   Gateway   Lookup   Process  Generate  Format  Deliver
Telegram  API   Parsing   Routing            Logic    Output    For
WhatsApp        Auth      Dispatch                    Platform
```

Entry points:
- `BaseChannel.start()` - Channel initialization and connection
- `BaseChannel.ingestMessage()` - User message ingestion
- `BaseChannel.send()` - Agent response delivery
- Channel-specific event handlers (message, ready, error)

Core modules:
- `BaseChannel`: Abstract base class with common channel logic
- `CliChannel`: Interactive terminal interface with slash commands
- `TelegramChannel`: Telegram bot integration via polling
- `WhatsAppChannel`: WhatsApp Web integration via whatsapp-web.js
- `TerminalRenderer`: CLI display logic with streaming and formatting
- `CommandSystem`: Slash command parsing and execution (CLI)

State management: Channel connection state, authentication state (WhatsApp QR), polling state (Telegram), CLI session state.

Data flow: Platform message → channel parsing → ingest → router → session processing → agent response → channel formatting → platform delivery.

## 4. Folder Structure Explanation

**base.ts** (72 lines)
- What: Abstract base class for all channels
- Why: Provides common functionality (ingest, send, config) for all channels
- Who calls: Extended by specific channel implementations
- What calls: Message router for inbound messages, session manager for outbound
- Side effects: Standardizes channel interface, enables polymorphic channel handling
- Critical assumptions: Router and session manager are initialized, config is valid

**cli/index.ts** (362 lines)
- What: Command-line interface with interactive REPL
- Why: Primary development and debugging interface for Talon
- Who calls: Gateway during channel initialization
- What calls: Readline for input, TerminalRenderer for output, command system
- Side effects: Creates TTY interface, handles Ctrl+C, manages CLI session
- Critical assumptions: Running in TTY environment, terminal supports ANSI codes

**cli/commands.ts** (555 lines)
- What: Slash command system (/help, /status, /config, etc.)
- Why: Provides administrative and utility commands within CLI
- Who calls: CLI channel when user types slash commands
- What calls: Gateway status, config access, session management
- Side effects: Executes commands, changes settings, displays information
- Critical assumptions: Commands are properly registered, context available

**cli/renderer.ts** (411 lines)
- What: Terminal output rendering with streaming and formatting
- Why: Handles all display logic (agent responses, tool usage, streaming)
- Who calls: CLI channel for all output operations
- What calls: Chalk for coloring, box-drawing characters, stream handling
- Side effects: Renders to stdout, manages cursor position, handles line wrapping
- Critical assumptions: Terminal supports UTF-8, proper width detection

**cli/skill-commands.ts** (229 lines)
- What: Skill command registration system
- Why: Extensible command system for skills (time, echo, calc, etc.)
- Who calls: CLI command system during initialization
- What calls: Skill implementations, command registry
- Side effects: Registers skill commands, extends CLI functionality
- Critical assumptions: Skills are properly implemented, command names unique

**cli/utils.ts** (224 lines)
- What: CLI utility functions (formatting, parsing, helpers)
- Why: Shared utilities for CLI channel components
- Who calls: Various CLI components as needed
- What calls: String manipulation, date formatting, validation
- Side effects: Formatting operations, input parsing
- Critical assumptions: Utility functions are pure/side-effect free

**cli/markdown.ts** (233 lines)
- What: Markdown to terminal formatting conversion
- Why: Converts agent markdown responses to terminal-friendly format
- Who calls: Terminal renderer when displaying agent responses
- What calls: Markdown parsing, ANSI code generation
- Side effects: Strips/transforms markdown for terminal display
- Critical assumptions: Markdown is well-formed, terminal supports basic ANSI

**telegram/index.ts** (228 lines)
- What: Telegram bot integration via long-polling
- Why: Enables Talon access via Telegram messaging
- Who calls: Gateway during channel initialization
- What calls: Telegram Bot API via fetch, message router for inbound
- Side effects: Polls Telegram API, sends/receives messages, manages offset
- Critical assumptions: Bot token valid, network accessible, API rate limits respected

**whatsapp/index.ts** (337 lines)
- What: WhatsApp Web integration via whatsapp-web.js
- Why: Enables Talon access via WhatsApp messaging
- Who calls: Gateway during channel initialization
- What calls: whatsapp-web.js library, Puppeteer for browser automation
- Side effects: Launches browser, QR code authentication, message handling
- Critical assumptions: WhatsApp Web supported, browser automation works, dependencies installed

## 5. Public API

**Exported classes:**
- `BaseChannel` - Abstract base class for all channels
- `CliChannel` - Command-line interface implementation
- `TelegramChannel` - Telegram bot implementation
- `WhatsAppChannel` - WhatsApp integration implementation
- `TerminalRenderer` - CLI display rendering

**Input types:**
- `InboundMessage`: {channel, senderId, senderName, text, media?, isGroup?, groupId?}
- `OutboundMessage`: {text, metadata?}
- `ChannelConfig`: Platform-specific configuration (tokens, enabled, settings)
- `CommandInput`: Raw user input string for CLI commands

**Output types:**
- `ChannelStatus`: {name: string, enabled: boolean, connected: boolean, ready: boolean}
- `CommandResult`: {success: boolean, output: string, error?: string}
- `RenderOutput`: Formatted terminal output with styling
- `PlatformMessage`: Platform-specific message format for delivery

**Error behavior:**
- Connection errors: Retry with exponential backoff, log failure
- Authentication errors: Clear error messages (invalid token, QR expired)
- Message send failures: Retry limited times, log failure
- Parsing errors: Return helpful error to user
- Platform errors: Convert to Talon error format, log details

**Edge cases:**
- CLI without TTY: Disable channel with clear message
- Telegram rate limit: Implement backoff, respect limits
- WhatsApp QR timeout: Re-generate QR, clear session
- Large messages: Split/truncate per platform limits
- Media messages: Handle or ignore based on capability

**Idempotency notes:**
- Message ingestion: NOT idempotent — Telegram tracks offset but doesn't persist; WhatsApp has no deduplication
- Channel start: Not idempotent (multiple starts cause errors)
- Command execution: Depends on command (some idempotent, some not)
- Message sending: Platform-dependent (may duplicate on retry)
- Missing: Message ID deduplication cache for true idempotency

## 6. Internal Logic Details

**Core algorithms:**
- CLI command parsing: Slash command detection, argument extraction, command lookup
- Telegram polling: Long-polling with offset tracking, exponential backoff on errors
- WhatsApp authentication: QR code generation, session persistence, reconnection
- Terminal rendering: Streaming display with proper line wrapping and cursor management
- Markdown stripping: Platform-specific markdown removal (Telegram plain text)

**Important decision trees:**
1. User input → Detect channel → Parse message → If command → Execute command, Else → Ingest to router
2. Channel start → Check enabled → Load dependencies → Initialize connection → Start listening
3. Message send → Format for platform → Check size limits → Send → If fails → Retry → Log result
4. CLI command → Parse → Lookup handler → Execute → Format output → Render to terminal

**Guardrails:**
- Message size limits: Platform-specific truncation (Telegram 4096, WhatsApp 65536) ✅
- Rate limiting: Respect platform API limits (Telegram 30 messages/second) ✅
- Connection retry: Exponential backoff with max attempts ✅
- Authentication: Secure token storage, session cleanup ✅
- Missing: Channel-specific spam protection
- Missing: Input sanitization for injection prevention

**Validation strategy:**
- Configuration validation: Required tokens, valid URLs, enabled flags
- Message validation: Non-empty text, valid sender IDs, proper formatting
- Command validation: Registered commands, correct argument count
- Platform response validation: API response parsing, error handling
- Connection validation: Heartbeat/ping checks, reconnection logic
- Missing: Input sanitization for injection prevention

**Retry logic:**
- Connection failures: 3 retries with exponential backoff (2s, 4s, 8s)
- Message send failures: 2 retries with short delay
- API call failures: Platform-specific retry (Telegram 429 handling)
- Authentication failures: Clear session, restart auth flow
- Missing: Circuit breaker for persistently failing channels

## 7. Data Contracts

**Schemas used:**
- `ChannelConfigSchema`: ✅ Zod schema for channel configuration (src/config/schema.ts)
- `InboundMessage`: ❌ TypeScript interface only (src/utils/types.ts) — no runtime validation
- `OutboundMessage`: ❌ TypeScript interface only — no runtime validation
- `CommandInput`: ❌ TypeScript type only — no runtime validation
- **Missing**: Zod schemas for runtime message validation

**Validation rules:**
- Channel config: ✅ Required fields based on platform, token format validation (Zod)
- Inbound messages: ❌ Runtime validation — relies on TypeScript only
- Outbound messages: ❌ Runtime validation — relies on TypeScript only
- CLI commands: ❌ Runtime validation — relies on TypeScript only
- Platform messages: Conform to platform API specifications

**Expected shape of objects:**
```typescript
InboundMessage: {
  channel: 'cli' | 'telegram' | 'whatsapp';
  senderId: string;  // Platform-specific ID
  senderName: string; // User display name
  text: string;      // Message content
  media: null | {type: string, url: string}; // Optional media
  isGroup: boolean;  // Group chat flag
  groupId: string | null; // Group identifier if isGroup
}

ChannelConfig: {
  cli: {enabled: boolean};
  telegram: {enabled: boolean, botToken?: string};
  whatsapp: {enabled: boolean, phoneNumber?: string};
  webchat: {enabled: boolean}; // Future
}
```

**Breaking-change risk areas:**
- Channel message format: Changes break router compatibility
- Platform APIs: Changes break specific channel implementations
- CLI command interface: Changes break user command usage
- Authentication flow: Changes break existing sessions
- Configuration structure: Changes require config migration

## 8. Failure Modes

**Known failure cases:**
- Network partition: Channels cannot connect to platforms
- API rate limits: Platform blocks requests (Telegram 429)
- Authentication expired: Tokens/QR codes expire (WhatsApp)
- Browser automation failure: Puppeteer issues (WhatsApp)
- Terminal issues: TTY not available or incompatible (CLI)
- Dependency missing: Optional packages not installed

**Silent failure risks:**
- Message loss: Inbound messages not ingested
- Send failure: Outbound messages not delivered
- Connection drop: Channel disconnected without notification
- Command failure: CLI commands fail silently
- Missing: Health monitoring for channel status

**Race conditions:**
- Concurrent message ingestion: Duplicate processing
- Connection state changes: Start/stop race conditions
- Session ID conflicts: Multiple channels same senderId
- CLI input/output: Readline interference with rendering
- Missing: Locking for shared channel state

**Memory issues:**
- Message queue buildup: Unbounded inbound queue
- Connection pool growth: Multiple channel instances
- Browser memory: WhatsApp Puppeteer memory leak
- Terminal buffer: Large output accumulation
- Missing: Memory usage monitoring per channel

**Performance bottlenecks:**
- WhatsApp browser startup: 5-10 second latency
- Telegram polling delay: 1-2 second response time
- CLI rendering: Large output rendering blocks input
- Message processing: Serial processing of inbound messages
- Network latency: Platform API response times

## 9. Observability

**Logs produced:**
- Channel lifecycle: INFO level with start/stop events
- Message flow: DEBUG level with inbound/outbound counts
- Connection events: INFO level with connect/disconnect
- Authentication: INFO level with auth success/failure
- Command execution: DEBUG level with command and result
- Missing: Channel performance metrics

**Metrics to track:**
- Message throughput (inbound/outbound per channel)
- Connection uptime (percentage time connected)
- Message latency (send to receive time)
- Command usage frequency (by command)
- Error rate by channel and error type
- Authentication success rate
- Missing: Channel health score composite

**Debug strategy:**
1. Enable channel debug: `DEBUG=channels:*` environment variable
2. Check channel status: Gateway status shows channel states
3. Test connections: Manual platform message tests
4. CLI debugging: Direct command execution
5. Network inspection: Check platform API responses
6. Browser debugging: WhatsApp headless: false for visibility

**How to test locally:**
1. CLI testing: Run Talon, use slash commands, verify output
2. Telegram testing: Set up test bot, send messages, verify responses
3. WhatsApp testing: Install dependencies, scan QR, test messaging
4. Unit tests: `npm test src/channels/` (coverage varies)
5. Integration: Gateway with channels enabled, end-to-end messaging
6. Load testing: Simulate multiple concurrent users

## 10. AI Agent Instructions

**How an AI agent should modify this feature:**
1. Understand the BaseChannel pattern before adding new channels
2. Test platform API compatibility thoroughly
3. Verify message routing still works with changes
4. Check CLI command backward compatibility
5. Run channel tests before committing changes

**What files must be read before editing:**
- `base.ts`: Channel abstraction and common functionality
- Target channel implementation (cli/, telegram/, whatsapp/)
- `cli/commands.ts`: Command system if modifying CLI
- `cli/renderer.ts`: Output formatting if modifying display
- Configuration schema for channel settings

**Safe refactoring rules:**
1. Keep BaseChannel interface backward compatible
2. Maintain platform API compatibility
3. Preserve CLI command syntax
4. Don't break message format expectations
5. Keep authentication flows stable

**Forbidden modifications:**
- Changing channel message format without router updates
- Breaking platform API integrations
- Removing required CLI commands
- Changing authentication storage without migration
- Removing channel configuration options

## 11. Extension Points

**Where new functionality can be safely added:**
- New channels: Create new directory following BaseChannel pattern
- Additional CLI commands: Add to commands.ts or skill-commands.ts
- Enhanced rendering: Extend TerminalRenderer class
- New platform features: Add to existing channel implementations
- Authentication methods: Extend auth systems per channel
- Media handling: Add media processing to channels

**How to extend without breaking contracts:**
1. Add new channels with unique names
2. Use optional parameters in existing APIs
3. Add new CLI commands with unique names
4. Version platform integrations with feature detection
5. Use configuration flags for experimental features

## 12. Technical Debt & TODO

**Resolved Issues (2026-02-23):**
- ✅ **CHAN-001**: Config file missing Telegram/WhatsApp settings — Fixed in `config.example.json`
- ✅ **CHAN-002**: Telegram message splitting for 4096 char limit — Implemented chunking
- ✅ **CHAN-003**: No response delivery to Telegram/WhatsApp — Added outbound routing in gateway
- ✅ **CHAN-004**: Code blocks stripped entirely — Now preserves code content
- ✅ **CHAN-005**: WhatsApp blocking boot sequence — Made initialization non-blocking

**Weak areas:**
- WhatsApp dependency heavy (Puppeteer, browser automation)
- Telegram polling inefficient (could use webhooks)
- CLI rendering complex (could use framework like Ink)
- No channel health monitoring or auto-recovery
- Missing: WebSocket channel for web UI
- Missing: Mobile app channels (iOS/Android)

**Remaining TODOs:**
- [ ] **CHAN-006**: Implement Telegram group mention check (currently TODO in code)
- [ ] **CHAN-007**: Clarify allowedUsers format (numeric IDs vs usernames)
- [ ] **CHAN-008**: Implement exponential backoff for polling errors
- [ ] **CHAN-009**: Add WhatsApp reconnection logic
- [ ] **CHAN-010**: Add rate limiting for WhatsApp messages
- [ ] **CHAN-011**: Update line counts in README
- [ ] **CHAN-012**: Fill in sub-README placeholders
- [ ] **CHAN-013**: Add missing Zod schemas or update README claims
- [ ] **CHAN-014**: Implement message deduplication
- [ ] **CHAN-015**: Add input sanitization for injection prevention
- [ ] **CHAN-016**: Implement Discord channel or mark as planned
- [ ] **CHAN-017**: Add typing indicators for Telegram/WhatsApp
- [ ] **CHAN-018**: Support Telegram MarkdownV2 formatting
- [ ] **CHAN-019**: Add error reporting back to users on channel failures
- [ ] **CHAN-020**: Add WhatsApp message chunking (65536 char limit)
- [ ] **CHAN-021**: Add env var support for bot tokens
- [ ] **CHAN-022**: Secure WhatsApp auth storage
- [ ] **CHAN-023**: Write channel unit tests
- [ ] **CHAN-024**: Remove backup file (cli/index.ts.backup)

**Refactor targets:**
- Extract platform API clients to separate modules
- Implement webhook support for Telegram
- Simplify CLI rendering with framework
- Add comprehensive channel health monitoring
- Implement connection pooling for channels
- Missing: Dependency injection for testability

**Simplification ideas:**
- Reduce channel boilerplate with decorators/metadata
- Consolidate message formatting across channels
- Simplify CLI command registration
- Reduce configuration complexity
- Merge similar channel utilities
- Missing: Unified channel status dashboard