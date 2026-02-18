// src/tui/app.tsx
import React from 'react';
import { Box, Text } from 'ink';

export interface AppProps {
  gatewayUrl: string;
  initialModel?: string;
  workspaceRoot?: string;
}

export function App({ gatewayUrl, initialModel, workspaceRoot }: AppProps) {
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

      {/* Chat Area */}
      <Box flexDirection="column" marginTop={1}>
        <Text>Welcome to Talon TUI (Ink Edition)</Text>
        <Text dimColor>Type a message to get started...</Text>
      </Box>

      {/* Input Area */}
      <Box marginTop={1}>
        <Text color="cyan">You &gt; </Text>
        <Text dimColor>[Input component coming soon]</Text>
      </Box>
    </Box>
  );
}
