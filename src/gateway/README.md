# Feature: Talon Gateway System

## 1. Purpose
- Provides the main HTTP/WebSocket server that coordinates all AI assistant operations.
- Solves the problem of multi-channel communication (CLI, Telegram, WhatsApp) through a unified gateway.
- Exists as the central orchestration layer between user interfaces and the AI agent system.
- Does NOT handle: AI model inference (delegated to agent system), tool execution (delegated to tools), or memory storage (delegated to storage system).

## 2. Scope Boundaries
- Belongs inside: HTTP server management, WebSocket protocol handling, session lifecycle, message routing between channels.
- Must NEVER contain: AI model implementations, tool business logic, database schemas, or UI rendering.
- Dependencies: agent/ (for AI processing), memory/ (for context), tools/ (for capabilities), plugins/ (for extensions).
- Ownership boundaries: Gateway owns session state, WebSocket connections, and HTTP endpoints. Agent system owns AI reasoning. Tools own specific capabilities.

## 3. Architecture Overview
```
User Interface → Channel → Gateway → Session → Router → Agent Loop → Tools → Response
    ↑              ↑         ↑         ↑         ↑         ↑         ↑        ↓
WebSocket/HTTP  Protocol  Server   Manager   Message   State     Registry  User
```

Entry points:
- `TalonGateway.boot()` - Main initialization (8-phase boot)
- `TalonServer.start()` - HTTP/WebSocket server start
- `MessageRouter.route()` - Incoming message processing

Core modules:
- `TalonGateway`: Orchestrates all components (8-phase boot)
- `TalonServer`: Fastify HTTP server with WebSocket support
- `SessionManager`: Session lifecycle and persistence
- `MessageRouter`: Routes messages between channels/sessions
- `SessionKeyStore`: Session identification and key management
- `EventBus`: Internal pub/sub for component communication

State management: Session-based state in `SessionManager`, ephemeral WebSocket connections, persistent session storage in SQLite.

Data flow: WebSocket messages → protocol validation → session lookup → agent loop → tool execution → response streaming → WebSocket delta messages.

## 4. Folder Structure Explanation

**enhanced-index.ts** (611 lines)
- What: Main gateway class with 8-phase boot sequence
- Why: Coordinates all architectural components in proper initialization order
- Who calls: CLI entry point (`talon start`), service manager
- What calls: All subcomponents (agent, memory, tools, plugins, cron)
- Side effects: Starts HTTP server, WebSocket server, file watchers, cron jobs
- Critical assumptions: Config is valid, workspace exists, AI providers are reachable

**index.ts** (307 lines)
- What: Legacy gateway implementation (simpler version)
- Why: Backward compatibility, fallback if enhanced fails
- Who calls: CLI when `--simple` flag used
- What calls: Basic agent loop without plugins/cron
- Side effects: Starts server without architectural enhancements
- Critical assumptions: No plugin system needed, no cron jobs required

**server.ts** (591 lines)
- What: Fastify HTTP server with WebSocket support
- Why: Provides REST API and real-time WebSocket communication
- Who calls: `TalonGateway` during boot phase 7
- What calls: Health endpoints, WebSocket handlers, static file serving
- Side effects: Binds to port (default 19789), opens network connections
- Critical assumptions: Port is available, CORS configured correctly

**sessions.ts** (247 lines)
- What: Session management with SQLite persistence
- Why: Maintains conversation state across reconnects and restarts
- Who calls: `MessageRouter` for session lookup, `TalonGateway` for initialization
- What calls: SQLite database operations, event bus notifications
- Side effects: Creates SQLite database file, manages session cleanup
- Critical assumptions: SQLite is available, workspace directory is writable

**session-keys.ts** (359 lines)
- What: Session key generation and parsing system
- Why: Standardized session identification across channels
- Who calls: Channels when creating sessions, router when routing messages
- What calls: Key parsing utilities, normalization functions
- Side effects: None (pure functions)
- Critical assumptions: Key format follows `channel:senderId[:agentId][:scope][:groupId][:threadId]`

**router.ts** (97 lines)
- What: Message routing between channels and sessions
- Why: Decouples channel implementations from session handling
- Who calls: Channel implementations (CLI, Telegram, WhatsApp)
- What calls: `SessionManager` for session lookup, `AgentLoop` for processing
- Side effects: May create new sessions, emit routing events
- Critical assumptions: Messages have valid session keys, channels are registered

