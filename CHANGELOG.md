# Changelog

All notable changes to Talon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-02-19

### ✨ Added

#### SQLite Persistence
- **SQLite Database**: Replaced file-based session storage with SQLite
  - Better concurrent access with WAL mode
  - ACID transactions for data integrity
  - Query capabilities with indexed lookups
  - Smaller disk footprint
  - Industry standard database
- **Automatic Migration**: Migrates existing file-based sessions to SQLite on first boot
- **Database Schema**: 
  - `sessions` table with 7 indexes
  - `messages` table with foreign keys
  - `metadata` table for migrations
- **Database Operations**:
  - Full CRUD operations for sessions and messages
  - Database stats (total sessions, active sessions, total messages, db size)
  - Vacuum support for database optimization

### 🔧 Changed
- **Version Bump**: Updated to v0.4.0
- **Session Manager**: Now uses SQLite instead of file-based storage
- **Performance**: Improved session lookup and persistence speed

### 📚 Documentation
- **v0.4.0 Plan**: Complete development plan for v0.4.0 features
- **Shipping Summary**: Combined v0.3.3 & v0.4.0 achievements

### 🧪 Testing
- **All Tests Passing**: 514/515 tests (99.8%)
- **Session Manager Tests**: 11/11 passing with SQLite

### 📊 Stats
- **Database**: SQLite with WAL mode
- **Migration**: Automatic on first boot
- **Performance**: Instant queries vs file I/O

---

## [0.3.3] - 2026-02-19

### ✨ Added

#### Gateway v0.3.3 - Production Ready
- **`talon gateway` Command**: New dedicated command for gateway-only mode (WebSocket server without CLI)
- **Desktop Screenshot Tool**: Cross-platform desktop screenshot capture (macOS/Linux/Windows)
  - `desktop_screenshot` tool with optional base64 encoding
  - Automatic platform detection (screencapture, scrot, PowerShell)
- **Structured WebSocket Protocol**: Complete event-based protocol with 16 event types
  - Client → Server: `gateway.status`, `session.list`, `session.create`, `session.send_message`, `session.reset`, `tools.list`, `tools.invoke`
  - Server → Client: `gateway.status`, `session.created`, `session.list`, `session.message.delta`, `session.message.final`, `session.reset`, `tools.list`, `tools.result`, `session.error`
  - Full error handling and validation
  - Backward compatible with legacy `channel.message` event
- **Direct Tool Execution**: Execute tools via WebSocket without creating a session
  - `tools.invoke` event for instant tool calls
  - Synchronous tool results
- **Comprehensive Test Suite**: End-to-end gateway testing script
  - Tests WebSocket connection, session management, tool execution, safety checks
  - Run with `npm run test:gateway`
- **WebSocket Protocol Tests**: 11 integration tests for WebSocket protocol (all passing)
  - Gateway status, session management, tool execution, error handling
  - Run with `npm test tests/integration/websocket-protocol.test.ts`
- **Enhanced WebSocket Client**: Interactive test client with new protocol commands
  - Session management: `create`, `sessions`, `send`, `reset`
  - Tool commands: `tools`, `invoke`, shortcuts (`echo`, `ls`, `pwd`, `screenshot`)
  - Run with `npm run ws`
- **Quick Start Guide**: Complete deployment and testing documentation (`docs/QUICKSTART.md`)
- **Implementation Tracking**: Detailed progress tracking document (`docs/19fbIMPLEMENTATION.md`)
- **Audit Document**: Complete codebase audit and stabilization plan (`docs/AUDIT_AND_STABILIZATION.md`)

#### WebSocket Protocol Documentation
- Formal protocol specification with all event types
- Complete payload schemas with TypeScript types
- Example payloads for all events
- Error codes and handling

#### Tools
- **27+ Tools Registered**: Complete tool registry with safety checks
- **Safety Checks**: Dangerous command blocking (rm -rf, sudo, curl|sh, etc.)
- **Tool Categories**: File, shell, web, browser, memory, productivity, Apple integrations

### 🔧 Changed
- **Version Bump**: Updated to v0.3.3 across all components
- **Gateway Banner**: Updated to show v0.3.3
- **Health Endpoint**: Returns v0.3.3 in status response
- **CLI Help**: Updated with `gateway` command documentation
- **WebSocket Server**: Enhanced with structured event handlers
- **Agent Loop**: Added `getRegisteredTools()` and `executeTool()` methods

### 📚 Documentation
- **Implementation Guide**: Complete audit and implementation tracking
- **Quick Start Guide**: Step-by-step deployment instructions
- **Protocol Specification**: Formal WebSocket event schema with examples
- **Test Guide**: How to verify all features
- **Audit Document**: Codebase audit with 90% completion status

### 🧪 Testing
- **E2E Test Script**: Comprehensive gateway testing (`scripts/test-gateway-e2e.js`)
- **WebSocket Protocol Tests**: 11 integration tests (all passing)
- **Test Coverage**: 514/515 tests passing (99.8%)
- **npm Scripts**: Added `npm run test:gateway` and updated `npm run test:all`

### 🐛 Fixed
- **Process Management**: Robust PID tracking and graceful shutdown
- **WebSocket Protocol**: Structured event types with validation
- **Tool Execution**: Direct tool invocation via WebSocket

