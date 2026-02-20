import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

function escapeAppleScript(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
            }

            const url = escapeAppleScript(args.url as string);
            const newTab = args.newTab !== false; // Default to true

            try {
                if (newTab) {
                    const script = `tell application "Safari"
    if not running then launch
    activate
    tell front window
        set current tab to (make new tab with properties {URL:"${url}"})
    end tell
end tell`;
                    await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                } else {
                    const script = `tell application "Safari"
    if not running then launch
    activate
    set URL of current tab of front window to "${url}"
end tell`;
                    await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                }
                
                logger.info({ url, newTab }, 'Safari navigation successful');
                return `Navigated to ${args.url} in Safari`;
            } catch (error) {
                logger.error({ error, url }, 'Failed to navigate in Safari');
                return `Error: ${(error as Error).message}`;
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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
            }

            const script = `tell application "Safari"
    if not running then return "Safari is not running"
    tell front document
        set pageTitle to name
        set pageURL to URL
        return "Title: " & pageTitle & "\nURL: " & pageURL
    end tell
end tell`;

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 10000 });
                return stdout.trim();
            } catch (error) {
                logger.error({ error }, 'Failed to get Safari page info');
                return `Error: ${(error as Error).message}`;
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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
            }

            const selector = args.selector as string | undefined;
            const maxLength = (args.maxLength as number) || 5000;

            try {
                // Build JavaScript code to execute
                let jsLogic: string;
                if (selector) {
                    jsLogic = `const el = document.querySelector('${selector.replace(/'/g, "\\'")}'); if (!el) return 'Element not found'; return el.innerText || el.textContent || ''`;
                } else {
                    jsLogic = `return document.body.innerText || document.body.textContent || ''`;
                }
                
                // Wrap in IIFE
                const jsCode = `(function() { ${jsLogic} })()`;
                
                // Build AppleScript - properly escape for shell execution
                const script = `tell application "Safari" to tell front document to do JavaScript "${jsCode.replace(/"/g, '\\"').replace(/\\/g, '\\\\')}"`;
                
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                let content = stdout.trim();
                
                // Truncate if too long
                if (content.length > maxLength) {
                    content = content.substring(0, maxLength) + '\n... (truncated)';
                }
                
                logger.info({ selector, contentLength: content.length }, 'Safari content extracted');
                return content || 'No text content found on the page';
            } catch (error) {
                logger.error({ error, selector }, 'Failed to extract content from Safari');
                return `Error: ${(error as Error).message}`;
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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
            }

            const userScript = args.script as string;
            const waitMs = (args.waitMs as number) || 0;
            
            // Wait if requested (for client-side rendering)
            if (waitMs > 0) {
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
            
            // Escape quotes and backslashes for AppleScript
            const escapedScript = userScript.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            
            const script = `tell application "Safari" to tell front document to do JavaScript "${escapedScript}"`;

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                const result = stdout.trim();
                logger.info({ script: userScript, result }, 'JavaScript executed in Safari');
                return result || 'JavaScript executed successfully (no return value)';
            } catch (error) {
                logger.error({ error, script: userScript }, 'Failed to execute JavaScript in Safari');
                return `Error: ${(error as Error).message}`;
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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
            }

            const selector = escapeAppleScript(args.selector as string);

            const jsCode = `(() => {
                const el = document.querySelector('${selector}');
                if (!el) return 'Element not found: ${selector}';
                el.click();
                return 'Clicked element: ' + (el.textContent || el.id || el.className || '${selector}').substring(0, 50);
            })()`;

            const script = `tell application "Safari"
    tell front document
        do JavaScript "${escapeAppleScript(jsCode)}"
    end tell
end tell`;

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                const result = stdout.trim();
                logger.info({ selector, result }, 'Element clicked in Safari');
                return result;
            } catch (error) {
                logger.error({ error, selector }, 'Failed to click element in Safari');
                return `Error: ${(error as Error).message}`;
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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
            }

            const selector = escapeAppleScript(args.selector as string);
            const text = escapeAppleScript(args.text as string);
            const submit = args.submit === true;

            const jsCode = `(() => {
                const el = document.querySelector('${selector}');
                if (!el) return 'Element not found: ${selector}';
                el.focus();
                el.value = '${text}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                ${submit ? `if (el.form) el.form.submit();` : ''}
                return 'Typed "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}" into ' + (el.placeholder || el.name || el.id || '${selector}');
            })()`;

            const script = `tell application "Safari"
    tell front document
        do JavaScript "${escapeAppleScript(jsCode)}"
    end tell
end tell`;

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                const result = stdout.trim();
                logger.info({ selector, textLength: (args.text as string).length }, 'Text typed into Safari field');
                return result;
            } catch (error) {
                logger.error({ error, selector }, 'Failed to type into Safari field');
                return `Error: ${(error as Error).message}`;
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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
            }

            const script = `tell application "Safari"
    tell front document
        do JavaScript "history.back()"
    end tell
end tell`;

            try {
                await execAsync(`osascript -e '${script}'`, { timeout: 10000 });
                logger.info('Navigated back in Safari');
                return 'Navigated back in Safari';
            } catch (error) {
                logger.error({ error }, 'Failed to navigate back in Safari');
                return `Error: ${(error as Error).message}`;
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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
            }

            const script = `tell application "Safari"
    tell front document
        do JavaScript "location.reload()"
    end tell
end tell`;

            try {
                await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                logger.info('Reloaded Safari page');
                return 'Reloaded Safari page';
            } catch (error) {
                logger.error({ error }, 'Failed to reload Safari page');
                return `Error: ${(error as Error).message}`;
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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
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
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 10000 });
                const result = stdout.trim();
                logger.info({ tabCount: result.split('\n').length }, 'Listed Safari tabs');
                return result || 'No tabs found';
            } catch (error) {
                logger.error({ error }, 'Failed to list Safari tabs');
                return `Error: ${(error as Error).message}`;
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
            if (process.platform !== 'darwin') {
                return 'Error: Safari automation is only available on macOS';
            }

            const windowIndex = (args.windowIndex as number) || 1;
            const tabIndex = args.tabIndex as number;

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
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 10000 });
                const result = stdout.trim();
                logger.info({ windowIndex, tabIndex }, 'Activated Safari tab');
                return result;
            } catch (error) {
                logger.error({ error, windowIndex, tabIndex }, 'Failed to activate Safari tab');
                return `Error: ${(error as Error).message}`;
            }
        },
    },
];
