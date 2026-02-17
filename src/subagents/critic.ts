import { Subagent } from './base.js';
import type { SubagentTask, SubagentResult } from './types.js';
import { buildSubAgentPrompt } from '../agent/prompts.js';
import type { ModelRouter } from '../agent/router.js';

export class CriticSubagent extends Subagent {
    constructor(model: string, private router: ModelRouter) {
        super('critic', model);
    }

    async execute(task: SubagentTask): Promise<SubagentResult> {
        const prompt = buildSubAgentPrompt('critic', task.description);
        const route = this.router.getDefaultProvider();
        if (!route) throw new Error('No provider available');
        
        const response = await route.provider.chat([{ role: 'user', content: prompt }], { model: this.model });
        const content = response.content || '{}';
        const data = JSON.parse(content);

        return {
            summary: `Rating: ${data.rating}/10`,
            data: { rating: data.rating || 5, strengths: data.strengths || [], weaknesses: data.weaknesses || [], suggestions: data.suggestions || [], approved: data.approved || false },
            confidence: 0.85,
        };
    }
}