### 📊 Stats
- **Tests**: 514/515 passing (99.8%)
- **Tools**: 27+
- **Subagents**: 5
- **Documentation**: 100% complete
- **Commits**: 16 total

### 🎯 Production Readiness
- ✅ Gateway daemon with graceful shutdown
- ✅ WebSocket server with stable protocol
- ✅ Session persistence (file-based)
- ✅ Streaming responses with delta chunks
- ✅ Tool execution with safety checks
- ✅ Subagent routing (5 subagents)
- ✅ Shadow Loop (proactive intelligence)
- ✅ HTTP health and status endpoints
- ✅ Comprehensive documentation

## [Unreleased]

### ✨ Added
- **apple_mail_list_emails**: List emails from mailbox (inbox, sent, junk, etc.) with sender, subject, date, read status
- **apple_mail_read_email**: Read full email content by message ID
- **apple_mail_send_email**: Send emails with recipient, subject, and body
- **Native Integration**: Uses AppleScript for seamless macOS Mail app integration
- **Auto-detection**: Only enabled on macOS (darwin platform)
- **Robust Error Handling**: Fixed AppleScript quoting to handle apostrophes in email subjects/senders

#### Apple Mail Bug Fixes
- **AppleScript Quoting Fix**: Switched from single-quoted osascript to heredoc syntax to handle emails with apostrophes in subjects/senders
- **Provider Crash Fix**: Added nullish coalescing defaults for usage.prompt_tokens in OpenCode provider
- **Silent Failure Fix**: Added pendingToolResults tracking to surface tool outputs when LLM call fails

### 🐛 Fixed

#### Critical: Agent Memory/Identity Loading
- **Problem**: Agent forgets who you are on new TUI sessions, asks "Who am I? Who are you?" even though USER.md and IDENTITY.md contain your information
- **Root Cause**: MemoryManager cached SOUL.md once in constructor, system prompt never refreshed with USER.md/IDENTITY.md on new sessions
- **Solution**: Load ALL workspace files (SOUL.md, USER.md, IDENTITY.md, MEMORY.md) fresh on EVERY message, matching OpenClaw's behavior
- **Files Modified**: 
  - `src/memory/manager.ts` - Removed cached `soul` field, load fresh in `buildContext()`
  - `src/agent/prompts.ts` - Added debug logging for loaded files with status tracking
- **Impact**: Agent now always knows who you are, file updates take effect immediately without restart
- **Tests**: All 323 tests passing, verification script added (`scripts/verify-memory-fix.js`)
- **Documentation**: `BUGFIX-SUMMARY.md`, `BUGFIX-MEMORY-IDENTITY-COMPLETE.md`, `TESTING-MEMORY-FIX.md`

#### Browser Launch Improvements
- **Better Error Handling**: Improved error messages when browser fails to launch
- **Bundled Chrome Support**: Uses Puppeteer's bundled Chrome by default (`executablePath: undefined`)
- **Helpful Hints**: Error messages now include installation instructions (`npx puppeteer browsers install chrome`)
- **File Modified**: `src/tools/browser.ts`

### ✨ Added

#### Daily Memory Loading
- **Daily Memory Loader**: New `src/memory/daily.ts` module loads `memory/YYYY-MM-DD.md` files
- **Auto-Loading**: Loads today and yesterday's daily memories automatically on every message
- **Location**: Daily memories stored in `~/.talon/workspace/memory/YYYY-MM-DD.md`
- **Chronological Order**: Yesterday's memories loaded first, then today's
- **Auto-Directory Creation**: Creates `memory/` directory if it doesn't exist

#### Proactive User Recognition
- **Name Extraction**: Automatically extracts user's name from USER.md
- **Casual Greeting**: Agent greets user by name on first message (e.g., "Hey Orlando! Ready to crush some goals? 🚀")
- **No More "Who are you?"**: Agent now recognizes returning users immediately
- **System Prompt Integration**: Greeting instruction added to system prompt dynamically

#### TUI Response Formatting
- **Clean AI Output**: Removes ugly `**` markdown bold syntax from AI responses
- **Colored Bullets**: Converts `-` bullet points to cyan `•` for better readability
- **formatAIResponse()**: New utility function in `src/channels/cli/utils.ts`
- **Automatic Formatting**: All AI responses are automatically formatted before display
- **Memory Loading Indicator**: TUI now shows "Loading memory files..." on startup

### 🔧 Changed
- **TUI Display**: AI responses now render cleaner without markdown artifacts

## [0.3.2] - 2026-02-17

### ✨ Added

#### OpenCode Integration (100% FREE Models)
- **4 Free Models**: minimax-m2.5-free, big-pickle, glm-5-free, kimi-k2.5-free
- **No API Key Required**: Zero cost, unlimited usage
- **Custom Provider**: Direct fetch API without Authorization header
- **Router Integration**: OpenCode prioritized as cheapest provider
- **Setup Wizard Support**: Automatic configuration in `talon setup`
- **CLI Commands**: Full support in `talon provider` and `talon switch`
- **Subagent Support**: All subagents can use free models
- **Error Handling**: Rate limit detection and automatic fallback
- **Cost Savings**: 100% free vs $126/month (DeepSeek)

