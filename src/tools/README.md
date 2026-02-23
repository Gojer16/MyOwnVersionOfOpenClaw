# Feature: Talon Tools System

## 1. Purpose
- Provides executable capabilities that the AI agent can use to interact with the world (files, shell, web, browser, productivity apps).
- Solves the problem of giving the AI agent concrete actions beyond text generation.
- Exists as the "hands" of Talon that translate AI decisions into real-world effects.
- Does NOT handle: AI reasoning (agent), session management (gateway), protocol handling (gateway), or memory compression (memory).

## 2. Scope Boundaries
- Belongs inside: Tool implementations, safety checks, platform-specific integrations, tool registry management.
- Must NEVER contain: AI model logic, session state management, HTTP server code, or UI rendering.
- Dependencies: agent/ (for tool registration), config/ (for safety settings), utils/ (for logging).
- Ownership boundaries: Tools own specific capability implementations. Agent owns when to use tools. Gateway owns tool execution context.

## 3. Architecture Overview
```
Agent Loop → Tool Registry → Tool Implementation → External System → Result
    ↑            ↑                ↑                    ↑              ↓
Request      Lookup          Safety checks      API/File/Shell    Response
             Dispatch        Platform guard     Browser/Apple
```

Entry points:
- `registerAllTools()` - Main registration function called by gateway
- Individual tool `execute()` methods - Called by agent loop
- Tool-specific classes (BrowserTools, etc.) - Managed instances

Core modules:
- `ToolRegistry`: Central registry with tool definitions and safety checks
- `FileTools`: Read/write/list files with path restrictions
- `ShellTools`: Execute commands with timeout and destructive pattern blocking
- `WebTools`: Search and fetch web content with multi-provider fallback
- `BrowserTools`: Puppeteer-based browser automation
- `ProductivityTools`: Notes, tasks, Apple integrations (macOS, bulletproofed with Zod + JSON output)
- `MemoryTools`: Agent's own memory management (append/search)
- `SafetySystem`: Path validation, command blocking, rate limiting

State management: Stateless tool execution (pure functions), stateful browser instances (BrowserTools), platform detection for Apple tools, permission caching with TTL for Apple apps.

Data flow: Agent request → tool lookup → Zod schema validation → safety checks → platform detection → permission check → external call → BulletproofOutput JSON → agent response.

## 4. Folder Structure Explanation

**registry.ts** (200+ lines)
- What: Central tool registry and registration system
- Why: Provides single source of truth for available tools with configuration-based enable/disable
- Who calls: Gateway during boot phase 3 (AI Brain initialization)
- What calls: Individual tool registration functions, configuration validation
- Side effects: Registers tools with agent loop, logs registration counts
- Critical assumptions: Agent loop is initialized, config is valid, platform detection works

**file.ts** (300+ lines)
- What: File system operations (read, write, list, search)
- Why: Allows agent to read code, configs, documents and write results
- Who calls: Agent when user asks to read/write files
- What calls: Node.js fs module, path validation, size checking
- Side effects: Reads/writes files, validates paths against allowed/denied lists
- Critical assumptions: Path restrictions configured, file size limits set, permissions allow access

**shell.ts** (250+ lines)
- What: Shell command execution with safety controls
- Why: Enables running scripts, git operations, package management, tests
- Who calls: Agent when user asks to execute commands
- What calls: Node.js child_process, command validation, timeout handling
- Side effects: Executes system commands, consumes resources, may modify system
- Critical assumptions: Commands are safe, timeout limits prevent hangs, output size limited

**web.ts** (400+ lines)
- What: Web search and content fetching with multi-provider fallback
- Why: Provides internet access for research, news, information lookup
- Who calls: Agent when user asks to search or fetch web content
- What calls: External APIs (DeepSeek, OpenRouter, Tavily, DuckDuckGo), JSDOM for parsing
- Side effects: Makes network requests, consumes API credits, parses HTML
- Critical assumptions: API keys configured (except DuckDuckGo), network available, HTML parsable

**browser.ts** (300+ lines)
- What: Browser automation with Puppeteer (navigate, click, type, screenshot)
- Why: Enables web interaction beyond simple fetching (forms, JavaScript sites)
- Who calls: Agent when user asks to interact with websites
- What calls: Puppeteer API, browser lifecycle management
- Side effects: Launches browser process, interacts with web pages, takes screenshots
- Critical assumptions: Chrome/Chromium installed, Puppeteer works, sites allow automation

