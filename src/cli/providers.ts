// ─── Provider Definitions ─────────────────────────────────────────
// Known providers with their API details and available models

export interface ProviderDef {
    id: string;
    name: string;
    envVar: string;
    baseUrl: string;
    apiType: 'openai-compatible' | 'anthropic-compatible';
    models: { id: string; name: string; isDefault?: boolean }[];
    description: string;
}

export const PROVIDERS: ProviderDef[] = [
    {
        id: 'deepseek',
        name: 'DeepSeek API',
        envVar: 'DEEPSEEK_API_KEY',
        baseUrl: 'https://api.deepseek.com',
        apiType: 'openai-compatible',
        models: [
            { id: 'deepseek-chat', name: 'DeepSeek-V3 (Chat)', isDefault: true },
            { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (Reasoning)' },
        ],
        description: 'Affordable, high-quality models — recommended for cost-effective daily use',
    },
    {
        id: 'openrouter',
        name: 'OpenRouter (multi-model proxy)',
        envVar: 'OPENROUTER_API_KEY',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiType: 'openai-compatible',
        models: [
            { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3 via OpenRouter', isDefault: true },
            { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
            { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash' },
            { id: 'openai/gpt-4o', name: 'GPT-4o' },
            { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick' },
        ],
        description: 'Access 200+ models through one API — great for flexibility',
    },
    {
        id: 'openai',
        name: 'OpenAI API',
        envVar: 'OPENAI_API_KEY',
        baseUrl: 'https://api.openai.com/v1',
        apiType: 'openai-compatible',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o', isDefault: true },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'o3-mini', name: 'o3-mini (Reasoning)' },
        ],
        description: 'OpenAI\'s flagship models',
    },
    {
        id: 'anthropic',
        name: 'Anthropic API',
        envVar: 'ANTHROPIC_API_KEY',
        baseUrl: 'https://api.anthropic.com',
        apiType: 'anthropic-compatible',
        models: [
            { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', isDefault: true },
            { id: 'claude-opus-4-0', name: 'Claude Opus 4' },
        ],
        description: 'Claude models — excellent reasoning and coding',
    },
];

export interface CustomProviderConfig {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiType: 'openai-compatible' | 'anthropic-compatible';
    modelId: string;
}

/**
 * Test a model by sending a minimal prompt.
 * Returns true if the model responds, false otherwise.
 */
export async function checkModel(
    baseUrl: string,
    apiKey: string,
    modelId: string,
    apiType: 'openai-compatible' | 'anthropic-compatible',
): Promise<{ ok: boolean; error?: string }> {
    try {
        if (apiType === 'openai-compatible') {
            const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
                    max_tokens: 10,
                }),
                signal: AbortSignal.timeout(15_000),
            });

            if (!res.ok) {
                const body = await res.text();
                return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
            }

            return { ok: true };
        } else {
            // Anthropic-compatible
            const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
                    max_tokens: 10,
                }),
                signal: AbortSignal.timeout(15_000),
            });

            if (!res.ok) {
                const body = await res.text();
                return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
            }

            return { ok: true };
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
    }
}
