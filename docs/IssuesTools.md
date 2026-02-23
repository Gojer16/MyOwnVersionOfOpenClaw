# Tools System — Issues, Gaps & Technical Debt

> **Created**: 2026-02-23  
> **Audited by**: Antigravity AI Agent  
> **Scope**: All files in `src/tools/`  
> **Reference**: `src/tools/README.md`  
> **Status**: Open — ready for AI agent implementation  

---

## How to Use This Document

Each issue has:
- **ID** for tracking (e.g., `TOOL-001`)
- **Severity**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low
- **File(s)** affected with line numbers where applicable
- **What's wrong** and **how to fix it**
- **Checkbox** `[ ]` — mark `[x]` when resolved

AI agents should read `src/tools/README.md` and this file before modifying any tool.

---

## 1. Critical Gaps (Missing Functionality)

### TOOL-001: `apple-safari.ts` is completely undocumented in README
- [ ] **Severity**: 🔴 Critical
- **File**: `src/tools/README.md`
- **Problem**: After the bulletproofing rewrite of Section 4, the individual Apple tool entries replaced the old `apple-*.ts` catch-all, but `apple-safari.ts` was omitted entirely. It has 415 lines and 10 tools (navigate, get_info, extract, execute_js, click, type, go_back, reload, list_tabs, activate_tab) but is not documented anywhere in the README.
- **Fix**: Add a `**apple-safari.ts** (415 lines)` entry to Section 4 of the README, documenting all 10 tools, their purpose, what they call, side effects, and current limitations (no bulletproofing).

### TOOL-002: `apple-safari.ts` is NOT bulletproofed
- [ ] **Severity**: 🔴 Critical
- **File**: `src/tools/apple-safari.ts` (415 lines)
- **Problem**: Safari is the only Apple tool that was NOT bulletproofed. It still uses:
  - Raw `args as string` casts (no Zod validation)
  - `osascript -e` inline execution (shell injection risk)
  - Plain text `Error:` responses (not `BulletproofOutput` JSON)
  - Its own local `escapeAppleScript` function (line 7-9) instead of importing from `apple-shared.ts`
  - No permission checks
  - No platform detection returning structured JSON
- **Fix**: Apply the same bulletproofing pattern as `apple-reminders.ts`, `apple-notes.ts`, `apple-mail.ts`:
  1. Import utilities from `apple-shared.ts`
  2. Add Zod schemas for all 10 tools
  3. Use `safeExecAppleScript` instead of `osascript -e`
  4. Return `BulletproofOutput` JSON for all responses
  5. Add `checkPlatform` and `checkAppPermission('Safari')` calls
  6. Update `tests/unit/apple-safari-tools.test.ts` to assert JSON output
- **Reference**: See `apple-reminders.ts` for the pattern to follow.

### TOOL-003: `subagent-tool.ts` is dead code (never registered)
- [ ] **Severity**: 🟠 High
- **File**: `src/tools/subagent-tool.ts` (27 lines), `src/tools/registry.ts`
- **Problem**: `registry.ts` does NOT import or register `createSubagentTool`. The function exists but is never called anywhere in the codebase. The README documents it as if it's active.
- **Fix**: Either:
  - **(A)** Wire it up in `registry.ts` by importing `createSubagentTool` and registering it (requires `SubagentRegistry` instance)
  - **(B)** Remove the file and its README entry if subagents are not yet implemented
  - **(C)** Mark it as `[PLANNED]` in the README and add a TODO comment in the file

