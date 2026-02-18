// ─── System Prompt Templates ──────────────────────────────────────
// Injected into every LLM call by the Memory Manager

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadDailyMemories, extractUserName } from '../memory/daily.js';

const TALON_HOME = path.join(os.homedir(), '.talon');

// ─── Helper Functions ─────────────────────────────────────────────

/**
 * Check if a workspace file is still in its empty template state.
 * Returns true if the file contains template placeholders or empty fields.
 */
function isTemplateEmpty(content: string): boolean {
    // Check for common template indicators
    const templateIndicators = [
        '*(pick something you like)*',
        '*(What do they care about?',
        '*(curated long-term memory)*',
        '*(Add anything useful',
    ];
    
    // If it contains template text, it's still empty
    if (templateIndicators.some(indicator => content.includes(indicator))) {
        return true;
    }
    
    // Check if all the key fields are empty (just the label with no value)
    const lines = content.split('\n');
    let hasAnyFilledField = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Check if this is a field line: - **FieldName:** value or **FieldName:** value
        const fieldMatch = line.match(/^-?\s*\*\*([^*]+):\*\*\s*(.*)$/);
        if (fieldMatch) {
            const fieldName = fieldMatch[1].trim();
            const fieldValue = fieldMatch[2].trim();
            
            // Skip optional fields or template markers
            if (fieldValue.includes('(optional)') || fieldValue.startsWith('_') || fieldValue.startsWith('*')) {
                continue;
            }
            
            // If there's actual content after the colon
            if (fieldValue && fieldValue.length > 0) {
                hasAnyFilledField = true;
                break;
            }
        }
    }
    
    return !hasAnyFilledField;
}

// ─── Workspace File Loaders ───────────────────────────────────────

function resolveWorkspacePath(workspaceRoot: string, file: string): string {
    return path.join(workspaceRoot.replace(/^~/, os.homedir()), file);
}

function loadWorkspaceFile(workspaceRoot: string, file: string): string | null {
    const filePath = resolveWorkspacePath(workspaceRoot, file);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content;
    }
    return null;
}

/**
 * Load SOUL.md content from workspace.
 */
export function loadSoul(workspaceRoot: string): string {
    return loadWorkspaceFile(workspaceRoot, 'SOUL.md') ?? DEFAULT_SOUL;
}

/**
 * Load USER.md content from workspace.
 */
export function loadUser(workspaceRoot: string): string | null {
    return loadWorkspaceFile(workspaceRoot, 'USER.md');
}

/**
 * Load IDENTITY.md content from workspace.
 */
export function loadIdentity(workspaceRoot: string): string | null {
    return loadWorkspaceFile(workspaceRoot, 'IDENTITY.md');
}

/**
 * Load AGENTS.md content from workspace (operating manual).
 */
export function loadAgentsManual(workspaceRoot: string): string | null {
    return loadWorkspaceFile(workspaceRoot, 'AGENTS.md');
}

/**
 * Check if BOOTSTRAP.md exists (first-run detection).
 */
export function isBootstrapNeeded(workspaceRoot: string): boolean {
    return fs.existsSync(resolveWorkspacePath(workspaceRoot, 'BOOTSTRAP.md'));
}

/**
 * Load BOOTSTRAP.md for first-run onboarding.
 */
export function loadBootstrap(workspaceRoot: string): string | null {
    return loadWorkspaceFile(workspaceRoot, 'BOOTSTRAP.md');
}

const DEFAULT_SOUL = `You are Talon, a personal AI assistant.
You are helpful, direct, and technically capable.
You prefer concise responses over verbose ones.
You have access to tools for file operations, shell commands, web browsing, productivity management, and task delegation.
You can save notes, manage tasks, create calendar events, and delegate specialized work to subagents.`;

/**
 * Build the main agent system prompt.
 * Injects SOUL.md + USER.md + IDENTITY.md + workspace context.
 * 
 * IMPORTANT: This is called on EVERY message to ensure fresh workspace files are loaded.
 * This matches OpenClaw's behavior where the agent always knows who you are.
 */
