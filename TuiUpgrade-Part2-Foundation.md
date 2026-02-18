# Talon TUI Upgrade Implementation Plan - Part 2: Foundation Setup

> **For Claude:** Follow TDD - Write test first, see it fail, implement, see it pass, commit.

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add Ink dependencies**

```bash
npm install ink@^4.4.1 ink-text-input@^5.0.1 ink-select-input@^5.0.0 ink-spinner@^5.0.0 react@^18.2.0 cli-highlight@^2.1.11 fuse.js@^7.0.0
```

**Step 2: Add dev dependencies**

```bash
npm install -D @types/react@^18.2.0 ink-testing-library@^3.0.0
```

**Step 3: Verify installation**

Run: `npm list ink react`
Expected: Shows installed versions

**Step 4: Update tsconfig.json for JSX**

```json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "React.createElement",
    "jsxFragmentFactory": "React.Fragment"
  }
}
```

**Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "feat(tui): add Ink and React dependencies"
```

---

## Task 2: Create Project Structure

**Files:**
- Create: `src/tui/` directory structure

**Step 1: Create directories**

```bash
mkdir -p src/tui/{components/overlays,hooks,theme,utils}
```

**Step 2: Create placeholder files**

```bash
touch src/tui/index.tsx
touch src/tui/app.tsx
touch src/tui/hooks/{use-gateway.ts,use-keyboard.ts,use-session.ts}
touch src/tui/components/{chat-log.tsx,message-user.tsx,message-assistant.tsx,tool-card.tsx,status-bar.tsx,input-bar.tsx,markdown.tsx}
touch src/tui/components/overlays/{model-picker.tsx,session-picker.tsx,agent-picker.tsx}
touch src/tui/theme/{colors.ts,styles.ts}
touch src/tui/utils/{fuzzy.ts,formatters.ts}
```

**Step 3: Verify structure**

Run: `tree src/tui -L 2`
Expected: Shows directory structure

**Step 4: Commit**

```bash
git add src/tui/
git commit -m "feat(tui): create project structure"
```

---

## Task 3: Create Theme System

**Files:**
- Create: `src/tui/theme/colors.ts`
- Create: `src/tui/theme/styles.ts`

**Step 1: Write colors.ts**

```typescript
// src/tui/theme/colors.ts
import chalk from 'chalk';

export const colors = {
  // Text
  text: '#E8E3D5',
  dim: '#7B7F87',
  accent: '#F6C453',
  accentSoft: '#F2A65A',
  
  // UI Elements
  border: '#3C414B',
  background: '#1E1E1E',
  
  // Messages
  userBg: '#2B2F36',
  userText: '#F3EEE0',
  assistantText: '#E8E3D5',
  systemText: '#9BA3B2',
  
  // Tools
  toolPendingBg: '#1F2A2F',
  toolSuccessBg: '#1E2D23',
  toolErrorBg: '#2F1F1F',
  toolTitle: '#F6C453',
  toolOutput: '#E1DACB',
  
  // Markdown
  quote: '#8CC8FF',
  quoteBorder: '#3B4D6B',
  code: '#F0C987',
  codeBlock: '#1E232A',
  codeBorder: '#343A45',
  link: '#7DD3A5',
  
  // Status
  error: '#F97066',
  success: '#7DD3A5',
  warning: '#F6C453',
  info: '#8CC8FF',
} as const;

export const theme = {
  text: chalk.hex(colors.text),
  dim: chalk.hex(colors.dim),
  accent: chalk.hex(colors.accent),
  accentSoft: chalk.hex(colors.accentSoft),
  error: chalk.hex(colors.error),
  success: chalk.hex(colors.success),
  warning: chalk.hex(colors.warning),
  info: chalk.hex(colors.info),
  userText: chalk.hex(colors.userText),
  assistantText: chalk.hex(colors.assistantText),
  systemText: chalk.hex(colors.systemText),
  toolTitle: chalk.hex(colors.toolTitle),
  toolOutput: chalk.hex(colors.toolOutput),
  quote: chalk.hex(colors.quote),
  code: chalk.hex(colors.code),
  link: chalk.hex(colors.link),
};
```

**Step 2: Write styles.ts**

```typescript
// src/tui/theme/styles.ts
import { colors } from './colors.js';