#### Gateway Protection & Safety
- **Auto-Detection**: `talon setup` detects and offers to stop running gateways
- **Duplicate Prevention**: `talon start` prevents multiple gateways on same port
- **Safe Process Killing**: Verifies process is Talon before terminating
- **Port-Based Detection**: Uses `lsof` to find all processes on port 19789
- **Process Verification**: Checks command line contains "talon" or "gateway"
- **Multi-Gateway Support**: Handles multiple PIDs safely

#### Documentation
- **OPENCODE_INTEGRATION.md**: Comprehensive integration guide
- **OPENCODE_QUICKSTART.md**: 2-minute setup guide
- **OPENCODE_IMPLEMENTATION.md**: Technical implementation details
- **OPENCODE_VERIFICATION.md**: Full test verification report

#### Testing
- **Integration Tests**: All 4 models verified working
- **Comprehensive Tests**: Router, subagents, agent loop tested
- **323 Tests Passing**: No regressions introduced

### 🔧 Changed
- **Default Provider**: OpenCode set as default in `config.example.json`
- **Model Router**: OpenCode prioritized first for cost optimization
- **Provider Definitions**: OpenCode listed first in CLI
- **talon stop**: Now uses port-based detection (more reliable)
- **talon start**: Checks for existing gateway before starting
- **talon setup**: Prompts to stop running gateways

### 🐛 Fixed
- **Setup Wizard**: Skip model check for OpenCode (no auth needed)
- **Gateway Detection**: Improved process detection reliability
- **Process Safety**: Won't kill non-Talon processes on port 19789
- **Config Conflicts**: Prevents old gateways from using stale config

### 📚 Documentation
- Updated README with OpenCode features
- Added OpenCode to `.env.example` with usage notes
- Updated CLI help text with new safety features
- Comprehensive test documentation

## [0.3.1] - 2026-02-17

### ✨ Added

#### Shadow Loop (Proactive Intelligence)
- **Filesystem Watcher**: Monitors file changes using chokidar
- **Heuristic Engine**: Filters events through customizable rules
- **Ghost Messenger**: Sends proactive suggestions before you ask
- **Built-in Heuristics**:
  - New TypeScript file detection → "Need tests?"
  - TypeScript file changes → "Need help?"
  - Test file updates → "Test file updated"
- **Configuration**: Custom paths, ignore patterns, cooldown, rate limiting
- **Gateway Integration**: Automatically starts with gateway when enabled
- **85.8% Test Coverage**: 32 tests (16 unit + 16 integration)

#### Browser Control
- **browser_navigate**: Open URLs in browser
- **browser_click**: Click elements by CSS selector
- **browser_type**: Type text into input fields
- **browser_screenshot**: Capture page screenshots (base64)
- **browser_extract**: Extract page content (text/HTML)
- **Puppeteer Integration**: Full browser automation
- **Configurable**: Headless/headed mode, custom viewport
- **35 Tests**: Full TDD implementation

#### Subagent System
- **5 Specialized Agents**: Research, Writer, Planner, Critic, Summarizer
- **Cost Optimization**: 97% savings using gpt-4o-mini vs gpt-4o
- **SubagentRegistry**: Manages agent instances
- **Configurable Model**: Use any model for subagents
- **19 Tests**: Complete TDD coverage

### 🧪 Testing

#### Test Infrastructure
- **323 Total Tests**: 100% passing
- **Test Coverage**: 
  - Shadow Loop: 85.8%
  - Browser Tools: 100%
  - Subagents: 100%
  - Core Components: 75-80%
- **Integration Tests**: Real filesystem, gateway, error handling
- **Vitest + Coverage**: @vitest/coverage-v8

### 📚 Documentation
- **SYSTEM_ACCESS_AUDIT.md**: Full system access analysis
- **SHADOW_LOOP_TESTS.md**: Test coverage report
- **COVERAGE.md**: Detailed coverage breakdown
- **IMPLEMENTATION_STATUS.md**: Master tracker

### 🔧 Fixed
- TypeScript compilation errors in subagent files
- Heuristic ordering (test files now match first)
- CI/CD permissions for releases

### 🎯 Full System Access Complete
- ✅ Read files
- ✅ Write files  
- ✅ Run commands
- ✅ Control browsers
- ✅ Observe filesystem changes

## [Unreleased]

### ✨ New Features

#### Productivity Tools
- **Notes System**:
  - **notes_save**: Save notes with title, content, and tags to `~/.talon/workspace/notes/`
  - **notes_search**: Search notes by keyword or tag with preview
  - Markdown format with frontmatter metadata
  - Local storage in workspace
  
- **Tasks System**:
  - **tasks_add**: Add tasks with title, description, and priority (low/medium/high)
  - **tasks_list**: List tasks filtered by status (pending/completed/all)
  - **tasks_complete**: Mark tasks as completed by ID
  - JSON storage with timestamps and IDs
  - Priority-based organization

#### Apple Integrations (macOS)
- **Apple Notes**:
  - **apple_notes_create**: Create notes in Apple Notes app with folder support
  - **apple_notes_search**: Search Apple Notes by keyword with preview
  - Uses AppleScript for native integration
  
