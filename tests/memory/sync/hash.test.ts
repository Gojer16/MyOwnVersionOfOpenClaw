import { describe, it, expect } from 'vitest';
import { hashText, hashFile } from '../../../src/memory/sync/hash.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Hash Utilities', () => {
  it('should hash text consistently', () => {
    const text = 'Hello, world!';
    const hash1 = hashText(text);
    const hash2 = hashText(text);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it('should produce different hashes for different text', () => {
    const hash1 = hashText('Hello');
    const hash2 = hashText('World');
    expect(hash1).not.toBe(hash2);
  });

  it('should hash file content', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'Test content');

    const hash = await hashFile(tmpFile);
    expect(hash).toHaveLength(64);

    fs.unlinkSync(tmpFile);
  });
});
