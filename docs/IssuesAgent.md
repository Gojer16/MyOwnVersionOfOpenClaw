# Agent System — Issues, Gaps & Technical Debt

> **Created**: 2026-02-23  
> **Audited by**: Antigravity AI Agent  
> **Scope**: All files in `src/agent/`, including `loop.ts`, `router.ts`, `fallback.ts`, `context-guard.ts`, `prompts.ts`, `providers/`  
> **Reference**: `src/agent/README.md`, `src/agent/ARCHITECTURAL_REVIEW.md`  
> **Status**: Open — ready for AI agent implementation  
> **Context**: The agent is the **core brain** of Talon. Every bug here affects ALL channels.

---

## 0. End-to-End Agent Flow Audit

### Flow: User Message → Agent → Response

```
User message arrives (via any channel)
  → eventBus.emit('message.inbound')                    [gateway/index.ts:90]
  → gateway listener calls agentLoop.run(session)        [gateway/index.ts:105]
  
  AgentLoop.run(session):
    1. state = 'thinking'                                [loop.ts:151]
    2. Check compression needed                          [loop.ts:156]
    3. Get default provider (modelRouter)                 [loop.ts:161]
    4. Set available tools for system prompt              [loop.ts:172]
    5. LOOP (max iterations):
       a. state = 'executing'                            [loop.ts:183]
       b. Build context (memoryManager.buildContext)      [loop.ts:195]
       c. Evaluate context window                         [loop.ts:198]
       d. Truncate if needed                              [loop.ts:205]
       e. LLM call with fallback + 90s timeout           [loop.ts:224-273]
       f. IF tool_calls → execute tools → continue        [loop.ts:338-455]
       g. IF text response → yield done → return          [loop.ts:457-508]
    6. Max iterations → yield warning + done              [loop.ts:511-540]
  
  → eventBus.emit('message.outbound')                    [gateway/index.ts:136]
  → Channel delivers response (CLI only, see IssuesChannels.md CHAN-003)
```

### Flow Status

| Step | Status | Notes |
|------|--------|-------|
| Message ingestion | ✅ Works | Via BaseChannel.ingestMessage() |
| Session resolution | ✅ Works | Via MessageRouter.handleInbound() |
| Provider selection | ⚠️ Fragile | See AGENT-003 (unresolved env vars) |
| Context building | ✅ Works | memoryManager.buildContext() |
| Context guard | ⚠️ Approximate | See AGENT-008 (token estimation) |
| LLM call | ✅ Works | With timeout + fallback |
| Tool execution | ✅ Works | Rate-limited, error-handled |
| Response delivery | ❌ Broken for non-CLI | See IssuesChannels.md CHAN-003 |
| Memory compression | ⚠️ Untested | See AGENT-010 |
| Error handling | ✅ Works | Yields error chunk back to gateway |

---

## 1. README Hallucinations (Already Identified in ARCHITECTURAL_REVIEW.md)

The existing `ARCHITECTURAL_REVIEW.md` (created 2026-02-20) already identified these — still unfixed:

### AGENT-001: Line counts wrong by 35-43x
- [x] **Severity**: 🔴 Critical — ~~already documented in ARCHITECTURAL_REVIEW.md~~
- **File**: `src/agent/README.md`, Section 4
- **Problem**: README claims `loop.ts` is 21,592 lines when it's 576. All 5 files are overstated by 35-43x. These are **byte counts misreported as line counts**.

| File | README claims | Actual lines | Actual bytes |
|------|-------------|-------------|-------------|
| `loop.ts` | "21,592 lines" | 576 | 23,421 |
| `prompts.ts` | "21,851 lines" | 511 | 21,851 |
| `router.ts` | "9,733 lines" | 263 | 9,733 |
| `fallback.ts` | "10,012 lines" | 291 | 10,012 |
| `context-guard.ts` | "6,346 lines" | 180 | 6,346 |

- **Root cause**: The README generator used **byte counts** instead of line counts.
- **Fix**: Replace all numbers with actual line counts from `wc -l`.