**memory-tools.ts** (200+ lines)
- What: Agent's own memory management (append to MEMORY.md, search memories)
- Why: Allows agent to store and retrieve long-term knowledge
- Who calls: Agent when it needs to remember or recall information
- What calls: File system for memory files, simple text search
- Side effects: Updates MEMORY.md, searches memory directory
- Critical assumptions: Workspace exists, memory files are readable/writable

**notes.ts** (150+ lines)
- What: Local note management with markdown and tags
- Why: Personal note-taking system within Talon workspace
- Who calls: Agent when user asks to save or search notes
- What calls: File system for note storage, markdown parsing
- Side effects: Creates/updates notes in ~/.talon/workspace/notes/
- Critical assumptions: Workspace directory writable, markdown format consistent

**tasks.ts** (150+ lines)
- What: Todo list management with priorities and completion
- Why: Personal task tracking system within Talon
- Who calls: Agent when user asks to manage tasks
- What calls: JSON file storage, task filtering/sorting
- Side effects: Creates/updates tasks.json in workspace
- Critical assumptions: JSON file persists, task schema stable

**apple-shared.ts** (220+ lines)
- What: Shared bulletproof infrastructure for all Apple tool integrations
- Why: DRY extraction of common patterns — output contract, validation, safe execution, permission checks
- Who calls: All apple-*.ts tool files
- What calls: child_process (exec), fs (temp files), os (tmpdir), zod (validation)
- Side effects: Writes/cleans temp .scpt files, caches permission check results (5-min TTL)
- Exports: `BulletproofOutput`, `formatSuccess`, `formatError`, `safeExecAppleScript`, `checkAppPermission`, `handleAppleScriptError`, `checkPlatform`, `createBaseString`, `escapeAppleScript`, `normalizeString`, `DELIMITER`

**apple-safari.ts** (500+ lines)
- What: macOS Safari browser integration with full bulletproofing
- Why: Native Safari control — open URLs, get active tab, extract content, navigate history
- Who calls: Agent on macOS when user asks to interact with Safari
- What calls: apple-shared.ts utilities, safeExecAppleScript
- Side effects: Controls Safari browser, caches permissions
- Bulletproofing: Zod schemas for all 10 Safari tools, `BulletproofOutput` JSON responses, temp file script execution

**apple-calendar.ts** (730+ lines)
- What: macOS Calendar integration with full bulletproofing
- Why: Native Apple Calendar management — create, list, delete events
- Who calls: Agent on macOS when user asks about calendar events
- What calls: apple-shared.ts utilities, date-parser.ts for flexible date input
- Side effects: Creates/modifies calendar events, caches permissions
- Bulletproofing: Zod schemas (`CreateEventSchema`, `ListEventsSchema`, `DeleteEventSchema`), DST gap detection, idempotency checks, operation locking, `BulletproofOutput` JSON responses

**apple-reminders.ts** (240+ lines)
- What: macOS Reminders integration with full bulletproofing
- Why: Native Apple Reminders management — add, list, complete reminders
- Who calls: Agent on macOS when user asks about reminders
- What calls: apple-shared.ts utilities, safeExecAppleScript
- Side effects: Creates/modifies reminders, caches permissions
- Bulletproofing: Zod schemas (`AddReminderSchema`, `ListRemindersSchema`, `CompleteReminderSchema`), date validation, `BulletproofOutput` JSON responses

**apple-notes.ts** (180+ lines)
- What: macOS Notes integration with full bulletproofing
- Why: Native Apple Notes management — create, search notes
- Who calls: Agent on macOS when user asks about notes
- What calls: apple-shared.ts utilities, safeExecAppleScript
- Side effects: Creates notes, caches permissions
- Bulletproofing: Zod schemas (`CreateNoteSchema`, `SearchNotesSchema`), `BulletproofOutput` JSON responses, safe delimiter output parsing

**apple-mail.ts** (480+ lines)
- What: macOS Mail integration with full bulletproofing
- Why: Native Apple Mail management — list, search, read, count emails
- Who calls: Agent on macOS when user asks about email
- What calls: apple-shared.ts utilities, safeExecAppleScript
- Side effects: Reads email data, caches permissions
- Bulletproofing: Zod schemas (`ListEmailsSchema`, `GetRecentSchema`, `SearchEmailsSchema`, `GetEmailContentSchema`, `CountEmailsSchema`), `BulletproofOutput` JSON responses, index bounds validation

**screenshot.ts** (100+ lines)
- What: Cross-platform desktop screenshot capture
- Why: Allows agent to see user's screen for context
- Who calls: Agent when user asks for screenshot or screen help
- What calls: Platform-specific commands (screencapture, scrot, PowerShell)
- Side effects: Captures screen image, returns base64 or saves file
- Critical assumptions: Platform commands available, permissions granted

