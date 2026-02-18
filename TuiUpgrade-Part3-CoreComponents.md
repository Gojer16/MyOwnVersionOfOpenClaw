# Talon TUI Upgrade Implementation Plan - Part 3: Core Components

> **For Claude:** Follow TDD - Write test first, see it fail, implement, see it pass, commit.

---

## Task 8: Create Message Components

**Files:**
- Create: `src/tui/components/message-user.tsx`
- Create: `src/tui/components/message-assistant.tsx`
- Create: `tests/unit/tui-components.test.tsx`

**Step 1: Write failing test**

```typescript
// tests/unit/tui-components.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { UserMessage } from '@/tui/components/message-user.js';
import { AssistantMessage } from '@/tui/components/message-assistant.js';

describe('Message Components', () => {
  describe('UserMessage', () => {
    it('should render user message', () => {
      const { lastFrame } = render(<UserMessage text="Hello world" />);
      expect(lastFrame()).toContain('Hello world');
      expect(lastFrame()).toContain('You');
    });

    it('should show timestamp', () => {
      const timestamp = new Date('2026-02-18T18:00:00Z');
      const { lastFrame } = render(
        <UserMessage text="Test" timestamp={timestamp} />
      );
      expect(lastFrame()).toContain('18:00');
    });
  });

  describe('AssistantMessage', () => {
    it('should render assistant message', () => {
      const { lastFrame } = render(<AssistantMessage text="Hi there!" />);
      expect(lastFrame()).toContain('Hi there!');
      expect(lastFrame()).toContain('🦅');
    });

    it('should show streaming indicator', () => {
      const { lastFrame } = render(
        <AssistantMessage text="Thinking..." isStreaming={true} />
      );
      expect(lastFrame()).toContain('⏳');
    });

    it('should show token usage', () => {
      const { lastFrame } = render(
        <AssistantMessage 
          text="Done" 
          tokens={{ input: 100, output: 50, total: 150 }}
        />
      );
      expect(lastFrame()).toContain('150');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tui-components.test.tsx`
Expected: FAIL - "Cannot find module"

**Step 3: Implement UserMessage component**

```typescript
// src/tui/components/message-user.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme/index.js';

export interface UserMessageProps {
  text: string;
  timestamp?: Date;
}

export function UserMessage({ text, timestamp }: UserMessageProps) {
  const timeStr = timestamp 
    ? timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <Box 
      flexDirection="column" 
      borderStyle="round" 
      borderColor="yellow"
      paddingX={1}
      marginY={1}
    >
      {/* Header */}
      <Box>
        <Text color="cyan" bold>You</Text>
        {timeStr && (
          <>
            <Text dimColor> • </Text>
            <Text dimColor>{timeStr}</Text>
          </>
        )}
      </Box>

      {/* Content */}
      <Box marginTop={1}>
        <Text>{text}</Text>
      </Box>
    </Box>
  );
}
```

**Step 4: Implement AssistantMessage component**

```typescript
// src/tui/components/message-assistant.tsx
import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme/index.js';

export interface AssistantMessageProps {
  text: string;
  isStreaming?: boolean;
  timestamp?: Date;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  model?: string;
}

export function AssistantMessage({ 
  text, 
  isStreaming = false,
  timestamp,
  tokens,
  model,
}: AssistantMessageProps) {
  const timeStr = timestamp 
    ? timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <Box 
      flexDirection="column" 
      borderStyle="round" 
      borderColor="gray"
      paddingX={1}
      marginY={1}
    >
      {/* Header */}
      <Box>
        <Text color="green">🦅 Talon</Text>
        {isStreaming && (
          <>
            <Text dimColor> • </Text>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
          </>
        )}
        {timeStr && !isStreaming && (
          <>
            <Text dimColor> • </Text>
            <Text dimColor>{timeStr}</Text>
          </>
        )}
        {model && (
          <>
            <Text dimColor> • </Text>
            <Text dimColor>{model}</Text>
          </>
        )}
      </Box>

      {/* Content */}
      <Box marginTop={1} flexDirection="column">
        <Text>{text}</Text>
      </Box>

      {/* Footer with tokens */}
      {tokens && !isStreaming && (
        <Box marginTop={1}>
          <Text dimColor>
            💰 {tokens.input} → {tokens.output} = {tokens.total} tokens
          </Text>
        </Box>
      )}
    </Box>
  );
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tui-components.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tui/components/message-*.tsx tests/unit/tui-components.test.tsx
git commit -m "feat(tui): add UserMessage and AssistantMessage components"
```

