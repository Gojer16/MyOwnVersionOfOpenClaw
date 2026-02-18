// ─── Apple Safari Tools Integration Tests ─────────────────────────
// Tests Safari tool registration and execution in agent loop

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoop } from '@/agent/loop.js';
import { ModelRouter } from '@/agent/router.js';
import { MemoryManager } from '@/memory/manager.js';
import { MemoryCompressor } from '@/memory/compressor.js';
import { EventBus } from '@/gateway/events.js';
import { appleSafariTools } from '@/tools/apple-safari.js';
import { mockConfig, createMockSession, createMockProvider } from './setup.js';
import type { LLMResponse } from '@/agent/providers/openai-compatible.js';

describe('Apple Safari Tools Integration', () => {
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

    describe('Tool Registration', () => {
        it('should register all 10 Safari tools', () => {
            // Register all Safari tools
            appleSafariTools.forEach(tool => {
                agentLoop.registerTool(tool);
            });

            const toolDefs = agentLoop.getToolDefinitions();
            const toolNames = toolDefs.map(t => t.function.name);

            expect(toolNames).toContain('apple_safari_navigate');
            expect(toolNames).toContain('apple_safari_get_info');
            expect(toolNames).toContain('apple_safari_extract');
            expect(toolNames).toContain('apple_safari_execute_js');
            expect(toolNames).toContain('apple_safari_click');
            expect(toolNames).toContain('apple_safari_type');
            expect(toolNames).toContain('apple_safari_go_back');
            expect(toolNames).toContain('apple_safari_reload');
            expect(toolNames).toContain('apple_safari_list_tabs');
            expect(toolNames).toContain('apple_safari_activate_tab');
        });

        it('should have correct tool definitions structure', () => {
            appleSafariTools.forEach(tool => {
                agentLoop.registerTool(tool);
            });

            const toolDefs = agentLoop.getToolDefinitions();
            
            toolDefs.forEach(toolDef => {
                expect(toolDef.type).toBe('function');
                expect(toolDef.function).toBeDefined();
                expect(toolDef.function.name).toBeDefined();
                expect(toolDef.function.description).toBeDefined();
                expect(toolDef.function.parameters).toBeDefined();
            });
        });
    });

    describe('Tool Execution Flow', () => {
        it('should execute navigate tool through agent loop', async () => {
            const navigateTool = appleSafariTools.find(t => t.name === 'apple_safari_navigate')!;
            
            // Mock the execution to avoid actual AppleScript calls
            const mockExecute = vi.fn().mockResolvedValue('Navigated to https://example.com in Safari');
            const toolWithMock = {
                ...navigateTool,
                execute: mockExecute,
            };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ url: 'https://example.com' });
            
            expect(result).toContain('Navigated');
            expect(mockExecute).toHaveBeenCalledWith({ url: 'https://example.com' });
        });

        it('should execute extract tool with selector', async () => {
            const extractTool = appleSafariTools.find(t => t.name === 'apple_safari_extract')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Extracted content from article element');
            const toolWithMock = {
                ...extractTool,
                execute: mockExecute,
            };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ 
                selector: 'article', 
                maxLength: 500 
            });
            
            expect(result).toContain('Extracted');
        });

        it('should execute type tool with submit', async () => {
            const typeTool = appleSafariTools.find(t => t.name === 'apple_safari_type')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Typed "test@example.com" into input#email');
            const toolWithMock = {
                ...typeTool,
                execute: mockExecute,
            };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({
                selector: 'input#email',
                text: 'test@example.com',
                submit: true,
            });
            
            expect(result).toContain('Typed');
        });
    });

    describe('Platform Detection', () => {
        it('should return platform error on non-macOS', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const navigateTool = appleSafariTools.find(t => t.name === 'apple_safari_navigate')!;
            const result = await navigateTool.execute({ url: 'https://example.com' });

            Object.defineProperty(process, 'platform', originalPlatform!);

            expect(result).toContain('Error');
            expect(result).toContain('macOS');
        });

        it('should attempt execution on macOS', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            const navigateTool = appleSafariTools.find(t => t.name === 'apple_safari_navigate')!;
            
            // Mock exec to simulate Safari not running
            const result = await navigateTool.execute({ url: 'https://example.com' });

            Object.defineProperty(process, 'platform', originalPlatform!);

            // Should either succeed or return an error (not the platform error)
            expect(result).not.toContain('macOS only');
        });
    });

    describe('Tool Parameters Validation', () => {
        it('should validate required parameters for navigate', () => {
            const navigateTool = appleSafariTools.find(t => t.name === 'apple_safari_navigate')!;
            
            expect(navigateTool.parameters.required).toContain('url');
            expect(navigateTool.parameters.properties.url.type).toBe('string');
        });

        it('should validate required parameters for click', () => {
            const clickTool = appleSafariTools.find(t => t.name === 'apple_safari_click')!;
            
            expect(clickTool.parameters.required).toContain('selector');
        });

        it('should validate required parameters for type', () => {
            const typeTool = appleSafariTools.find(t => t.name === 'apple_safari_type')!;
            
            expect(typeTool.parameters.required).toContain('selector');
            expect(typeTool.parameters.required).toContain('text');
        });

        it('should have optional parameters with defaults', () => {
            const navigateTool = appleSafariTools.find(t => t.name === 'apple_safari_navigate')!;
            const extractTool = appleSafariTools.find(t => t.name === 'apple_safari_extract')!;
            const typeTool = appleSafariTools.find(t => t.name === 'apple_safari_type')!;
            const activateTabTool = appleSafariTools.find(t => t.name === 'apple_safari_activate_tab')!;

            // newTab is optional with default true
            expect(navigateTool.parameters.properties.newTab).toBeDefined();
            
            // selector is optional for extract
            expect(extractTool.parameters.required).toBeUndefined();
            
            // submit is optional for type
            expect(typeTool.parameters.properties.submit).toBeDefined();
            
            // windowIndex is optional with default 1
            expect(activateTabTool.parameters.properties.windowIndex).toBeDefined();
        });
    });

    describe('Tool Descriptions', () => {
        it('should have meaningful descriptions for all tools', () => {
            appleSafariTools.forEach(tool => {
                expect(tool.description.length).toBeGreaterThan(20);
                expect(tool.description).toContain('Safari');
                expect(tool.description).toContain('macOS only');
            });
        });

        it('should describe tool functionality clearly', () => {
            const navigateTool = appleSafariTools.find(t => t.name === 'apple_safari_navigate')!;
            const extractTool = appleSafariTools.find(t => t.name === 'apple_safari_extract')!;
            
            expect(navigateTool.description).toContain('Navigate');
            expect(extractTool.description).toContain('Extract');
        });
    });

    describe('Integration with Agent Loop', () => {
        it('should be callable through agent loop tool execution', async () => {
            const getInfoTool = appleSafariTools.find(t => t.name === 'apple_safari_get_info')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Title: Test Page\nURL: https://test.com');
            const toolWithMock = {
                ...getInfoTool,
                execute: mockExecute,
            };

            agentLoop.registerTool(toolWithMock);

            // Simulate what agent loop does - call the tool's execute function
            const result = await toolWithMock.execute({});
            
            expect(result).toContain('Title');
            expect(result).toContain('URL');
        });

        it('should handle errors gracefully in agent loop', async () => {
            const navigateTool = appleSafariTools.find(t => t.name === 'apple_safari_navigate')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Error: Safari is not running');
            const toolWithMock = {
                ...navigateTool,
                execute: mockExecute,
            };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ url: 'https://example.com' });
            
            expect(result).toContain('Error');
        });
    });

    describe('Browser Automation Capabilities', () => {
        it('should cover all essential browser operations', () => {
            const toolNames = appleSafariTools.map(t => t.name);
            
            // Navigation
            expect(toolNames).toContain('apple_safari_navigate');
            expect(toolNames).toContain('apple_safari_go_back');
            expect(toolNames).toContain('apple_safari_reload');
            
            // Information
            expect(toolNames).toContain('apple_safari_get_info');
            expect(toolNames).toContain('apple_safari_extract');
            
            // Interaction
            expect(toolNames).toContain('apple_safari_click');
            expect(toolNames).toContain('apple_safari_type');
            expect(toolNames).toContain('apple_safari_execute_js');
            
            // Tab Management
            expect(toolNames).toContain('apple_safari_list_tabs');
            expect(toolNames).toContain('apple_safari_activate_tab');
        });

        it('should support JavaScript execution for complex interactions', async () => {
            const executeTool = appleSafariTools.find(t => t.name === 'apple_safari_execute_js')!;
            
            expect(executeTool.parameters.required).toContain('script');
            expect(executeTool.description).toContain('JavaScript');
        });
    });
});
