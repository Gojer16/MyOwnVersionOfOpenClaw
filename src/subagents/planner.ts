import { Subagent } from './base.js';
import type { SubagentTask, SubagentResult } from './types.js';
import { buildSubAgentPrompt } from '../agent/prompts.js';
import type { ModelRouter } from '../agent/router.js';

export class PlannerSubagent extends Subagent {
    constructor(model: string, private router: ModelRouter) {
        super('planner', model);
    }

    async execute(task: SubagentTask): Promise<SubagentResult> {
        const prompt = buildSubAgentPrompt('planner', task.description);
        const route = this.router.getDefaultProvider();
        if (!route) throw new Error('No provider available');
        
        const response = await route.provider.chat([{ role: 'user', content: prompt }], { model: this.model });
        const content = response.content || '{}';
        const data = JSON.parse(content);

        return {
            summary: data.goal || 'Plan created',
            data: { goal: data.goal || '', steps: data.steps || [], estimatedTime: data.estimatedTime || 'Unknown', risks: data.risks || [] },
            confidence: 0.8,
        };
    }
}
