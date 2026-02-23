// ─── Safari Integration with Full Bulletproofing ─────────────────────────────
// macOS Safari browser automation using AppleScript
// All tools return structured BulletproofOutput JSON with Zod validation

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import {
    BulletproofOutput,
    formatSuccess,
    formatError,
    safeExecAppleScript,
    checkPlatform,
    checkAppPermission,
    handleAppleScriptError,
    escapeAppleScript,
} from './apple-shared.js';

// ─── Zod Schemas ──────────────────────────────────────────────

const NavigateSchema = z.object({
    url: z.string().trim().min(1, "URL cannot be empty").max(2048, "URL too long (max 2048 chars)"),
    newTab: z.boolean().optional().default(true),
});

const ExtractSchema = z.object({
    selector: z.string().trim().max(500, "Selector too long").optional(),
    maxLength: z.number().int().min(1).max(50000).optional().default(5000),
});

const ExecuteJSSchema = z.object({
    script: z.string().trim().min(1, "Script cannot be empty").max(10000, "Script too long"),
    waitMs: z.number().int().min(0).max(30000).optional().default(0),
});

const ClickSchema = z.object({
    selector: z.string().trim().min(1, "Selector cannot be empty").max(500, "Selector too long"),
});

const TypeSchema = z.object({
    selector: z.string().trim().min(1, "Selector cannot be empty").max(500, "Selector too long"),
    text: z.string().min(1, "Text cannot be empty").max(5000, "Text too long"),
    submit: z.boolean().optional().default(false),
});

const ActivateTabSchema = z.object({
    windowIndex: z.number().int().min(1).optional().default(1),
    tabIndex: z.number().int().min(1, "Tab index must be at least 1"),
});

// ─── Tool Definitions ─────────────────────────────────────────