### TOOL-004: `normalize.ts` is never used
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/normalize.ts` (61 lines)
- **Problem**: `normalizeToolExecution()` is exported but never imported by any tool file. The README documents it as "Tool output normalization" that tool implementations call "before returning results," but no tool actually does this.
- **Fix**: Either:
  - **(A)** Wrap non-Apple tool `execute()` functions with `normalizeToolExecution()` to standardize their output
  - **(B)** Remove the file if `BulletproofOutput` (from `apple-shared.ts`) is the preferred pattern going forward
  - **(C)** Refactor into a shared utility that both patterns can use

### TOOL-005: `memory-search-semantic-tool.ts` is dead code (never registered)
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/memory-search-semantic-tool.ts` (56 lines), `src/tools/registry.ts`
- **Problem**: `createMemorySearchSemanticTool` is not imported or registered in `registry.ts`. It requires a `VectorMemory` instance but is never wired up.
- **Fix**: Either:
  - **(A)** Wire it up in `registry.ts` (requires `VectorMemory` from `src/memory/vector.ts` to be initialized)
  - **(B)** Mark as `[PLANNED]` in README if vector memory is not yet production-ready
  - **(C)** Remove if deprecated

---

## 2. README Inaccuracies

### TOOL-006: Line count claims are wrong across most files
- [ ] **Severity**: 🟢 Low
- **File**: `src/tools/README.md`, Section 4
- **Problem**: Line counts in the README do not match actual file sizes.

| README Claim | Actual Lines | File |
|---|---|---|
| `registry.ts` "200+ lines" | 119 lines | `src/tools/registry.ts` |
| `file.ts` "300+ lines" | 387 lines | `src/tools/file.ts` |
| `shell.ts` "250+ lines" | 156 lines | `src/tools/shell.ts` |
| `browser.ts` "300+ lines" | 345 lines | `src/tools/browser.ts` |
| `memory-tools.ts` "200+ lines" | 251 lines | `src/tools/memory-tools.ts` |
| `notes.ts` "150+ lines" | 90 lines | `src/tools/notes.ts` |
| `tasks.ts` "150+ lines" | 138 lines | `src/tools/tasks.ts` |
| `subagent-tool.ts` "100+ lines" | 27 lines | `src/tools/subagent-tool.ts` |
| `memory-search-semantic-tool.ts` "100+ lines" | 56 lines | `src/tools/memory-search-semantic-tool.ts` |

- **Fix**: Update all line counts in Section 4 to match reality.

### TOOL-007: Data flow description is misleading
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/README.md`, line 40
- **Problem**: The data flow says "Zod schema validation" as a universal step, but only Apple tools use Zod. All other tools (file, shell, web, browser, notes, tasks, memory, screenshot, scratchpad) use raw `args as string` casts with zero validation.
- **Fix**: Change to something like:
  ```
  Data flow: Agent request → tool lookup → parameter validation (Zod for Apple tools, JSON schema for others) → safety checks → platform detection → external call → result formatting → agent response.
  ```
  And add a note about the validation gap.

### TOOL-008: README claims URL validation exists but it doesn't
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/README.md` line 261, `src/tools/web.ts`
- **Problem**: Section 6 says "URL validation: Protocol checking (http/https)" but `web.ts` does NOT validate URLs before fetching. The `web_fetch` execute function at line 451 does `const url = args.url as string` and passes it directly to `runWebFetch` with no protocol check.
- **Fix**: Either add actual URL validation in `web.ts` or remove the claim from the README.

### TOOL-009: Test documentation is incomplete
- [ ] **Severity**: 🟢 Low
- **File**: `src/tools/README.md`, line 382
- **Problem**: Section 9 "How to test locally" only mentions Apple tool tests (79 tests). There are also:
  - `tests/unit/file-tools.test.ts`
  - `tests/unit/shell-tools.test.ts`
  - `tests/unit/web-tools.test.ts`
  - `tests/unit/browser-tools.test.ts`
  - `tests/unit/memory-tools.test.ts`
  - `tests/unit/tool-normalization.test.ts`
  - `tests/unit/apple-safari-tools.test.ts`
- **Fix**: Update to `npx vitest run tests/unit/` and report accurate total test count across all tool test files.

---

## 3. Bugs & Vulnerabilities

