# Feature: Talon Shadow Loop System

## 1. Purpose
- Provides proactive intelligence by monitoring filesystem changes and sending helpful suggestions before users ask.
- Solves the problem of passive AI assistance by enabling the agent to observe and react to user activities.
- Exists as the "proactive assistant" that anticipates needs based on observed behavior.
- Does NOT handle: Direct user interaction (channels), AI reasoning (agent), configuration management (config), or tool execution (tools).

## 2. Scope Boundaries
- Belongs inside: Filesystem monitoring, event filtering, heuristic evaluation, proactive messaging.
- Must NEVER contain: AI model logic, user interface components, session management, or business logic.
- Dependencies: utils/ (for logging), chokidar (for file watching), gateway/ (for message delivery).
- Ownership boundaries: Shadow owns observation and suggestion generation. Gateway owns message delivery. Agent owns whether to act on suggestions.

## 3. Architecture Overview
```
Filesystem → Watcher → Events → Heuristic Engine → Filtered Events → Ghost Messenger → Gateway → User
    ↑          ↑         ↑           ↑                  ↑                ↑              ↑        ↑
chokidar    Monitor   Raw events   Rule-based       Interesting      Proactive       Route     Receive
            (add/     (path,       evaluation       events only     messages        message   suggestion
            change/   type,                         (test files,    ("Need help?",  to
            unlink)   timestamp)                    new .ts files)  "Need tests?")  session
```

Entry points:
- `ShadowLoop.start()` - Main initialization and watcher start
- `FilesystemWatcher.watch()` - Begin filesystem monitoring
- `HeuristicEngine.evaluate()` - Process filesystem events
- `GhostMessenger.send()` - Send proactive messages

Core modules:
- `FilesystemWatcher`: chokidar-based file monitoring with configurable paths
- `HeuristicEngine`: Rule-based event evaluation with customizable heuristics
- `GhostMessenger`: Proactive message queuing and delivery system
- `ShadowLoop`: Main orchestrator connecting all components
- `HeuristicRegistry`: Built-in and custom heuristic definitions

State management: Watcher state (watching/not watching), message queue (pending suggestions), heuristic registry (active rules).

Data flow: Filesystem event → watcher capture → heuristic evaluation → if interesting → generate message → queue message → deliver to gateway → user receives suggestion.

## 4. Folder Structure Explanation

**index.ts** (74 lines)
- What: Main Shadow Loop orchestrator and public API
- Why: Coordinates all shadow components and provides unified interface
- Who calls: Gateway during initialization when shadow loop enabled
- What calls: FilesystemWatcher, HeuristicEngine, GhostMessenger
- Side effects: Starts file watching, registers heuristics, connects components
- Critical assumptions: Config enables shadow loop, file system accessible, chokidar works

**watcher.ts** (47 lines)
- What: Filesystem monitoring using chokidar library
- Why: Detects file changes (add, change, unlink) in configured paths
- Who calls: ShadowLoop during initialization
- What calls: chokidar library, emits events to heuristic engine
- Side effects: Creates file watchers, consumes system resources (inotify/fsevents)
- Critical assumptions: chokidar installed, file system supports watching, permissions allow access

**heuristics.ts** (53 lines)
- What: Rule-based event evaluation engine
- Why: Filters filesystem events to find interesting patterns worth commenting on
- Who calls: FilesystemWatcher when events occur
- What calls: Heuristic test functions, message generation functions
- Side effects: Evaluates events, generates proactive messages
- Critical assumptions: Heuristics are well-defined, test functions efficient

**ghost.ts** (32 lines)
- What: Proactive message delivery system
- Why: Queues and sends suggestions to users without being asked
- Who calls: HeuristicEngine when interesting events found
- What calls: Gateway message delivery, logging system
- Side effects: Sends messages to users, maintains message history
- Critical assumptions: Gateway can receive messages, users want suggestions

**types.ts** (25 lines)
- What: TypeScript type definitions for shadow system
- Why: Provides type safety and clear interfaces between components
- Who calls: All shadow components for type definitions
- What calls: TypeScript compiler, provides IntelliSense
- Side effects: None (compile-time only)
- Critical assumptions: Types accurately reflect runtime behavior

## 5. Public API

**Exported classes:**
- `ShadowLoop` - Main orchestrator class
- `FilesystemWatcher` - Filesystem monitoring
- `HeuristicEngine` - Event evaluation engine
- `GhostMessenger` - Proactive message delivery
- `builtInHeuristics` - Default heuristic rules

**Input types:**
- `WatcherConfig`: {paths: string[], ignored?: string[], enabled?: boolean}
- `WatchEvent`: {type: 'add' | 'change' | 'unlink', path: string, timestamp: number}
- `Heuristic`: {name: string, test: (event) => boolean, generate: (event) => GhostMessage}
- `GhostMessage`: {message: string, context: Record<string, unknown>, priority: 'low' | 'medium' | 'high'}