### AGENT-002: Zod schemas claimed but don't exist
- [ ] **Severity**: 🟠 High
- **File**: `src/agent/README.md`, Section 7 (Data Contracts)
- **Problem**: Claims `LLMMessageSchema`, `ToolCallSchema`, `AgentConfigSchema`, `ProviderConfigSchema` as Zod schemas. Zero Zod schemas exist in the agent directory. Only TypeScript interfaces are used.
- **Fix**: Either implement schemas or update README to say "TypeScript interfaces only (no runtime validation)".

---

## 2. Functional Bugs

### AGENT-003: Provider skip logic is fragile with unresolved env vars
- [ ] **Severity**: 🟢 Low (downgraded — config loader DOES resolve env vars)
- **File**: `src/agent/router.ts`, line 46
- **Problem**: The router skips providers whose API key starts with `${`:
  ```typescript
  if (!apiKey || apiKey.startsWith('${')) {
      logger.debug({ provider: id }, 'Skipping provider — no API key');
      continue;
  }
  ```
  The config loader (`src/config/loader.ts:190`) calls `resolveEnvVarsDeep()` which resolves `${OPENROUTER_API_KEY}` → actual value BEFORE reaching the router. So this works correctly **as long as** the env var is set.
  
  However, if the env var is NOT set (e.g., `OPENROUTER_API_KEY` undefined), `resolveEnvVars()` returns the original `"${OPENROUTER_API_KEY}"` string (line 44 returns original on `undefined`), and the router silently skips the provider with only a `debug` log. The user gets no warning about the missing env var.
- **Fix**: Log at `warn` level instead of `debug` when skipping due to unresolved env var pattern:
  ```typescript
  if (apiKey.startsWith('${')) {
      logger.warn({ provider: id, hint: apiKey }, 'Skipping provider — env var not set');
      continue;
  }
  ```

### AGENT-004: `executeTool()` uses dead-code `normalize.ts`
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/loop.ts`, lines 108-109
- **Problem**: `executeTool()` dynamically imports `../tools/normalize.js` and calls `normalizeToolExecution()`. But `executeTool()` is never called by the main loop — the loop uses `toolHandler.execute()` directly at line 383. And `normalize.ts` was flagged as dead code in `docs/IssuesTools.md` (TOOL-003).
  
  `executeTool()` is only a public utility for external callers. The normalization wrapper adds overhead for no benefit since the loop handles errors itself.
- **Fix**: Either:
  - **(A)** Remove `executeTool()` entirely if nothing external uses it
  - **(B)** Make the main loop also use normalized execution for consistency

### AGENT-005: State machine has no transition guards
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/loop.ts`, various lines
- **Problem**: The README claims "PLAN → DECIDE → EXECUTE → EVALUATE → COMPRESS → RESPOND with guard conditions". Reality:
  - No `PLAN` or `DECIDE` phases exist
  - State is set with raw `this.state = 'xxx'` assignments
  - No validation that the transition is valid
  - Any code can set any state from any other state
  - If an error occurs during `evaluating`, the state can get stuck
- **Fix**: Add a `transition()` method:
  ```typescript
  private transition(to: LoopState): void {
      const allowed: Record<LoopState, LoopState[]> = {
          'idle': ['thinking'],
          'thinking': ['executing', 'compressing', 'error'],
          'executing': ['evaluating', 'error'],
          'evaluating': ['responding', 'executing'],
          'compressing': ['thinking'],
          'responding': ['idle'],
          'error': ['idle'],
      };
      if (!allowed[this.state]?.includes(to)) {
          logger.warn({ from: this.state, to }, 'Invalid state transition');
      }
      this.state = to;
  }
  ```

### AGENT-006: Tool execution time always reported as 0
- [ ] **Severity**: 🟢 Low
- **File**: `src/agent/loop.ts`, lines 392, 444
- **Problem**: Both `tool.complete` event (line 392) and the tool message metadata (line 444) report `executionTime: 0`. The actual execution time is never measured.
- **Fix**: Capture `Date.now()` before and after tool execution:
  ```typescript
  const toolStart = Date.now();
  output = await toolHandler.execute(tc.args, session);
  const executionTime = Date.now() - toolStart;
  ```

