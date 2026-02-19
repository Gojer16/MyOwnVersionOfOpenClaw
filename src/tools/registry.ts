// ─── Tool Registry ────────────────────────────────────────────────
// Central registry for all Talon tools. The agent loop queries this
// to know what tools are available and how to call them.

import type { TalonConfig } from '../config/schema.js';
import type { AgentLoop } from '../agent/loop.js';
import { registerFileTools } from './file.js';
import { registerShellTools } from './shell.js';
import { registerMemoryTools } from './memory-tools.js';
import { registerWebTools } from './web.js';
import { registerBrowserTools } from './browser.js';
import { desktopScreenshotTools } from './screenshot.js';
import { notesTools } from './notes.js';
import { tasksTools } from './tasks.js';
import { appleNotesTools } from './apple-notes.js';
import { appleRemindersTools } from './apple-reminders.js';
import { appleCalendarTools } from './apple-calendar.js';
import { appleSafariTools } from './apple-safari.js';
import { appleMailTools } from './apple-mail.js';
import { logger } from '../utils/logger.js';

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Register all enabled tools with the agent loop.
 */
export function registerAllTools(agentLoop: AgentLoop, config: TalonConfig): void {
    const registered: string[] = [];

    // File tools
    if (config.tools.files.enabled) {
        const fileTools = registerFileTools(config);
        for (const tool of fileTools) {
            agentLoop.registerTool(tool);
            registered.push(tool.name);
        }
    }

    // Shell tool
    if (config.tools.shell.enabled) {
        const shellTools = registerShellTools(config);
        for (const tool of shellTools) {
            agentLoop.registerTool(tool);
            registered.push(tool.name);
        }
    }

    // Memory tools (always enabled — these are how the agent writes to its own files)
    const memoryTools = registerMemoryTools(config);
    for (const tool of memoryTools) {
        agentLoop.registerTool(tool);
        registered.push(tool.name);
    }

    // Web tools
    const webTools = registerWebTools(config);
    for (const tool of webTools) {
        agentLoop.registerTool(tool);
        registered.push(tool.name);
    }

    // Browser tools
    if (config.tools.browser.enabled) {
        const browserTools = registerBrowserTools(config);
        for (const tool of browserTools) {
            agentLoop.registerTool(tool);
            registered.push(tool.name);
        }
    }

    // Desktop screenshot tool (always enabled)
    for (const tool of desktopScreenshotTools) {
        agentLoop.registerTool(tool);
        registered.push(tool.name);
    }

    // Productivity tools (notes and tasks)
    for (const tool of [...notesTools, ...tasksTools]) {
        agentLoop.registerTool(tool);
        registered.push(tool.name);
    }

    // Apple integrations (macOS only)
    logger.debug({ platform: process.platform, isDarwin: process.platform === 'darwin' }, 'Checking platform for Apple tools');
    if (process.platform === 'darwin') {
        logger.info('macOS detected - registering Apple tools');
        logger.debug({ 
            notesCount: appleNotesTools.length,
            remindersCount: appleRemindersTools.length,
            calendarCount: appleCalendarTools.length,
            safariCount: appleSafariTools.length
        }, 'Apple tool counts');
        
        for (const tool of [...appleNotesTools, ...appleRemindersTools, ...appleCalendarTools, ...appleSafariTools, ...appleMailTools]) {
            agentLoop.registerTool(tool);
            registered.push(tool.name);
            logger.debug({ toolName: tool.name }, 'Registered Apple tool');
        }
        logger.info({ 
            totalAppleTools: appleNotesTools.length + appleRemindersTools.length + appleCalendarTools.length + appleSafariTools.length + appleMailTools.length
        }, 'Apple integrations enabled');
    } else {
        logger.warn({ platform: process.platform }, 'Not macOS - skipping Apple tools');
    }

    logger.info({ tools: registered, count: registered.length }, 'Tools registered');
}
