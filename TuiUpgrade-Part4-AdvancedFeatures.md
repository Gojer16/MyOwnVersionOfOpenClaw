# Talon TUI Upgrade Implementation Plan - Part 4: Advanced Features

> **For Claude:** Follow TDD - Write test first, see it fail, implement, see it pass, commit.

---

## Task 13: Create Markdown Component with Syntax Highlighting

**Files:**
- Create: `src/tui/components/markdown.tsx`
- Create: `src/tui/utils/syntax-highlight.ts`

**Step 1: Install additional dependency**

```bash
npm install marked@^12.0.0 marked-terminal@^7.0.0
```

**Step 2: Create syntax highlighter utility**

```typescript
// src/tui/utils/syntax-highlight.ts
import { highlight } from 'cli-highlight';
import chalk from 'chalk';

export interface HighlightOptions {
  language?: string;
  theme?: 'default' | 'monokai' | 'github';
}

export function highlightCode(
  code: string, 
  options: HighlightOptions = {}
): string {
  const { language = 'javascript', theme = 'monokai' } = options;

  try {
    return highlight(code, {
      language,
      theme: {
        keyword: chalk.hex('#F92672'),
        built_in: chalk.hex('#66D9EF'),
        string: chalk.hex('#E6DB74'),
        number: chalk.hex('#AE81FF'),
        comment: chalk.hex('#75715E'),
        function: chalk.hex('#A6E22E'),
        class: chalk.hex('#A6E22E'),
        params: chalk.hex('#FD971F'),
      },
    });
  } catch {
    // Fallback if highlighting fails
    return code;
  }
}

export function detectLanguage(code: string): string {
  // Simple language detection
  if (code.includes('function') || code.includes('const') || code.includes('let')) {
    return 'javascript';
  }
  if (code.includes('def ') || code.includes('import ')) {
    return 'python';
  }
  if (code.includes('interface') || code.includes('type ')) {
    return 'typescript';
  }
  if (code.includes('<?php')) {
    return 'php';
  }
  if (code.includes('package ') || code.includes('func ')) {
    return 'go';
  }
  return 'text';
}
```

**Step 3: Create Markdown component**

```typescript
// src/tui/components/markdown.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';
import { highlightCode, detectLanguage } from '../utils/syntax-highlight.js';
import { theme } from '../theme/index.js';

export interface MarkdownProps {
  content: string;
  maxWidth?: number;
}

interface ParsedNode {
  type: 'text' | 'code' | 'quote' | 'heading' | 'list';
  content: string;
  level?: number;
  language?: string;
}

function parseMarkdown(content: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  
  // Parse with marked
  const tokens = marked.lexer(content);
  
  for (const token of tokens) {
    switch (token.type) {
      case 'code':
        nodes.push({
          type: 'code',
          content: token.text,
          language: token.lang || detectLanguage(token.text),
        });
        break;
        
      case 'blockquote':
        nodes.push({
          type: 'quote',
          content: token.text,
        });
        break;
        
      case 'heading':
        nodes.push({
          type: 'heading',
          content: token.text,
          level: token.depth,
        });
        break;
        
      case 'list':
        const items = token.items.map(item => `• ${item.text}`).join('\n');
        nodes.push({
          type: 'list',
          content: items,
        });
        break;
        
      case 'paragraph':
      case 'text':
        nodes.push({
          type: 'text',
          content: token.text || (token as any).raw,
        });
        break;
    }
  }
  
  return nodes;
}

export function Markdown({ content, maxWidth = 80 }: MarkdownProps) {
  const nodes = parseMarkdown(content);

  return (
    <Box flexDirection="column">
      {nodes.map((node, index) => {
        switch (node.type) {
          case 'code':
            return (
              <Box 
                key={index}
                flexDirection="column"
                borderStyle="round"
                borderColor="gray"
                paddingX={1}
                marginY={1}
              >
                <Text dimColor>{node.language}</Text>
                <Text>{highlightCode(node.content, { language: node.language })}</Text>
              </Box>
            );

          case 'quote':
            return (
              <Box 
                key={index}
                borderStyle="round"
                borderColor="blue"
                paddingX={1}
                marginY={1}
              >
                <Text color="blue">❝ {node.content}</Text>
              </Box>
            );

          case 'heading':
            const headingColor = node.level === 1 ? 'yellow' : 'cyan';
            return (
              <Box key={index} marginY={1}>
                <Text bold color={headingColor}>
                  {'#'.repeat(node.level || 1)} {node.content}
                </Text>
              </Box>
            );

          case 'list':
            return (
              <Box key={index} marginY={1} paddingLeft={2}>
                <Text color="cyan">{node.content}</Text>
              </Box>
            );

          case 'text':
          default:
            return (
              <Box key={index} marginY={1}>
                <Text>{node.content}</Text>
              </Box>
            );
        }
      })}
    </Box>
  );
}
```

