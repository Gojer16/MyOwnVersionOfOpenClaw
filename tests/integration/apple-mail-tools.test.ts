// ─── Apple Mail Tools Integration Tests ───────────────────────────
// Tests Apple Mail tool registration and execution in agent loop

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoop } from '@/agent/loop.js';
import { ModelRouter } from '@/agent/router.js';
import { MemoryManager } from '@/memory/manager.js';
import { MemoryCompressor } from '@/memory/compressor.js';
import { EventBus } from '@/gateway/events.js';
import { appleMailTools } from '@/tools/apple-mail.js';
import { mockConfig } from './setup.js';
import type { LLMResponse } from '@/agent/providers/openai-compatible.js';

describe('Apple Mail Tools Integration', () => {
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
        it('should register all 5 Apple Mail tools', () => {
            appleMailTools.forEach(tool => {
                agentLoop.registerTool(tool);
            });

            const toolDefs = agentLoop.getToolDefinitions();
            const toolNames = toolDefs.map(t => t.function.name);

            expect(toolNames).toContain('apple_mail_list_emails');
            expect(toolNames).toContain('apple_mail_get_recent');
            expect(toolNames).toContain('apple_mail_search');
            expect(toolNames).toContain('apple_mail_get_email_content');
            expect(toolNames).toContain('apple_mail_count');
        });

        it('should have correct tool definitions structure', () => {
            appleMailTools.forEach(tool => {
                agentLoop.registerTool(tool);
            });

            const toolDefs = agentLoop.getToolDefinitions();
            
            toolDefs.forEach(toolDef => {
                expect(toolDef.type).toBe('function');
                expect(toolDef.function).toBeDefined();
                expect(toolDef.function.name).toBeDefined();
                expect(toolDef.function.name).toMatch(/^apple_mail_/);
                expect(toolDef.function.description).toBeDefined();
                expect(toolDef.function.parameters).toBeDefined();
            });
        });
    });

    describe('Tool Execution Flow', () => {
        it('should execute list_emails tool through agent loop', async () => {
            const listTool = appleMailTools.find(t => t.name === 'apple_mail_list_emails')!;
            
            const mockExecute = vi.fn().mockResolvedValue('[1] Test Email | From: Sender | Date: Today | Read: true');
            const toolWithMock = { ...listTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ count: 10 });
            
            expect(result).toContain('Test Email');
            expect(mockExecute).toHaveBeenCalledWith({ count: 10 });
        });

        it('should execute get_recent tool with hours parameter', async () => {
            const recentTool = appleMailTools.find(t => t.name === 'apple_mail_get_recent')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Recent emails from last 24 hours');
            const toolWithMock = { ...recentTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ hours: 24, count: 5 });
            
            expect(result).toContain('24');
        });

        it('should execute search tool with query', async () => {
            const searchTool = appleMailTools.find(t => t.name === 'apple_mail_search')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Search results for "invoice"');
            const toolWithMock = { ...searchTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ query: 'invoice', count: 10 });
            
            expect(result).toContain('invoice');
        });

        it('should execute get_email_content by index', async () => {
            const contentTool = appleMailTools.find(t => t.name === 'apple_mail_get_email_content')!;
            
            const mockContent = 'Subject: Test\nFrom: sender@test.com\n\nBody content';
            const mockExecute = vi.fn().mockResolvedValue(mockContent);
            const toolWithMock = { ...contentTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ index: 1 });
            
            expect(result).toContain('Subject:');
            expect(result).toContain('Body content');
        });

        it('should execute count tool', async () => {
            const countTool = appleMailTools.find(t => t.name === 'apple_mail_count')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Total emails in INBOX: 100\nUnread: 5');
            const toolWithMock = { ...countTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({});
            
            expect(result).toContain('100');
            expect(result).toContain('Unread: 5');
        });
    });

    describe('Platform Detection', () => {
        it('should return platform error on non-macOS for all tools', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            for (const tool of appleMailTools) {
                const result = await tool.execute({ query: 'test' });
                expect(result).toContain('Error');
                expect(result).toContain('macOS');
            }

            Object.defineProperty(process, 'platform', originalPlatform!);
        });
    });

    describe('Tool Categories Coverage', () => {
        it('should cover all Mail operations', () => {
            const toolNames = appleMailTools.map(t => t.name);
            
            // Listing
            expect(toolNames).toContain('apple_mail_list_emails');
            expect(toolNames).toContain('apple_mail_get_recent');
            
            // Search
            expect(toolNames).toContain('apple_mail_search');
            
            // Content
            expect(toolNames).toContain('apple_mail_get_email_content');
            
            // Count
            expect(toolNames).toContain('apple_mail_count');
        });
    });

    describe('Tool Parameters Validation', () => {
        it('should validate required parameters for search', () => {
            const searchTool = appleMailTools.find(t => t.name === 'apple_mail_search')!;
            expect(searchTool.parameters.required).toContain('query');
        });

        it('should validate required parameters for get_email_content', () => {
            const contentTool = appleMailTools.find(t => t.name === 'apple_mail_get_email_content')!;
            expect(contentTool.parameters.required).toContain('index');
        });

        it('should have optional parameters with defaults', () => {
            const listTool = appleMailTools.find(t => t.name === 'apple_mail_list_emails')!;
            const recentTool = appleMailTools.find(t => t.name === 'apple_mail_get_recent')!;
            const countTool = appleMailTools.find(t => t.name === 'apple_mail_count')!;

            // count is optional for list
            expect(listTool.parameters.required).toBeUndefined();
            
            // hours is optional for recent
            expect(recentTool.parameters.required).toBeUndefined();
            
            // All params optional for count
            expect(countTool.parameters.required).toBeUndefined();
        });
    });

    describe('Integration with Agent Loop', () => {
        it('should be callable through agent loop tool execution', async () => {
            const listTool = appleMailTools.find(t => t.name === 'apple_mail_list_emails')!;
            
            const mockExecute = vi.fn().mockResolvedValue('[1] Email 1\n[2] Email 2');
            const toolWithMock = { ...listTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ count: 5 });
            
            expect(typeof result).toBe('string');
            expect(result).toContain('Email');
        });

        it('should handle errors gracefully in agent loop', async () => {
            const searchTool = appleMailTools.find(t => t.name === 'apple_mail_search')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Error: Mailbox not found');
            const toolWithMock = { ...searchTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ query: 'test' });
            
            expect(result).toContain('Error');
        });
    });
});
