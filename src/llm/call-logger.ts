import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { LlmUsage } from './types.js';

export interface LlmCallLogEntry {
    provider: string;
    model: string;
    latencyMs: number;
    usage?: LlmUsage;
    taskType?: string;
    ok: boolean;
    error?: string;
}

const defaultLogPath = path.join(os.homedir(), '.talon', 'logs', 'llm-calls.jsonl');

export class LlmCallLogger {
    constructor(private filePath: string = defaultLogPath) {}

    async log(entry: LlmCallLogEntry): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });

        const line = JSON.stringify({
            timestamp: new Date().toISOString(),
            ...entry,
        });

        await fs.appendFile(this.filePath, `${line}\n`, 'utf8');
    }
}