---

## Task 9: Create ToolCard Component

**Files:**
- Create: `src/tui/components/tool-card.tsx`

**Step 1: Write failing test**

```typescript
// Add to tests/unit/tui-components.test.tsx

describe('ToolCard', () => {
  it('should render tool call', () => {
    const { lastFrame } = render(
      <ToolCard 
        toolName="file_read"
        args={{ path: "config.json" }}
        status="pending"
      />
    );
    expect(lastFrame()).toContain('file_read');
    expect(lastFrame()).toContain('config.json');
    expect(lastFrame()).toContain('🛠️');
  });

  it('should show success result', () => {
    const { lastFrame } = render(
      <ToolCard 
        toolName="file_read"
        args={{ path: "config.json" }}
        status="success"
        result="{ content: 'test' }"
        duration={120}
      />
    );
    expect(lastFrame()).toContain('✅');
    expect(lastFrame()).toContain('120ms');
  });

  it('should show error', () => {
    const { lastFrame } = render(
      <ToolCard 
        toolName="file_read"
        args={{ path: "missing.txt" }}
        status="error"
        error="File not found"
      />
    );
    expect(lastFrame()).toContain('❌');
    expect(lastFrame()).toContain('File not found');
  });

  it('should be expandable', () => {
    const { lastFrame, rerender } = render(
      <ToolCard 
        toolName="file_read"
        args={{ path: "config.json" }}
        status="success"
        result="Long result..."
        isExpanded={false}
      />
    );
    
    expect(lastFrame()).not.toContain('Long result');
    
    rerender(
      <ToolCard 
        toolName="file_read"
        args={{ path: "config.json" }}
        status="success"
        result="Long result..."
        isExpanded={true}
      />
    );
    
    expect(lastFrame()).toContain('Long result');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tui-components.test.tsx`
Expected: FAIL - "Cannot find module"

**Step 3: Implement ToolCard component**

```typescript
// src/tui/components/tool-card.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme/index.js';

export interface ToolCardProps {
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  result?: string;
  error?: string;
  duration?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function ToolCard({
  toolName,
  args,
  status,
  result,
  error,
  duration,
  isExpanded = false,
  onToggleExpand,
}: ToolCardProps) {
  const statusIcon = {
    pending: <Spinner type="dots" />,
    success: '✅',
    error: '❌',
  }[status];

  const borderColor = {
    pending: 'yellow',
    success: 'green',
    error: 'red',
  }[status];

  // Format args for display
  const argsStr = Object.entries(args)
    .map(([key, value]) => {
      const valStr = typeof value === 'string' 
        ? `"${value}"` 
        : JSON.stringify(value);
      return `${key}=${valStr}`;
    })
    .join(', ');

  // Truncate result if not expanded
  const displayResult = result && !isExpanded && result.length > 100
    ? result.slice(0, 100) + '...'
    : result;

  return (
    <Box 
      flexDirection="column" 
      borderStyle="round" 
      borderColor={borderColor}
      paddingX={1}
      marginY={1}
    >
      {/* Header */}
      <Box>
        <Text>{statusIcon} </Text>
        <Text color="yellow" bold>{toolName}</Text>
        <Text dimColor>({argsStr})</Text>
      </Box>

      {/* Duration */}
      {duration !== undefined && status !== 'pending' && (
        <Box marginTop={1}>
          <Text dimColor>⏱️  {duration}ms</Text>
        </Box>
      )}

      {/* Result */}
      {result && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green">Result:</Text>
          <Box paddingLeft={2} marginTop={1}>
            <Text dimColor>{displayResult}</Text>
          </Box>
          {result.length > 100 && (
            <Box marginTop={1}>
              <Text dimColor>
                {isExpanded ? '▼ Collapse' : '▶ Expand'} 
                {onToggleExpand && ' (press E)'}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red">Error:</Text>
          <Box paddingLeft={2} marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tui-components.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/components/tool-card.tsx tests/unit/tui-components.test.tsx
git commit -m "feat(tui): add ToolCard component with expand/collapse"
```

