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

      <Box>
        <Text color="yellow">⚡ </Text>
        <Text>{model}</Text>
        {provider && <Text dimColor> ({provider})</Text>}
      </Box>

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
