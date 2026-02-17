// ─── Heuristic Engine ─────────────────────────────────────────────
// Evaluates filesystem events and decides if they're interesting

import type { WatchEvent, GhostMessage, Heuristic } from './types.js';

export class HeuristicEngine {
    private heuristics: Heuristic[] = [];

    register(heuristic: Heuristic): void {
        this.heuristics.push(heuristic);
    }

    evaluate(event: WatchEvent): GhostMessage | null {
        for (const heuristic of this.heuristics) {
            if (heuristic.test(event)) {
                return heuristic.generate(event);
            }
        }
        return null;
    }
}

// ─── Built-in Heuristics ──────────────────────────────────────────

export const builtInHeuristics: Heuristic[] = [
    {
        name: 'new-typescript-file',
        test: (e) => e.type === 'add' && e.path.endsWith('.ts') && !e.path.includes('.test.'),
        generate: (e) => ({
            message: `I see you created ${e.path}. Need tests?`,
            context: { path: e.path, type: 'new-file' },
            priority: 'medium',
        }),
    },
    {
        name: 'typescript-change',
        test: (e) => e.type === 'change' && e.path.endsWith('.ts'),
        generate: (e) => ({
            message: `I noticed you changed ${e.path}. Need help?`,
            context: { path: e.path, type: 'typescript' },
            priority: 'low',
        }),
    },
    {
        name: 'test-file-change',
        test: (e) => e.path.includes('.test.') || e.path.includes('.spec.'),
        generate: (e) => ({
            message: `Test file updated: ${e.path}`,
            context: { path: e.path, type: 'test' },
            priority: 'low',
        }),
    },
];
