# Memory System Upgrade Implementation Plan - Part 5: Session Memory

> **For Claude:** This is Part 5 of 6. Implement automatic session indexing and memory hooks.

**Goal:** Automatically index conversation history and save sessions to memory with LLM-generated slugs.

---

## Task 11: Session File Parser

**Files:**
- Create: `src/memory/session/parser.ts`
- Test: `tests/memory/session/parser.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/session/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseSessionFile, extractSessionText } from '../../src/memory/session/parser.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Session File Parser', () => {
  it('should parse JSONL session file', async () => {
    const tmpFile = path.join(os.tmpdir(), `session-${Date.now()}.jsonl`);
    const content = [
      JSON.stringify({ type: 'message', message: { role: 'user', content: 'Hello' } }),
      JSON.stringify({ type: 'message', message: { role: 'assistant', content: 'Hi there!' } }),
      JSON.stringify({ type: 'tool_use', tool: 'file_read', args: {} }),
    ].join('\n');

    fs.writeFileSync(tmpFile, content);

    const entry = await parseSessionFile(tmpFile);
    expect(entry).toBeDefined();
    expect(entry!.content).toContain('User: Hello');
    expect(entry!.content).toContain('Assistant: Hi there!');
    expect(entry!.lineMap).toHaveLength(2); // Only user/assistant messages

    fs.unlinkSync(tmpFile);
  });

  it('should extract text from content array', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
    ];

    const text = extractSessionText(content);
    expect(text).toBe('Hello World');
  });

  it('should extract text from string content', () => {
    const text = extractSessionText('Simple string');
    expect(text).toBe('Simple string');
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/session/parser.test.ts
```

Expected: FAIL

### Step 3: Write implementation

```typescript
// src/memory/session/parser.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../utils/logger.js';

export interface SessionFileEntry {
  path: string;
  absPath: string;
  mtimeMs: number;
  size: number;
  hash: string;
  content: string;
  lineMap: number[]; // Maps content lines to JSONL line numbers
}

/**
 * Normalize session text (remove extra whitespace).
 */
function normalizeSessionText(value: string): string {
  return value
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract text from message content (string or array).
 */
export function extractSessionText(content: unknown): string | null {
  if (typeof content === 'string') {
    const normalized = normalizeSessionText(content);
    return normalized || null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue;
    }

    const record = block as { type?: unknown; text?: unknown };
    if (record.type !== 'text' || typeof record.text !== 'string') {
      continue;
    }

    const normalized = normalizeSessionText(record.text);
    if (normalized) {
      parts.push(normalized);
    }
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Parse session JSONL file and extract user/assistant messages.
 */
export async function parseSessionFile(absPath: string): Promise<SessionFileEntry | null> {
  try {
    const stat = await fs.stat(absPath);
    const raw = await fs.readFile(absPath, 'utf-8');
    const lines = raw.split('\n');

    const collected: string[] = [];
    const lineMap: number[] = [];

    for (let jsonlIdx = 0; jsonlIdx < lines.length; jsonlIdx++) {
      const line = lines[jsonlIdx];
      if (!line.trim()) {
        continue;
      }

      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue; // Skip invalid JSON
      }

      if (
        !record ||
        typeof record !== 'object' ||
        (record as { type?: unknown }).type !== 'message'
      ) {
        continue;
      }

      const message = (record as { message?: unknown }).message as
        | { role?: unknown; content?: unknown }
        | undefined;

      if (!message || typeof message.role !== 'string') {
        continue;
      }

      if (message.role !== 'user' && message.role !== 'assistant') {
        continue;
      }

      const text = extractSessionText(message.content);
      if (!text) {
        continue;
      }

      const label = message.role === 'user' ? 'User' : 'Assistant';
      collected.push(`${label}: ${text}`);
      lineMap.push(jsonlIdx + 1);
    }

    const content = collected.join('\n');
    const hash = require('crypto')
      .createHash('sha256')
      .update(content + '\n' + lineMap.join(','))
      .digest('hex');

    return {
      path: path.basename(absPath),
      absPath,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      hash,
      content,
      lineMap,
    };
  } catch (error) {
    logger.debug({ error, path: absPath }, 'Failed to parse session file');
    return null;
  }
}

/**
 * List all session files for an agent.
 */
export async function listSessionFiles(sessionsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => path.join(sessionsDir, entry.name));
  } catch {
    return [];
  }
}
```

