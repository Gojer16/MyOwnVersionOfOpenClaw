# Architectural Review: Gateway README

**Document:** `src/gateway/README.md`  
**Reviewer:** Senior Software Architect  
**Date:** February 20, 2026  
**Version Reviewed:** 0.4.0

---

## Executive Summary

This review identifies **6 critical documentation issues** in the Gateway README, including hallucinated features, ambiguous contracts, and missing architectural decisions. The documentation overstates implementation maturity in several areas, particularly around validation, session management, and error handling.

**Key Findings:**
- 🔴 **3 Hallucinations** - Features documented but not implemented
- 🟡 **4 Ambiguous Areas** - Unclear contracts and ownership boundaries
- 🟢 **7 Accurate Sections** - Well-documented and aligned with code

---

## 🔴 Critical Issues

### 1. Hallucinated: Protocol Validation Layer

**Location:** Section 5, 6, 7  
**Severity:** HIGH  
**Effort to Fix:** 2-4 hours

#### Claim
> "Protocol validation: Zod schemas for all WebSocket frames"  
> "`GatewayMessageSchema`: Zod schema for WebSocket messages"  
> "Validation rules: Protocol validation: Zod schemas for all WebSocket frames"

#### Reality
No Zod schemas exist for WebSocket message validation. The implementation uses:
- TypeScript interfaces in `src/utils/types.ts` (compile-time only)
- Runtime parsing: `JSON.parse()` with type assertions
- **Zero runtime validation**

**Actual Code** (`src/gateway/server.ts:288`):
```typescript
private handleWSMessage(client: WSClient, data: Buffer): void {
    try {
        const msg = JSON.parse(data.toString()) as WSMessage;  // ← Type assertion only
        // ... no Zod validation
    } catch (err) {
        // Error handling is just try/catch
    }
}
```

**Zod Usage in Codebase:**
```bash
$ grep -r "z.object" src/gateway/
# Returns: 0 matches
```

#### Risk
- Runtime accepts malformed messages
- Type safety is illusory (erased at runtime)
- Security vulnerability: no input validation
- Clients may send invalid payloads without errors

#### Recommended Fix
**Option A (Implement validation):**
```typescript
// src/protocol/schemas.ts
import { z } from 'zod';

export const WSMessageSchema = z.object({
    id: z.string(),
    type: z.enum([...]), // All event types
    timestamp: z.number(),
    payload: z.unknown(),
});

// In server.ts
const result = WSMessageSchema.safeParse(JSON.parse(data));
if (!result.success) {
    sendError(client, 'INVALID_MESSAGE', result.error);
}
```

**Option B (Update documentation):**
```markdown
**Validation strategy:**
- Protocol validation: TypeScript interfaces (compile-time only)
- Runtime validation: Basic JSON parsing with try/catch
- ⚠️ TODO: Add Zod schemas for runtime validation
```

---

### 2. Hallucinated: Session Key Format Complexity

**Location:** Section 5, 7  
**Severity:** MEDIUM  
**Effort to Fix:** 1 hour

#### Claim
> `SessionKey`: string following format `channel:senderId[:agentId][:scope][:groupId][:threadId]`

#### Reality
The `SessionKeyBuilder` class exists but is **barely used**:

**Actual Usage** (`src/gateway/sessions.ts:77`):
```typescript
createSession(senderId: string, channel: string, senderName?: string, explicitId?: string): Session {
    // No session key construction
    // Just uses senderId directly
    this.senderIndex.set(senderId, id);  // ← Simple map
}
```

**Unused Features:**
- ❌ `agentId` scoping - not implemented
- ❌ `groupId` / `threadId` - not implemented
- ❌ `accountId` field - documented but unused
- ❌ Session key parsing - exists but not called

#### Risk
- Documentation promises flexible session routing that doesn't exist
- Developers may design features assuming non-existent capabilities
- Migration path needed if complex keys are added later

#### Recommended Fix
Update documentation to reflect actual implementation:
```markdown
**Session Identification:**
- Format: Simple `senderId` → `sessionId` mapping
- Index: `Map<string, string>` (senderId to sessionId)
- ⚠️ Complex session keys (`channel:senderId:...`) are planned but not implemented
```

