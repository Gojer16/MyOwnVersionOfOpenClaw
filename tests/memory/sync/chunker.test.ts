import { describe, it, expect } from 'vitest';
import { chunkFile, estimateTokens } from '../../../src/memory/sync/chunker.js';
import type { FileEntry } from '../../../src/memory/sync/types.js';

describe('File Chunker', () => {
  it('should chunk file into token-sized pieces', () => {
    const file: FileEntry = {
      path: 'test.md',
      absPath: '/workspace/test.md',
      source: 'memory',
      hash: 'abc123',
      mtimeMs: Date.now(),
      size: 1000,
      content: Array(100)
        .fill('This is a test line with about ten words.')
        .join('\n'),
    };

    const chunks = chunkFile(file, {
      tokens: 100,
      overlap: 20,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].tokens).toBeLessThanOrEqual(100);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].filePath).toBe('test.md');
    expect(chunks[0].source).toBe('memory');
  });

  it('should create overlapping chunks', () => {
    const file: FileEntry = {
      path: 'test.md',
      absPath: '/workspace/test.md',
      source: 'memory',
      hash: 'abc123',
      mtimeMs: Date.now(),
      size: 1000,
      content: Array(50)
        .fill('Line with content.')
        .join('\n'),
    };

    const chunks = chunkFile(file, {
      tokens: 50,
      overlap: 10,
    });

    if (chunks.length >= 2) {
      // Check that chunks overlap
      const chunk1End = chunks[0].endLine;
      const chunk2Start = chunks[1].startLine;
      expect(chunk2Start).toBeLessThan(chunk1End);
    }
  });

  it('should handle small files (single chunk)', () => {
    const file: FileEntry = {
      path: 'small.md',
      absPath: '/workspace/small.md',
      source: 'memory',
      hash: 'def456',
      mtimeMs: Date.now(),
      size: 100,
      content: 'Short file.',
    };

    const chunks = chunkFile(file, {
      tokens: 400,
      overlap: 80,
    });

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe('Short file.');
  });

  it('should estimate tokens correctly', () => {
    expect(estimateTokens('Hello world')).toBeGreaterThan(0);
    expect(estimateTokens('A'.repeat(400))).toBeCloseTo(100, -1);
  });
});
