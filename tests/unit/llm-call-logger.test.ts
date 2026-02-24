import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LlmCallLogger } from '@/llm/call-logger.js';

const tempRoots: string[] = [];

afterEach(() => {
    for (const dir of tempRoots) {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
    tempRoots.length = 0;
});

describe('LlmCallLogger', () => {
    it('should append JSONL entries with provider/model/tokens/latency', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talon-llm-logger-'));
        tempRoots.push(root);

        const logPath = path.join(root, 'llm-calls.jsonl');
        const logger = new LlmCallLogger(logPath);

        await logger.log({
            provider: 'openai',
            model: 'gpt-5.3-codex',
            latencyMs: 1234,
            usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
            },
            ok: true,
        });

        const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
        expect(lines).toHaveLength(1);

        const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
        expect(parsed.provider).toBe('openai');
        expect(parsed.model).toBe('gpt-5.3-codex');
        expect(parsed.latencyMs).toBe(1234);
        expect(parsed.ok).toBe(true);
        expect(parsed.usage).toEqual({
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
        });
    });
});