### AGENT-007: `resolveContextWindow()` matches greedily via `.includes()`
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/context-guard.ts`, lines 65-79
- **Problem**: Model name matching uses `normalized.includes(pattern)`:
  ```typescript
  for (const [pattern, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      if (normalized.includes(pattern.toLowerCase())) {
          return window;
      }
  }
  ```
  This causes false matches:
  - `"openrouter/deepseek/deepseek-chat-v3-0324"` matches `"deepseek-chat"` → returns 64k
  - But it also matches `"default"` if iterated in wrong order
  - `"claude-3-opus"` matches before `"claude-3-haiku"` if the model ID contains both
  
  The iteration order of `Object.entries()` is insertion order, so `gpt-4o` matches before `gpt-4o-mini` — returning the same 128k, but this is fragile.
- **Fix**: Sort patterns by length (longest first) to match most specific first. Or use a lookup table with exact slug extraction.

### AGENT-008: Token estimation is ~4 chars/token — dangerously inaccurate for code
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/context-guard.ts`, lines 44-49
- **Problem**: `estimateTokens()` uses `text.length / 4`. For English prose this is ~OK, but:
  - **Code blocks**: Typically ~3 chars/token → underestimates by ~25%
  - **JSON/structured data**: Varies wildly
  - **Non-English text**: Chinese/Japanese can be 1-2 chars/token → underestimates by 50-75%
  - **Tool outputs**: Often JSON, underestimated
  
  This means the context guard may say "you have 30k tokens remaining" when you actually have 20k. Combined with large tool outputs, this can cause unexpected context overflow errors from the LLM.
- **Fix**: Use a proper tokenizer library, or at minimum add a safety margin:
  ```typescript
  export function estimateTokens(text: string): number {
      return Math.ceil(text.length / 3); // Conservative: ~3 chars/token
  }
  ```

### AGENT-009: `truncateMessagesToFit` breaks tool call/result pairs
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/context-guard.ts`, lines 141-179
- **Problem**: Truncation removes oldest non-system messages. But tool call messages (role: `assistant` with `tool_calls`) and tool result messages (role: `tool`) must come in pairs. If truncation removes an assistant message with tool_calls but keeps the corresponding tool result (or vice versa), the LLM will receive an invalid message sequence and may crash with:
  > "Invalid parameter: messages with role 'tool' must be a response to a preceding message with 'tool_calls'"
- **Fix**: When truncating, always remove tool_call/tool_result as atomic pairs.

### AGENT-010: Memory compression untested and fragile
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/loop.ts`, lines 545-568
- **Problem**: `compressMemory()`:
  1. Gets messages for compression
  2. Formats them
  3. Sends to `memoryCompressor.compress()` — which makes an LLM call
  4. Applies compression result
  
  If the compression LLM call fails (rate limit, timeout), the error is **not caught** — it propagates up and crashes the entire `run()` generator. This means a compression failure kills the user's current request even though the actual task might not need compression.
- **Fix**: Wrap compression in try/catch:
  ```typescript
  private async *compressMemory(session: Session): AsyncIterable<AgentChunk> {
      try {
          // ... existing code
      } catch (err) {
          logger.error({ err }, 'Memory compression failed — continuing without compression');
          yield { type: 'thinking', content: 'Memory compression skipped (will retry later)' };
      }
  }
  ```

---

## 3. Provider Issues

### AGENT-011: `providers/README.md` has wrong line counts (byte counts again)
- [ ] **Severity**: 🟢 Low
- **File**: `src/agent/providers/README.md`, lines 7-8
- **Problem**: Claims `openai-compatible.ts` is "9455 lines" and `opencode.ts` is "3880 lines". Actual: 283 and 110 lines respectively. Same byte-count-as-line-count bug.
- **Fix**: Update to actual line counts.

### AGENT-012: OpenCode base URL is hardcoded
- [ ] **Severity**: 🟢 Low
- **File**: `src/agent/providers/opencode.ts`, line 13
- **Problem**: `this.baseUrl = 'https://opencode.ai/zen/v1'` is hardcoded. If OpenCode changes their URL or the user wants to use a self-hosted version, there's no way to configure it.
- **Fix**: Accept `baseUrl` as a constructor parameter with a default.

### AGENT-013: OpenCode `chatStream()` throws instead of degrading gracefully
- [ ] **Severity**: 🟢 Low
- **File**: `src/agent/providers/opencode.ts`, lines 99-104
- **Problem**: `chatStream()` throws `'Streaming not supported for OpenCode provider'`. If any future code path calls `chatStream()` (e.g., adding streaming to the agent loop), it will crash instead of falling back to non-streaming.
- **Fix**: Implement a polyfill that returns the non-streaming result as a single chunk.

### AGENT-014: `providers/README.md` claims wrong OpenCode URL
- [ ] **Severity**: 🟢 Low
- **File**: `src/agent/providers/README.md`, line 47
- **Problem**: Says `https://api.opencode.ai/v1` but actual code uses `https://opencode.ai/zen/v1`.
- **Fix**: Update README.

---

## 4. Prompt Engineering Issues

### AGENT-015: System prompt is ~2000 tokens of boilerplate on EVERY message
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/prompts.ts`, lines 234-402
- **Problem**: `buildSystemPrompt()` appends a massive section (~2000 tokens) of rules, tool categories, response format instructions, and multi-step task guidance to EVERY system prompt. This:
  - Wastes ~2000 tokens per message (at $0.001/1k tokens for DeepSeek, that's $0.002/message)
  - Reduces available context for actual conversation
  - Hardcodes tool categories that may not match registered tools
  - Includes `<think>` and `<final>` tag instructions that not all models support
- **Fix**: 
  - Move static instructions to SOUL.md (loaded once, user-editable)
  - Only include tool categories for tools that are actually registered
  - Make `<think>/<final>` format model-aware (some models don't support it)

### AGENT-016: Tool categories in prompt are hardcoded and may drift from registry
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/prompts.ts`, lines 286-323
- **Problem**: Lines 286-323 hardcode tool categories like "Apple Mail", "Browser Automation", "Delegation". If tools are added/removed from the registry, this section becomes stale. The actual available tools ARE listed dynamically (line 283), but the category descriptions are static.
- **Fix**: Generate tool categories from the registered tools, or remove the manual categorization section.

### AGENT-017: Workspace files read from disk on EVERY message
- [ ] **Severity**: 🟢 Low
- **File**: `src/agent/prompts.ts`, lines 65-72
- **Problem**: `loadWorkspaceFile()` does `fs.existsSync()` + `fs.readFileSync()` for SOUL.md, USER.md, IDENTITY.md, MEMORY.md, and daily memories on every single message. That's 5-7 disk reads per message. Files rarely change mid-conversation.
- **Fix**: Cache with a 30-second TTL, or use a file watcher.

---

## 5. Router Issues

### AGENT-018: `getProviderForTask()` never used in main loop
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/router.ts`, lines 82-166; `src/agent/loop.ts`, line 161
- **Problem**: README says the router does "cost-based model selection (simple→cheapest, complex→best)". But the agent loop only calls `getDefaultProvider()` (line 161), which always returns the `'moderate'` complexity route. The entire `getProviderForTask()` method with its `simple/moderate/complex/summarize` logic is **never invoked by the agent loop**.
  - `getProviderForTask()` is effectively dead code for the main conversation flow.
- **Fix**: Either:
  - **(A)** Implement task complexity detection in the loop (analyze user message → determine complexity → select appropriate provider)
  - **(B)** Document that task-based routing is not yet wired up

### AGENT-019: Model selection uses hardcoded model name lists
- [ ] **Severity**: 🟢 Low
- **File**: `src/agent/router.ts`, lines 193-206
- **Problem**: `selectModelByComplexity()` hardcodes lists like `['minimax-m2.5-free', 'big-pickle', 'glm-5-free', ...]` and `['deepseek-reasoner', 'o3-mini', 'claude-opus', ...]`. These lists will become stale as models are deprecated and new ones appear.
- **Fix**: Move model tier lists to config or make them discoverable from provider model lists.

---

## 6. Fallback Issues

### AGENT-020: Fallback has no circuit breaker
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/fallback.ts`, lines 157-254
- **Problem**: README (line 163) says "Missing: Circuit breaker per provider." This is accurate — if a provider is consistently failing, the fallback router still tries it every time (wasting latency on the timeout). No state is tracked across requests.
- **Fix**: Implement a simple circuit breaker:
  ```typescript
  private failureCounts = new Map<string, { count: number; lastFail: number }>();
  
  private isCircuitOpen(providerId: string): boolean {
      const state = this.failureCounts.get(providerId);
      if (!state) return false;
      // Open circuit for 60s after 3 consecutive failures
      return state.count >= 3 && (Date.now() - state.lastFail) < 60000;
  }
  ```

### AGENT-021: Fallback `indexOf` check uses wrong array
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/fallback.ts`, line 241
- **Problem**: 
  ```typescript
  if (this.providers.indexOf(providerInfo) < orderedProviders.length - 1) {
      await this.delay(this.retryDelayMs);
  }
  ```
  This checks `this.providers.indexOf(providerInfo)` but iterates over `orderedProviders`. Since `orderedProviders` may have a different order than `this.providers`, the indexOf check could return `-1` (if the object reference doesn't match) or an incorrect index, causing incorrect delay behavior.
- **Fix**: Change to:
  ```typescript
  const currentIndex = orderedProviders.indexOf(providerInfo);
  if (currentIndex < orderedProviders.length - 1) {
      await this.delay(this.retryDelayMs);
  }
  ```

---

## 7. Security Issues

### AGENT-022: No tool argument sanitization
- [ ] **Severity**: 🟠 High
- **File**: `src/agent/loop.ts`, line 383
- **Problem**: The agent loop calls `toolHandler.execute(tc.args, session)` with raw LLM-generated arguments. The LLM controls what args are passed to each tool. If a tool (like `shell_execute`) doesn't validate its inputs, the LLM can be tricked (via prompt injection) into running arbitrary commands.
  
  While individual tools should validate their own inputs, the agent loop provides no defense-in-depth. A single un-validated tool is a security hole.
- **Fix**: Add a central sanitization layer before tool execution:
  - Log all tool calls with their args for audit
  - Validate that args match the tool's declared parameter schema
  - Block tools that are in the security deny list

### AGENT-023: System prompt injection via workspace files
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/prompts.ts`, lines 65-72
- **Problem**: Workspace files (SOUL.md, USER.md, MEMORY.md) are loaded and injected verbatim into the system prompt. If any of these files contain prompt injection text (e.g., "IGNORE ALL PREVIOUS INSTRUCTIONS"), it becomes part of the system prompt. Since tools like `file_write` can modify these files, a clever prompt injection chain could self-propagate.
- **Fix**: Sanitize workspace file content before injection, or at minimum add a separator that the LLM understands is user-controlled content.

---

## 8. Test Coverage

### AGENT-024: Agent loop has no unit tests
- [ ] **Severity**: 🟠 High
- **File**: `tests/` directory
- **Problem**: README claims "323 tests" but:
  - No `agent-loop.test.ts` exists
  - No `fallback.test.ts` exists
  - No `context-guard.test.ts` exists
  - No `prompts.test.ts` exists
  - `model-router.test.ts` exists (1 file)
  
  The core brain of the entire system has almost no test coverage. The "323 tests" claim is fabricated.
- **Fix**: Create tests for:
  - Agent loop: tool execution, max iterations, error handling, compression trigger
  - Fallback: error classification, provider ordering, retry behavior
  - Context guard: token estimation, truncation (especially tool pairs)
  - Prompts: workspace file loading, template detection, system prompt construction

---

## 9. Performance Issues

### AGENT-025: LLM timeout creates a dangling timer
- [ ] **Severity**: 🟡 Medium
- **File**: `src/agent/loop.ts`, lines 224-273
- **Problem**: The timeout implementation uses `Promise.race()`:
  ```typescript
  const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(...), LLM_TIMEOUT_MS);
  });
  return Promise.race([llmPromise, timeoutPromise]);
  ```
  If the LLM call succeeds before the timeout, the `setTimeout` still fires 90 seconds later and calls `reject()` on the already-resolved promise. While this doesn't break anything (unhandled rejection on a settled promise is a no-op), it keeps the timer reference alive, preventing garbage collection.
- **Fix**: Clear the timeout on success:
  ```typescript
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(...), LLM_TIMEOUT_MS);
  });
  return Promise.race([
      llmPromise.finally(() => clearTimeout(timeoutId)),
      timeoutPromise,
  ]);
  ```

### AGENT-026: Tool definitions rebuilt on every iteration
- [ ] **Severity**: 🟢 Low
- **File**: `src/agent/loop.ts`, line 237
- **Problem**: `this.getToolDefinitions()` is called inside the loop on every iteration. This rebuilds the entire tool definition array from the Map. Tools don't change during a loop run.
- **Fix**: Build tool definitions once before the loop and reuse.

---

## 10. Priority Implementation Order

### 🚨 Must Fix (affects daily usage):

| # | Issue | What | Time |
|---|-------|------|------|
| 1 | `AGENT-009` | Fix tool pair truncation (causes LLM crashes) | 30 min |
| 2 | `AGENT-010` | Catch compression failures (kills active request) | 10 min |
| 3 | `AGENT-001` | Fix README line counts (bytes → lines) | 5 min |

### 🟡 Should Fix (quality/reliability):

| # | Issue | What |
|---|-------|------|
| 4 | `AGENT-022` | Add tool argument validation layer |
| 5 | `AGENT-021` | Fix fallback indexOf bug |
| 6 | `AGENT-008` | Improve token estimation safety margin |
| 7 | `AGENT-020` | Add circuit breaker for failed providers |
| 8 | `AGENT-025` | Clear LLM timeout on success |
| 9 | `AGENT-005` | Add state transition guards |

### 🟢 Nice-to-have (optimization):

| # | Issue | What |
|---|-------|------|
| 10 | `AGENT-015` | Reduce system prompt bloat |
| 11 | `AGENT-017` | Cache workspace file reads |
| 12 | `AGENT-018` | Wire up task complexity routing |
| 13 | `AGENT-024` | Write agent unit tests |
| 14 | `AGENT-003` | Improve env var warning logging |
| 15 | `AGENT-002,004,006,007,011-14,16,19,23,26` | Everything else |

---

## 11. Files Reference

| File | Lines | Status | Critical Issues |
|------|-------|--------|-----------------|
| `src/agent/loop.ts` | 576 | 🟡 Has bugs | AGENT-004, 005, 006, 009, 010, 022, 025, 026 |
| `src/agent/router.ts` | 263 | 🟡 Has issues | AGENT-003, 018, 019 |
| `src/agent/fallback.ts` | 291 | 🟡 Has bugs | AGENT-020, 021 |
| `src/agent/context-guard.ts` | 180 | 🟡 Has issues | AGENT-007, 008, 009 |
| `src/agent/prompts.ts` | 511 | 🟡 Bloated | AGENT-015, 016, 017, 023 |
| `src/agent/providers/openai-compatible.ts` | 283 | ✅ Clean | — |
| `src/agent/providers/opencode.ts` | 110 | ✅ Clean | AGENT-012, 013 |
| `src/agent/README.md` | 340 | 🔴 Hallucinated | AGENT-001, 002 |
| `src/agent/ARCHITECTURAL_REVIEW.md` | 588 | ✅ Accurate | Pre-existing review |
| `src/agent/providers/README.md` | 58 | 🟡 Inaccurate | AGENT-011, 014 |

---

## 12. Comparison with Previous Audits

| Metric | src/tools/ | src/channels/ | src/agent/ |
|--------|-----------|--------------|-----------|
| Total issues | 32 | 24 | 26 |
| Critical/High | 8 | 9 | 7 |
| Has unit tests? | Partial (Apple only) | ❌ None | ❌ Nearly none |
| README accuracy | ~60% | ~50% | ~40% (worst) |
| Dead code found | 3 modules | 1 file | 1 method |
| Security issues | 5 | 2 | 2 |
| Blocks daily use? | No | Yes (CHAN-003) | Maybe (AGENT-003) |

**The agent README is the least trustworthy** of all three — primarily because of the 35-43x line count inflation, which suggests no human ever reviewed it.