---

## Task 10: Create ChatLog Component

**Files:**
- Create: `src/tui/components/chat-log.tsx`

**Step 1: Write ChatLog component**

```typescript
// src/tui/components/chat-log.tsx
import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { UserMessage } from './message-user.js';
import { AssistantMessage } from './message-assistant.js';
import { ToolCard } from './tool-card.js';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  model?: string;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  result?: string;
  error?: string;
  duration?: number;
  startTime: Date;
}

export interface ChatLogProps {
  messages: ChatMessage[];
  tools: ToolExecution[];
  toolsExpanded?: boolean;
  maxHeight?: number;
}

export function ChatLog({ 
  messages, 
  tools,
  toolsExpanded = false,
  maxHeight = 20,
}: ChatLogProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleToolExpand = useCallback((toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }, []);

  return (
    <Box flexDirection="column" height={maxHeight} overflow="hidden">
      {messages.length === 0 && (
        <Box paddingY={2}>
          <Text dimColor>No messages yet. Type something to get started...</Text>
        </Box>
      )}

      {messages.map((message) => {
        switch (message.type) {
          case 'user':
            return (
              <UserMessage
                key={message.id}
                text={message.text}
                timestamp={message.timestamp}
              />
            );

          case 'assistant':
            return (
              <AssistantMessage
                key={message.id}
                text={message.text}
                isStreaming={message.isStreaming}
                timestamp={message.timestamp}
                tokens={message.tokens}
                model={message.model}
              />
            );

          case 'system':
            return (
              <Box key={message.id} marginY={1}>
                <Text dimColor>ℹ️  {message.text}</Text>
              </Box>
            );

          default:
            return null;
        }
      })}

      {/* Tool Executions */}
      {toolsExpanded && tools.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">🛠️  Tool Executions</Text>
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              toolName={tool.toolName}
              args={tool.args}
              status={tool.status}
              result={tool.result}
              error={tool.error}
              duration={tool.duration}
              isExpanded={expandedTools.has(tool.id)}
              onToggleExpand={() => toggleToolExpand(tool.id)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
```

**Step 2: Add test for ChatLog**

```typescript
// Add to tests/unit/tui-components.test.tsx

describe('ChatLog', () => {
  it('should render empty state', () => {
    const { lastFrame } = render(<ChatLog messages={[]} tools={[]} />);
    expect(lastFrame()).toContain('No messages yet');
  });

  it('should render messages', () => {
    const messages = [
      {
        id: '1',
        type: 'user' as const,
        text: 'Hello',
        timestamp: new Date(),
      },
      {
        id: '2',
        type: 'assistant' as const,
        text: 'Hi there!',
        timestamp: new Date(),
      },
    ];

    const { lastFrame } = render(<ChatLog messages={messages} tools={[]} />);
    expect(lastFrame()).toContain('Hello');
    expect(lastFrame()).toContain('Hi there!');
  });

  it('should render tools when expanded', () => {
    const tools = [
      {
        id: 't1',
        toolName: 'file_read',
        args: { path: 'test.txt' },
        status: 'success' as const,
        result: 'File content',
        startTime: new Date(),
      },
    ];

    const { lastFrame } = render(
      <ChatLog messages={[]} tools={tools} toolsExpanded={true} />
    );
    
    expect(lastFrame()).toContain('file_read');
    expect(lastFrame()).toContain('test.txt');
  });
});
```

**Step 3: Run tests**

Run: `npm test -- tui-components.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tui/components/chat-log.tsx tests/unit/tui-components.test.tsx
git commit -m "feat(tui): add ChatLog component"
```

---

## Task 11: Create StatusBar Component

**Files:**
- Create: `src/tui/components/status-bar.tsx`

**Step 1: Implement StatusBar**

