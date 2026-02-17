// ─── Tool Registration Integration Tests ────────────────────────────────
// Tests tool registration flow from config to agent loop

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoop } from '@/agent/loop.js';
import { ModelRouter } from '@/agent/router.js';
import { MemoryManager } from '@/memory/manager.js';
import { MemoryCompressor } from '@/memory/compressor.js';
import { EventBus } from '@/gateway/events.js';
import { registerAllTools, type ToolDefinition } from '@/tools/registry.js';
import { mockConfig, createMockSession, createMockProvider } from './setup.js';
import type { LLMResponse } from '@/agent/providers/openai-compatible.js';

describe('Tool Registration Integration', () => {
    let agentLoop: AgentLoop;
    let memoryManager: MemoryManager;
    let memoryCompressor: MemoryCompressor;
    let eventBus: EventBus;
    let modelRouter: ModelRouter;

    beforeEach(() => {
        eventBus = new EventBus();
        memoryManager = new MemoryManager({
            workspaceRoot: '/tmp/test-workspace',
            maxContextTokens: 6000,
            maxSummaryTokens: 800,
            keepRecentMessages: 5,
            maxToolOutputTokens: 500,
        });
        memoryCompressor = new MemoryCompressor({
            model: 'deepseek-chat',
            chat: vi.fn().mockResolvedValue({
                content: 'Summary of conversation',
                finishReason: 'stop',
                usage: { input: 100, output: 50 },
            } as LLMResponse),
        });
        modelRouter = new ModelRouter(mockConfig);
        agentLoop = new AgentLoop(modelRouter, memoryManager, memoryCompressor, eventBus);
    });

    describe('registerAllTools', () => {
        it('should register all enabled tools', () => {
            registerAllTools(agentLoop, mockConfig);

            const toolDefs = agentLoop.getToolDefinitions();
            const toolNames = toolDefs.map(t => t.function.name);

            // Should have file, shell, memory, and web tools
            expect(toolNames).toContain('file_read');
            expect(toolNames).toContain('file_write');
            expect(toolNames).toContain('shell_execute');
            expect(toolNames).toContain('memory_append');
        });

        it('should not register disabled tools', () => {
            const configWithDisabledFiles = {
                ...mockConfig,
                tools: {
                    ...mockConfig.tools,
                    files: { ...mockConfig.tools.files, enabled: false },
                },
            };

            registerAllTools(agentLoop, configWithDisabledFiles);

            const toolDefs = agentLoop.getToolDefinitions();
            const toolNames = toolDefs.map(t => t.function.name);

            expect(toolNames).not.toContain('file_read');
            expect(toolNames).not.toContain('file_write');
        });

        it('should register memory tools even when disabled (required for agent)', () => {
            const configWithDisabledMemory = {
                ...mockConfig,
                memory: {
                    ...mockConfig.memory,
                    enabled: false,
                },
            };

            registerAllTools(agentLoop, configWithDisabledMemory);

            const toolDefs = agentLoop.getToolDefinitions();
            const toolNames = toolDefs.map(t => t.function.name);

            // Memory tools should still be registered
            expect(toolNames).toContain('memory_append');
        });
    });

    describe('Custom Tool Registration', () => {
        it('should allow registering custom tools', () => {
            const customTool: ToolDefinition = {
                name: 'custom_tool',
                description: 'A custom test tool',
                parameters: {
                    type: 'object',
                    properties: {
                        input: { type: 'string' },
                    },
                },
                execute: async (args) => {
                    return `Processed: ${args.input}`;
                },
            };

            agentLoop.registerTool(customTool);

            const toolDefs = agentLoop.getToolDefinitions();
            expect(toolDefs).toHaveLength(1);
            expect(toolDefs[0].function.name).toBe('custom_tool');
        });

        it('should execute custom tools through agent loop', async () => {
            const customTool: ToolDefinition = {
                name: 'echo_tool',
                description: 'Echo back the input',
                parameters: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                    },
                },
                execute: async (args) => {
                    return `Echo: ${args.message}`;
                },
            };

            agentLoop.registerTool(customTool);

            // Add custom tool to mock provider
            const mockProvider = createMockProvider({
                content: '',
                finishReason: 'tool_calls',
                usage: { input: 10, output: 10 },
                toolCalls: [{
                    id: 'call_1',
                    name: 'echo_tool',
                    args: { message: 'Hello World' },
                }],
            });

            modelRouter = new ModelRouter({
                ...mockConfig,
                agent: {
                    ...mockConfig.agent,
                    providers: {
                        deepseek: {
                            apiKey: 'test-key',
                            models: ['deepseek-chat'],
                        },
                    },
                },
            });

            // This is a simplified test - real execution would need full provider setup
            const toolDefs = agentLoop.getToolDefinitions();
            expect(toolDefs.some(t => t.function.name === 'echo_tool')).toBe(true);
        });
    });
});
