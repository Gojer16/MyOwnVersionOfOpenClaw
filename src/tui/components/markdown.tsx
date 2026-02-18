// src/tui/components/markdown.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';
import { highlightCode, detectLanguage } from '../utils/syntax-highlight.js';

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

export function Markdown({ content }: MarkdownProps) {
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
