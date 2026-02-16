// ─── Web Tools ────────────────────────────────────────────────────
// Basic web search capabilities using DuckDuckGo HTML scraping
// No API key required, respects privacy, lightweight.

import type { TalonConfig } from '../config/schema.js';
import type { ToolDefinition } from './registry.js';
import { logger } from '../utils/logger.js';

// ─── Search Implementation ────────────────────────────────────────
// DuckDuckGo HTML parsing (simplest robust way without heavy deps)

async function searchDuckDuckGo(query: string): Promise<string> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    // Fake user agent to avoid basic blocking
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        return parseDuckDuckGoResults(html);
    } catch (err) {
        logger.error({ err, query }, 'Web search failed');
        return `Error searching for "${query}": ${err instanceof Error ? err.message : String(err)}`;
    }
}

function parseDuckDuckGoResults(html: string): string {
    // Basic regex parsing for DDG HTML
    // Looking for: <a class="result__a" href="...">Title</a> ... <a class="result__snippet" ...>Snippet</a>

    const results: string[] = [];
    const resultRegex = /<div class="result__body"[^>]*>([\s\S]*?)<\/div>/g;
    const linkRegex = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/;
    const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;

    let match;
    let count = 0;

    while ((match = resultRegex.exec(html)) !== null && count < 5) {
        const body = match[1];
        const linkMatch = linkRegex.exec(body);
        const snippetMatch = snippetRegex.exec(body);

        if (linkMatch) {
            let title = linkMatch[2].replace(/<[^>]+>/g, ''); // Strip tags
            // Decode entities
            title = title.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

            const url = linkMatch[1];

            let snippet = '';
            if (snippetMatch) {
                snippet = snippetMatch[1].replace(/<[^>]+>/g, '');
                snippet = snippet.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            }

            if (url && !url.startsWith('//duckduckgo.com')) {
                results.push(`### [${title}](${url})\n${snippet}`);
                count++;
            }
        }
    }

    if (results.length === 0) {
        return 'No results found.';
    }

    return results.join('\n\n');
}

// ─── Tools ────────────────────────────────────────────────────────

export function registerWebTools(config: TalonConfig): ToolDefinition[] {
    return [
        {
            name: 'web_search',
            description: 'Search the web for information using DuckDuckGo. Returns summarized search results. Use when you need up-to-date information.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query',
                    },
                },
                required: ['query'],
            },
            execute: async (args) => {
                const query = args.query as string;
                logger.info({ query }, 'web_search');
                return await searchDuckDuckGo(query);
            },
        },
    ];
}
