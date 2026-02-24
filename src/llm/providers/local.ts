import type { LlmProvider, LlmGenerateInput, LlmGenerateOutput } from '../types.js';

export class LocalLlmProvider implements LlmProvider {
    name = 'local';

    async generate(_input: LlmGenerateInput): Promise<LlmGenerateOutput> {
        throw new Error('LocalLlmProvider is not implemented yet');
    }
}