```typescript
// src/tui/components/status-bar.tsx
import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export interface StatusBarProps {
  isConnected: boolean;
  model: string;
  provider?: string;
  workspaceRoot: string;
  activity?: 'idle' | 'thinking' | 'streaming' | 'tool_executing';
  sessionId?: string;
}

export function StatusBar({
  isConnected,
  model,
  provider,
  workspaceRoot,
  activity = 'idle',
  sessionId,
}: StatusBarProps) {
  const connectionIcon = isConnected ? '✓' : '✗';
  const connectionColor = isConnected ? 'green' : 'red';
  const connectionText = isConnected ? 'Connected' : 'Disconnected';

  const activityText = {
    idle: '',
    thinking: '🤔 Thinking...',
    streaming: '📝 Streaming...',
    tool_executing: '🛠️  Executing tool...',
  }[activity];

  return (
    <Box 
      borderStyle="round" 
      borderColor="cyan" 
      paddingX={2}
      justifyContent="space-between"
    >
      {/* Left side */}
      <Box>
        <Text color={connectionColor}>{connectionIcon} {connectionText}</Text>
        {activity !== 'idle' && (
          <>
            <Text dimColor> | </Text>
            <Text color="yellow">
              <Spinner type="dots" /> {activityText}
            </Text>
          </>
        )}
      </Box>

      {/* Center */}
      <Box>
        <Text color="yellow">⚡ </Text>
        <Text>{model}</Text>
        {provider && <Text dimColor> ({provider})</Text>}
      </Box>

      {/* Right side */}
      <Box>
        <Text color="blue">📍 </Text>
        <Text dimColor>{workspaceRoot}</Text>
        {sessionId && (
          <>
            <Text dimColor> | </Text>
            <Text dimColor>Session: {sessionId.slice(0, 8)}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
```

**Step 2: Add test**

```typescript
// Add to tests/unit/tui-components.test.tsx

describe('StatusBar', () => {
  it('should show connected status', () => {
    const { lastFrame } = render(
      <StatusBar
        isConnected={true}
        model="gpt-4o"
        workspaceRoot="~/.talon"
      />
    );
    expect(lastFrame()).toContain('✓ Connected');
    expect(lastFrame()).toContain('gpt-4o');
  });

  it('should show activity', () => {
    const { lastFrame } = render(
      <StatusBar
        isConnected={true}
        model="gpt-4o"
        workspaceRoot="~/.talon"
        activity="thinking"
      />
    );
    expect(lastFrame()).toContain('Thinking');
  });

  it('should show session ID', () => {
    const { lastFrame } = render(
      <StatusBar
        isConnected={true}
        model="gpt-4o"
        workspaceRoot="~/.talon"
        sessionId="abc123def456"
      />
    );
    expect(lastFrame()).toContain('abc123de');
  });
});
```

**Step 3: Run tests**

Run: `npm test -- tui-components.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tui/components/status-bar.tsx tests/unit/tui-components.test.tsx
git commit -m "feat(tui): add StatusBar component"
```

---

## Task 12: Create InputBar Component

**Files:**
- Create: `src/tui/components/input-bar.tsx`

**Step 1: Implement InputBar**

```typescript
// src/tui/components/input-bar.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export interface InputBarProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function InputBar({ 
  onSubmit, 
  placeholder = 'Type a message...',
  disabled = false,
}: InputBarProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  return (
    <Box marginTop={1}>
      <Text color="cyan" bold>You &gt; </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        showCursor={!disabled}
      />
    </Box>
  );
}
```

**Step 2: Add test**

```typescript
// Add to tests/unit/tui-components.test.tsx

describe('InputBar', () => {
  it('should render input', () => {
    const onSubmit = vi.fn();
    const { lastFrame } = render(<InputBar onSubmit={onSubmit} />);
    expect(lastFrame()).toContain('You >');
  });

  it('should call onSubmit when Enter pressed', () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<InputBar onSubmit={onSubmit} />);
    
    stdin.write('Hello world');
    stdin.write('\r'); // Enter key
    
    expect(onSubmit).toHaveBeenCalledWith('Hello world');
  });

  it('should clear input after submit', () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(<InputBar onSubmit={onSubmit} />);
    
    stdin.write('Test');
    stdin.write('\r');
    
    // Input should be cleared
    expect(lastFrame()).not.toContain('Test');
  });
});
```

**Step 3: Run tests**

Run: `npm test -- tui-components.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tui/components/input-bar.tsx tests/unit/tui-components.test.tsx
git commit -m "feat(tui): add InputBar component"
```

---

**Next:** See `TuiUpgrade-Part4-AdvancedFeatures.md` for overlays, markdown, and keyboard shortcuts.