**Output types:**
- `ShadowLoopStatus`: {enabled: boolean, watchingPaths: string[], messageCount: number}
- `WatchEvent`: Processed filesystem event
- `GhostMessage`: Proactive suggestion for user
- `HeuristicResult`: Evaluation result with match boolean and generated message

**Error behavior:**
- File watcher errors: Logs error, continues with remaining paths
- Heuristic errors: Logs error, skips heuristic, continues evaluation
- Message delivery errors: Logs error, message remains in queue for retry
- Configuration errors: Disables shadow loop with clear error message
- Permission errors: Logs warning, skips inaccessible paths

**Edge cases:**
- No interesting events: No messages generated (silent operation)
- Rapid file changes: Debouncing handled by chokidar
- Network filesystems: May not support watching (falls back to polling)
- Large directories: Performance impact, configurable ignore patterns
- Symbolic links: Follows based on chokidar configuration

**Idempotency notes:**
- Event watching: Not idempotent (multiple watchers duplicate events)
- Heuristic evaluation: Idempotent for same event
- Message sending: Not idempotent (duplicate messages to user)
- Configuration: Idempotent (same config → same behavior)
- Start/stop: Idempotent (start on started = no-op, stop on stopped = no-op)

## 6. Internal Logic Details

**Core algorithms:**
- File watching: chokidar with configurable ignore patterns and polling fallback
- Heuristic matching: Sequential evaluation of registered heuristics (first match wins)
- Message prioritization: Priority levels (low/medium/high) for message delivery ordering
- Event filtering: Path pattern matching, file extension checking, change type discrimination
- Context preservation: Event metadata included in generated messages

**Important decision trees:**
1. Filesystem event → Check ignore patterns → If ignored → Skip, Else → Pass to heuristics
2. Heuristic evaluation → Test each heuristic → First match → Generate message → Send via ghost
3. Message delivery → Check priority → Queue message → Deliver to gateway → Log result
4. Configuration validation → Check paths exist → Check permissions → Start watching → Log status

**Guardrails:**
- Ignore patterns: Default excludes node_modules, dist, .git
- Rate limiting: Configurable cooldown between messages per path
- Priority limits: High priority messages limited to prevent spam
- Path validation: Only watches existing, accessible directories
- Resource limits: Configurable maximum watchers and event queue size
- Missing: User preference storage (opt-out per heuristic)

**Validation strategy:**
- Path validation: Existence check, permission check, symbolic link resolution
- Heuristic validation: Test function returns boolean, generate function returns message
- Configuration validation: Paths array non-empty, ignored patterns valid globs
- Event validation: Path exists, type valid, timestamp reasonable
- Missing: Heuristic performance monitoring

**Retry logic:**
- File watcher errors: Automatic restart with exponential backoff
- Message delivery failures: Retry queue with limited attempts
- Heuristic evaluation errors: Skip failed heuristic, continue with others
- Configuration reload: Watcher restart on config changes
- Missing: Circuit breaker for persistent failures

## 7. Data Contracts

**Schemas used:**
- `WatcherConfigSchema`: Zod schema for watcher configuration
- `WatchEventSchema`: Zod schema for filesystem events
- `GhostMessageSchema`: Zod schema for proactive messages
- `HeuristicSchema`: Zod schema for heuristic definitions

**Validation rules:**
- Watch paths: Must be non-empty array of strings, valid paths
- Ignore patterns: Array of glob patterns, optional
- Event types: Must be 'add', 'change', or 'unlink'
- Message priority: Must be 'low', 'medium', or 'high'
- Heuristic functions: Must be callable, return correct types

**Expected shape of objects:**
```typescript
WatcherConfig: {
  paths: string[];           // e.g., ['~/projects', './src']
  ignored?: string[];        // e.g., ['**/node_modules/**', '**/.git/**']
  enabled?: boolean;         // default: true
}

GhostMessage: {
  message: string;           // e.g., "I see you created src/utils.ts. Need tests?"
  context: {                 // Event metadata
    path: string;
    type: 'test' | 'new-file' | 'typescript' | string;
    timestamp?: number;
  };
  priority: 'low' | 'medium' | 'high';
}

Heuristic: {
  name: string;              // e.g., 'new-typescript-file'
  test: (event: WatchEvent) => boolean;
  generate: (event: WatchEvent) => GhostMessage | null;
}
```

**Breaking-change risk areas:**
- Heuristic interface: Changing test/generate signature breaks existing heuristics
- Message format: Changing GhostMessage structure breaks gateway integration
- Event format: Changing WatchEvent structure breaks heuristic evaluation
- Configuration format: Changing WatcherConfig breaks existing configs
- API exports: Changing public API breaks dependent code

## 8. Failure Modes

**Known failure cases:**
- File system watcher limits: OS inotify/fsevents limits exceeded
- Network filesystem: Watching not supported (e.g., NFS, SMB)
- Permission denied: Cannot watch protected directories
- Symbolic link cycles: Infinite recursion in directory traversal
- Heuristic infinite loop: Buggy test function never returns
- Memory exhaustion: Unbounded event or message queue growth