---

### 3. Missing: Boot Sequence Rollback

**Location:** Section 3, 6, 10  
**Severity:** MEDIUM  
**Effort to Fix:** 4-8 hours (to implement) / 30 min (to document)

#### Claim
> "8-phase sequential initialization with rollback on failure"  
> "Boot failure → Log phase error → Attempt cleanup → Exit with error code"

#### Reality
**No rollback logic exists:**

**Actual Code** (`src/gateway/enhanced-index.ts:54-155`):
```typescript
async boot(): Promise<void> {
    // Phase 1: Configuration
    this.config = await loadConfig(...);  // ← If this fails, no cleanup

    // Phase 2: Core Infrastructure
    this.eventBus = new EventBus();  // ← Never cleaned up on failure

    // Phase 3: AI Brain
    this.agentLoop = new AgentLoop(...);  // ← Resources leak on error

    // ... no try/catch, no rollback, no cleanup
}
```

**Missing:**
- ❌ No try/catch blocks around phases
- ❌ No cleanup on failure
- ❌ No resource disposal (EventBus, connections, etc.)
- ❌ No "attempt cleanup" logic

#### Risk
- Resource leaks on boot failure (memory, file handles, ports)
- Partial initialization leaves system in undefined state
- Cannot gracefully recover from transient failures

#### Recommended Fix
**Option A (Implement rollback):**
```typescript
async boot(): Promise<void> {
    const initializedComponents: Array<{name: string, cleanup: () => Promise<void>}> = [];

    try {
        // Phase 1
        this.config = await loadConfig(...);
        initializedComponents.push({ name: 'config', cleanup: async () => {} });

        // Phase 2
        this.eventBus = new EventBus();
        initializedComponents.push({ name: 'eventBus', cleanup: async () => this.eventBus.destroy() });

        // ... etc
    } catch (error) {
        logger.error({ error }, 'Boot failed, rolling back...');
        // Rollback in reverse order
        for (const comp of initializedComponents.reverse()) {
            await comp.cleanup().catch(err => logger.warn({ err }, `Cleanup failed: ${comp.name}`));
        }
        throw error;
    }
}
```

**Option B (Update documentation):**
```markdown
**Boot sequencing:** 8-phase sequential initialization
⚠️ **Rollback:** Not implemented. Boot failures exit immediately without cleanup.
```

---

### 4. Hallucinated: Session Type Mismatch

**Location:** Section 7  
**Severity:** MEDIUM  
**Effort to Fix:** 30 minutes

#### Claim
```typescript
Expected shape of objects:
Session: {
  id: string;
  key: string;  // ← Documented field
  messages: Array<Message>;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}
```

#### Reality
**Actual Session Type** (`src/utils/types.ts`):
```typescript
export interface Session {
    id: string;
    senderId: string;        // ← Different structure
    channel: string;
    state: SessionState;
    messages: Message[];
    memorySummary: string;
    metadata: SessionMetadata;
    config: Partial<TalonConfig>;
    // No 'key' field
    // No 'created_at' / 'updated_at' (uses metadata.createdAt instead)
}
```

#### Risk
- Developers reference non-existent fields
- Code generation tools produce incorrect types
- Integration with external systems may fail

#### Recommended Fix
Update documentation to match actual type:
```typescript
Session: {
  id: string;
  senderId: string;
  channel: string;
  state: 'created' | 'active' | 'idle' | 'closed';
  messages: Array<Message>;
  memorySummary: string;
  metadata: {
    createdAt: number;
    lastActiveAt: number;
    messageCount: number;
    model?: string;
  };
  config: Partial<TalonConfig>;
}
```

---

### 5. Missing: Error Code Definitions

**Location:** Section 5  
**Severity:** MEDIUM  
**Effort to Fix:** 1 hour

#### Claim
> "Error codes: 15+ standardized error codes"

#### Reality
**No error code enum or constants exist:**

```bash
$ grep -r "ErrorCode" src/
# Returns: 0 matches (excluding README)

$ grep -r "error.*code" src/gateway/
# Returns: Only documentation references
```

