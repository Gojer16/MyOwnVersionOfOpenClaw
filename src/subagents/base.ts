import type { SubagentType, SubagentTask, SubagentResult } from './types.js';

export abstract class Subagent {
    constructor(
        public readonly type: SubagentType,
        public readonly model: string,
    ) {}

    abstract execute(task: SubagentTask): Promise<SubagentResult>;
}