**Silent failure risks:**
- Watcher stops: File system events missed without notification
- Heuristic mis-match: Interesting events not detected
- Message loss: Proactive suggestions not delivered
- Configuration drift: Actual watched paths differ from config
- Missing: Health monitoring for shadow loop

**Race conditions:**
- Concurrent file operations: Multiple rapid events cause duplicate messages
- Configuration changes during watch: Inconsistent state
- Heuristic registration during evaluation: Missing or duplicate evaluation
- Message delivery during queue clear: Lost messages
- Missing: Locking for shared state

**Memory issues:**
- Event queue growth: Unbounded accumulation during high activity
- Message queue growth: Undelivered messages accumulate
- Heuristic registry: Large number of heuristics consumes memory
- Watcher instances: Multiple watchers not cleaned up
- Missing: Memory usage monitoring and limits

**Performance bottlenecks:**
- Heuristic evaluation: O(n) sequential testing for each event
- File watching: OS-dependent performance (inotify vs polling)
- Message delivery: Network latency to gateway
- Large directory trees: Initial scan and ongoing monitoring overhead
- Regex pattern matching: Complex ignore patterns slow evaluation

## 9. Observability

**Logs produced:**
- Watcher lifecycle: INFO level with start/stop and path counts
- Event detection: DEBUG level with event type and path (sanitized)
- Heuristic matches: INFO level with heuristic name and generated message
- Message delivery: DEBUG level with message and delivery result
- Error events: ERROR level with error details and context
- Missing: Performance metrics for heuristic evaluation

**Metrics to track:**
- Event rate (events per second by type)
- Heuristic match rate (percentage of events generating messages)
- Message delivery success rate
- Queue sizes (event queue, message queue)
- Watcher health (uptime, restart count)
- Resource usage (memory, file descriptors)
- Missing: User engagement with suggestions

**Debug strategy:**
1. Enable shadow debug: `DEBUG=shadow:*` environment variable
2. Check watcher status: ShadowLoop.getWatcher() status
3. Test heuristics: Manual event injection and evaluation
4. Monitor messages: GhostMessenger.getMessages() queue
5. Verify configuration: Actual watched paths vs configured
6. Performance profiling: Heuristic evaluation timing

**How to test locally:**
1. Unit tests: `npm test src/shadow/` (coverage: 85.8%)
2. Integration: Start shadow loop, create/modify files, verify messages
3. Heuristic testing: Create custom heuristics, test with sample events
4. Performance: Simulate high file event rate, monitor resource usage
5. Error handling: Test with invalid paths, permission errors
6. Configuration: Test different path patterns and ignore rules

## 10. AI Agent Instructions

**How an AI agent should modify this feature:**
1. Understand the heuristic pattern before adding new heuristics
2. Test file watching behavior on target platforms
3. Verify message delivery integration with gateway
4. Check performance impact of new heuristics
5. Run shadow tests before committing changes

**What files must be read before editing:**
- `index.ts`: Overall architecture and component wiring
- `heuristics.ts`: Heuristic interface and built-in examples
- `watcher.ts`: File watching implementation and limitations
- `ghost.ts`: Message delivery system
- Configuration schema for shadow settings

**Safe refactoring rules:**
1. Keep heuristic interface backward compatible
2. Maintain message format compatibility with gateway
3. Preserve event structure for existing heuristics
4. Don't break configuration file format
5. Keep error handling consistent across components

**Forbidden modifications:**
- Changing heuristic test/generate signature without migration
- Breaking GhostMessage format without gateway updates
- Removing built-in heuristics without replacement
- Changing event structure without heuristic updates
- Breaking configuration without migration path

## 11. Extension Points

**Where new functionality can be safely added:**
- New heuristics: Add to heuristics.ts or register dynamically
- Additional event types: Extend WatchEvent type and watcher
- Enhanced filtering: Add pre-filter hooks before heuristic evaluation
- Message templates: Template system for generated messages
- User preferences: Opt-in/out system for heuristic categories
- Cross-platform optimizations: Platform-specific watcher implementations

**How to extend without breaking contracts:**
1. Add new optional fields to existing types
2. Use feature flags for new heuristics
3. Version message format with backward compatibility
4. Add new event types alongside existing
5. Use configuration to enable/disable new features

## 12. Technical Debt & TODO

**Weak areas:**
- Limited built-in heuristics (only 3 basic ones)
- No user preference system (cannot disable specific heuristics)
- Basic message prioritization (simple low/medium/high)
- No cooldown mechanism (can spam on rapid changes)
- Missing: Heuristic learning from user feedback
- Missing: Cross-session context awareness

**Refactor targets:**
- Implement user preference storage and management
- Add cooldown and rate limiting per heuristic/path
- Enhance heuristic system with weights and confidence scores
- Add machine learning for heuristic effectiveness
- Implement cross-session context tracking
- Missing: Dependency injection for testability

**Simplification ideas:**
- Reduce configuration complexity with sensible defaults
- Consolidate similar heuristics into parameterized versions
- Simplify message delivery with direct gateway integration
- Reduce type definitions with inferred types
- Merge small files into logical modules
- Missing: Unified event processing pipeline