**subagent-tool.ts** (100+ lines)
- What: Delegation to specialized subagents (research, writer, planner, critic, summarizer)
- Why: Enables cost-effective task specialization using cheaper models
- Who calls: Agent when task matches subagent specialty
- What calls: Subagent registry, model routing
- Side effects: Creates subagent instances, makes additional LLM calls
- Critical assumptions: Subagent registry initialized, models configured

**scratchpad.ts** (80+ lines)
- What: Multi-step task tracking within a single agent session
- Why: Helps agent break down complex tasks and track progress
- Who calls: Agent during complex multi-step operations
- What calls: Session memory for scratchpad state
- Side effects: Maintains scratchpad state in session
- Critical assumptions: Session supports custom metadata

**normalize.ts** (50+ lines)
- What: Tool output normalization and formatting
- Why: Ensures consistent tool response format for agent parsing
- Who calls: Tool implementations before returning results
- What calls: String formatting, truncation, error wrapping
- Side effects: Formats tool outputs consistently
- Critical assumptions: Tool outputs are strings or stringifiable

**memory-search-semantic-tool.ts** (100+ lines)
- What: Semantic search over memory files using embeddings
- Why: More intelligent memory recall than simple text search
- Who calls: Agent when searching memories with semantic meaning
- What calls: Embedding model, vector similarity search
- Side effects: Computes embeddings, searches vector space
- Critical assumptions: Embedding model available, memory files indexed

## 5. Public API

**Exported functions:**
- `registerAllTools(agentLoop, config)` - Main registration entry point
- Individual `register*Tools(config)` functions for each category
- `ToolDefinition` interface for tool implementations
- `BrowserTools` class for stateful browser automation

**Input types:**
- `ToolDefinition`: {name, description, parameters, execute}
- `ToolParameters`: JSON schema defining expected arguments
- `ToolExecutionContext`: Optional session context for stateful tools
- `PlatformConfig`: Platform-specific tool enablement

**Output types:**
- `ToolResult`: String result (success) or error message
- `BulletproofOutput`: {success, data?, error?: {code, message, recoverable, recoverySteps?}, metadata: {timestamp, duration_ms}}
- `BrowserResult`: {success, content?, screenshot?, error?}
- `SearchResponse`: {query, provider, results[], tookMs}
- `FileResult`: Content with metadata (line count, size)

**Error behavior:**
- Safety violations: Returns clear error message about blocked action
- Permission errors: Returns `PERMISSION_DENIED` with recoverySteps (Apple tools)
- Validation errors: Returns `VALIDATION_ERROR` with Zod error details (Apple tools)
- Network errors: Returns provider-specific error with fallback attempt
- Timeout errors: Returns `TIMEOUT` with duration (Apple tools) or timeout message
- Platform errors: Returns `PLATFORM_NOT_SUPPORTED` with macOS guidance (Apple tools)

**Edge cases:**
- Empty search results: Returns "No results found" with query
- Large file truncation: Returns truncated content with size warning
- Command timeout: Returns partial output with timeout notice
- Browser launch failure: Returns installation instructions
- Apple tools on non-macOS: Returns platform not supported

**Idempotency notes:**
- File read: Idempotent (same content)
- File write: Not idempotent (overwrites)
- Shell commands: Depends on command
- Web search: Not idempotent (real-time results)
- Browser actions: Depends on page state

## 6. Internal Logic Details

**Core algorithms:**
- Path safety: allowedPaths/deniedPaths prefix matching with home directory expansion
- Command safety: Regex pattern matching for destructive commands, configurable blocklists
- Web search fallback: DeepSeek → OpenRouter → Tavily → DuckDuckGo priority chain
- Browser automation: Puppeteer lifecycle management with auto-reconnect
- AppleScript integration: Temp file execution via `safeExecAppleScript` (avoids shell quoting issues), Zod schema validation, permission caching with 5-min TTL
- Screenshot capture: Platform detection with command-specific arguments

**Important decision trees:**
1. Tool execution → Validate parameters → Check safety → Platform check → Execute → Format result
2. Web search → Check API keys → Try primary → If fails → Try next in fallback chain → Return best results
3. File access → Expand path → Check denied list → Check allowed list → If denied → Error, If allowed → Proceed
4. Shell command → Check blocked commands → Check destructive patterns → If destructive & confirm required → Block, Else → Execute with timeout

**Guardrails:**
- Path restrictions: User-configurable allowed/denied paths
- Command blocking: Configurable blocklist and destructive pattern detection
- File size limits: Maximum file size for read operations
- Output truncation: Limit shell/web output to prevent context overflow
- Timeout limits: Prevent hanging operations (shell, browser, web)
- Rate limiting: Configurable for web search providers
- Missing: Tool usage quotas (per user/session)