export function buildSystemPrompt(
    soul: string,
    availableTools: string[],
    workspaceRoot?: string,
): string {
    let prompt = soul;
    
    const loadedFiles: Array<{ name: string; chars: number; status: string }> = [];
    loadedFiles.push({ name: 'SOUL.md', chars: soul.length, status: 'loaded' });

    // Inject user context if available
    if (workspaceRoot) {
        const bootstrap = isBootstrapNeeded(workspaceRoot);

        if (bootstrap) {
            const bootstrapContent = loadBootstrap(workspaceRoot);
            if (bootstrapContent) {
                loadedFiles.push({ name: 'BOOTSTRAP.md', chars: bootstrapContent.length, status: 'loaded' });
                
                // 🛑 CRITICAL: If bootstrapping, REPLACE the default soul entirely.
                prompt = `## 🚀 SYSTEM BOOT — FIRST RUN SEQUENCE\n\n${bootstrapContent}\n\n## CRITICAL INSTRUCTIONS\n\nYou MUST use the file_write tool to update these files as you learn information:\n- USER.md — Fill in their name, timezone, and preferences\n- IDENTITY.md — Fill in your name, creature type, vibe, and emoji\n\nDo NOT just remember this information — you must WRITE it to the files so it persists across sessions.\n\nWhen a file is fully populated, it will be automatically loaded into your context on future sessions.`;

                // 🧠 PARTIAL PROGRESS CHECK
                // Check if we have already learned things (e.g. from crashed session or partial run)
                const user = loadUser(workspaceRoot);
                const identity = loadIdentity(workspaceRoot);
                const memory = loadWorkspaceFile(workspaceRoot, 'MEMORY.md');

                let additionalContext = '';

                if (identity && !isTemplateEmpty(identity)) {
                    additionalContext += `\n\n## Identity (Learned So Far)\n${identity}`;
                    loadedFiles.push({ name: 'IDENTITY.md', chars: identity.length, status: 'partial' });
                } else if (identity) {
                    loadedFiles.push({ name: 'IDENTITY.md', chars: identity.length, status: 'template' });
                }

                if (user && !isTemplateEmpty(user)) {
                    additionalContext += `\n\n## User Info (Learned So Far)\n${user}`;
                    loadedFiles.push({ name: 'USER.md', chars: user.length, status: 'partial' });
                } else if (user) {
                    loadedFiles.push({ name: 'USER.md', chars: user.length, status: 'template' });
                }

                if (memory && !isTemplateEmpty(memory)) {
                    additionalContext += `\n\n## Long-Term Memory (Permanent)\n${memory}`;
                    loadedFiles.push({ name: 'MEMORY.md', chars: memory.length, status: 'loaded' });
                } else if (memory) {
                    loadedFiles.push({ name: 'MEMORY.md', chars: memory.length, status: 'template' });
                }

                if (additionalContext) {
                    prompt += `\n\n## ⚠️ RESUMING BOOTSTRAP\nWe have already started this process. Use the context below to pick up where we left off (don't ask questions we've already answered):\n${additionalContext}`;
                }
            } else {
                loadedFiles.push({ name: 'BOOTSTRAP.md', chars: 0, status: 'missing' });
            }
        } else {
            // Normal operation: inject User and Identity context
            const user = loadUser(workspaceRoot);
            const identity = loadIdentity(workspaceRoot);
            const memory = loadWorkspaceFile(workspaceRoot, 'MEMORY.md');

            if (identity && !isTemplateEmpty(identity)) {
                prompt += `\n\n## Your Identity\n\n${identity}`;
                loadedFiles.push({ name: 'IDENTITY.md', chars: identity.length, status: 'loaded' });
            } else if (identity) {
                loadedFiles.push({ name: 'IDENTITY.md', chars: identity.length, status: 'template-empty' });
            } else {
                loadedFiles.push({ name: 'IDENTITY.md', chars: 0, status: 'missing' });
            }

            if (user && !isTemplateEmpty(user)) {
                prompt += `\n\n## About the User\n\n${user}`;
                loadedFiles.push({ name: 'USER.md', chars: user.length, status: 'loaded' });
            } else if (user) {
                loadedFiles.push({ name: 'USER.md', chars: user.length, status: 'template-empty' });
            } else {
                loadedFiles.push({ name: 'USER.md', chars: 0, status: 'missing' });
            }

            if (memory && !isTemplateEmpty(memory)) {
                prompt += `\n\n## Long-Term Memory (Permanent)\n\n${memory}`;
                loadedFiles.push({ name: 'MEMORY.md', chars: memory.length, status: 'loaded' });
            } else if (memory) {
                loadedFiles.push({ name: 'MEMORY.md', chars: memory.length, status: 'template-empty' });
            } else {
                loadedFiles.push({ name: 'MEMORY.md', chars: 0, status: 'missing' });
            }
            
            // Load daily memories (today + yesterday)
            const dailyMemories = loadDailyMemories(workspaceRoot);
            if (dailyMemories.length > 0) {
                prompt += `\n\n## Recent Daily Notes\n\n${dailyMemories.join('\n\n---\n\n')}`;
                loadedFiles.push({ name: 'Daily Memories', chars: dailyMemories.join('').length, status: 'loaded' });
            }
            
            // Add proactive greeting instruction if we know the user's name
            const userName = extractUserName(user);
            if (userName) {
                prompt += `\n\n## First Message Greeting\nIf this is the first message in this session, greet ${userName} casually (e.g., "Hey ${userName}! Ready to crush some goals? 🚀" or "What's good, ${userName}?"). Don't ask who they are - you already know them from the files above!`;
            }
        }
    }

    prompt += `

## Your Capabilities

You are an AI assistant with an iterative agent loop. You can:
1. **Think** about the user's request and plan your approach
2. **Use tools** to read files, run commands, browse the web, and manage memory
3. **Delegate tasks** to specialized subagents (research, writer, planner, critic, summarizer)
4. **Manage productivity** with notes, tasks, and calendar integrations
5. **Evaluate** your results and decide if more work is needed
6. **Respond** with a clear, helpful answer

## Available Tools
${availableTools.length > 0 ? availableTools.map(t => `- ${t}`).join('\n') : '(No tools currently available)'}

## Tool Categories

**File & System:**
- file_read, file_write, file_list, file_search - File operations
- shell_execute - Run shell commands

**Web & Research:**
- web_search - Search the web (DeepSeek, OpenRouter, Tavily, DuckDuckGo)
- web_fetch - Extract content from URLs

**Memory & Knowledge:**
- memory_read, memory_write - Persistent memory system
- notes_save, notes_search - Save and search markdown notes

**Productivity:**
- tasks_add, tasks_list, tasks_complete - Todo list management
- apple_notes_create, apple_notes_search - Apple Notes integration (macOS)
- apple_reminders_add, apple_reminders_list, apple_reminders_complete - Apple Reminders (macOS)
- apple_calendar_create_event, apple_calendar_list_events, apple_calendar_delete_event - Apple Calendar (macOS)

**Browser Automation (Safari via AppleScript - macOS only):**
- apple_safari_navigate - Open URLs in Safari
- apple_safari_get_info - Get current page title and URL
- apple_safari_extract - Extract text content from pages
- apple_safari_execute_js - Run JavaScript on the page
- apple_safari_click - Click elements by CSS selector
- apple_safari_type - Type text into form fields
- apple_safari_go_back, apple_safari_reload - Navigation controls
- apple_safari_list_tabs, apple_safari_activate_tab - Tab management

**Delegation:**
- delegate_to_subagent - Delegate specialized tasks to cheap models (research, writer, planner, critic, summarizer)

## Important Guidelines

- **Be direct.** Don't add filler or unnecessary caveats.
- **Use tools proactively.** If you need to check something, check it — don't guess.
- **Delegate when appropriate.** Use subagents for research, writing, planning, reviewing, or summarizing.
- **Manage productivity.** Save important notes, create tasks, and schedule events.
- **Show your work.** When you use tools, briefly explain what you found.
- **Admit uncertainty.** If you don't know something and can't look it up, say so.
- **Remember context.** Pay attention to the memory summary — it contains important decisions and facts.
- **Be cost-conscious.** Don't make unnecessary tool calls. Plan before acting.
`;

    // Log workspace files loaded (helps debug "why doesn't it know me?" issues)
    if (loadedFiles.length > 0) {
        const summary = loadedFiles.map(f => `${f.name}: ${f.status} (${f.chars} chars)`).join(', ');
        // Note: Using console.error to avoid polluting stdout, but this goes to debug logs
        if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
            console.error(`[Workspace Files] ${summary}`);
        }
    }

    return prompt;
}