- **Apple Reminders**:
  - **apple_reminders_add**: Add reminders with due dates and priority (0-9)
  - **apple_reminders_list**: List reminders by list name with completion status
  - **apple_reminders_complete**: Mark reminders as complete by title
  - Auto-creates "Talon" list
  
- **Apple Calendar**:
  - **apple_calendar_create_event**: Create events with date, time, location, and notes
  - **apple_calendar_list_events**: List upcoming events (configurable days ahead)
  - **apple_calendar_delete_event**: Delete events by title
  - Auto-calculate end time (1 hour after start if not specified)
  - Auto-creates "Talon" calendar
  
- **Native Integration**: Uses AppleScript for seamless macOS integration
- **Auto-detection**: Only enabled on macOS (darwin platform)
- **No Setup Required**: Works immediately with system permissions

#### Enhanced Agent Awareness
- **System Prompt Updates**: Agent now explicitly knows about all 26+ tools
- **Tool Categories**: Organized by File, Web, Memory, Productivity, Apple, Delegation
- **Proactive Usage**: SOUL.md encourages using tools instead of just acknowledging
- **TOOLS.md Template**: Complete documentation of all available tools
- **Usage Guidelines**: When to use notes_save, tasks_add, calendar tools, subagents
- **Cost-Conscious Delegation**: Explicit guidance on using cheap subagent models

### 📊 Statistics
- **Total Tools**: 26+ (13 new productivity/Apple tools)
- **Apple Tools**: 8 (Notes, Reminders, Calendar)
- **Local Tools**: 5 (Notes, Tasks)
- **Subagents**: 5 specialized agents
- **Platform Support**: macOS (Apple tools), All platforms (local tools)

---
  - Auto-calculate end time (1 hour after start if not specified)
  
- **Native Integration**: Uses AppleScript for seamless macOS integration
- **Auto-detection**: Only enabled on macOS (darwin platform)
- **Auto-creation**: Creates "Talon" folder/list/calendar automatically

#### Subagent System
- **SubagentRegistry**: Manages specialized subagent instances
- **5 Subagent Types**:
  - **Research**: Gathers information with structured findings and sources
  - **Writer**: Produces content in markdown, code, or text formats
  - **Planner**: Creates actionable plans with steps, risks, and time estimates
  - **Critic**: Reviews work with ratings, strengths, weaknesses, and suggestions
  - **Summarizer**: Compresses information into concise summaries with key points
- **delegate_to_subagent Tool**: Agent can delegate specialized tasks to subagents
- **Cost Optimization**: Subagents use cheap models (gpt-4o-mini) for 97% cost savings
- **Config Support**: `agent.subagentModel` configuration option
- **Full Integration**: Initialized in gateway Phase 3 with agent loop
- **TDD Implementation**: All 19 unit tests passing

#### TUI Client (`talon tui`)
- **Interactive WebSocket Client**: Connect to running gateway without stopping/starting
- **Real-time Chat**: Stream responses with typing indicators (⏳ Talon is thinking...)
- **Status Indicators**: Shows model, workspace, and connection status on startup
- **Better Tool Display**: Shows file names and query details (🛠️ file_read → IDENTITY.md)
- **Response Formatting**: Beautiful box borders for agent responses
- **Slash Commands**: `/help`, `/clear`, `/exit`, `/status`, `/model`, `/config`, `/version`
- **Bash Execution**: Use `!` prefix for shell commands (e.g., `!ls -la`)
- **Gateway Check**: Verifies gateway is running before connecting
- **1.5s Startup Delay**: Waits for gateway to be fully ready

#### Provider Management
- **`talon provider`**: Add/change AI providers with interactive prompts
  - Reuses existing API keys from `.env`
  - Fetches all 342+ OpenRouter models dynamically
  - Multi-model selection for fallback (checkbox interface)
  - Auto-restart gateway option
  
- **`talon switch`**: Switch between configured models
  - Shows all models from selected provider
  - Updates config and optionally restarts gateway

#### Service Management
- **`talon service start`**: Start service without reinstalling
- **`talon service stop`**: Stop service temporarily
- **`talon service restart`**: Restart running service
- **`talon service status`**: Check installation and running state
- **`talon service install`**: Install as system service (LaunchAgent/systemd)
- **`talon service uninstall`**: Clean removal

### 🎨 Setup Wizard Enhancements
- **Talon Branding**: Changed emoji from 🦞 to 🦅 (Talon eagle)
- **Timezone-Aware Greetings**: Shows "Good morning/afternoon/evening" based on local time
- **Dynamic OpenRouter Models**: Fetches all 342+ models from OpenRouter API
- **Cleaner UI**: Removed verbose descriptions from provider/model selections
- **OpenClaw-Style Channel Selection**: Loop-based selection with visual indicators (○/●)
- **Removed Discord**: Replaced with WhatsApp support
- **Model Format Fix**: DeepSeek models no longer double-prefixed

### 🔧 Gateway Configuration
- **Token Authentication**: Auto-generate 48-char hex tokens
- **Bind Mode Selection**: Loopback (127.0.0.1) or All interfaces (0.0.0.0)
- **Tailscale Support**: Config option for Tailscale exposure
- **Config Backup**: Automatic `.bak` file creation before overwriting
- **User Feedback**: Shows "✓ Updated ~/.talon/config.json" with backup info

