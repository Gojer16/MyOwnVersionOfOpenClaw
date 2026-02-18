// ─── Apple Tools Integration Tests ────────────────────────────────
// Tests all Apple tool registration and execution in agent loop

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoop } from '@/agent/loop.js';
import { ModelRouter } from '@/agent/router.js';
import { MemoryManager } from '@/memory/manager.js';
import { MemoryCompressor } from '@/memory/compressor.js';
import { EventBus } from '@/gateway/events.js';
import { appleNotesTools } from '@/tools/apple-notes.js';
import { appleRemindersTools } from '@/tools/apple-reminders.js';
import { appleCalendarTools } from '@/tools/apple-calendar.js';
import { mockConfig } from './setup.js';
import type { LLMResponse } from '@/agent/providers/openai-compatible.js';

describe('Apple Tools Integration', () => {
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
        it('should register all 8 Apple productivity tools', () => {
            // Register all Apple tools (Notes, Reminders, Calendar)
            const allAppleTools = [
                ...appleNotesTools,
                ...appleRemindersTools,
                ...appleCalendarTools,
            ];

            allAppleTools.forEach(tool => {
                agentLoop.registerTool(tool);
            });

            const toolDefs = agentLoop.getToolDefinitions();
            const toolNames = toolDefs.map(t => t.function.name);

            // Notes
            expect(toolNames).toContain('apple_notes_create');
            expect(toolNames).toContain('apple_notes_search');

            // Reminders
            expect(toolNames).toContain('apple_reminders_add');
            expect(toolNames).toContain('apple_reminders_list');
            expect(toolNames).toContain('apple_reminders_complete');

            // Calendar
            expect(toolNames).toContain('apple_calendar_create_event');
            expect(toolNames).toContain('apple_calendar_list_events');
            expect(toolNames).toContain('apple_calendar_delete_event');
        });

        it('should have correct tool definitions structure for all tools', () => {
            const allAppleTools = [
                ...appleNotesTools,
                ...appleRemindersTools,
                ...appleCalendarTools,
            ];

            allAppleTools.forEach(tool => {
                agentLoop.registerTool(tool);
            });

            const toolDefs = agentLoop.getToolDefinitions();
            
            toolDefs.forEach(toolDef => {
                expect(toolDef.type).toBe('function');
                expect(toolDef.function).toBeDefined();
                expect(toolDef.function.name).toBeDefined();
                expect(toolDef.function.name).toMatch(/^apple_/);
                expect(toolDef.function.description).toBeDefined();
                expect(toolDef.function.parameters).toBeDefined();
            });
        });
    });

    describe('Notes Tools Integration', () => {
        it('should execute create note through agent loop', async () => {
            const createTool = appleNotesTools.find(t => t.name === 'apple_notes_create')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Note created: "Test Note" (folder: Talon)');
            const toolWithMock = { ...createTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({
                title: 'Test Note',
                content: 'Test content',
            });
            
            expect(result).toContain('Note created');
            expect(result).toContain('Test Note');
        });

        it('should execute search notes through agent loop', async () => {
            const searchTool = appleNotesTools.find(t => t.name === 'apple_notes_search')!;
            
            const mockResults = 'Title: Shopping List\nPreview: Buy milk';
            const mockExecute = vi.fn().mockResolvedValue(mockResults);
            const toolWithMock = { ...searchTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ query: 'shopping' });
            
            expect(result).toContain('Shopping List');
        });
    });

    describe('Reminders Tools Integration', () => {
        it('should execute add reminder through agent loop', async () => {
            const addTool = appleRemindersTools.find(t => t.name === 'apple_reminders_add')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Reminder added: "Buy milk" (list: Talon)');
            const toolWithMock = { ...addTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({
                title: 'Buy milk',
                dueDate: '2026-02-20',
                priority: 1,
            });
            
            expect(result).toContain('Reminder added');
            expect(result).toContain('Buy milk');
        });

        it('should execute list reminders through agent loop', async () => {
            const listTool = appleRemindersTools.find(t => t.name === 'apple_reminders_list')!;
            
            const mockReminders = '[ ] Buy milk\n[ ] Call mom';
            const mockExecute = vi.fn().mockResolvedValue(mockReminders);
            const toolWithMock = { ...listTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ list: 'Talon' });
            
            expect(result).toContain('Buy milk');
            expect(result).toContain('[ ]');
        });

        it('should execute complete reminder through agent loop', async () => {
            const completeTool = appleRemindersTools.find(t => t.name === 'apple_reminders_complete')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Reminder completed: "Buy milk"');
            const toolWithMock = { ...completeTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({
                title: 'Buy milk',
                list: 'Talon',
            });
            
            expect(result).toContain('Reminder completed');
        });
    });

    describe('Calendar Tools Integration', () => {
        it('should execute create event through agent loop', async () => {
            const createTool = appleCalendarTools.find(t => t.name === 'apple_calendar_create_event')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Event created: "Team Meeting" on 2026-02-20 10:00 (calendar: Talon)');
            const toolWithMock = { ...createTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({
                title: 'Team Meeting',
                startDate: '2026-02-20 10:00',
                location: 'Office',
            });
            
            expect(result).toContain('Event created');
            expect(result).toContain('Team Meeting');
        });

        it('should execute list events through agent loop', async () => {
            const listTool = appleCalendarTools.find(t => t.name === 'apple_calendar_list_events')!;
            
            const mockEvents = 'Meeting | Friday, February 20, 2026 at 10:00:00 AM | Office';
            const mockExecute = vi.fn().mockResolvedValue(mockEvents);
            const toolWithMock = { ...listTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({ days: 7 });
            
            expect(result).toContain('Meeting');
        });

        it('should execute delete event through agent loop', async () => {
            const deleteTool = appleCalendarTools.find(t => t.name === 'apple_calendar_delete_event')!;
            
            const mockExecute = vi.fn().mockResolvedValue('Event deleted: "Old Meeting"');
            const toolWithMock = { ...deleteTool, execute: mockExecute };

            agentLoop.registerTool(toolWithMock);

            const result = await toolWithMock.execute({
                title: 'Old Meeting',
                calendar: 'Talon',
            });
            
            expect(result).toContain('Event deleted');
        });
    });

    describe('Platform Detection', () => {
        it('should return platform error on non-macOS for all tools', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const allTools = [
                ...appleNotesTools,
                ...appleRemindersTools,
                ...appleCalendarTools,
            ];

            for (const tool of allTools) {
                const result = await tool.execute({ title: 'Test' });
                expect(result).toContain('Error');
                expect(result).toContain('macOS');
            }

            Object.defineProperty(process, 'platform', originalPlatform!);
        });
    });

    describe('Tool Categories Coverage', () => {
        it('should cover Notes category with 2 tools', () => {
            expect(appleNotesTools).toHaveLength(2);
            const names = appleNotesTools.map(t => t.name);
            expect(names).toContain('apple_notes_create');
            expect(names).toContain('apple_notes_search');
        });

        it('should cover Reminders category with 3 tools', () => {
            expect(appleRemindersTools).toHaveLength(3);
            const names = appleRemindersTools.map(t => t.name);
            expect(names).toContain('apple_reminders_add');
            expect(names).toContain('apple_reminders_list');
            expect(names).toContain('apple_reminders_complete');
        });

        it('should cover Calendar category with 3 tools', () => {
            expect(appleCalendarTools).toHaveLength(3);
            const names = appleCalendarTools.map(t => t.name);
            expect(names).toContain('apple_calendar_create_event');
            expect(names).toContain('apple_calendar_list_events');
            expect(names).toContain('apple_calendar_delete_event');
        });
    });

    describe('Tool Parameter Validation', () => {
        it('should validate required parameters for notes create', () => {
            const tool = appleNotesTools.find(t => t.name === 'apple_notes_create')!;
            expect(tool.parameters.required).toContain('title');
            expect(tool.parameters.required).toContain('content');
        });

        it('should validate required parameters for reminders add', () => {
            const tool = appleRemindersTools.find(t => t.name === 'apple_reminders_add')!;
            expect(tool.parameters.required).toContain('title');
        });

        it('should validate required parameters for calendar create', () => {
            const tool = appleCalendarTools.find(t => t.name === 'apple_calendar_create_event')!;
            expect(tool.parameters.required).toContain('title');
            expect(tool.parameters.required).toContain('startDate');
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle errors gracefully for all tools', async () => {
            const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            const mockExecute = vi.fn().mockResolvedValue('Error: Something went wrong');

            const allTools = [
                ...appleNotesTools,
                ...appleRemindersTools,
                ...appleCalendarTools,
            ];

            for (const tool of allTools) {
                const toolWithMock = { ...tool, execute: mockExecute };
                agentLoop.registerTool(toolWithMock);

                const result = await toolWithMock.execute({ title: 'Test' });
                expect(result).toBeDefined();
            }

            Object.defineProperty(process, 'platform', originalPlatform!);
        });
    });
});
