import type { SubagentType, SubagentTask, SubagentResult } from './types.js';
import type { Subagent } from './base.js';

export class SubagentRegistry {
    private subagents = new Map<SubagentType, Subagent>();

    register(type: SubagentType, subagent: Subagent): void {
        this.subagents.set(type, subagent);
    }

    get(type: SubagentType): Subagent | undefined {
        return this.subagents.get(type);
    }

    async execute(task: SubagentTask): Promise<SubagentResult> {
        const subagent = this.get(task.type);
        if (!subagent) {
            throw new Error(`Subagent not found: ${task.type}`);
        }
        return subagent.execute(task);
    }
}