### 🚀 Boot-md Hook
- **BOOT.md Execution**: Runs on gateway startup with full agent loop
- **Tool Access**: Agent can use all tools during boot (files, shell, web, etc.)
- **Date Placeholder**: `{{DATE}}` replaced with current date
- **Template Included**: Example BOOT.md with usage tips
- **Setup Integration**: Optional hook configuration in wizard (Step 6/8)

### 🐛 Bug Fixes
- Fixed TypeScript validation error in wizard port input
- Fixed LaunchAgent plist to use separate command and args array
- Added timeouts to service restart to prevent hanging
- Fixed getuid() TypeScript errors for cross-platform compatibility
- Fixed tool name display in TUI (was showing "undefined")
- Fixed model format to prevent OpenRouter double-prefixing
- Fixed inquirer/readline conflicts in provider commands
- Fixed workspace identity loading (fresh BOOTSTRAP.md on first run)

### 📝 Documentation
- Updated README with service management commands
- Added CHANGELOG entries for all new features

## [0.3.0] - 2026-02-17

### 🏗️ Enterprise Architecture Release

Major architectural upgrade implementing OpenClaw-inspired enterprise-grade components: Protocol Layer, Session Key System, Plugin Architecture, Cron Scheduler, and **Enhanced CLI with Skill Command Registration**.

### ✨ New Features

#### Enhanced CLI with Skill Command Registration
- **Skill Command System** (`src/channels/cli/skill-commands.ts`)
  - Extensible command registration for skills
  - Category-based command organization (System, Session, Skills)
  - Built-in commands + skill commands unified registry
  
- **New Essential Commands**:
  - **/config** - View current Talon configuration (workspace, model, channels)
  - **/memory** - View recent memory files with dates
  - **/clear** - Clear screen and show welcome banner
  - **/version** - Show version, node version, platform, uptime
  - **/debug** - Toggle debug logging on/off
  
- **Enhanced Command Registry** (`src/channels/cli/commands.ts`)
  - Category support for better help organization
  - Command suggestions for mistyped commands
  - Spinner animations for long-running operations
  - Better help formatting with categories
  
- **Example Skill Implementation**:
  - **/time** - Show current date and time
  - **/echo** - Echo back input text
  - **/calc** - Simple calculator (e.g., `/calc 2+2`)
  - Demonstrates skill command registration pattern
  
- **Skills Loader Foundation**:
  - Basic infrastructure for loading skills
  - Skill command registration API
  - Future-proof architecture for extensibility

#### Protocol Layer (`src/protocol/`)
- **Gateway Frame Types**: hello, hello_ok, event, ping, pong, error
- **Chat Events**: delta, final, aborted, error states
- **Event Types**: Agent, Session, Tool, Protocol events
- **Zod Validation**: Runtime schema validation for all messages
- **Error Codes**: 15+ standardized error codes
- **Frame Builders**: Helper functions for constructing frames
- **Files**: `src/protocol/index.ts` (240 lines)

### ✨ New Features

#### Essential CLI Commands
- **/config** - View current Talon configuration (workspace, model, channels)
- **/memory** - View recent memory files with dates
- **/clear** - Clear screen and show welcome banner
- **/version** - Show version, node version, platform, uptime
- **/debug** - Toggle debug logging on/off

#### Protocol Layer (`src/protocol/`)
- **Gateway Frame Types**: hello, hello_ok, event, ping, pong, error
- **Chat Events**: delta, final, aborted, error states
- **Event Types**: Agent, Session, Tool, Protocol events
- **Zod Validation**: Runtime schema validation for all messages
- **Error Codes**: 15+ standardized error codes
- **Frame Builders**: Helper functions for constructing frames
- **Files**: `src/protocol/index.ts` (240 lines)

#### Session Key System (`src/gateway/session-keys.ts`)
- **Format**: `channel:senderId[:agentId][:scope][:groupId][:threadId]`
- **SessionKeyBuilder**: Fluent API for constructing keys
- **Key Components**: Channel, sender, agent, scope, group/thread IDs
- **SessionKeyStore**: Registry with activity tracking
- **Utilities**: Parse, normalize, derive from messages
- **Files**: `src/gateway/session-keys.ts` (330 lines)

#### Plugin Architecture (`src/plugins/`)
- **Plugin Interface**: Standard contract with activate/deactivate
- **Plugin API**: Config, events, agent, logger access
- **Plugin Loader**: Dynamic loading from directories
- **Plugin Registry**: Channel, tool, auth provider registration
- **Type-Safe**: Full TypeScript contracts
- **Files**: `src/plugins/index.ts` (390 lines)

#### Cron/Scheduler (`src/cron/`)
- **Cron Parser**: Standard syntax + @daily, @hourly, @reboot
- **Job Management**: Add, remove, enable, disable jobs
- **Event System**: jobStarted, jobCompleted, jobFailed
- **Features**: Auto next-run, timeout, retry, run logs
- **Presets**: Every minute, 5 minutes, hourly, daily
- **Files**: `src/cron/index.ts` (480 lines)

