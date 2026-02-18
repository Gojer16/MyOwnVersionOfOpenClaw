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
  const { language = 'javascript' } = options;

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
    return code;
  }
}

export function detectLanguage(code: string): string {
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