**Step 4: Add test**

```typescript
// Add to tests/unit/tui-components.test.tsx

describe('Markdown', () => {
  it('should render plain text', () => {
    const { lastFrame } = render(<Markdown content="Hello world" />);
    expect(lastFrame()).toContain('Hello world');
  });

  it('should render code blocks', () => {
    const content = '```javascript\nconst x = 1;\n```';
    const { lastFrame } = render(<Markdown content={content} />);
    expect(lastFrame()).toContain('const x = 1');
    expect(lastFrame()).toContain('javascript');
  });

  it('should render quotes', () => {
    const content = '> This is a quote';
    const { lastFrame } = render(<Markdown content={content} />);
    expect(lastFrame()).toContain('This is a quote');
    expect(lastFrame()).toContain('❝');
  });

  it('should render headings', () => {
    const content = '# Heading 1\n## Heading 2';
    const { lastFrame } = render(<Markdown content={content} />);
    expect(lastFrame()).toContain('# Heading 1');
    expect(lastFrame()).toContain('## Heading 2');
  });

  it('should render lists', () => {
    const content = '- Item 1\n- Item 2';
    const { lastFrame } = render(<Markdown content={content} />);
    expect(lastFrame()).toContain('• Item 1');
    expect(lastFrame()).toContain('• Item 2');
  });
});
```

**Step 5: Run tests**

Run: `npm test -- tui-components.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tui/components/markdown.tsx src/tui/utils/syntax-highlight.ts tests/unit/tui-components.test.tsx package.json
git commit -m "feat(tui): add Markdown component with syntax highlighting"
```

---

## Task 14: Create Fuzzy Search Utility

**Files:**
- Create: `src/tui/utils/fuzzy.ts`

**Step 1: Implement fuzzy search**

```typescript
// src/tui/utils/fuzzy.ts
import Fuse from 'fuse.js';

export interface FuzzySearchOptions<T> {
  keys: string[];
  threshold?: number;
  limit?: number;
}

export interface FuzzyResult<T> {
  item: T;
  score: number;
  matches: Array<{
    key: string;
    indices: [number, number][];
  }>;
}

export function fuzzySearch<T>(
  items: T[],
  query: string,
  options: FuzzySearchOptions<T>
): FuzzyResult<T>[] {
  const { keys, threshold = 0.4, limit = 10 } = options;

  if (!query.trim()) {
    return items.slice(0, limit).map(item => ({
      item,
      score: 0,
      matches: [],
    }));
  }

  const fuse = new Fuse(items, {
    keys,
    threshold,
    includeScore: true,
    includeMatches: true,
  });

  const results = fuse.search(query, { limit });

  return results.map(result => ({
    item: result.item,
    score: result.score || 0,
    matches: (result.matches || []).map(match => ({
      key: match.key || '',
      indices: match.indices || [],
    })),
  }));
}

export function highlightMatches(
  text: string,
  indices: [number, number][],
  highlightFn: (text: string) => string
): string {
  if (!indices.length) return text;

  let result = '';
  let lastIndex = 0;

  for (const [start, end] of indices) {
    result += text.slice(lastIndex, start);
    result += highlightFn(text.slice(start, end + 1));
    lastIndex = end + 1;
  }

  result += text.slice(lastIndex);
  return result;
}
```

**Step 2: Add test**

```typescript
// tests/unit/tui-utils.test.ts
import { describe, it, expect } from 'vitest';
import { fuzzySearch, highlightMatches } from '@/tui/utils/fuzzy.js';

describe('Fuzzy Search', () => {
  const items = [
    { name: 'file_read', description: 'Read a file' },
    { name: 'file_write', description: 'Write to a file' },
    { name: 'shell_exec', description: 'Execute shell command' },
    { name: 'web_search', description: 'Search the web' },
  ];

  it('should find exact matches', () => {
    const results = fuzzySearch(items, 'file_read', { keys: ['name'] });
    expect(results[0].item.name).toBe('file_read');
  });

  it('should find fuzzy matches', () => {
    const results = fuzzySearch(items, 'frd', { keys: ['name'] });
    expect(results[0].item.name).toBe('file_read');
  });

  it('should search multiple keys', () => {
    const results = fuzzySearch(items, 'shell', { keys: ['name', 'description'] });
    expect(results[0].item.name).toBe('shell_exec');
  });

  it('should limit results', () => {
    const results = fuzzySearch(items, 'file', { keys: ['name'], limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('should return all items when query is empty', () => {
    const results = fuzzySearch(items, '', { keys: ['name'] });
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('Highlight Matches', () => {
  it('should highlight matched indices', () => {
    const text = 'file_read';
    const indices: [number, number][] = [[0, 3], [5, 8]];
    const result = highlightMatches(text, indices, (t) => `[${t}]`);
    expect(result).toBe('[file]_[read]');
  });

  it('should handle no matches', () => {
    const text = 'file_read';
    const result = highlightMatches(text, [], (t) => `[${t}]`);
    expect(result).toBe('file_read');
  });
});
```