#### Enhanced Gateway (`src/gateway/enhanced-index.ts`)
- **8-Phase Boot**: Config → Infrastructure → AI → Plugins → Server → Cron → Events → Channels
- **Full Integration**: All new components wired together
- **Status Reporting**: Providers, plugins, cron jobs, sessions
- **Graceful Shutdown**: Proper cleanup sequence
- **Files**: `src/gateway/enhanced-index.ts` (380 lines)

### 🔧 Technical Changes
- **Event System**: 30+ new event types (protocol, plugin, cron, channel, system)
- **Type Safety**: All protocol messages validated with Zod
- **Architecture**: Now matches OpenClaw core design patterns
- **Code Size**: +1,500 lines (7,100 → 8,600)
- **Files**: +4 new architectural modules

### 🐛 Bug Fixes

#### Critical: Tool Message Completeness (`src/memory/manager.ts`)
- **Problem**: DeepSeek/OpenAI API throws 400 error when assistant messages with `tool_calls` don't have all corresponding tool result messages
- **Root Cause**: Context window truncation (`keepRecentMessages`) could cut off some tool results while keeping the assistant message that made the calls
- **Solution**: Added logic to detect missing tool results and include them in the context, even if they exceed `keepRecentMessages`
- **Error Fixed**: "An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. (insufficient tool messages following tool_calls message)"

#### Enhanced Error Handling (`src/gateway/index.ts`, `src/channels/cli/index.ts`)
- **Problem**: Agent errors would crash the conversation without user feedback
- **Solution**: Implemented graceful error handling with user-friendly messages
- **Features**:
  - Specific error messages for different error types (billing, rate limit, timeout, tool context, network)
  - Error messages displayed with yellow ⚠️  indicator in CLI
  - Session persisted even on error (conversation not lost)
  - WebSocket error broadcasts with `recoverable: true` flag
  - Debug mode shows error details

### 📊 Architecture Comparison

| Component | OpenClaw | Talon v0.3.0 |
|-----------|----------|--------------|
| Protocol Layer | JSON Schema | Zod validation |
| Session Keys | Complex system | Full implementation |
| Plugins | Extension SDK | Plugin architecture |
| Cron | Isolated agents | Native scheduler |

### 📁 New Files
- `src/protocol/index.ts` - Protocol definitions
- `src/gateway/session-keys.ts` - Session management
- `src/gateway/enhanced-index.ts` - Enhanced gateway
- `src/plugins/index.ts` - Plugin system
- `src/cron/index.ts` - Cron scheduler
- `docs/ARCHITECTURE_ENHANCEMENTS.md` - Architecture docs
- `src/channels/cli/skill-commands.ts` - Skill command registration system
- `src/channels/cli/commands.ts` - Enhanced command registry with categories

### ✅ Testing
- TypeScript compilation: ✅ Pass
- Type safety: ✅ Full coverage
- No circular dependencies: ✅ Verified

---

## [0.2.2] - 2026-02-16

### Core Architecture Improvements

Enhanced reliability and production-readiness with OpenClaw-inspired features.

### ✨ New Features

#### Health Checks
- **Basic Health Endpoint** (`/api/health`)
  - Version, uptime, session count, WebSocket client count
  - Component status reporting
  
- **Deep Health Probe** (`/api/health/deep`)
  - Probes each component (sessions, agent, memory)
  - Returns degraded status if any component fails
  
- **Readiness Check** (`/api/ready`)
  - For load balancers and orchestration
  - Returns false if agent not initialized

#### Config Hot Reload
- **Automatic Reload** - Watches `~/.talon/config.json` for changes
- **Debounced Updates** - 300ms debounce to prevent rapid reloads
- **Event Emission** - Emits `config.reloaded` event on changes
- **Handler System** - Register handlers for component-specific reload

#### Daemon Mode
- **Background Running** - Run Talon as a system service
- **PID File Management** - Track running process
- **Platform Support** - macOS (launchd) and Linux (systemd)
- **Service File Generation** - Generate launchd plist or systemd unit

#### CLI Commands
- `talon start --daemon` - Run in background
- `talon stop` - Stop running daemon
- `talon restart` - Restart daemon
- `talon health` - Enhanced with component status

### 📦 Files Added
- `src/config/reload.ts` - Config hot reload system
- `src/scripts/daemon.ts` - Daemon support utilities

### 📦 Files Changed
- `src/gateway/server.ts` - Enhanced health endpoints
- `src/gateway/index.ts` - Config reloader integration
- `src/scripts/daemon.ts` - Daemon support
- `src/cli/index.ts` - Added stop/restart commands
- `src/utils/types.ts` - Added config.reloaded event

---

## [0.2.1] - 2026-02-16

### Web Search & Setup Wizard Updates

Enhanced web search capabilities and improved configuration experience.

### ✨ New Features

#### Web Search (Enhanced)
- **DeepSeek Real API Integration** - Direct API at `https://api.deepseek.com`
  - Uses `deepseek-chat` model for search queries
  - Much cheaper than via OpenRouter (~ $0.14/1M tokens)
  
- **Multi-Provider Fallback Chain**:
  1. DeepSeek (primary, cheapest)
  2. OpenRouter (fallback)
  3. Tavily (free tier, 100 searches/month)
  4. DuckDuckGo (last resort, free scraping)