### TOOL-010: `notes.ts` — Path traversal via title
- [ ] **Severity**: 🔴 Critical
- **File**: `src/tools/notes.ts`, lines 24-40
- **Problem**: The `notes_save` tool creates a filename from user-supplied `title`:
  ```typescript
  const title = args.title as string;
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.md';
  const filepath = path.join(NOTES_DIR, filename);
  ```
  While the regex strips most special chars, there is no validation that `title` is a string, not empty, or within reasonable length. If `title` is undefined, `.toLowerCase()` will throw. If extremely long, it creates absurdly long filenames.
- **Fix**: Add Zod validation: `z.string().trim().min(1).max(200)`. Validate that the resolved path stays within `NOTES_DIR`.

### TOOL-011: `notes.ts` — No validation on `content` or `query`
- [ ] **Severity**: 🟠 High
- **File**: `src/tools/notes.ts`, lines 27-28, line 55
- **Problem**: `args.content as string` and `args.query as string` are raw casts. If omitted by the LLM, these become `undefined`, and calling `.toLowerCase()` on undefined will throw an unhandled exception.
- **Fix**: Add Zod schemas for both `notes_save` and `notes_search` tools.

### TOOL-012: `notes.ts` — Tag search is case-sensitive while content search is not
- [ ] **Severity**: 🟢 Low
- **File**: `src/tools/notes.ts`, line 68
- **Problem**: `content.toLowerCase().includes(query)` does case-insensitive content matching, but `content.includes('tags: ${tag}')` on line 68 is case-sensitive and also depends on exact YAML formatting.
- **Fix**: Normalize tag comparison: `content.toLowerCase().includes(`tags: ${tag.toLowerCase()}`)`.

### TOOL-013: `tasks.ts` — No input validation
- [ ] **Severity**: 🟠 High
- **File**: `src/tools/tasks.ts`, lines 44-60, 117-135
- **Problem**: All three task tools use raw `args as string` casts:
  - `tasks_add`: `args.title as string` (could be undefined)
  - `tasks_complete`: `args.id as string` (could be undefined)
  - `tasks_list`: `args.status as string` cast to enum without validation
- **Fix**: Add Zod schemas for all three tools. Validate `title` is non-empty string, `id` is non-empty string, `status` is one of the enum values.

### TOOL-014: `tasks.ts` — Task ID collision risk
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/tasks.ts`, line 48
- **Problem**: `id: Date.now().toString()` — if two tasks are added in the same millisecond (e.g., via rapid agent calls), they get the same ID. `tasks_complete` would then find the wrong one.
- **Fix**: Use `crypto.randomUUID()` or `Date.now().toString() + '-' + Math.random().toString(36).substring(7)`.

### TOOL-015: `tasks.ts` — Unbounded task list
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/tasks.ts`, lines 17-24, 27-29
- **Problem**: `loadTasks()` reads the entire `tasks.json` into memory and `saveTasks()` writes it all back. There is no limit on the number of tasks. Over time this file can grow unbounded.
- **Fix**: Add a max task limit (e.g., 500). When exceeded, auto-archive completed tasks or return an error.

### TOOL-016: `memory-tools.ts` — No input validation
- [ ] **Severity**: 🟠 High
- **File**: `src/tools/memory-tools.ts`, lines 92-108, 124-135, 156-169, 186-199, 216-247
- **Problem**: All 5 memory tools use raw `args as string` casts for `text`, `content`, `query`, and `path` parameters. If any required parameter is omitted (undefined), functions will crash or write "undefined" to memory files.
- **Fix**: Add Zod schemas for all 5 tools.

### TOOL-017: `memory-tools.ts` — `soul_update` replaces entire file without confirmation
- [ ] **Severity**: 🔴 Critical
- **File**: `src/tools/memory-tools.ts`, `soul_update` tool (around line 186)
- **Problem**: `soul_update` does `fs.writeFileSync(soulPath, content, 'utf-8')` — it replaces the entire SOUL.md with whatever the LLM provides. There is no:
  - Backup of the existing file
  - Confirmation prompt
  - Maximum size limit
  - Diff or merge logic
  A hallucinating LLM could wipe the agent's personality file.