export const styles = {
  box: {
    borderStyle: 'round' as const,
    borderColor: colors.border,
    padding: 1,
  },
  
  userMessage: {
    borderStyle: 'round' as const,
    borderColor: colors.accent,
    padding: 1,
  },
  
  assistantMessage: {
    borderStyle: 'round' as const,
    borderColor: colors.dim,
    padding: 1,
  },
  
  toolCard: {
    borderStyle: 'round' as const,
    borderColor: colors.toolTitle,
    padding: 1,
  },
  
  overlay: {
    borderStyle: 'double' as const,
    borderColor: colors.accent,
    padding: 2,
  },
};
```

**Step 3: Test theme imports**

Create: `src/tui/theme/index.ts`

```typescript
export { colors, theme } from './colors.js';
export { styles } from './styles.js';
```

**Step 4: Commit**

```bash
git add src/tui/theme/
git commit -m "feat(tui): add theme system with colors and styles"
```

---

## Task 4: Create WebSocket Hook

**Files:**
- Create: `src/tui/hooks/use-gateway.ts`
- Create: `tests/unit/tui-hooks.test.ts`

**Step 1: Write failing test**

```typescript
// tests/unit/tui-hooks.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGateway } from '@/tui/hooks/use-gateway.js';

describe('useGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should connect to gateway', async () => {
    const { result } = renderHook(() => useGateway('ws://localhost:19789/ws'));
    
    expect(result.current.isConnected).toBe(false);
    
    await act(async () => {
      await result.current.connect();
    });
    
    expect(result.current.isConnected).toBe(true);
  });

  it('should handle incoming messages', async () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => 
      useGateway('ws://localhost:19789/ws', { onMessage })
    );
    
    await act(async () => {
      await result.current.connect();
    });
    
    // Simulate message
    // (Will be implemented with mock WebSocket)
    
    expect(onMessage).toHaveBeenCalled();
  });

  it('should send messages', async () => {
    const { result } = renderHook(() => useGateway('ws://localhost:19789/ws'));
    
    await act(async () => {
      await result.current.connect();
      await result.current.sendMessage('Hello');
    });
    
    expect(result.current.error).toBeNull();
  });

  it('should disconnect cleanly', async () => {
    const { result } = renderHook(() => useGateway('ws://localhost:19789/ws'));
    
    await act(async () => {
      await result.current.connect();
      result.current.disconnect();
    });
    
    expect(result.current.isConnected).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tui-hooks.test.ts`
Expected: FAIL - "Cannot find module '@/tui/hooks/use-gateway.js'"

**Step 3: Implement useGateway hook**

```typescript
// src/tui/hooks/use-gateway.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import WebSocket from 'ws';

export interface GatewayMessage {
  type: string;
  [key: string]: unknown;
}

export interface UseGatewayOptions {
  onMessage?: (message: GatewayMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  autoConnect?: boolean;
}

export interface UseGatewayReturn {
  isConnected: boolean;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (text: string) => Promise<void>;
  sendRaw: (data: unknown) => void;
}

export function useGateway(
  url: string,
  options: UseGatewayOptions = {}
): UseGatewayReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { onMessage, onConnect, onDisconnect, onError, autoConnect = false } = options;

  const connect = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.on('open', () => {
          setIsConnected(true);
          setError(null);
          onConnect?.();
          resolve();
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString()) as GatewayMessage;
            onMessage?.(message);
          } catch (err) {
            const parseError = err instanceof Error ? err : new Error('Parse error');
            setError(parseError);
            onError?.(parseError);
          }
        });

        ws.on('error', (err) => {
          const wsError = err instanceof Error ? err : new Error('WebSocket error');
          setError(wsError);
          onError?.(wsError);
          reject(wsError);
        });

        ws.on('close', () => {
          setIsConnected(false);
          onDisconnect?.();
        });
      } catch (err) {
        const connectError = err instanceof Error ? err : new Error('Connection failed');
        setError(connectError);
        reject(connectError);
      }
    });
  }, [url, onMessage, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!wsRef.current || !isConnected) {
      throw new Error('Not connected to gateway');
    }

    const message = {
      type: 'chat.message',
      text,
      timestamp: Date.now(),
    };

    wsRef.current.send(JSON.stringify(message));
  }, [isConnected]);

  const sendRaw = useCallback((data: unknown) => {
    if (!wsRef.current || !isConnected) {
      throw new Error('Not connected to gateway');
    }

    wsRef.current.send(JSON.stringify(data));
  }, [isConnected]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
    sendMessage,
    sendRaw,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tui-hooks.test.ts`
Expected: PASS (may need WebSocket mocking)

**Step 5: Commit**

```bash
git add src/tui/hooks/use-gateway.ts tests/unit/tui-hooks.test.ts
git commit -m "feat(tui): add useGateway WebSocket hook"
```

---

## Task 5: Create Session State Hook

**Files:**
- Create: `src/tui/hooks/use-session.ts`

**Step 1: Write use-session hook**

```typescript
// src/tui/hooks/use-session.ts
import { useState, useCallback } from 'react';

export interface SessionInfo {
  sessionId: string | null;
  agentId: string;
  model: string;
  provider: string;
  thinkingLevel: string;
  verboseLevel: string;
  contextTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UseSessionReturn {
  session: SessionInfo;
  updateSession: (updates: Partial<SessionInfo>) => void;
  resetSession: () => void;
}

const defaultSession: SessionInfo = {
  sessionId: null,
  agentId: 'default',
  model: 'unknown',
  provider: 'unknown',
  thinkingLevel: 'off',
  verboseLevel: 'off',
  contextTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export function useSession(initial?: Partial<SessionInfo>): UseSessionReturn {
  const [session, setSession] = useState<SessionInfo>({
    ...defaultSession,
    ...initial,
  });

  const updateSession = useCallback((updates: Partial<SessionInfo>) => {
    setSession((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetSession = useCallback(() => {
    setSession(defaultSession);
  }, []);

  return {
    session,
    updateSession,
    resetSession,
  };
}
```

**Step 2: Commit**

```bash
git add src/tui/hooks/use-session.ts
git commit -m "feat(tui): add useSession state hook"
```

---

## Task 6: Create Basic App Component

**Files:**
- Create: `src/tui/app.tsx`

**Step 1: Write App component**

```typescript
// src/tui/app.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from './theme/index.js';

export interface AppProps {
  gatewayUrl: string;
  initialModel?: string;
  workspaceRoot?: string;
}

export function App({ gatewayUrl, initialModel, workspaceRoot }: AppProps) {
  const [isReady, setIsReady] = useState(false);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Status Bar */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2}>
        <Text color="green">✓ Connected</Text>
        <Text dimColor> | </Text>
        <Text color="yellow">⚡ Model: </Text>
        <Text dimColor>{initialModel || 'unknown'}</Text>
        <Text dimColor> | </Text>
        <Text color="blue">📍 Workspace: </Text>
        <Text dimColor>{workspaceRoot || '~/.talon'}</Text>
      </Box>

      {/* Chat Area (placeholder) */}
      <Box flexDirection="column" marginTop={1}>
        <Text>Welcome to Talon TUI (Ink Edition)</Text>
        <Text dimColor>Type a message to get started...</Text>
      </Box>

      {/* Input Area (placeholder) */}
      <Box marginTop={1}>
        <Text color="cyan">You &gt; </Text>
        <Text dimColor>[Input component coming soon]</Text>
      </Box>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add src/tui/app.tsx
git commit -m "feat(tui): add basic App component"
```

---

## Task 7: Create Entry Point

**Files:**
- Create: `src/tui/index.tsx`

**Step 1: Write index.tsx**

```typescript
// src/tui/index.tsx
import React from 'react';
import { render } from 'ink';
import { App } from './app.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

const GATEWAY_URL = 'ws://127.0.0.1:19789/ws';

export async function startInkTUI(): Promise<void> {
  console.clear();

  // Check if gateway is running
  try {
    const healthCheck = await fetch('http://127.0.0.1:19789/api/health');
    if (!healthCheck.ok) {
      console.log(chalk.red('✗ Gateway is not responding'));
      console.log(chalk.dim('  Run `talon service start` or `talon start --daemon`\n'));
      process.exit(1);
    }
  } catch {
    console.log(chalk.red('✗ Gateway is not running'));
    console.log(chalk.dim('  Run `talon service start` or `talon start --daemon`\n'));
    process.exit(1);
  }

  // Load config
  const configPath = path.join(os.homedir(), '.talon', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Render Ink app
  const { waitUntilExit } = render(
    <App
      gatewayUrl={GATEWAY_URL}
      initialModel={config.agent.model}
      workspaceRoot={config.workspace.root}
    />
  );

  await waitUntilExit();
}
```

**Step 2: Update CLI to use new TUI**

Modify: `src/cli/index.ts`

Add import:
```typescript
import { startInkTUI } from '../tui/index.js';
```

Add command:
```typescript
.command('tui-new')
.description('Start interactive TUI (Ink edition)')
.action(async () => {
  await startInkTUI();
});
```

**Step 3: Test new TUI**

Run: `npm run build && node dist/cli/index.js tui-new`
Expected: Shows basic Ink UI with status bar

**Step 4: Commit**

```bash
git add src/tui/index.tsx src/cli/index.ts
git commit -m "feat(tui): add Ink TUI entry point"
```

---

**Next:** See `TuiUpgrade-Part3-CoreComponents.md` for ChatLog, Messages, and ToolCard implementation.
