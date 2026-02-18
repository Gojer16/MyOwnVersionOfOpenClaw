// ─── Browser Tools ────────────────────────────────────────────────
// Browser automation via Puppeteer
// Provides: navigate, click, type, screenshot, extract

import puppeteer, { Browser, Page } from 'puppeteer';
import type { TalonConfig } from '../config/schema.js';
import { logger } from '../utils/logger.js';

interface BrowserResult {
    success: boolean;
    content?: string;
    screenshot?: string;
    error?: string;
}

export class BrowserTools {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private headless: boolean;
    private viewport: { width: number; height: number };

    constructor(config: TalonConfig) {
        this.headless = config.tools.browser.headless;
        this.viewport = config.tools.browser.viewport;
    }

    /**
     * Launch browser instance
     */
    async launch(): Promise<void> {
        if (this.browser) {
            logger.debug('Browser already launched');
            return;
        }

        try {
            this.browser = await puppeteer.launch({
                headless: this.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                // Let Puppeteer use its bundled Chrome
                executablePath: undefined,
            });

            this.page = await this.browser.newPage();
            
            // Set viewport
            await this.page.setViewport(this.viewport);

            logger.info('Browser launched successfully');
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to launch browser');
            throw new Error(`Browser launch failed: ${error.message}. Try running: npx puppeteer browsers install chrome`);
        }
    }

    /**
     * Close browser instance
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            logger.info('Browser closed');
        }
    }

    /**
     * Check if browser is launched
     */
    isLaunched(): boolean {
        return this.browser !== null && this.browser.isConnected();
    }

    /**
     * Ensure browser is launched
     */
    private async ensureLaunched(): Promise<void> {
        if (!this.isLaunched()) {
            await this.launch();
        }
    }

    /**
     * Navigate to URL
     */
    async navigate(url: string): Promise<BrowserResult> {
        try {
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                return {
                    success: false,
                    error: 'Invalid URL - must start with http:// or https://',
                };
            }

            await this.ensureLaunched();

            await this.page!.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000,
            });

            const title = await this.page!.title();

            logger.info({ url, title }, 'Navigated to URL');

            return {
                success: true,
                content: `Navigated to ${url} - ${title}`,
            };
        } catch (error: any) {
            logger.error({ error, url }, 'Navigation failed');
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Click element by selector
     */
    async click(selector: string): Promise<BrowserResult> {
        try {
            if (!selector) {
                return {
                    success: false,
                    error: 'Selector required',
                };
            }

            await this.ensureLaunched();

            await this.page!.waitForSelector(selector, { timeout: 5000 });
            await this.page!.click(selector);

            logger.info({ selector }, 'Clicked element');

            return {
                success: true,
                content: `Clicked ${selector}`,
            };
        } catch (error: any) {
            logger.error({ error, selector }, 'Click failed');
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Type text into input
     */
    async type(selector: string, text: string): Promise<BrowserResult> {
        try {
            if (!selector || !text) {
                return {
                    success: false,
                    error: 'Selector and text required',
                };
            }

            await this.ensureLaunched();

            await this.page!.waitForSelector(selector, { timeout: 5000 });
            await this.page!.type(selector, text);

            logger.info({ selector, textLength: text.length }, 'Typed text');

            return {
                success: true,
                content: `Typed "${text}" into ${selector}`,
            };
        } catch (error: any) {
            logger.error({ error, selector }, 'Type failed');
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Capture screenshot
     */
    async screenshot(): Promise<BrowserResult> {
        try {
            await this.ensureLaunched();

            const screenshot = await this.page!.screenshot({
                encoding: 'base64',
                fullPage: false,
            });

            logger.info('Screenshot captured');

            return {
                success: true,
                screenshot: screenshot as string,
            };
        } catch (error: any) {
            logger.error({ error }, 'Screenshot failed');
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Extract content from page
     */
    async extract(selector?: string): Promise<BrowserResult> {
        try {
            await this.ensureLaunched();

            let content: string;

            if (selector) {
                // Extract specific element
                content = await this.page!.$eval(
                    selector,
                    (el) => el.textContent || ''
                );
            } else {
                // Extract full page text
                content = await this.page!.evaluate(() => document.body.textContent || '');
            }

            logger.info({ selector, contentLength: content.length }, 'Content extracted');

            return {
                success: true,
                content: content.trim(),
            };
        } catch (error: any) {
            logger.error({ error, selector }, 'Extract failed');
            return {
                success: false,
                error: error.message,
            };
        }
    }
}

/**
 * Register browser tools with agent
 */
export function registerBrowserTools(config: TalonConfig) {
    const browserTools = new BrowserTools(config);

    return [
        {
            name: 'browser_navigate',
            description: 'Navigate to a URL in the browser',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'URL to navigate to (must start with http:// or https://)',
                    },
                },
                required: ['url'],
            },
            execute: async (args: Record<string, unknown>) => {
                const result = await browserTools.navigate(args.url as string);
                return result.success ? result.content! : `Error: ${result.error}`;
            },
        },
        {
            name: 'browser_click',
            description: 'Click an element on the page',
            parameters: {
                type: 'object',
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector for the element to click',
                    },
                },
                required: ['selector'],
            },
            execute: async (args: Record<string, unknown>) => {
                const result = await browserTools.click(args.selector as string);
                return result.success ? result.content! : `Error: ${result.error}`;
            },
        },
        {
            name: 'browser_type',
            description: 'Type text into an input field',
            parameters: {
                type: 'object',
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector for the input element',
                    },
                    text: {
                        type: 'string',
                        description: 'Text to type',
                    },
                },
                required: ['selector', 'text'],
            },
            execute: async (args: Record<string, unknown>) => {
                const result = await browserTools.type(args.selector as string, args.text as string);
                return result.success ? result.content! : `Error: ${result.error}`;
            },
        },
        {
            name: 'browser_screenshot',
            description: 'Capture a screenshot of the current page',
            parameters: {
                type: 'object',
                properties: {},
            },
            execute: async (args: Record<string, unknown>) => {
                const result = await browserTools.screenshot();
                return result.success 
                    ? `Screenshot captured (base64): ${result.screenshot!.substring(0, 50)}...`
                    : `Error: ${result.error}`;
            },
        },
        {
            name: 'browser_extract',
            description: 'Extract text content from the page',
            parameters: {
                type: 'object',
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector for specific element (optional - extracts full page if not provided)',
                    },
                },
            },
            execute: async (args: Record<string, unknown>) => {
                const result = await browserTools.extract(args.selector as string | undefined);
                return result.success ? result.content! : `Error: ${result.error}`;
            },
        },
    ];
}
