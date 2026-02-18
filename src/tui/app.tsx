// src/tui/app.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useGateway } from './hooks/use-gateway.js';
import { useSession } from './hooks/use-session.js';
import { useKeyboard } from './hooks/use-keyboard.js';
import { StatusBar } from './components/status-bar.js';
import { ChatLog, ChatMessage, ToolExecution } from './components/chat-log.js';
import { InputBar } from './components/input-bar.js';
import { ModelPicker, Model } from './components/overlays/model-picker.js';
import { SessionPicker, Session } from './components/overlays/session-picker.js';

export interface AppProps {
  gatewayUrl: string;
  initialModel?: string;
  workspaceRoot?: string;
}

type Overlay = 'none' | 'model' | 'session';
type Activity = 'idle' | 'thinking' | 'streaming' | 'tool_executing';

export function App({ gatewayUrl, initialModel, workspaceRoot }: AppProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolExecution[]>([]);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [activity, setActivity] = useState<Activity>('idle');
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [models] = useState<Model[]>([
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', contextWindow: 128000 },
    { id: 'deepseek', name: 'DeepSeek', provider: 'DeepSeek', contextWindow: 64000 },
  ]);
  const [sessions] = useState<Session[]>([]);

  const { session, updateSession } = useSession({
    model: initialModel || 'unknown',
  });

  const { isConnected, connect, sendMessage } = useGateway(gatewayUrl, {
    onMessage: handleGatewayMessage,
    onConnect: () => {},
    onDisconnect: () => setActivity('idle'),
    autoConnect: true, // Auto-connect on mount
  });

  function handleGatewayMessage(msg: any) {
    switch (msg.type) {
      case 'chat.stream':
        setActivity('streaming');
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.type === 'assistant' && last.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: msg.text },
            ];
          }
          return [
            ...prev,
            {
              id: msg.runId || Date.now().toString(),
              type: 'assistant',
              text: msg.text,
              timestamp: new Date(),
              isStreaming: true,
            },
          ];
        });
        break;

      case 'chat.done':
        setActivity('idle');
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.type === 'assistant' && last.isStreaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                text: msg.text,
                isStreaming: false,
                tokens: msg.usage,
              },
            ];
          }
          return prev;
        });
        break;

      case 'tool.call':
        setActivity('tool_executing');
        setTools((prev) => [
          ...prev,
          {
            id: msg.toolCallId,
            toolName: msg.toolName,
            args: msg.args,
            status: 'pending',
            startTime: new Date(),
          },
        ]);
        break;

      case 'tool.result':
        setActivity('idle');
        setTools((prev) =>
          prev.map((tool) =>
            tool.id === msg.toolCallId
              ? {
                  ...tool,
                  status: msg.isError ? 'error' : 'success',
                  result: msg.result,
                  error: msg.error,
                  duration: Date.now() - tool.startTime.getTime(),
                }
              : tool
          )
        );
        break;
    }
  }

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!isConnected) return;

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'user',
          text,
          timestamp: new Date(),
        },
      ]);

      setActivity('thinking');
      await sendMessage(text);
    },
    [isConnected, sendMessage]
  );

  const handleClearScreen = useCallback(() => {
    setMessages([]);
    setTools([]);
  }, []);

  const handleToggleTools = useCallback(() => {
    setToolsExpanded((prev) => !prev);
  }, []);

  const handleModelSelect = useCallback((model: Model) => {
    updateSession({ model: model.id, provider: model.provider });
    setOverlay('none');
  }, [updateSession]);

  const handleSessionSelect = useCallback((session: Session) => {
    updateSession({ sessionId: session.id });
    setOverlay('none');
  }, [updateSession]);

  const handleNewSession = useCallback(() => {
    updateSession({ sessionId: null });
    setMessages([]);
    setTools([]);
    setOverlay('none');
  }, [updateSession]);

  useKeyboard({
    onCtrlC: () => {
      if (overlay !== 'none') {
        setOverlay('none');
      } else {
        // Exit on Ctrl+C
        process.exit(0);
      }
    },
    onCtrlD: () => process.exit(0),
    onCtrlL: handleClearScreen,
    onCtrlO: () => setOverlay('model'),
    onCtrlP: () => setOverlay('session'),
    onCtrlT: handleToggleTools,
    onEscape: () => setOverlay('none'),
  });

  // Remove the manual connect call - autoConnect handles it
  // useEffect(() => {
  //   connect();
  // }, [connect]);

  if (overlay === 'model') {
    return (
      <ModelPicker
        models={models}
        currentModel={session.model}
        onSelect={handleModelSelect}
        onCancel={() => setOverlay('none')}
      />
    );
  }

  if (overlay === 'session') {
    return (
      <SessionPicker
        sessions={sessions}
        currentSessionId={session.sessionId || undefined}
        onSelect={handleSessionSelect}
        onCancel={() => setOverlay('none')}
        onNewSession={handleNewSession}
      />
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <StatusBar
        isConnected={isConnected}
        model={session.model}
        provider={session.provider}
        workspaceRoot={workspaceRoot || '~/.talon'}
        activity={activity}
        sessionId={session.sessionId || undefined}
      />

      <Box flexGrow={1} marginTop={1}>
        <ChatLog
          messages={messages}
          tools={tools}
          toolsExpanded={toolsExpanded}
        />
      </Box>

      <InputBar
        onSubmit={handleSubmit}
        disabled={!isConnected || activity !== 'idle'}
      />

      <Box marginTop={1}>
        <Text dimColor>
          Ctrl+O: Model | Ctrl+P: Session | Ctrl+T: Tools | Ctrl+L: Clear | Ctrl+C: Exit
        </Text>
      </Box>
    </Box>
  );
}
