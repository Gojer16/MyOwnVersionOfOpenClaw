// src/tui/components/chat-log.tsx
import React, { useState, useCallback, useMemo } from 'react';
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

const MemoizedUserMessage = React.memo(UserMessage);
const MemoizedAssistantMessage = React.memo(AssistantMessage);
const MemoizedToolCard = React.memo(ToolCard);

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

  const visibleMessages = useMemo(() => {
    const maxVisible = 50;
    return messages.slice(-maxVisible);
  }, [messages]);

  return (
    <Box flexDirection="column" height={maxHeight}>
      {visibleMessages.length === 0 && (
        <Box paddingY={2}>
          <Text dimColor>No messages yet. Type something to get started...</Text>
        </Box>
      )}

      {visibleMessages.map((message) => {
        switch (message.type) {
          case 'user':
            return (
              <MemoizedUserMessage
                key={message.id}
                text={message.text}
                timestamp={message.timestamp}
              />
            );

          case 'assistant':
            return (
              <MemoizedAssistantMessage
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

      {toolsExpanded && tools.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">🛠️  Tool Executions</Text>
          {tools.map((tool) => (
            <MemoizedToolCard
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
