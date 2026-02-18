import type { VectorMemory } from '../memory/vector.js';
import { logger } from '../utils/logger.js';

export function createMemorySearchSemanticTool(vectorMemory: VectorMemory) {
    return {
        name: 'memory_search_semantic',
        description: 'Search conversation history semantically. Use for questions like "what did we discuss about React?" or "when did I mention the bug?"',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Natural language search query',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results (default 10)',
                    default: 10,
                },
                days: {
                    type: 'number',
                    description: 'Search last N days only (optional)',
                },
            },
            required: ['query'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            const query = args.query as string;
            const limit = args.limit as number | undefined;
            const days = args.days as number | undefined;
            
            try {
                const results = await vectorMemory.search(query, {
                    limit: limit ?? 10,
                    daysAgo: days,
                });

                if (results.length === 0) {
                    return `No relevant conversations found for: "${query}"`;
                }

                const formatted = results.map((r, i) => {
                    const date = new Date(r.timestamp).toLocaleString();
                    const preview = r.content.slice(0, 200);
                    return `[${i + 1}] ${r.role} (${date}, similarity: ${(r.similarity * 100).toFixed(1)}%)\n${preview}${r.content.length > 200 ? '...' : ''}`;
                }).join('\n\n');

                return `Found ${results.length} relevant messages:\n\n${formatted}`;
            } catch (error: any) {
                logger.error({ error }, 'Semantic search failed');
                return `Error searching memory: ${error.message}`;
            }
        },
    };
}