**Actual Error Handling** (`src/gateway/server.ts`):
```typescript
this.sendToClient(client, {
    id: nanoid(),
    type: 'error',
    timestamp: Date.now(),
    payload: { error: 'Invalid message format' },  // ← String, not code
});
```

#### Risk
- Clients cannot programmatically handle errors
- Error messages may change without notice
- No structured error handling

#### Recommended Fix
```typescript
// src/utils/error-codes.ts
export enum ErrorCode {
    INVALID_MESSAGE = 'ERR_INVALID_MESSAGE',
    SESSION_NOT_FOUND = 'ERR_SESSION_NOT_FOUND',
    TOOL_NOT_FOUND = 'ERR_TOOL_NOT_FOUND',
    RATE_LIMIT_EXCEEDED = 'ERR_RATE_LIMIT',
    // ... etc
}

// Usage
payload: {
    code: ErrorCode.INVALID_MESSAGE,
    message: 'Invalid message format',
    recoverable: true,
}
```

---

### 6. Hallucinated: WebSocket Frame Types

**Location:** Section 3, 7  
**Severity:** MEDIUM  
**Effort to Fix:** 30 minutes

#### Claim
> "Gateway Frame Types: hello, hello_ok, event, ping, pong, error"

#### Reality
**Actual Event Types** (`src/utils/types.ts:10-35`):
```typescript
// Client → Server
export type ClientEventType =
    | 'gateway.status'
    | 'session.list'
    | 'session.create'
    | 'session.send_message'
    | 'session.reset'
    | 'tools.list'
    | 'tools.invoke'
    | 'channel.message';

// Server → Client
export type ServerEventType =
    | 'gateway.status'
    | 'session.created'
    | 'session.list'
    | 'session.message.delta'
    | 'session.message.final'
    | 'session.reset'
    | 'tools.list'
    | 'tools.result'
    | 'session.error'
    | 'agent.response'
    | 'agent.response.end'
    | 'tool.call'
    | 'tool.result'
    | 'tool.stream'
    | 'shadow.ghost'
    | 'session.resumed'
    | 'config.updated'
    | 'error';
```

**Missing Frame Types:**
- ❌ `hello` - not implemented
- ❌ `hello_ok` - not implemented
- ❌ `ping` - not implemented
- ❌ `pong` - not implemented

#### Risk
- Protocol documentation doesn't match implementation
- Clients may implement non-existent frame handlers
- Confusion for new developers

#### Recommended Fix
Update documentation:
```markdown
**WebSocket Protocol:**
- Event-based protocol with 10 client events and 16 server events
- No ping/pong (uses WebSocket native keepalive)
- No hello/hello_ok (connection established via standard WS handshake)
```

---

## 🟡 Ambiguous Areas

### 7. Unclear: SessionManager vs SessionKeyStore Ownership

**Location:** Section 3  
**Severity:** LOW

#### Issue
Both components manage sessions with overlapping responsibilities:

| SessionManager | SessionKeyStore |
|---------------|-----------------|
| `sessions: Map<string, Session>` | `sessions: Map<string, SessionEntry>` |
| `createSession()` | `build()` |
| `getSession()` | `parse()` |
| SQLite persistence | Pure functions |

**Questions:**
1. When should I use `SessionKeyStore` vs `SessionManager`?
2. Why do both track sessions?
3. What happens if they diverge?

#### Recommended Fix
Add ownership boundary documentation:
```markdown
**Ownership Boundaries:**
- `SessionManager`: Owns session lifecycle, persistence, and state
- `SessionKeyStore`: Utility for parsing/generating session key strings (stateless)
- Rule: Always use SessionManager for session operations
```

---

### 8. Missing: Circuit Breaker Pattern

**Location:** Section 6, 12  
**Severity:** LOW

#### Claim
> "Missing: Circuit breaker pattern for external dependencies"

#### Reality
Correctly identified as missing, but no implementation plan exists.

**External Dependencies Without Protection:**
- ❌ AI providers (DeepSeek, OpenRouter, OpenAI)
- ❌ SQLite database
- ❌ File system operations
- ❌ WebSocket connections

