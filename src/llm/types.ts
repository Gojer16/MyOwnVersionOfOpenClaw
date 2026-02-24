export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
    role: LlmRole;
    content: string;
}

export interface LlmUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface LlmGenerateInput {
    model: string;
    messages: LlmMessage[];
    tools?: unknown[];
    toolChoice?: 'auto' | { type: string; name: string };
    temperature?: number;
    maxTokens?: number;
}

export interface LlmGenerateOutput {
    output: string;
    toolCalls?: unknown[];
    usage?: LlmUsage;
}

export interface LlmProvider {
    name: string;
    generate(input: LlmGenerateInput): Promise<LlmGenerateOutput>;
}