**Validation strategy:**
- Parameter validation: JSON schema validation before execution
- Apple tool validation: Zod schemas with `.strict()` mode — validates types, string lengths, enum values, and rejects unknown fields
- Path validation: Resolution and prefix checking against config
- Command validation: Blocklist and pattern matching
- URL validation: Protocol checking (http/https)
- Platform validation: macOS checks for Apple tools (returns `PLATFORM_NOT_SUPPORTED` JSON)
- Missing: Input sanitization for shell command arguments

**Retry logic:**
- Web search: Automatic fallback to next provider on failure
- Browser actions: Auto-reconnect on disconnection
- Network operations: Limited retries with exponential backoff
- File operations: No retry (fail fast on permission errors)
- Missing: Circuit breaker for frequently failing tools

## 7. Data Contracts

**Schemas used:**
- `ToolDefinitionSchema`: Zod schema for tool registration
- `FileToolParams`: {path: string, startLine?: number, endLine?: number}
- `ShellToolParams`: {command: string, cwd?: string, timeout?: number}
- `WebSearchParams`: {query: string, provider?: string, maxResults?: number}
- `BrowserToolParams`: {url: string, selector?: string, text?: string}

**Validation rules:**
- File paths: Must be strings, resolved against allowed paths
- Shell commands: Must not contain blocked patterns, timeout must be positive
- URLs: Must start with http:// or https://, must be valid format
- Search queries: Must be non-empty strings, max length enforced
- Tool parameters: Must match JSON schema defined in tool registration

**Expected shape of objects:**
```typescript
ToolDefinition: {
  name: string;  // e.g., "file_read"
  description: string;  // Natural language description for LLM
  parameters: {  // JSON schema
    type: 'object',
    properties: Record<string, {type: string, description: string}>,
    required: string[]
  };
  execute: (args: Record<string, unknown>) => Promise<string>;
}

BrowserResult: {
  success: boolean;
  content?: string;  // Page content or extracted text
  screenshot?: string;  // Base64 encoded image
  error?: string;  // Error message if success=false
}
```

**Breaking-change risk areas:**
- Tool parameter schemas: Changes break existing agent prompts
- Tool names: Renaming breaks agent tool call parsing
- Browser API: Changing Puppeteer interaction patterns
- AppleScript commands: Changes break macOS integrations
- Safety configurations: Changing defaults affects security posture

## 8. Failure Modes

**Known failure cases:**
- All web search providers rate limited: No fallback available
- Browser fails to launch: Chrome not installed or permissions issue
- File permission denied: Path outside allowed areas or OS restrictions
- AppleScript execution fails: Returns `APPLESCRIPT_ERROR` with stderr details (Apple tools)
- AppleScript permission denied: Returns `PERMISSION_DENIED` with `recoverySteps` (Apple tools)
- Shell command hangs: Process doesn't respect timeout
- Memory full: Cannot write to memory files

**Silent failure risks:**
- Command blocking false negative: Dangerous command not detected
- Path traversal not caught: Relative path escapes allowed area
- Browser disconnection: Page state lost without error
- Missing: Tool execution timeout not enforced

**Race conditions:**
- Concurrent file writes: Corruption of memory/notes files
- Browser instance reuse: Multiple tool calls interfering
- Shell command collision: Working directory conflicts
- Apple Calendar: Concurrent event creation prevented by operation lock
- Other Apple apps: No lock (low concurrency risk for Notes/Reminders/Mail read operations)

**Memory issues:**
- Browser instance leak: Puppeteer not cleaned up
- Large output buffers: Shell/web output not truncated
- Embedding model memory: Semantic search caching
- Missing: Memory usage monitoring per tool

**Performance bottlenecks:**
- Browser startup: 2-5 second latency for first use
- Web search API calls: Sequential provider attempts
- File system scans: Searching all memory files
- AppleScript execution: Slow inter-process communication
- Embedding computation: CPU-intensive for semantic search

## 9. Observability

**Logs produced:**
- Tool registration: INFO level with counts by category
- Tool execution: DEBUG level with parameters (sanitized)
- Safety violations: WARN level with blocked actions
- Provider failures: WARN level with fallback attempts
- Browser lifecycle: INFO level with launch/close events
- Missing: Tool execution latency metrics

**Metrics to track:**
- Tool usage frequency (by tool name)
- Safety block rate (percentage of blocked attempts)
- Web search provider success rate
- Browser session duration and success rate
- File operation counts (read/write/list)
- Shell command execution time distribution
- Missing: Error rate by tool category