### Step 4: Run test to verify it passes

```bash
npm test tests/memory/session/parser.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/memory/session/parser.ts tests/memory/session/parser.test.ts
git commit -m "feat(memory): add session file parser for JSONL transcripts"
```

---

## Task 12: LLM Slug Generator

**Files:**
- Create: `src/memory/session/slug.ts`
- Test: `tests/memory/session/slug.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/session/slug.test.ts
import { describe, it, expect } from 'vitest';
import { generateSlug, sanitizeSlug } from '../../src/memory/session/slug.js';

describe('LLM Slug Generator', () => {
  it('should generate slug from session content', async () => {
    const content = `
      User: Can you help me debug this API issue?
      Assistant: Sure! What's the error?
      User: Getting 404 on /api/users
      Assistant: Let me check the routes...
    `;

    const slug = await generateSlug(content, {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || 'test-key',
    });

    expect(slug).toBeDefined();
    expect(slug.length).toBeGreaterThan(0);
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it('should sanitize slug', () => {
    expect(sanitizeSlug('Hello World!')).toBe('hello-world');
    expect(sanitizeSlug('API/Debug Issue')).toBe('api-debug-issue');
    expect(sanitizeSlug('Test   Multiple   Spaces')).toBe('test-multiple-spaces');
  });

  it('should fallback to timestamp on error', async () => {
    const slug = await generateSlug('', {
      provider: 'openai',
      apiKey: 'invalid-key',
    });

    expect(slug).toMatch(/^\d{4}$/); // HHMM format
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/session/slug.test.ts
```

Expected: FAIL

### Step 3: Write implementation

```typescript
// src/memory/session/slug.ts
import { logger } from '../../utils/logger.js';

export interface SlugGeneratorOptions {
  provider: 'openai' | 'deepseek' | 'openrouter';
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

const SLUG_PROMPT = `Generate a short, descriptive slug (2-4 words, kebab-case) for this conversation.
Focus on the main topic or task. Examples: "api-debugging", "vendor-pitch", "bug-fix".

Conversation:
{content}

Slug:`;

/**
 * Sanitize slug to kebab-case.
 */
export function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Generate timestamp-based fallback slug (HHMM).
 */
function generateFallbackSlug(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}${minutes}`;
}

/**
 * Generate descriptive slug using LLM.
 */
