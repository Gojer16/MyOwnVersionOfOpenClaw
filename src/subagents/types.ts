export type SubagentType = 'research' | 'writer' | 'planner' | 'critic' | 'summarizer';

export interface SubagentTask {
    type: SubagentType;
    description: string;
    context?: Record<string, any>;
}

export interface SubagentResult {
    summary: string;
    data: any;
    confidence: number;
    metadata?: Record<string, any>;
}