**events.ts** (50 lines)
- What: Event bus for internal component communication
- Why: Loose coupling between gateway components
- Who calls: All gateway components for publishing events
- What calls: Event listeners registered by components
- Side effects: Async event propagation, potential memory leaks if not cleaned up
- Critical assumptions: Event types are defined, listeners handle errors

**process-manager.ts** (323 lines)
- What: Process lifecycle management for daemon mode
- Why: Enables background service operation and graceful shutdown
- Who calls: CLI service commands (`talon service start/stop`)
- What calls: Child process spawning, PID file management, signal handlers
- Side effects: Creates PID files, spawns child processes, handles OS signals
- Critical assumptions: Platform supports daemonization (macOS/Linux), PID files are writable

## 5. Public API

**Exported classes:**
- `TalonGateway` (enhanced-index.ts)
- `TalonServer` (server.ts)
- `SessionManager` (sessions.ts)
- `MessageRouter` (router.ts)
- `SessionKeyStore` (session-keys.ts)
- `EventBus` (events.ts)

**Input types:**
- `SessionKey`: string following format `channel:senderId[:agentId][:scope][:groupId][:threadId]`
- `GatewayMessage`: Zod-validated protocol message
- `SessionConfig`: From TalonConfig with workspace and memory settings

**Output types:**
- `GatewayStatus`: Object with version, uptime, session count, component health
- `Session`: Object with id, key, messages, metadata, created/updated timestamps
- `WebSocketFrame`: Protocol-compliant WebSocket message

**Error behavior:**
- HTTP errors: 400 for bad requests, 404 for not found, 500 for server errors
- WebSocket errors: `error` frame type with `recoverable` flag
- Session errors: Session not found → create new, invalid key → 400 error
- Boot errors: Phase failure → log error and stop boot sequence

**Edge cases:**
- Duplicate WebSocket connections: Latest wins, previous closed
- Malformed session keys: Rejected with validation error
- Database corruption: Attempt recovery, fallback to new session
- Port already in use: Increment port or fail with clear error

**Idempotency notes:**
- Session creation: Idempotent for same session key
- Message routing: Idempotent with message ID deduplication
- Boot sequence: Not idempotent (multiple calls cause errors)
- Health checks: Idempotent (read-only)

## 6. Internal Logic Details

**Core algorithms:**
- Session key parsing: Regex-based parsing with component extraction
- Message deduplication: Message ID tracking within session window
- Connection management: WebSocket ping/pong for keepalive
- Boot sequencing: 8-phase sequential initialization with rollback on failure

**Important decision trees:**
1. Message arrival → Validate protocol → Extract session key → Find/create session → Route to agent → Stream response
2. Session lookup → Check memory cache → Check SQLite → Create if not found → Initialize with defaults
3. Boot failure → Log phase error → Attempt cleanup → Exit with error code

**Guardrails:**
- Max WebSocket connections: Configurable limit (default: 100)
- Session timeout: Inactive sessions cleaned up (default: 24h)
- Message rate limiting: Per-session message throttling
- Memory limits: Session message count capped (configurable)

**Validation strategy:**
- Protocol validation: Zod schemas for all WebSocket frames
- Session key validation: Format regex and component validation
- Input sanitization: Path traversal prevention, size limits
- Configuration validation: Zod schema on load

**Retry logic:**
- Database operations: 3 retries with exponential backoff
- WebSocket connections: Auto-reconnect with backoff
- Boot phase failures: No retry (fail fast)
- Missing: Circuit breaker pattern for external dependencies

## 7. Data Contracts

**Schemas used:**
- `GatewayMessageSchema`: Zod schema for WebSocket messages
- `SessionSchema`: Zod schema for session objects
- `HealthResponseSchema`: Zod schema for health endpoint
- `ConfigSchema`: Zod schema for gateway configuration

**Validation rules:**
- Session keys: Must match regex pattern, required components present
- WebSocket messages: Must have type, payload, optional metadata
- HTTP requests: Content-Type headers, body parsing
- Configuration: Required fields, type coercion, environment variable substitution

**Expected shape of objects:**
```typescript
Session: {
  id: string;
  key: string;
  messages: Array<Message>;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

GatewayMessage: {
  type: 'gateway.status' | 'session.create' | 'session.send_message' | ...;
  payload: any;
  metadata?: { messageId: string; timestamp: number; };
}
```

**Breaking-change risk areas:**
- WebSocket protocol: Changing frame types breaks clients
- Session key format: Changes break existing session lookup
- Database schema: Migration required for schema changes
- Configuration structure: Changes require config migration

## 8. Failure Modes