**Step 3: Run tests**

Run: `npm test -- tui-utils.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tui/utils/fuzzy.ts tests/unit/tui-utils.test.ts
git commit -m "feat(tui): add fuzzy search utility"
```

---

## Task 15: Create Model Picker Overlay

**Files:**
- Create: `src/tui/components/overlays/model-picker.tsx`

**Step 1: Implement ModelPicker**

```typescript
// src/tui/components/overlays/model-picker.tsx
import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { fuzzySearch, highlightMatches } from '../../utils/fuzzy.js';
import chalk from 'chalk';

export interface Model {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  supportsReasoning?: boolean;
}

export interface ModelPickerProps {
  models: Model[];
  currentModel?: string;
  onSelect: (model: Model) => void;
  onCancel: () => void;
}

export function ModelPicker({
  models,
  currentModel,
  onSelect,
  onCancel,
}: ModelPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      return models;
    }

    const results = fuzzySearch(models, searchQuery, {
      keys: ['name', 'provider', 'id'],
      limit: 20,
    });

    return results.map(r => r.item);
  }, [models, searchQuery]);

  const items = filteredModels.map(model => ({
    label: formatModelLabel(model, currentModel === model.id),
    value: model.id,
  }));

  return (
    <Box 
      flexDirection="column" 
      borderStyle="double" 
      borderColor="yellow"
      padding={2}
      width={80}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="yellow">🎯 Select Model</Text>
        <Text dimColor> (Esc to cancel)</Text>
      </Box>

      {/* Search Input */}
      <Box marginBottom={1}>
        <Text dimColor>Search: </Text>
        <TextInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Type to filter..."
        />
      </Box>

      {/* Model List */}
      <Box flexDirection="column" height={15} overflow="hidden">
        {items.length === 0 ? (
          <Text dimColor>No models found</Text>
        ) : (
          <SelectInput
            items={items}
            onSelect={(item) => {
              const model = models.find(m => m.id === item.value);
              if (model) onSelect(model);
            }}
          />
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          {filteredModels.length} of {models.length} models
        </Text>
      </Box>
    </Box>
  );
}

function formatModelLabel(model: Model, isCurrent: boolean): string {
  const prefix = isCurrent ? '● ' : '○ ';
  const name = chalk.cyan(model.name);
  const provider = chalk.dim(`(${model.provider})`);
  const context = model.contextWindow 
    ? chalk.dim(` • ${(model.contextWindow / 1000).toFixed(0)}k`)
    : '';
  const reasoning = model.supportsReasoning 
    ? chalk.yellow(' • 🧠')
    : '';

  return `${prefix}${name} ${provider}${context}${reasoning}`;
}
```

**Step 2: Add test**

```typescript
// Add to tests/unit/tui-components.test.tsx

describe('ModelPicker', () => {
  const models: Model[] = [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', contextWindow: 128000 },
    { id: 'claude-3', name: 'Claude 3', provider: 'Anthropic', contextWindow: 200000 },
    { id: 'deepseek', name: 'DeepSeek', provider: 'DeepSeek', contextWindow: 64000 },
  ];

  it('should render model list', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    
    const { lastFrame } = render(
      <ModelPicker
        models={models}
        onSelect={onSelect}
        onCancel={onCancel}
      />
    );
    
    expect(lastFrame()).toContain('Select Model');
    expect(lastFrame()).toContain('GPT-4o');
    expect(lastFrame()).toContain('Claude 3');
  });

  it('should highlight current model', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    
    const { lastFrame } = render(
      <ModelPicker
        models={models}
        currentModel="gpt-4o"
        onSelect={onSelect}
        onCancel={onCancel}
      />
    );
    
    expect(lastFrame()).toContain('●'); // Current model indicator
  });

  it('should filter models by search', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    
    const { lastFrame, stdin } = render(
      <ModelPicker
        models={models}
        onSelect={onSelect}
        onCancel={onCancel}
      />
    );
    
    stdin.write('claude');
    
    expect(lastFrame()).toContain('Claude 3');
    expect(lastFrame()).not.toContain('GPT-4o');
  });
});
```