export const appleSafariTools = [
    {
        name: 'apple_safari_navigate',
        description: 'Navigate to a URL in Safari (macOS only). Opens in a new tab by default.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to navigate to (e.g., "https://example.com")' },
                newTab: { type: 'boolean', description: 'Open in new tab (default: true)' },
            },
            required: ['url'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Validate inputs
            let url: string;
            let newTab: boolean;
            try {
                const parsed = NavigateSchema.parse(args);
                url = parsed.url;
                newTab = parsed.newTab;
            } catch (error: any) {
                return formatError(
                    'VALIDATION_ERROR',
                    error.errors?.[0]?.message || 'Invalid parameters',
                    false,
                    { receivedArgs: args },
                    startTime
                );
            }

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            try {
                let script: string;
                if (newTab) {
                    script = `tell application "Safari"
    if not running then launch
    activate
    tell front window
        set current tab to (make new tab with properties {URL:"${escapeAppleScript(url)}"})
    end tell
end tell`;
                } else {
                    script = `tell application "Safari"
    if not running then launch
    activate
    set URL of current tab of front window to "${escapeAppleScript(url)}"
end tell`;
                }

                await safeExecAppleScript(script, 30000);
                logger.info({ url, newTab }, 'Safari navigation successful');

                return formatSuccess(
                    { url, newTab, message: `Navigated to ${url} in Safari` },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', { url, newTab }, startTime);
            }
        },
    },
    {
        name: 'apple_safari_get_info',
        description: 'Get the title and URL of the current Safari page (macOS only)',
        parameters: {
            type: 'object',
            properties: {},
        },
        async execute(): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            const script = `tell application "Safari"
    if not running then return "Safari is not running"
    tell front document
        set pageTitle to name
        set pageURL to URL
        return "Title: " & pageTitle & "\\nURL: " & pageURL
    end tell
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 10000);
                const result = stdout.trim();
                logger.info({ result }, 'Safari page info retrieved');

                return formatSuccess(
                    { rawOutput: result },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', {}, startTime);
            }
        },
    },
    {
        name: 'apple_safari_extract',
        description: 'Extract text content from the current Safari page (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'CSS selector to extract specific element (optional, e.g., "article", "#content", ".main")' },
                maxLength: { type: 'number', description: 'Maximum characters to return (default: 5000)' },
            },
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Validate inputs
            let selector: string | undefined;
            let maxLength: number;
            try {
                const parsed = ExtractSchema.parse(args);
                selector = parsed.selector;
                maxLength = parsed.maxLength;
            } catch (error: any) {
                return formatError(
                    'VALIDATION_ERROR',
                    error.errors?.[0]?.message || 'Invalid parameters',
                    false,
                    { receivedArgs: args },
                    startTime
                );
            }

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            try {
                // Build JavaScript code to execute
                let jsLogic: string;
                if (selector) {
                    // Escape selector for JavaScript
                    const escapedSelector = selector.replace(/'/g, "\\'");
                    jsLogic = `const el = document.querySelector('${escapedSelector}'); if (!el) return 'Element not found'; return el.innerText || el.textContent || ''`;
                } else {
                    jsLogic = `return document.body.innerText || document.body.textContent || ''`;
                }

                // Wrap in IIFE
                const jsCode = `(function() { ${jsLogic} })()`;

                const script = `tell application "Safari"
    tell front document
        do JavaScript "${escapeAppleScript(jsCode)}"
    end tell
end tell`;

                const { stdout } = await safeExecAppleScript(script, 30000);
                let content = stdout.trim();

                // Truncate if too long
                if (content.length > maxLength) {
                    content = content.substring(0, maxLength) + '\\n... (truncated)';
                }

                logger.info({ selector, contentLength: content.length }, 'Safari content extracted');
                return formatSuccess(
                    { content, selector, length: content.length },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', { selector }, startTime);
            }
        },
    },
    {
        name: 'apple_safari_execute_js',
        description: 'Execute JavaScript on the current Safari page (macOS only). Use this for custom interactions. Returns the result as a string (use JSON.stringify for objects).',
        parameters: {
            type: 'object',
            properties: {
                script: { type: 'string', description: 'JavaScript code to execute. For structured data, wrap in JSON.stringify().' },
                waitMs: { type: 'number', description: 'Milliseconds to wait before executing (default: 0, useful for client-side rendered pages)' },
            },
            required: ['script'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Validate inputs
            let userScript: string;
            let waitMs: number;
            try {
                const parsed = ExecuteJSSchema.parse(args);
                userScript = parsed.script;
                waitMs = parsed.waitMs;
            } catch (error: any) {
                return formatError(
                    'VALIDATION_ERROR',
                    error.errors?.[0]?.message || 'Invalid parameters',
                    false,
                    { receivedArgs: args },
                    startTime
                );
            }

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            // Wait if requested (for client-side rendering)
            if (waitMs > 0) {
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }

            const script = `tell application "Safari"
    tell front document
        do JavaScript "${escapeAppleScript(userScript)}"
    end tell
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 30000);
                const result = stdout.trim();
                logger.info({ scriptLength: userScript.length }, 'JavaScript executed in Safari');

                return formatSuccess(
                    { result, scriptLength: userScript.length },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', { scriptLength: userScript.length }, startTime);
            }
        },
    },
    {
        name: 'apple_safari_click',
        description: 'Click an element on the current Safari page by CSS selector (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'CSS selector for the element to click (e.g., "button", "a.link", "#submit")' },
            },
            required: ['selector'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Validate inputs
            let selector: string;
            try {
                const parsed = ClickSchema.parse(args);
                selector = parsed.selector;
            } catch (error: any) {
                return formatError(
                    'VALIDATION_ERROR',
                    error.errors?.[0]?.message || 'Invalid parameters',
                    false,
                    { receivedArgs: args },
                    startTime
                );
            }

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            const jsCode = `(() => {
                const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                if (!el) return 'Element not found: ${selector.replace(/'/g, "\\'")}';
                el.click();
                return 'Clicked element: ' + (el.textContent || el.id || el.className || '${selector}').substring(0, 50);
            })()`;

            const script = `tell application "Safari"
    tell front document
        do JavaScript "${escapeAppleScript(jsCode)}"
    end tell
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 30000);
                const result = stdout.trim();
                logger.info({ selector, result }, 'Element clicked in Safari');

                return formatSuccess(
                    { result, selector },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', { selector }, startTime);
            }
        },
    },
    {
        name: 'apple_safari_type',
        description: 'Type text into an input field on the current Safari page (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'CSS selector for the input element' },
                text: { type: 'string', description: 'Text to type into the field' },
                submit: { type: 'boolean', description: 'Submit the form after typing (default: false)' },
            },
            required: ['selector', 'text'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Validate inputs
            let selector: string;
            let text: string;
            let submit: boolean;
            try {
                const parsed = TypeSchema.parse(args);
                selector = parsed.selector;
                text = parsed.text;
                submit = parsed.submit;
            } catch (error: any) {
                return formatError(
                    'VALIDATION_ERROR',
                    error.errors?.[0]?.message || 'Invalid parameters',
                    false,
                    { receivedArgs: args },
                    startTime
                );
            }

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            const escapedSelector = selector.replace(/'/g, "\\'");
            const escapedText = text.replace(/'/g, "\\'");

            const jsCode = `(() => {
                const el = document.querySelector('${escapedSelector}');
                if (!el) return 'Element not found: ${escapedSelector}';
                el.focus();
                el.value = '${escapedText}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                ${submit ? 'if (el.form) el.form.submit();' : ''}
                return 'Typed "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}" into ' + (el.placeholder || el.name || el.id || '${escapedSelector}');
            })()`;

            const script = `tell application "Safari"
    tell front document
        do JavaScript "${escapeAppleScript(jsCode)}"
    end tell
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 30000);
                const result = stdout.trim();
                logger.info({ selector, textLength: text.length }, 'Text typed into Safari field');

                return formatSuccess(
                    { result, selector, textLength: text.length },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', { selector, textLength: text.length }, startTime);
            }
        },
    },
    {
        name: 'apple_safari_go_back',
        description: 'Navigate back in Safari history (macOS only)',
        parameters: {
            type: 'object',
            properties: {},
        },
        async execute(): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            const script = `tell application "Safari"
    tell front document
        do JavaScript "history.back()"
    end tell
end tell`;

            try {
                await safeExecAppleScript(script, 10000);
                logger.info('Navigated back in Safari');
                return formatSuccess(
                    { message: 'Navigated back in Safari' },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', {}, startTime);
            }
        },
    },
    {
        name: 'apple_safari_reload',
        description: 'Reload the current Safari page (macOS only)',
        parameters: {
            type: 'object',
            properties: {},
        },
        async execute(): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            const script = `tell application "Safari"
    tell front document
        do JavaScript "location.reload()"
    end tell
end tell`;

            try {
                await safeExecAppleScript(script, 30000);
                logger.info('Reloaded Safari page');
                return formatSuccess(
                    { message: 'Reloaded Safari page' },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', {}, startTime);
            }
        },
    },
    {
        name: 'apple_safari_list_tabs',
        description: 'List all open tabs in Safari with their titles and URLs (macOS only)',
        parameters: {
            type: 'object',
            properties: {},
        },
        async execute(): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            const script = `tell application "Safari"
    if not running then return "Safari is not running"
    set tabList to {}
    set windowIndex to 1
    repeat with aWindow in windows
        set tabIndex to 1
        repeat with aTab in tabs of aWindow
            set tabTitle to name of aTab
            set tabURL to URL of aTab
            set end of tabList to "[" & windowIndex & ":" & tabIndex & "] " & tabTitle & " - " & tabURL
            set tabIndex to tabIndex + 1
        end repeat
        set windowIndex to windowIndex + 1
    end repeat
    if (count of tabList) = 0 then
        return "No tabs found"
    else
        return tabList as text
    end if
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 10000);
                const result = stdout.trim();
                const tabCount = result === 'No tabs found' ? 0 : result.split('\\n').length;
                logger.info({ tabCount }, 'Listed Safari tabs');

                return formatSuccess(
                    { rawOutput: result, tabCount },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', {}, startTime);
            }
        },
    },
    {
        name: 'apple_safari_activate_tab',
        description: 'Activate a specific tab in Safari by window and tab index (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                windowIndex: { type: 'number', description: 'Window index (1-based, default: 1)' },
                tabIndex: { type: 'number', description: 'Tab index (1-based)' },
            },
            required: ['tabIndex'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            // Platform check
            const platformError = checkPlatform('Safari', startTime);
            if (platformError) return platformError;

            // Validate inputs
            let windowIndex: number;
            let tabIndex: number;
            try {
                const parsed = ActivateTabSchema.parse(args);
                windowIndex = parsed.windowIndex;
                tabIndex = parsed.tabIndex;
            } catch (error: any) {
                return formatError(
                    'VALIDATION_ERROR',
                    error.errors?.[0]?.message || 'Invalid parameters',
                    false,
                    { receivedArgs: args },
                    startTime
                );
            }

            // Check Safari permission
            const { granted: permissionGranted } = await checkAppPermission('Safari', 'tell application "Safari" to name of front document');
            if (!permissionGranted) {
                return formatError(
                    'PERMISSION_DENIED',
                    'Terminal does not have permission to control Safari',
                    true,
                    {},
                    startTime,
                    [
                        'Open System Settings',
                        'Go to Privacy & Security → Automation',
                        'Find Terminal (or your terminal app)',
                        'Enable the Safari checkbox',
                        'Restart your terminal and try again',
                    ]
                );
            }

            const script = `tell application "Safari"
    if not running then return "Safari is not running"
    tell window ${windowIndex}
        set current tab to tab ${tabIndex}
    end tell
    tell front document
        set tabTitle to name
        set tabURL to URL
        return "Activated tab: " & tabTitle & " (" & tabURL & ")"
    end tell
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 10000);
                const result = stdout.trim();
                logger.info({ windowIndex, tabIndex }, 'Activated Safari tab');

                return formatSuccess(
                    { result, windowIndex, tabIndex },
                    {},
                    startTime
                );
            } catch (error: any) {
                return handleAppleScriptError(error, 'Safari', { windowIndex, tabIndex }, startTime);
            }
        },
    },
];