**Debug strategy:**
1. Enable tool debug: `DEBUG=tools:*` environment variable
2. Check tool registration: Gateway logs show registered tools
3. Test individual tools: Direct execution bypassing agent
4. Verify safety config: Check allowedPaths/blockedCommands
5. Browser debugging: Set `headless: false` to see interactions
6. AppleScript testing: Run osascript commands manually

**How to test locally:**
1. Unit tests: `npx vitest run tests/unit/apple-*.test.ts` (79 tests across 4 Apple tool files)
2. Integration: Register tools, execute with test parameters
3. Safety testing: Attempt blocked paths/commands, verify denial
4. Browser testing: Launch browser, navigate to test page
5. Apple tool testing: On macOS, test with actual Apple apps
6. Web search testing: Test each provider with simple query

## 10. AI Agent Instructions

**How an AI agent should modify this feature:**
1. Understand the tool registration pattern before adding new tools
2. Test safety checks thoroughly for new capabilities
3. Verify platform compatibility (macOS/Windows/Linux)
4. Check parameter schemas match LLM expectation format
5. Run all tool tests before committing changes

**What files must be read before editing:**
- `registry.ts`: Tool registration pattern and safety integration
- `apple-shared.ts`: Shared Apple tool infrastructure (BulletproofOutput, safeExecAppleScript, Zod helpers)
- The specific tool file being modified (e.g., `file.ts`, `shell.ts`, `apple-*.ts`)
- `normalize.ts`: Output formatting conventions
- Configuration schema for tool settings
- Platform detection logic in registry

**Safe refactoring rules:**
1. Keep tool parameter schemas backward compatible
2. Maintain safety check patterns (allow/deny lists)
3. Preserve platform detection for Apple tools
4. Don't break tool name references in agent prompts
5. Keep error message format consistent

**Forbidden modifications:**
- Removing safety checks without replacement
- Changing tool names without agent prompt updates
- Breaking AppleScript command syntax on macOS
- Removing platform detection for cross-platform tools
- Changing output format without agent loop updates

## 11. Extension Points

**Where new functionality can be safely added:**
- New tool categories: Create new file following existing patterns
- Additional safety checks: Extend validation in existing tools
- New web search providers: Add to fallback chain in web.ts
- Additional browser actions: Extend BrowserTools class
- New Apple app integrations: Create new apple-*.ts file
- Platform-specific tools: Add platform detection in registry

**How to extend without breaking contracts:**
1. Add new tools with unique names (no conflicts)
2. Use optional parameters in existing tools
3. Add new safety checks as warnings first, then blocks
4. Version tool APIs with backward compatibility
5. Use feature flags for experimental tools

## 12. Technical Debt & TODO

**Weak areas:**
- Missing: Tool usage quotas or rate limiting per user
- Missing: Tool execution history and audit logging
- Missing: Tool performance monitoring and alerting
- Missing: Dependency injection for testability

**Resolved (v0.4.0):**
- ~~AppleScript error handling is basic~~ → All Apple tools now use `BulletproofOutput` JSON with structured error codes, recovery steps, and Zod validation
- ~~Standardize error handling patterns across all tools~~ → Apple tools standardized via `apple-shared.ts`
- ~~Extract safety system to shared module~~ → `apple-shared.ts` provides shared infrastructure for all Apple tools
- ~~Safari script injection vulnerability~~ → apple-safari.ts uses `safeExecAppleScript()` (temp file execution)
- ~~Path traversal in notes~~ → Directory validation and path traversal prevention added
- ~~Task ID collisions~~ → UUID-based task IDs implemented
- ~~Shell zombie processes~~ → Proper timeout cleanup with SIGKILL escalation
- ~~Browser process leaks~~ → Process exit handlers with automatic cleanup
- ~~Regex crash in file_search~~ → Special characters now escaped
- ~~Destructive writes in soul_update~~ → Size limits, backups, and auto-restore

**Resolved (v0.4.0) - Additional Validation:**
- All tools now have Zod schema validation for inputs
- URL/Query validation in web.ts (http/https only)
- Path validation in screenshot.ts (temp/home dirs only)
- 500 task limit with auto-archiving in tasks.ts

**Refactor targets:**
- Add tool usage quotas with configurable limits
- Add comprehensive audit logging for all tool executions
- Add dependency injection for testability

**Simplification ideas:**
- Consolidate similar tools (multiple file operations could be one tool with action parameter)
- Reduce platform-specific code with better abstraction
- Simplify tool registration boilerplate
- Missing: Configuration-driven tool enablement matrix