export type TaskType = 'plan' | 'code' | 'docs';

export interface RouteSelection {
    provider: string;
    model: string;
}

type RoutePolicy = Record<TaskType, RouteSelection>;

const defaultPolicy: RoutePolicy = {
    plan: { provider: 'openai', model: 'gpt-5.1-thinking' },
    code: { provider: 'openai', model: 'gpt-5.3-codex' },
    docs: { provider: 'openai', model: 'gpt-5.1-codex-mini' },
};

export class LlmTaskRouter {
    private policy: RoutePolicy;

    constructor(overrides?: Partial<RoutePolicy>) {
        this.policy = {
            ...defaultPolicy,
            ...overrides,
        };
    }

    chooseRoute(task: TaskType): RouteSelection {
        return this.policy[task];
    }

    static inferTaskType(input: { channel?: string; text: string }): TaskType {
        const text = input.text.trim();

        if (/^code\s*:/i.test(text)) {
            return 'code';
        }

        if (input.channel === 'cli' && /^talon\s+code\s*:/i.test(text)) {
            return 'code';
        }

        if (/\b(docs?|documentation|readme|changelog|api docs)\b/i.test(text)) {
            return 'docs';
        }

        return 'plan';
    }
}
