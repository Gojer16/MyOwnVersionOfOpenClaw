import { describe, expect, it } from 'vitest';
import { LlmTaskRouter, type TaskType } from '@/llm/router.js';

describe('LlmTaskRouter', () => {
    it('should map plan/code/docs to OpenAI Codex policy defaults', () => {
        const router = new LlmTaskRouter();

        expect(router.chooseRoute('plan')).toEqual({
            provider: 'openai',
            model: 'gpt-5.1-thinking',
        });

        expect(router.chooseRoute('code')).toEqual({
            provider: 'openai',
            model: 'gpt-5.3-codex',
        });

        expect(router.chooseRoute('docs')).toEqual({
            provider: 'openai',
            model: 'gpt-5.1-codex-mini',
        });
    });

    it('should allow policy overrides', () => {
        const router = new LlmTaskRouter({
            code: { provider: 'openai', model: 'gpt-5.3-codex-preview' },
        });

        expect(router.chooseRoute('code')).toEqual({
            provider: 'openai',
            model: 'gpt-5.3-codex-preview',
        });
    });

    it('should infer code task for CLI code-prefixed prompts', () => {
        const task = LlmTaskRouter.inferTaskType({
            channel: 'cli',
            text: 'code: refactor this module',
        });

        expect(task).toBe('code');
    });

    it('should infer docs task for documentation prompts', () => {
        const task = LlmTaskRouter.inferTaskType({
            channel: 'webchat',
            text: 'write docs for this feature and add examples',
        });

        expect(task).toBe('docs');
    });

    it('should infer plan by default', () => {
        const task: TaskType = LlmTaskRouter.inferTaskType({
            channel: 'telegram',
            text: 'help me think through this architecture',
        });

        expect(task).toBe('plan');
    });
});