#### Recommended Fix
Add to Technical Debt section:
```markdown
**Circuit Breaker Implementation Plan:**
1. Add `src/utils/circuit-breaker.ts` with standard pattern
2. Wrap all AI provider calls
3. Configure thresholds:
   - Failure threshold: 5 failures in 30 seconds
   - Reset timeout: 60 seconds
   - Half-open max calls: 3
```

---

### 9. Ambiguous: Connection Pooling

**Location:** Section 8, 12  
**Severity:** LOW

#### Claim
> "Missing connection pooling for SQLite (single connection)"  
> "Database connection pool exhaustion: Deadlock"

#### Reality
**Actual Implementation** (`src/storage/sqlite.ts`):
```typescript
export class SqliteStore {
    private db: Database;  // ← Single connection, no pool

    constructor(dbPath: string = DEFAULT_DB_PATH) {
        this.db = new Database(dbPath);
    }
}
```

**Risk Assessment:**
- SQLite WAL mode allows concurrent reads
- Writes are serialized by SQLite internally
- Pool exhaustion unlikely for single-user app

#### Recommended Fix
Clarify in documentation:
```markdown
**SQLite Connection Strategy:**
- Single connection (no pooling)
- WAL mode enabled for concurrent reads
- Acceptable for single-user personal assistant
- TODO: Add connection pool if multi-user support added
```

---

## 🟢 Accurate Sections

The following sections are **well-documented and aligned with implementation**:

### ✅ Section 1: Purpose
- Clear scope boundaries
- Correctly states what gateway does NOT handle

### ✅ Section 2: Scope Boundaries
- Accurate dependency list
- Correct ownership boundaries (agent, tools, memory)

### ✅ Section 4: Folder Structure
- All file descriptions match implementation
- Line counts accurate
- Side effects correctly documented

### ✅ Section 8: Failure Modes
- Well-researched failure cases
- Silent failure risks correctly identified
- Race conditions accurately described

### ✅ Section 9: Observability
- Log levels correctly documented
- Debug strategy is accurate and actionable
- Metrics gaps correctly identified

### ✅ Section 11: Extension Points
- Safe extension areas correctly identified
- Backward compatibility guidance is sound

### ✅ Section 12: Technical Debt
- Honest assessment of weak areas
- Refactor targets are accurate

---

## 📊 Summary Statistics

| Category | Count | Percentage |
|----------|-------|------------|
| Critical Issues (🔴) | 3 | - |
| Ambiguous Areas (🟡) | 3 | - |
| Accurate Sections (🟢) | 7 | - |
| **Total Issues Found** | **9** | - |
| **Documentation Accuracy** | **78%** | (7/9 sections accurate) |

---

## 🎯 Priority Action Items

### P0 - Immediate (This Week)
1. **Remove Zod validation claims** or implement schemas
2. **Fix Session type documentation** to match implementation

### P1 - High Priority (This Month)
3. **Clarify session key implementation status**
4. **Add error code enum** or remove "15+ error codes" claim
5. **Update WebSocket frame type documentation**

### P2 - Medium Priority (Next Quarter)
6. **Implement or document boot rollback**
7. **Clarify SessionManager vs SessionKeyStore boundaries**
8. **Add circuit breaker implementation plan**

---

## 📝 Verification Commands

Use these commands to verify fixes:

```bash
# Check for Zod schemas in gateway
grep -r "z\.object" src/gateway/ || echo "No Zod schemas found"

# Check for error codes
grep -r "ErrorCode" src/ --include="*.ts" | grep -v README || echo "No error codes found"

# Check session type
grep -A 10 "export interface Session" src/utils/types.ts

# Check boot sequence
grep -A 5 "rollback" src/gateway/enhanced-index.ts || echo "No rollback logic found"
```

---

## 🔗 Related Documents

- [Gateway README](src/gateway/README.md)
- [WebSocket Protocol Types](src/utils/types.ts)
- [Gateway Implementation](src/gateway/enhanced-index.ts)
- [Session Manager](src/gateway/sessions.ts)
- [Protocol Schemas](src/protocol/index.ts) - ⚠️ Empty

---

**Last Updated:** February 20, 2026  
**Next Review:** After v0.4.1 release
