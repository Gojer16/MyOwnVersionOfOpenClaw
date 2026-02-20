// Tool output normalization - ensures all tools return structured JSON

export interface NormalizedToolResult {
    success: boolean;
    data: unknown;
    error: { code: string; message: string } | null;
    meta: {
        duration_ms: number;
        timestamp: string;
    };
}

export async function normalizeToolExecution(
    toolName: string,
    execute: (args: Record<string, unknown>) => Promise<string>,
    args: Record<string, unknown>
): Promise<string> {
    const start = Date.now();
    
    try {
        const rawOutput = await execute(args);
        const duration = Date.now() - start;
        
        // Check if output is already an error
        if (rawOutput.startsWith('Error:') || rawOutput.startsWith('⚠️ BLOCKED:')) {
            const result: NormalizedToolResult = {
                success: false,
                data: null,
                error: {
                    code: rawOutput.includes('BLOCKED') ? 'BLOCKED' : 'EXECUTION_ERROR',
                    message: rawOutput.replace(/^(Error:|⚠️ BLOCKED:)\s*/, '')
                },
                meta: { duration_ms: duration, timestamp: new Date().toISOString() }
            };
            return JSON.stringify(result, null, 2);
        }
        
        // Success case
        const result: NormalizedToolResult = {
            success: true,
            data: rawOutput,
            error: null,
            meta: { duration_ms: duration, timestamp: new Date().toISOString() }
        };
        return JSON.stringify(result, null, 2);
        
    } catch (err) {
        const duration = Date.now() - start;
        const result: NormalizedToolResult = {
            success: false,
            data: null,
            error: {
                code: 'EXCEPTION',
                message: err instanceof Error ? err.message : String(err)
            },
            meta: { duration_ms: duration, timestamp: new Date().toISOString() }
        };
        return JSON.stringify(result, null, 2);
    }
}
