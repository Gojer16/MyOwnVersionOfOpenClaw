// ─── System Prompt Templates ──────────────────────────────────────
// Injected into every LLM call by the Memory Manager

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractUserName } from '../memory/daily.js';
import { truncateToTokens } from '../utils/tokens.js';
import { buildProfileSummary, getProfileDisplayName, loadProfile } from '../memory/profile.js';

const TALON_HOME = path.join(os.homedir(), '.talon');

// ─── Helper Functions ─────────────────────────────────────────────

/**
 * Strip YAML frontmatter from template content.
 */
function stripFrontMatter(content: string): string {
    if (!content.startsWith('---')) {
        return content;
    }
    const endIndex = content.indexOf('\n---', 3);
    if (endIndex === -1) {
        return content;
    }
    const start = endIndex + '\n---'.length;
    let trimmed = content.slice(start);
    trimmed = trimmed.replace(/^\s+/, '');
    return trimmed;
}

function normalizeForCompare(content: string): string {
    return stripFrontMatter(content)
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .trim();
}

function loadTemplateFile(templateDir: string | undefined, file: string): string | null {
    if (!templateDir) return null;
    const templatePath = path.join(templateDir, file);
    if (!fs.existsSync(templatePath)) return null;
    return fs.readFileSync(templatePath, 'utf-8');
}

function isWorkspaceTemplateEqual(
    workspaceRoot: string,
    templateDir: string | undefined,
    file: string,
): boolean | null {
    const templateContent = loadTemplateFile(templateDir, file);
    const workspaceContent = loadWorkspaceFile(workspaceRoot, file);

    if (!templateContent || !workspaceContent) return null;

    return normalizeForCompare(templateContent) === normalizeForCompare(workspaceContent);
}

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
        '*(Nothing yet',
        '<!-- ⚠️  TEMPLATE FILE',
        '(not this template)',
        'PERSONALIZATION INSTRUCTIONS:',
        'Fill this in during your first conversation',
    ];

    // Check if all the key fields are empty (just the label with no value)
    const lines = content.split('\n');
    let hasAnyFilledField = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Check if this is a field line: - **FieldName:** value or **FieldName:** value
        const fieldMatch = line.match(/^-?\s*\*\*([^*]+):\*\*\s*(.*)$/);
        if (fieldMatch) {
            const fieldValue = fieldMatch[2].trim();

            // Skip optional fields or template markers
            if (fieldValue.includes('(optional)') || fieldValue.startsWith('_') || fieldValue.startsWith('*') || fieldValue.startsWith('(')) {
                continue;
            }

            // If there's actual content after the colon
            if (fieldValue && fieldValue.length > 0) {
                hasAnyFilledField = true;
                break;
            }
        }
    }

    if (hasAnyFilledField) {
        return false;
    }

    // Remove template indicators and empty field labels, then check if anything meaningful remains
    const stripped = content
        .split('\n')
        .filter(line => !templateIndicators.some(indicator => line.includes(indicator)))
        .filter(line => !/^\s*-?\s*\*\*[^*]+:\*\*\s*$/.test(line))
        .join('\n')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^#.*$/gm, '')
        .replace(/^\s*$/gm, '')
        .trim();

    return stripped.length < 10;
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
 * Load FACTS.json content from workspace (pretty-printed).
 */
export function loadFacts(workspaceRoot: string): string | null {
    const content = loadWorkspaceFile(workspaceRoot, 'FACTS.json');
    if (!content) return null;

    try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return content;
    }
}

function isFactsEmpty(content: string): boolean {
    try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') return false;

        const learnedFacts = Array.isArray(parsed.learned_facts) ? parsed.learned_facts.length : 0;
        const user = (parsed.user && typeof parsed.user === 'object') ? parsed.user as Record<string, unknown> : {};
        const userName = typeof user.name === 'string' ? user.name : '';
        const prefs = (user.preferences && typeof user.preferences === 'object')
            ? user.preferences as Record<string, unknown>
            : {};
        const hasMeaningfulPrefs = Object.entries(prefs).some(([key, value]) => {
            if (key === 'theme' && value === 'dark') return false;
            return value !== null && value !== '' && value !== undefined;
        });
        const env = (parsed.environment && typeof parsed.environment === 'object')
            ? parsed.environment as Record<string, unknown>
            : {};
        const hasEnv = Object.values(env).some(value => value !== null && value !== '' && value !== undefined);

        return learnedFacts === 0 && userName === 'User' && !hasMeaningfulPrefs && !hasEnv;
    } catch {
        return false;
    }
}

