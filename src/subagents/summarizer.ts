import { Subagent } from './base.js';
import type { SubagentTask, SubagentResult } from './types.js';
import { buildSubAgentPrompt } from '../agent/prompts.js';
import type { ModelRouter } from '../agent/router.js';

export class SummarizerSubagent extends Subagent {
    constructor(model: string, private router: ModelRouter) {
        super('summarizer', model);
    }

    async execute(task: SubagentTask): Promise<SubagentResult> {
        const prompt = buildSubAgentPrompt('summarizer', task.description);
        const route = this.router.getDefaultProvider();
        if (!route) throw new Error('No provider available');
        
        const response = await route.provider.chat([{ role: 'user', content: prompt }], { model: this.model });
        const summary = response.content || '';
        const originalLength = task.context?.text?.length || 0;

        return {
            summary,
            data: { summary, keyPoints: summary.split('\n').filter((l: string) => l.trim().startsWith('-')), originalLength, summaryLength: summary.length },
            confidence: 0.9,
        };
    }
}