**Known failure cases:**
- SQLite database locked: Concurrent write attempts
- WebSocket buffer overflow: High message volume
- Memory exhaustion: Too many active sessions
- Port conflict: Another service using port 19789
- File permission issues: Workspace directory not writable

**Silent failure risks:**
- Event listeners not cleaned up: Memory leak
- Database writes failing: Session data loss
- WebSocket ping failures: Stale connections not detected
- Missing: Health check false positives (shows healthy when degraded)

**Race conditions:**
- Concurrent session creation: Duplicate sessions
- Message processing while session deletion: Null reference
- Database connection pool exhaustion: Deadlock
- WebSocket message ordering: Out-of-order delivery

**Memory issues:**
- Session message accumulation: Unbounded growth
- WebSocket connection pooling: Connection leak
- Event bus subscribers: Unsubscribed listeners
- Missing: Memory usage monitoring and alerts

**Performance bottlenecks:**
- SQLite queries: Unindexed session lookups
- WebSocket broadcast: O(n) operations
- Message serialization: Large message payloads
- Boot sequence: Sequential initialization blocking

## 9. Observability

**Logs produced:**
- Boot phase logs: INFO level with phase completion
- WebSocket events: DEBUG level with connection lifecycle
- Session operations: INFO level with create/update/delete
- Error events: ERROR level with stack traces
- Missing: Structured logging with request IDs

**Metrics to track:**
- Active sessions count
- WebSocket connections count
- Message throughput (messages/second)
- Response latency (p50, p95, p99)
- Error rate by type
- Boot time per phase
- Missing: Export to metrics system (Prometheus)

**Debug strategy:**
1. Enable debug logging: `DEBUG=gateway:*` environment variable
2. Check health endpoint: `GET /api/health/deep`
3. Inspect SQLite database: `sqlite3 ~/.talon/sessions.db`
4. WebSocket test client: `npm run ws` (interactive test)
5. Session dump: Gateway status shows session list

**How to test locally:**
1. Start gateway: `npm start` or `talon start`
2. Test WebSocket: `npm run ws` then send test commands
3. Test HTTP: `curl http://localhost:19789/api/health`
4. Test session: Create session, send message, verify response
5. Integration tests: `npm run test:gateway`

## 10. AI Agent Instructions

**How an AI agent should modify this feature:**
1. Read ALL gateway files before making changes
2. Understand the 8-phase boot sequence dependencies
3. Test WebSocket protocol compatibility
4. Verify session persistence still works
5. Run gateway integration tests

**What files must be read before editing:**
- `enhanced-index.ts`: Boot sequence and component wiring
- `server.ts`: HTTP/WebSocket server implementation
- `sessions.ts`: Session persistence logic
- `session-keys.ts`: Key format and parsing
- `protocol/index.ts`: WebSocket protocol definitions

**Safe refactoring rules:**
1. Keep WebSocket protocol backward compatible
2. Maintain session key format compatibility
3. Preserve 8-phase boot order
4. Don't break SQLite schema without migration
5. Keep event bus interface stable

**Forbidden modifications:**
- Changing WebSocket protocol without client updates
- Modifying session key format without migration path
- Removing phase from boot sequence without replacement
- Breaking Zod schema validation
- Removing SQLite without data migration

## 11. Extension Points

**Where new functionality can be safely added:**
- New WebSocket event types: Add to protocol schema
- Additional health checks: Extend `server.ts` health endpoints
- Custom session metadata: Extend `Session` type with optional fields
- New boot phases: Insert in `enhanced-index.ts` with proper dependencies
- Additional event types: Add to `EventBus` type definitions

**How to extend without breaking contracts:**
1. Add optional fields to existing schemas
2. Use feature flags for new functionality
3. Provide backward compatibility shims
4. Version WebSocket protocol
5. Use migration scripts for data changes

## 12. Technical Debt & TODO

**Weak areas:**
- Missing connection pooling for SQLite (single connection)
- No circuit breaker for external dependencies
- Limited WebSocket message size validation
- Boot sequence not parallelizable
- Missing: Graceful degradation under load

**Refactor targets:**
- Extract boot phases to separate configurable modules
- Implement connection pool for SQLite
- Add protocol versioning for WebSocket
- Extract session cleanup to background job
- Missing: Dependency injection for testability

**Simplification ideas:**
- Merge `index.ts` and `enhanced-index.ts` with feature flags
- Simplify session key format (remove unused components)
- Reduce boot phases where dependencies allow
- Consolidate event types (currently fragmented)
- Missing: Configuration-driven component enable/disable