**Step 3: Run tests**

Run: `npm test -- tui-components.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tui/components/overlays/model-picker.tsx tests/unit/tui-components.test.tsx
git commit -m "feat(tui): add ModelPicker overlay with fuzzy search"
```

---

## Task 16: Create Session Picker Overlay

**Files:**
- Create: `src/tui/components/overlays/session-picker.tsx`

**Step 1: Implement SessionPicker**

```typescript
// src/tui/components/overlays/session-picker.tsx
import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { fuzzySearch } from '../../utils/fuzzy.js';
import chalk from 'chalk';

export interface Session {
  id: string;
  key: string;
  lastMessage?: string;
  timestamp: Date;
  messageCount: number;
  tokenCount: number;
}

export interface SessionPickerProps {
  sessions: Session[];
  currentSessionId?: string;
  onSelect: (session: Session) => void;
  onCancel: () => void;
  onNewSession: () => void;
}

export function SessionPicker({
  sessions,
  currentSessionId,
  onSelect,
  onCancel,
  onNewSession,
}: SessionPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) {
      return sessions;
    }

    const results = fuzzySearch(sessions, searchQuery, {
      keys: ['key', 'lastMessage'],
      limit: 20,
    });

    return results.map(r => r.item);
  }, [sessions, searchQuery]);

  const items = [
    {
      label: chalk.green('+ New Session'),
      value: '__new__',
    },
    ...filteredSessions.map(session => ({
      label: formatSessionLabel(session, currentSessionId === session.id),
      value: session.id,
    })),
  ];

  return (
    <Box 
      flexDirection="column" 
      borderStyle="double" 
      borderColor="cyan"
      padding={2}
      width={80}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">💬 Select Session</Text>
        <Text dimColor> (Esc to cancel)</Text>
      </Box>

      {/* Search Input */}
      <Box marginBottom={1}>
        <Text dimColor>Search: </Text>
        <TextInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Type to filter..."
        />
      </Box>

      {/* Session List */}
      <Box flexDirection="column" height={15} overflow="hidden">
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__new__') {
              onNewSession();
            } else {
              const session = sessions.find(s => s.id === item.value);
              if (session) onSelect(session);
            }
          }}
        />
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          {filteredSessions.length} of {sessions.length} sessions
        </Text>
      </Box>
    </Box>
  );
}

function formatSessionLabel(session: Session, isCurrent: boolean): string {
  const prefix = isCurrent ? '● ' : '○ ';
  const key = chalk.cyan(session.key.slice(0, 20));
  const preview = session.lastMessage 
    ? chalk.dim(` • ${session.lastMessage.slice(0, 30)}...`)
    : '';
  const time = chalk.dim(` • ${formatRelativeTime(session.timestamp)}`);
  const stats = chalk.dim(` • ${session.messageCount} msgs, ${(session.tokenCount / 1000).toFixed(1)}k tokens`);

  return `${prefix}${key}${preview}${time}${stats}`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
```

**Step 2: Add test**

```typescript
// Add to tests/unit/tui-components.test.tsx

describe('SessionPicker', () => {
  const sessions: Session[] = [
    {
      id: 's1',
      key: 'cli:user1',
      lastMessage: 'Hello world',
      timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      messageCount: 5,
      tokenCount: 1000,
    },
    {
      id: 's2',
      key: 'cli:user2',
      lastMessage: 'Test message',
      timestamp: new Date(Date.now() - 86400000), // 1 day ago
      messageCount: 10,
      tokenCount: 5000,
    },
  ];

  it('should render session list', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const onNewSession = vi.fn();
    
    const { lastFrame } = render(
      <SessionPicker
        sessions={sessions}
        onSelect={onSelect}
        onCancel={onCancel}
        onNewSession={onNewSession}
      />
    );
    
    expect(lastFrame()).toContain('Select Session');
    expect(lastFrame()).toContain('New Session');
    expect(lastFrame()).toContain('cli:user1');
  });

  it('should show new session option', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const onNewSession = vi.fn();
    
    const { lastFrame } = render(
      <SessionPicker
        sessions={sessions}
        onSelect={onSelect}
        onCancel={onCancel}
        onNewSession={onNewSession}
      />
    );
    
    expect(lastFrame()).toContain('+ New Session');
  });
});
```

**Step 3: Run tests**

Run: `npm test -- tui-components.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tui/components/overlays/session-picker.tsx tests/unit/tui-components.test.tsx
git commit -m "feat(tui): add SessionPicker overlay"
```

---

**Next:** See `TuiUpgrade-Part5-Integration.md` for keyboard shortcuts, App integration, and final polish.
