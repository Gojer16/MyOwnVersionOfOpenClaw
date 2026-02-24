import { Subagent } from './base.js';
import type { SubagentTask, SubagentResult } from './types.js';
import { buildSubAgentPrompt } from '../agent/prompts.js';
import type { ModelRouter } from '../agent/router.js';
import { logger } from '../utils/logger.js';

export class ResearchSubagent extends Subagent {
    constructor(model: string, private router: ModelRouter) {
        super('research', model);
    }

    async execute(task: SubagentTask): Promise<SubagentResult> {
        const start = Date.now();
        logger.info({ type: this.type, model: this.model, taskLength: task.description.length }, 'Subagent executing');

        const prompt = buildSubAgentPrompt('research', task.description);
        const route = this.router.getProviderForTask('simple') || this.router.getDefaultProvider();
        if (!route) throw new Error('No provider available');

        const llmPromise = route.provider.chat(
            [{ role: 'user', content: prompt }],
            { model: this.model },
        );
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Subagent timed out after 30s')), 30_000),
        );
        const response = await Promise.race([llmPromise, timeoutPromise]);
        const content = response.content || '{}';

        let data: any;
        try {
            data = JSON.parse(content);
        } catch {
            // LLM returned prose instead of JSON — use it as raw content
            data = { content, rawResponse: true, keyInsights: [content] };
        }

        const confidence = data.rawResponse ? 0.5 : 0.8;
        const elapsed = Date.now() - start;
        logger.info({ type: this.type, confidence, responseTimeMs: elapsed }, 'Subagent completed');

        return {
            summary: data.keyInsights?.[0] || 'Research completed',
            data: { findings: data.findings || [], sources: data.findings?.map((f: any) => f.source).filter(Boolean) || [] },
            confidence,
        };
    }
}