- **Fix**: 
  1. Create a backup before overwriting (e.g., `SOUL.md.bak`)
  2. Add a max content size (e.g., 10KB)
  3. Log the old content before replacing
  4. Consider requiring an `append` mode instead of full replacement

### TOOL-018: `shell.ts` — No input validation
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/shell.ts`, lines 57-60
- **Problem**: `args.command as string` — if LLM sends `{ command: undefined }`, this becomes the string "undefined" and is executed as a shell command.
- **Fix**: Validate `command` is a non-empty string before execution.

### TOOL-019: `shell.ts` — Zombie process timeout window
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/shell.ts`, lines 148-154
- **Problem**: There are two timeout mechanisms:
  1. `exec()` has its own `timeout` option (line 128)
  2. A manual `setTimeout` at `timeout + 1000` sends SIGTERM (line 149)
  
  If `exec()` timeout fires first and resolves the promise, the manual setTimeout still runs 1 second later and tries to kill an already-dead process. The `catch` handles this, but it's wasteful. More importantly, if neither kills the process, there's no SIGKILL escalation.
- **Fix**: Clear the manual timeout when the process exits. Add SIGKILL after SIGTERM if process is still alive.

### TOOL-020: `web.ts` — No URL validation
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/web.ts`, line 451
- **Problem**: `web_fetch` accepts any string as a URL with no validation:
  ```typescript
  const url = args.url as string;
  ```
  No protocol check, no format validation. Could attempt to fetch `file:///etc/passwd` or malformed strings.
- **Fix**: Validate URL format and restrict to `http://` and `https://` protocols only.

### TOOL-021: `web.ts` — No query validation
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/web.ts`, line 407
- **Problem**: `args.query as string` — no validation that query is non-empty or within reasonable length.
- **Fix**: Validate query is a non-empty string with max length.

### TOOL-022: `browser.ts` — No input validation
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/browser.ts`, lines 267-270, 285-288, 307-310, 319-324, 338-341
- **Problem**: All 5 browser tool `execute()` functions use raw `args as string` casts for `url`, `selector`, `text`. No validation.
- **Fix**: Validate URL format for navigate, validate selector is non-empty string for click/type/extract.

### TOOL-023: `browser.ts` — No cleanup on process exit
- [ ] **Severity**: 🟡 Medium  
- **File**: `src/tools/browser.ts`, `BrowserTools` class
- **Problem**: The `BrowserTools` class manages a Puppeteer browser instance but has no `process.on('exit')` or `process.on('SIGTERM')` handler to close the browser. If the process exits unexpectedly, Chrome is orphaned.
- **Fix**: Add process exit handlers in the constructor that call `this.close()`.

### TOOL-024: `screenshot.ts` — Path injection in outputPath
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/screenshot.ts`, lines 93-94
- **Problem**: `args.outputPath as string | undefined` is passed directly to `screencapture` without validation. An LLM could specify a malicious path.
- **Fix**: Validate that `outputPath` is within a safe directory (temp or workspace), and that it ends with `.png`.

### TOOL-025: `apple-safari.ts` — Script injection via `osascript -e`
- [ ] **Severity**: 🔴 Critical
- **File**: `src/tools/apple-safari.ts`, multiple `execute()` functions
- **Problem**: All Safari tools construct AppleScript commands using string interpolation with `osascript -e`:
  ```typescript
  const url = escapeAppleScript(args.url as string);
  await execAsync(`osascript -e '..."${url}"...'`);
  ```
  The local `escapeAppleScript` (line 7-9) only handles `\` and `"` — it does NOT handle single quotes, which are the outer delimiter of the `osascript -e` command. A URL containing a single quote would break the command and enable injection.
- **Fix**: Use `safeExecAppleScript` from `apple-shared.ts` (writes to temp file, no shell quoting issues).