/**
 * Load PROFILE.json content from workspace (pretty-printed).
 */
export function loadProfileRaw(workspaceRoot: string): string | null {
    const content = loadWorkspaceFile(workspaceRoot, 'PROFILE.json');
    if (!content) return null;
    try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return content;
    }
}

/**
 * Load AGENTS.md content from workspace (operating manual).
 */
export function loadAgentsManual(workspaceRoot: string): string | null {
    return loadWorkspaceFile(workspaceRoot, 'AGENTS.md');
}

/**
 * Check if bootstrap is needed.
 * 
 * Smart check: even if BOOTSTRAP.md exists, if both IDENTITY.md and USER.md
 * are already populated, bootstrap is complete and we skip it.
 * This prevents the "who am I?" loop when the LLM saved data but didn't delete BOOTSTRAP.md.
 */
export function isBootstrapNeeded(workspaceRoot: string, templateDir?: string): boolean {
    const bootstrapPath = resolveWorkspacePath(workspaceRoot, 'BOOTSTRAP.md');
    const bootstrapExists = fs.existsSync(bootstrapPath);

    // Check if files are already populated or still template-identical
    const identity = loadWorkspaceFile(workspaceRoot, 'IDENTITY.md');
    const profile = loadWorkspaceFile(workspaceRoot, 'PROFILE.json');

    const identityTemplateMatch = identity
        ? isWorkspaceTemplateEqual(workspaceRoot, templateDir, 'IDENTITY.md')
        : null;
    const profileTemplateMatch = profile
        ? isWorkspaceTemplateEqual(workspaceRoot, templateDir, 'PROFILE.json')
        : null;

    const identityIsTemplate = identity
        ? (identityTemplateMatch ?? isTemplateEmpty(identity))
        : true;
    const profileFilled = loadProfile(workspaceRoot) !== null;
    const profileIsTemplate = profile
        ? (profileTemplateMatch ?? !profileFilled)
        : true;

    if (!identityIsTemplate && !profileIsTemplate) {
        // Both files are populated — bootstrap is done!
        // Auto-delete BOOTSTRAP.md to prevent future re-checks
        if (bootstrapExists) {
            try {
                fs.unlinkSync(bootstrapPath);
                console.log('✅ Bootstrap complete — BOOTSTRAP.md auto-deleted');
            } catch {
                // Non-fatal: if we can't delete, the check above prevents re-triggering
            }
        }
        return false;
    }

    return bootstrapExists || identityIsTemplate || profileIsTemplate;
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
    workspaceTemplateDir?: string,
    config?: any, // TalonConfig - optional channel configuration
): string {
    let prompt = soul;

    const loadedFiles: Array<{ name: string; chars: number; status: string }> = [];
    loadedFiles.push({ name: 'SOUL.md', chars: soul.length, status: 'loaded' });

    // Inject user context if available
    if (workspaceRoot) {
        const bootstrap = isBootstrapNeeded(workspaceRoot, workspaceTemplateDir);

            if (bootstrap) {
                const bootstrapContent = loadBootstrap(workspaceRoot);
                if (bootstrapContent) {
                loadedFiles.push({ name: 'BOOTSTRAP.md', chars: bootstrapContent.length, status: 'loaded' });

                // 🛑 CRITICAL: If bootstrapping, REPLACE the default soul entirely.
                prompt = `## 🚀 SYSTEM BOOT — FIRST RUN SEQUENCE\n\n${bootstrapContent}\n\n## CRITICAL INSTRUCTIONS\n\nYou MUST use the file_write tool to update these files as you learn information:\n- PROFILE.json — Fill in their name, preferred name, timezone, working hours, and preferences\n- IDENTITY.md — Fill in your name, creature type, vibe, and emoji\n\nDo NOT just remember this information — you must WRITE it to the files so it persists across sessions.\n\nWhen a file is fully populated, it will be automatically loaded into your context on future sessions.`;

                // 🧠 PARTIAL PROGRESS CHECK
                // Check if we have already learned things (e.g. from crashed session or partial run)
                const user = loadUser(workspaceRoot);
                const identity = loadIdentity(workspaceRoot);
                const memory = loadWorkspaceFile(workspaceRoot, 'MEMORY.md');
                const facts = loadFacts(workspaceRoot);
                const profileRaw = loadProfileRaw(workspaceRoot);

                let additionalContext = '';

                if (identity && !isTemplateEmpty(identity)) {
                    additionalContext += `\n\n## Identity (Learned So Far)\n${identity}`;
                    loadedFiles.push({ name: 'IDENTITY.md', chars: identity.length, status: 'partial' });
                } else if (identity) {
                    loadedFiles.push({ name: 'IDENTITY.md', chars: identity.length, status: 'template' });
                }

                if (profileRaw) {
                    additionalContext += `\n\n## Profile (Learned So Far)\n${truncateToTokens(profileRaw, 400)}`;
                    loadedFiles.push({ name: 'PROFILE.json', chars: profileRaw.length, status: 'partial' });
                } else if (user && !isTemplateEmpty(user)) {
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

                if (facts && !isFactsEmpty(facts)) {
                    additionalContext += `\n\n## Facts (Structured)\n${truncateToTokens(facts, 600)}`;
                    loadedFiles.push({ name: 'FACTS.json', chars: facts.length, status: 'loaded' });
                } else if (facts) {
                    loadedFiles.push({ name: 'FACTS.json', chars: facts.length, status: 'template' });
                }

                if (additionalContext) {
                    prompt += `\n\n## ⚠️ RESUMING BOOTSTRAP\nWe have already started this process. Use the context below to pick up where we left off (don't ask questions we've already answered):\n${additionalContext}`;
                }
            } else {
                loadedFiles.push({ name: 'BOOTSTRAP.md', chars: 0, status: 'missing' });
            }
        } else {
            // Normal operation: inject Profile + Identity context
            const user = loadUser(workspaceRoot);
            const identity = loadIdentity(workspaceRoot);
            const facts = loadFacts(workspaceRoot);
            const profile = loadProfile(workspaceRoot);
            const profileRaw = loadProfileRaw(workspaceRoot);

            if (identity && !isTemplateEmpty(identity)) {
                prompt += `\n\n## Your Identity\n\n${identity}`;
                loadedFiles.push({ name: 'IDENTITY.md', chars: identity.length, status: 'loaded' });
            } else if (identity) {
                loadedFiles.push({ name: 'IDENTITY.md', chars: identity.length, status: 'template-empty' });
            } else {
                loadedFiles.push({ name: 'IDENTITY.md', chars: 0, status: 'missing' });
            }

            const profileSummary = buildProfileSummary(profile);
            const defaultChannel = profile?.channels?.default;
            if (profileSummary) {
                prompt += `\n\n## User Profile (Structured)\n\n${profileSummary}`;
                if (profileRaw) {
                    loadedFiles.push({ name: 'PROFILE.json', chars: profileRaw.length, status: 'loaded' });
                }
            } else if (profileRaw) {
                loadedFiles.push({ name: 'PROFILE.json', chars: profileRaw.length, status: 'template-empty' });
            } else {
                loadedFiles.push({ name: 'PROFILE.json', chars: 0, status: 'missing' });
            }

            if (facts && !isFactsEmpty(facts)) {
                prompt += `\n\n## Facts (Structured)\n\n${truncateToTokens(facts, 300)}`;
                loadedFiles.push({ name: 'FACTS.json', chars: facts.length, status: 'loaded' });
            } else if (facts) {
                loadedFiles.push({ name: 'FACTS.json', chars: facts.length, status: 'template-empty' });
            } else {
                loadedFiles.push({ name: 'FACTS.json', chars: 0, status: 'missing' });
            }

            if (defaultChannel) {
                prompt += `\n\n## Channel Defaults\nUse "${defaultChannel}" as the default channel for proactive messages or scheduled reminders unless the user specifies otherwise.`;
            }

            // Add proactive greeting instruction if we know the user's name
            const profileName = getProfileDisplayName(profile) || extractUserName(user);
            if (profileName) {
                prompt += `\n\n## First Message Greeting\nIf this is the first message in this session, greet ${profileName} casually (e.g., "Hey ${profileName}! Ready to crush some goals? 🚀" or "What's good, ${profileName}?"). Don't ask who they are - you already know them from the files above!`;
            }

            // Add configured channels information
            const channels: string[] = [];

            // Telegram channel status
            if (config?.channels?.telegram?.enabled && config.channels.telegram.botToken) {
                channels.push(`✅ **Telegram** - Bot configured (@${config.channels.telegram.botToken.split(':')[0]}), ${config.channels.telegram.allowedUsers?.length || 0} allowed user(s)`);
                channels.push(`   **Usage**: Users message the bot directly. Responses are AUTOMATICALLY delivered.`);
            } else if (config?.channels?.telegram?.enabled) {
                channels.push(`⚠️ **Telegram** - Enabled but MISSING bot token in .env`);
                channels.push(`   **Fix**: Add TELEGRAM_BOT_TOKEN to ~/.talon/.env`);
            } else {
                channels.push(`❌ **Telegram** - Disabled in config.json`);
            }

            // WhatsApp channel status (whatsapp-web.js - FREE, no Business API needed)
            if (config?.channels?.whatsapp?.enabled) {
                const userCount = config.channels.whatsapp.allowedUsers?.length || 0;
                channels.push(`✅ **WhatsApp** - Configured (whatsapp-web.js), ${userCount} allowed user(s)`);
                channels.push(`   **Usage**: Users message your number directly. QR code auth. Responses AUTOMATICALLY delivered.`);
                channels.push(`   **Note**: Uses FREE whatsapp-web.js library - NO Business API required!`);
            } else {
                channels.push(`❌ **WhatsApp** - Disabled in config.json`);
            }

            // CLI channel status
            if (config?.channels?.cli?.enabled) {
                channels.push(`✅ **CLI** - Terminal interface active`);
            }

            if (channels.length > 0) {
                prompt += `\n\n## 📱 Configured Communication Channels\n\n${channels.join('\n')}\n\n**CRITICAL**: When users message you via these channels, your responses are AUTOMATICALLY delivered to them on the same channel. You do NOT need any special tool or API - just respond naturally and the channel system handles delivery. The user's config already has everything needed.`;
            }
        }
    }

    prompt += `

## 🧠 CRITICAL: Memory and Session Rules

**⚠️ SESSION MEMORY IS TEMPORARY - WORKSPACE FILES ARE PERMANENT:**
- Anything you learn in this conversation will be FORGOTTEN when the session ends
- The ONLY way to remember information permanently is to write it to workspace files
- If you learn the user's name, goals, preferences → IMMEDIATELY write to PROFILE.json
- If you establish your identity → IMMEDIATELY write to IDENTITY.md
- If you learn important facts → IMMEDIATELY write to MEMORY.md

**WORKSPACE FILES ARE YOUR ONLY SOURCE OF TRUTH FOR USER IDENTITY:**
- If PROFILE.json is empty or contains template placeholders → you DON'T know the user yet
- If IDENTITY.md is empty → you haven't established your identity yet
- If MEMORY.md is empty → you have no long-term memories yet

**DO NOT confuse session history with persistent memory:**
- Session history (previous messages in this conversation) is SHORT-TERM and will be forgotten
- Only information written to workspace files (PROFILE.json, IDENTITY.md, MEMORY.md) persists across sessions
- If you see information in earlier messages but NOT in workspace files → it's NOT saved and you should NOT claim to remember it

**When the user introduces themselves:**
- If PROFILE.json is empty → this is the FIRST TIME you're learning about them (even if they mentioned it earlier in this session)
- You MUST IMMEDIATELY use file_write to save their information to PROFILE.json
- Do NOT say "I already know you" unless PROFILE.json actually contains their information
- CRITICAL: Information only in session history will be LOST when the session ends - you MUST write to files to persist it

## Your Capabilities

You are an AI assistant with an iterative agent loop. You can:
1. **Think** about the user's request and plan your approach
2. **Use tools** to read files, run commands, browse the web, and manage memory
3. **Delegate tasks** to specialized subagents (research, writer, planner, critic, summarizer)
4. **Manage productivity** with notes, tasks, and calendar integrations
5. **Evaluate** your results and decide if more work is needed
6. **Respond** with a clear, helpful answer
7. **Communicate via channels** - You are connected to Telegram and WhatsApp channels that deliver your responses to users

**Communication Channels:**
- **Telegram**: Users can message you via Telegram bot. Your responses are automatically delivered with MarkdownV2 formatting.
- **WhatsApp**: Users can message you via WhatsApp. Your responses are automatically delivered with proper formatting.
- **CLI**: Terminal interface for local interaction.
- When users ask you to "send a message to Telegram/WhatsApp", you can respond normally - the channel system automatically delivers your response to the correct platform.
- You do NOT need a special tool to send messages - just respond naturally and the channel system handles delivery.

## Available Tools
${availableTools.length > 0 ? availableTools.map(t => `- ${t}`).join('\n') : '(No tools currently available)'}

## Important Guidelines

- **Be direct.** Don't add filler or unnecessary caveats.
- **Use tools proactively.** If you need to check something, check it — don't guess.
- **ALWAYS respond after using tools.** After tool execution, you MUST generate a text response presenting the results to the user. Never leave tool results hanging without explanation.
- **NEVER include raw tool outputs in your response.** Synthesize the information into a clean, user-friendly answer. Users should NOT see tool names, raw HTML, or debug output.
- **Provide quality answers.** Extract the key information from tool results and present it clearly. If asked for a list, format it nicely with bullet points.
- **Delegate when appropriate.** Use subagents for research, writing, planning, reviewing, or summarizing.
- **Manage productivity.** Save important notes, create tasks, and schedule events.
- **Show your work.** When you use tools, briefly explain what you found.
- **Admit uncertainty.** If you don't know something and can't look it up, say so.
- **Remember context.** Pay attention to the memory summary — it contains important decisions and facts.
- **Be cost-conscious.** Don't make unnecessary tool calls. Plan before acting.

## Multi-Step Task Execution

When given a task that requires multiple steps (e.g., "find all models with 4b or 8b"):

1. **Plan the full workflow** before starting:
   - What data do I need to collect?
   - What pages do I need to visit?
   - How will I know when I'm done?

2. **Use scratchpad for progress tracking:**
   - Store visited URLs in scratchpad.visited
   - Store collected results in scratchpad.collected
   - Store remaining items in scratchpad.pending

3. **Extract structured data:**
   - When extracting lists, return JSON arrays
   - When extracting details, return JSON objects
   - Avoid returning raw HTML or unstructured text

4. **Iterate until complete:**
   - If you need to check multiple items, check ALL of them
   - If you need to click into detail pages, do it for EVERY item
   - Do NOT stop after the first extraction
   - Continue until scratchpad.pending is empty

5. **Verify completeness:**
   - Before responding, check: "Did I visit all items?"
   - If not, continue iterating
   - Only respond with final summary when ALL items are processed

6. **Handle client-side rendered pages:**
   - If extraction returns empty, wait 2-3 seconds and retry
   - Use apple_safari_execute_js with DOM queries after page load
   - Check for specific selectors before extracting

**CRITICAL:** Do NOT stop after one tool call. Multi-step tasks require multiple iterations.

## Response Format (MANDATORY)

ALWAYS format your response using these tags:

<think>[Your internal reasoning - brief analysis, max 3 sentences]</think>
<final>[Your clean, user-facing response here]</final>

**Rules:**
- ALL internal reasoning MUST be inside <think>...</think>
- Do NOT output any analysis outside <think> tags
- Only text inside <final>...</final> will be shown to the user
- Keep <think> brief (max 3 sentences)
- Put your complete answer inside <final> tags
- NEVER include tool outputs or raw data in <final> - synthesize clean answers

**Routing Directive (ONLY when explicitly requested):**
- If the user explicitly asks to send a message to specific channels (e.g., "send to telegram and whatsapp"),
  include a routing directive BEFORE <final>:
  <route>{"channels":["telegram","whatsapp"]}</route>
- Valid channels: telegram, whatsapp, cli, webchat
- Do NOT include <route> unless the user clearly requested cross-channel sending
- If the user is ambiguous about channels, ask a clarification question in <final>
- **Do NOT ask for recipient/timing** if a default recipient is configured for that channel
- **Assume "send now" and use the exact requested text** unless the user explicitly asked for edits or scheduling
- When sending to external channels, your <final> should contain **only the message text** (no confirmations, no status updates, no extra commentary)

**Example:**
<think>User asked for models with 4b/8b. I found translategemma (4b, 12b, 27b) and rnj-1 (8b). I'll format this as a clean list.</think>
<route>{"channels":["telegram","whatsapp"]}</route>
<final>Found 2 models with 4b or 8b:

• translategemma - 4b, 12b, 27b
  Translation model built on Gemma 3
  351.6K pulls

• rnj-1 - 8b
  Code and STEM optimized
  323.4K pulls</final>
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
