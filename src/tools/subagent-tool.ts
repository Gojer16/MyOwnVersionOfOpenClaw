import type { SubagentRegistry } from '../subagents/index.js';
import type { SubagentType } from '../subagents/types.js';

export function createSubagentTool(registry: SubagentRegistry) {
    return {
        name: 'delegate_to_subagent',
        description: 'Delegate a specialized task to a subagent (research, writer, planner, critic, summarizer)',
        parameters: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['research', 'writer', 'planner', 'critic', 'summarizer'], description: 'Type of subagent to use' },
                description: { type: 'string', description: 'Task description for the subagent' },
                context: { type: 'object', description: 'Optional context data for the subagent' },
            },
            required: ['type', 'description'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            const result = await registry.execute({
                type: args.type as SubagentType,
                description: args.description as string,
                context: args.context as Record<string, any> | undefined,
            });
            return JSON.stringify({ summary: result.summary, data: result.data, confidence: result.confidence }, null, 2);
        },
    };
}