export async function generateSlug(
  content: string,
  options: SlugGeneratorOptions,
): Promise<string> {
  if (!content.trim()) {
    return generateFallbackSlug();
  }

  try {
    const baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    const model = options.model || 'gpt-4o-mini';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: SLUG_PROMPT.replace('{content}', content.slice(0, 2000)),
          },
        ],
        max_tokens: 20,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const rawSlug = data.choices[0]?.message?.content?.trim() || '';

    if (!rawSlug) {
      throw new Error('Empty slug from LLM');
    }

    return sanitizeSlug(rawSlug);
  } catch (error) {
    logger.warn({ error }, 'Failed to generate LLM slug, using fallback');
    return generateFallbackSlug();
  }
}
```

### Step 4: Run test to verify it passes

```bash
npm test tests/memory/session/slug.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/memory/session/slug.ts tests/memory/session/slug.test.ts
git commit -m "feat(memory): add LLM-based slug generation for sessions"
```

---

## Task 13: Session-to-Memory Hook

**Files:**
- Create: `src/memory/session/hook.ts`
- Test: `tests/memory/session/hook.test.ts`

### Step 1: Write the failing test

```typescript
// tests/memory/session/hook.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveSessionToMemory } from '../../src/memory/session/hook.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Session-to-Memory Hook', () => {
  let workspaceDir: string;
  let sessionFile: string;

  beforeEach(() => {
    workspaceDir = path.join(os.tmpdir(), `workspace-${Date.now()}`);
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, 'memory'), { recursive: true });

    // Create test session file
    sessionFile = path.join(workspaceDir, 'session.jsonl');
    const content = [
      JSON.stringify({ type: 'message', message: { role: 'user', content: 'Hello' } }),
      JSON.stringify({ type: 'message', message: { role: 'assistant', content: 'Hi!' } }),
    ].join('\n');
    fs.writeFileSync(sessionFile, content);
  });

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('should save session to memory file', async () => {
    await saveSessionToMemory({
      sessionFile,
      workspaceDir,
      sessionKey: 'test-session',
      sessionId: 'sess123',
      source: 'cli',
    });

    const memoryFiles = fs.readdirSync(path.join(workspaceDir, 'memory'));
    expect(memoryFiles.length).toBe(1);
    expect(memoryFiles[0]).toMatch(/^\d{4}-\d{2}-\d{2}-.*\.md$/);

    const content = fs.readFileSync(
      path.join(workspaceDir, 'memory', memoryFiles[0]),
      'utf-8',
    );
    expect(content).toContain('# Session:');
    expect(content).toContain('User: Hello');
    expect(content).toContain('Assistant: Hi!');
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test tests/memory/session/hook.test.ts
```

Expected: FAIL

### Step 3: Write implementation

```typescript
// src/memory/session/hook.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSessionFile } from './parser.js';
import { generateSlug } from './slug.js';
import { logger } from '../../utils/logger.js';

export interface SaveSessionOptions {
  sessionFile: string;
  workspaceDir: string;
  sessionKey: string;
  sessionId: string;
  source: string;
  messageCount?: number;
  slugOptions?: {
    provider: 'openai' | 'deepseek' | 'openrouter';
    apiKey: string;
    baseUrl?: string;
  };
}

/**
 * Save session context to memory when /new command is triggered.
 */
export async function saveSessionToMemory(options: SaveSessionOptions): Promise<string | null> {
  const { sessionFile, workspaceDir, sessionKey, sessionId, source, messageCount = 15, slugOptions } = options;

  try {
    const memoryDir = path.join(workspaceDir, 'memory');
    await fs.mkdir(memoryDir, { recursive: true });

    // Parse session file
    const entry = await parseSessionFile(sessionFile);
    if (!entry) {
      logger.warn({ sessionFile }, 'Failed to parse session file');
      return null;
    }

    // Get recent messages
    const lines = entry.content.split('\n');
    const recentLines = lines.slice(-messageCount);
    const sessionContent = recentLines.join('\n');

    // Generate slug
    let slug: string;
    if (slugOptions && sessionContent) {
      slug = await generateSlug(sessionContent, slugOptions);
    } else {
      // Fallback to timestamp
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      slug = `${hours}${minutes}`;
    }

    // Create filename
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
    const filename = `${dateStr}-${slug}.md`;
    const memoryFilePath = path.join(memoryDir, filename);

    // Build markdown entry
    const entry_content = [
      `# Session: ${dateStr} ${timeStr} UTC`,
      '',
      `- **Session Key**: ${sessionKey}`,
      `- **Session ID**: ${sessionId}`,
      `- **Source**: ${source}`,
      '',
      '## Conversation Summary',
      '',
      sessionContent,
      '',
    ].join('\n');

    // Write to memory file
    await fs.writeFile(memoryFilePath, entry_content, 'utf-8');

    logger.info({ path: memoryFilePath }, 'Session saved to memory');
    return memoryFilePath;
  } catch (error) {
    logger.error({ error }, 'Failed to save session to memory');
    return null;
  }
}
```

### Step 4: Run test to verify it passes

```bash
npm test tests/memory/session/hook.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/memory/session/hook.ts tests/memory/session/hook.test.ts
git commit -m "feat(memory): add session-to-memory hook with LLM slugs"
```

---

## Progress Tracker

### Completed ✅
- [x] Task 11: Session File Parser
- [x] Task 12: LLM Slug Generator
- [x] Task 13: Session-to-Memory Hook

### Next Steps
- Continue to Part 6: Polish & Integration
- Implement file watcher
- Implement embedding cache
- Write integration tests
- Update documentation

---

**Part 5 Status:** Complete ✅  
**Next:** Part 6 - Polish, Testing & Integration  
**Estimated Time:** 3-4 days