/**
 * Build a sub-agent system prompt.
 */
export function buildSubAgentPrompt(
    role: 'research' | 'planner' | 'writer' | 'critic' | 'summarizer',
    task: string,
): string {
    const rolePrompts: Record<string, string> = {
        research: `You are a research sub-agent. Your job is to gather information about the given topic.
Return your findings as structured JSON with the following format:
{
  "findings": [{ "title": "...", "summary": "...", "source": "..." }],
  "keyInsights": ["..."],
  "suggestedNextSteps": ["..."]
}`,
        planner: `You are a planning sub-agent. Your job is to create an actionable plan.
Return your plan as structured JSON with the following format:
{
  "goal": "...",
  "steps": [{ "order": 1, "action": "...", "details": "...", "toolNeeded": "..." }],
  "estimatedTime": "...",
  "risks": ["..."]
}`,
        writer: `You are a writing sub-agent. Your job is to produce clear, well-structured text.
Return your output as structured JSON with the following format:
{
  "content": "...",
  "format": "markdown|code|text",
  "wordCount": 0
}`,
        critic: `You are a critic sub-agent. Your job is to review work and provide constructive feedback.
Return your review as structured JSON with the following format:
{
  "rating": 1-10,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "suggestions": ["..."],
  "approved": true/false
}`,
        summarizer: `You are a summarization sub-agent. Your job is to compress information into a concise summary.
Keep summaries under 800 tokens. Focus on: decisions made, important facts, and current task state.
Return your summary as plain text.`,
    };

    return `${rolePrompts[role]}

## Task
${task}

## Rules
- Return ONLY the requested output format — no explanations or preamble.
- Be concise and precise.
- Focus only on the task given — do not explore tangents.`;
}

/**
 * Build the memory compression prompt.
 */
export function buildCompressionPrompt(
    oldSummary: string,
    newMessages: string,
): string {
    return `You are a memory compression agent. Your job is to update the memory summary.

## Current Memory Summary
${oldSummary || '(empty — this is the first compression)'}

## New Messages to Incorporate
${newMessages}

## Instructions
Create an updated memory summary that:
1. Preserves all important facts, decisions, and user preferences
2. Merges new information with the existing summary
3. Removes outdated or superseded information
4. Stays under 800 tokens
5. Uses this format:

User Profile:
- Key facts about the user

Current Task:
- What the user is currently working on

Decisions Made:
- Important choices and their rationale

Important Facts:
- Technical details, preferences, constraints

Recent Actions:
- What was just done (last 2-3 actions only)

Return ONLY the updated summary — no explanations.`;
}