### TOOL-026: `file.ts` — Regex crash in `file_search`
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/file.ts`, line 267
- **Problem**: User-supplied `query` is passed directly to `new RegExp(query)`. If the query contains unbalanced regex characters like `(`, `[`, `{`, `*`, `+`, it will throw `SyntaxError: Invalid regular expression`.
- **Fix**: Wrap in try-catch, or escape regex special characters with a helper like:
  ```typescript
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  ```

### TOOL-027: `scratchpad.ts` — No validation on session mutations
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/scratchpad.ts`, lines 26-91
- **Problem**: All `value` and `data` arguments are cast with `args.value as string` and `args.data as any`. Values are pushed to arrays without type checking. A malformed `data` object could corrupt the scratchpad state.
- **Fix**: Add basic validation: `value` must be non-empty string, `data` must be a plain object.

### TOOL-028: `subagent-tool.ts` — No validation on type enum
- [ ] **Severity**: 🟡 Medium
- **File**: `src/tools/subagent-tool.ts`, line 18
- **Problem**: `args.type as SubagentType` — no validation that the string is actually one of the valid enum values. If the LLM sends an invalid type, it will fail inside `registry.execute()` with an unclear error.
- **Fix**: Validate against ['research', 'writer', 'planner', 'critic', 'summarizer'] before calling registry.

---

## 4. Inconsistency Issues

### TOOL-029: Two different output formats coexist
- [ ] **Severity**: 🟡 Medium
- **Files**: All tool files
- **Problem**: Apple tools return `BulletproofOutput` JSON. All other tools return plain strings with `Error:` prefix for failures. The agent loop must handle both formats, making parsing unreliable.
- **Fix**: Long-term, all tools should use a consistent output format. Options:
  - **(A)** Extend `BulletproofOutput` to all tools
  - **(B)** Use `normalizeToolExecution()` wrapper for non-Apple tools
  - **(C)** Accept the inconsistency but document it clearly in the README

### TOOL-030: Two different `escapeAppleScript` implementations
- [ ] **Severity**: 🟡 Medium
- **Files**: `src/tools/apple-shared.ts` (line ~42), `src/tools/apple-safari.ts` (lines 7-9)
- **Problem**: Safari has its own `escapeAppleScript` that only handles `\` and `"`. The shared version in `apple-shared.ts` also handles `\n`. If the shared version is improved in the future, Safari won't benefit.
- **Fix**: Remove the local copy in Safari and import from `apple-shared.ts`.

---

## 5. Missing Test Coverage

### TOOL-031: No validation tests for non-Apple tools
- [ ] **Severity**: 🟡 Medium
- **Files**: `tests/unit/file-tools.test.ts`, `tests/unit/shell-tools.test.ts`, `tests/unit/web-tools.test.ts`, `tests/unit/memory-tools.test.ts`
- **Problem**: Existing tests for these tools don't test what happens when:
  - Required parameters are missing (undefined)
  - Parameters are wrong type (number instead of string)
  - Parameters are empty strings
  - Parameters contain malicious content
- **Fix**: After adding input validation (Zod or manual), add test cases for each validation failure.

### TOOL-032: No tests for `notes.ts`, `tasks.ts`, `screenshot.ts`, `scratchpad.ts`
- [ ] **Severity**: 🟡 Medium
- **Files**: `tests/unit/` directory
- **Problem**: These four tool files have ZERO unit tests. No test files exist for them at all.
- **Fix**: Create test files following the existing patterns:
  - `tests/unit/notes-tools.test.ts`
  - `tests/unit/tasks-tools.test.ts`
  - `tests/unit/screenshot-tools.test.ts`
  - `tests/unit/scratchpad-tools.test.ts`

---

## 6. Priority Implementation Order

For agents picking up this work, here's the recommended order:

### Phase 1 — Critical Security (do first)
1. `TOOL-002` — Bulletproof `apple-safari.ts`
2. `TOOL-025` — Fix Safari script injection
3. `TOOL-017` — Protect `soul_update` from destructive writes
4. `TOOL-010` — Fix notes path traversal

### Phase 2 — Input Validation
5. `TOOL-011` — Validate notes.ts inputs
6. `TOOL-013` — Validate tasks.ts inputs
7. `TOOL-016` — Validate memory-tools.ts inputs
8. `TOOL-018` — Validate shell.ts inputs
9. `TOOL-020` — Validate web.ts URL
10. `TOOL-021` — Validate web.ts query
11. `TOOL-022` — Validate browser.ts inputs

### Phase 3 — Dead Code & Consistency
12. `TOOL-003` — Wire up or remove subagent-tool.ts
13. `TOOL-004` — Wire up or remove normalize.ts
14. `TOOL-005` — Wire up or remove memory-search-semantic-tool.ts
15. `TOOL-029` — Standardize output format
16. `TOOL-030` — Remove duplicate escapeAppleScript

### Phase 4 — Robustness
17. `TOOL-014` — Fix task ID collision
18. `TOOL-015` — Add task list limit
19. `TOOL-019` — Fix shell zombie timeout
20. `TOOL-023` — Add browser cleanup on exit
21. `TOOL-024` — Validate screenshot path
22. `TOOL-026` — Fix regex crash in file_search
23. `TOOL-027` — Validate scratchpad inputs
24. `TOOL-028` — Validate subagent type enum

### Phase 5 — Documentation
25. `TOOL-001` — Document Safari in README
26. `TOOL-006` — Fix line counts
27. `TOOL-007` — Fix data flow description
28. `TOOL-008` — Fix URL validation claim
29. `TOOL-009` — Fix test documentation
30. `TOOL-031` — Add validation tests
31. `TOOL-032` — Add missing test files

---

## 7. Files Reference

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| `src/tools/apple-shared.ts` | 215 | ✅ Bulletproofed | — |
| `src/tools/apple-calendar.ts` | 735 | ✅ Bulletproofed | — |
| `src/tools/apple-reminders.ts` | 240 | ✅ Bulletproofed | — |
| `src/tools/apple-notes.ts` | 180 | ✅ Bulletproofed | — |
| `src/tools/apple-mail.ts` | 480 | ✅ Bulletproofed | — |
| `src/tools/apple-safari.ts` | 415 | 🔴 Not bulletproofed | TOOL-001, TOOL-002, TOOL-025, TOOL-030 |
| `src/tools/file.ts` | 387 | 🟡 Partially safe | TOOL-026 |
| `src/tools/shell.ts` | 156 | 🟡 Has safety checks | TOOL-018, TOOL-019 |
| `src/tools/web.ts` | 477 | 🟡 No input validation | TOOL-008, TOOL-020, TOOL-021 |
| `src/tools/browser.ts` | 345 | 🟡 No input validation | TOOL-022, TOOL-023 |
| `src/tools/memory-tools.ts` | 251 | 🟠 No validation, dangerous | TOOL-016, TOOL-017 |
| `src/tools/notes.ts` | 90 | 🟠 No validation | TOOL-010, TOOL-011, TOOL-012 |
| `src/tools/tasks.ts` | 138 | 🟠 No validation | TOOL-013, TOOL-014, TOOL-015 |
| `src/tools/screenshot.ts` | 113 | 🟡 Path injection risk | TOOL-024 |
| `src/tools/scratchpad.ts` | 94 | 🟡 No validation | TOOL-027 |
| `src/tools/normalize.ts` | 61 | ⚪ Dead code | TOOL-004 |
| `src/tools/subagent-tool.ts` | 27 | ⚪ Dead code | TOOL-003, TOOL-028 |
| `src/tools/memory-search-semantic-tool.ts` | 56 | ⚪ Dead code | TOOL-005 |
| `src/tools/registry.ts` | 119 | ✅ Functional | TOOL-003, TOOL-005 (missing registrations) |
| `src/tools/README.md` | 462 | 🟡 Inaccurate | TOOL-001, TOOL-006, TOOL-007, TOOL-008, TOOL-009 |