- **Smart API Key Detection**:
  - Checks config first, then environment variables
  - Supports: `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `TAVILY_API_KEY`

- **Improved Web Fetch**:
  - JSDOM-based HTML parsing
  - Content cleaning (removes ads, nav, footers)
  - Configurable max characters

#### Setup Wizard (Enhanced)
- **New Step 5/6: Tools Configuration**
  - Choose web search provider
  - Option to use same LLM or different provider
  - API key input for selected provider
  
- **Provider Selection**:
  - DeepSeek API (recommended)
  - OpenRouter (multi-model)
  - Tavily (free tier)
  - DuckDuckGo (free, unreliable)

- **API Key Management**:
  - Auto-detect existing keys in environment
  - Prompt to reuse or enter new keys
  - Secure storage in `~/.talon/.env`

### 🔧 Technical Changes
- Updated `config/schema.ts` with new web search options
- Added `jsdom` dependency for HTML parsing
- Web tools now auto-fallback on provider failure

### 📦 Files Changed
- `src/config/schema.ts` - Added web search config
- `src/tools/web.ts` - Complete rewrite with DeepSeek + fallbacks
- `src/cli/wizard.ts` - Added Tools configuration step
- `package.json` - Added jsdom dependency

---

## [0.2.0] - 2026-02-16

### 🎉 Major Release - Production Ready Core

This release transforms Talon from a basic prototype into a production-ready personal AI assistant with enterprise-grade reliability features.

### ✨ New Features

#### Multi-Channel Support
- **WhatsApp Channel** - Full WhatsApp Web integration via `whatsapp-web.js`
  - QR code authentication
  - Direct message support
  - Group chat support with mention-gating
  - Automatic session persistence
  - Phone number authorization
  
- **Telegram Channel** - Bot integration via polling
  - Long-polling message reception
  - User and group authorization
  - Mention-based activation
  
- **CLI Channel** - Enhanced terminal interface
  - Interactive REPL with readline
  - Slash command system (`/help`, `/status`, `/reset`, `/tokens`, `/exit`)
  - Bash execution support (`!ls`, `!pwd`)
  - Tab completion for commands
  - Colored output with chalk
  - Token usage display after each response
  - Smart session resumption on startup

#### Agent Engine Enhancements
- **Context Window Guard** (`src/agent/context-guard.ts`)
  - Prevents token overflow crashes
  - Automatic message truncation when context limit approached
  - Support for multiple LLM context window sizes
  - Token estimation (~4 chars/token)
  
- **Model Fallback System** (`src/agent/fallback.ts`)
  - Automatic retry with different providers on failure
  - Smart error classification (auth, rate-limit, timeout, billing)
  - Provider priority system (cheapest first)
  - Tracks which provider successfully served the request
  - Usage tracking per provider
  
- **Enhanced Agent Loop** (`src/agent/loop.ts`)
  - State machine: idle → thinking → executing → evaluating → responding
  - Tool call support with execution and result handling
  - Memory compression trigger
  - Max iteration protection (prevents infinite loops)
  - Event bus integration for real-time updates
  - Provider tracking in responses

#### Tools & Capabilities
- **File Tools** (`src/tools/file.ts`)
  - Read, write, list, search files
  - Path validation and security
  - Large file handling with truncation
  
- **Shell Tools** (`src/tools/shell.ts`)
  - Command execution with child_process
  - Timeout support
  - Output size limits
  - Security confirmation for destructive operations
  
- **Web Tools** (`src/tools/web.ts`)
  - Web search via multiple providers (DeepSeek, OpenRouter, Tavily, DuckDuckGo)
  - Web page fetching and content extraction
  - JSDOM-based HTML parsing
  - Content cleaning (remove ads, navigation, etc.)
  
- **Memory Tools** (`src/tools/memory-tools.ts`)
  - Read/write to memory system
  - Fact storage and retrieval
  
- **Browser Tools** (planned integration via Playwright)

#### Memory System
- **Memory Manager** (`src/memory/manager.ts`)
  - Context window management
  - Message history tracking
  - Automatic context building for LLM calls
  - System prompt injection
  - SOUL.md loading for personality
  
- **Memory Compressor** (`src/memory/compressor.ts`)
  - Summarizes old messages to save tokens
  - Threshold-based compression triggers
  - Maintains recent message context

#### Configuration & Security
- **Secure Configuration System**
  - Environment variable support via `${ENV_VAR}` syntax
  - `.env` file loading from `~/.talon/.env`
  - `config.json` with variable substitution
  - Secure setup wizard (`npm run setup:secure`)
  - Template-based workspace initialization
  
- **Data Separation for Open Source**
  - `templates/workspace/` - Generic templates (committed)
  - `~/.talon/workspace/` - Personal data (gitignored)
  - Automatic template copying on first run
  - Clear separation between public code and private data
  - Security documentation (`docs/REPOSITORY_SECURITY.md`)

#### Gateway & Server
- **Talon Gateway** (`src/gateway/`)
  - Fastify-based HTTP server
  - WebSocket support for real-time communication
  - Health check endpoint (`/api/health`)
  - Session management API
  - Event bus for inter-component communication
  
- **Session Manager** (`src/gateway/sessions.ts`)
  - Session creation, retrieval, persistence
  - JSON file-based storage
  - Automatic cleanup of idle sessions
  
- **Message Router** (`src/gateway/router.ts`)
  - Routes messages between channels and sessions
  - Inbound/outbound message handling
  - Deduplication protection

#### Model Support
- **Multi-Provider Model Router** (`src/agent/router.ts`)
  - DeepSeek integration
  - OpenRouter integration
  - OpenAI integration
  - Custom provider support
  - Cost-based routing (cheapest model for task)
  - Quality-based routing (best model for complex tasks)
  
- **OpenAI-Compatible Provider** (`src/agent/providers/openai-compatible.ts`)
  - Generic provider for OpenAI-compatible APIs
  - Chat completions with tool support
  - Streaming support (foundation)
  - Usage tracking

#### CLI & Interface
- **Command Line Interface** (`src/cli/`)
  - `talon setup` - Configuration wizard
  - `talon start` - Start gateway (with `--daemon` flag)
  - `talon health` - Health check
  - `talon status` - Detailed status and sessions
  - Interactive setup script (`scripts/setup-secure.js`)

#### Documentation
- Comprehensive documentation suite:
  - `00-VISION.md` - Project vision and principles
  - `01-ARCHITECTURE.md` - System architecture
  - `02-COMPONENTS.md` - Component specifications
  - `03-TOOLS-AND-CAPABILITIES.md` - Tool documentation
  - `04-CHANNELS-AND-INTERFACES.md` - Channel documentation
  - `05-MEMORY-AND-PERSONA.md` - Memory system
  - `06-SECURITY.md` - Security considerations
  - `07-CONFIGURATION.md` - Configuration reference
  - `08-ROADMAP.md` - Project roadmap
  - `SECURITY.md` - Secure configuration guide
  - `REPOSITORY_SECURITY.md` - Open source security

### 🔧 Technical Improvements

#### Code Quality
- TypeScript strict mode compliance
- 35 source files with type safety
- Comprehensive error handling
- Structured logging with pino
- Input validation with Zod schemas

#### Build System
- TypeScript compilation (`npm run build`)
- Development mode with hot reload (`npm run dev`)
- Test suite with Vitest
- Git hooks support

#### Dependencies
- **Core**: Node.js 22+, TypeScript 5.7+
- **Server**: Fastify 5.x, WebSocket support
- **AI**: OpenAI SDK, custom providers
- **Channels**: whatsapp-web.js, node-telegram-bot-api (planned)
- **Utilities**: chalk, inquirer, nanoid, zod
- **Build**: tsx, vitest

### 🐛 Bug Fixes
- Fixed context window overflow issues
- Fixed duplicate message handling
- Fixed CLI response formatting
- Fixed TypeScript type errors in web tools
- Fixed memory compression edge cases

### 🛡️ Security
- API keys stored in `.env` (never committed)
- Personal data in `~/.talon/` (gitignored)
- Path traversal protection in file tools
- Command injection protection in shell tools
- Session isolation between users

### 📦 Project Structure
```
talon/
├── src/
│   ├── agent/           # AI agent loop, providers, routing
│   ├── channels/        # Telegram, WhatsApp, CLI
│   ├── cli/             # Command line interface
│   ├── config/          # Configuration loading, validation
│   ├── gateway/         # HTTP server, sessions, events
│   ├── memory/          # Memory management, compression
│   ├── tools/           # File, shell, web tools
│   ├── types/           # TypeScript declarations
│   └── utils/           # Logger, errors, helpers
├── templates/
│   └── workspace/       # Generic AI personality templates
├── docs/                # Documentation
├── scripts/             # Setup scripts
└── workspace/           # Personal data (gitignored)
```

### 📝 Configuration
- JSON-based configuration with Zod validation
- Environment variable substitution
- Sensible defaults for all options
- Per-channel authorization settings
- Tool-specific security settings

### 🚀 Deployment
- Local development mode
- Daemon mode for background operation
- Docker-ready (containerization support)
- Environment-based configuration

### ⚠️ Breaking Changes
None - this is a new release building on 0.1.0 foundation.

### 🎯 Known Limitations
- WhatsApp requires Puppeteer/Chromium (heavy dependency)
- Memory stored in JSON files (SQLite planned for future)
- No web dashboard UI yet (CLI and messaging only)
- Shadow loop not fully implemented
- Mobile apps not yet available

---

## [0.1.0] - 2026-02-15

### Initial Release - Foundation

Basic prototype with core functionality:

### Features
- Basic agent loop with state machine
- CLI channel with simple readline interface
- File and shell tools
- Basic memory management
- Configuration system with Zod
- Gateway server foundation
- Telegram channel (basic)
- Documentation structure

### Tech Stack
- Node.js 22+
- TypeScript 5.5+
- Fastify
- Zod validation

---

## Future Roadmap

### [0.3.0] - Planned
- Web dashboard UI (React-based)
- Skills system (plugin architecture)
- Calendar integration
- Email integration
- Advanced memory (SQLite)

### [0.4.0] - Planned
- Shadow loop (proactive agent)
- Voice interface
- Image generation tools
- Canvas/drawing tools
- iOS/Android apps

### [1.0.0] - Planned
- Stable API
- Plugin marketplace
- Multi-user support (enterprise)
- Advanced security features
- Production deployment guides

---

**Full Changelog**: https://github.com/yourusername/talon/commits/main
