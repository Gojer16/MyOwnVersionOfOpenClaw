// ─── Telegram Channel ─────────────────────────────────────────────
// Lightweight implementation using long-polling via fetch (no heavy deps)

import { BaseChannel } from '../base.js';
import type { OutboundMessage } from '../../utils/types.js';
import { logger } from '../../utils/logger.js';
import { processResponse } from '../../utils/strip-tags.js';

interface TelegramUpdate {
    update_id: number;
    message?: {
        message_id: number;
        from?: {
            id: number;
            first_name: string;
            username?: string;
        };
        chat: {
            id: number;
            type: string;
            title?: string;
        };
        date: number;
        text?: string;
    };
}

interface TelegramResponse<T> {
    ok: boolean;
    result: T;
    description?: string;
}

export class TelegramChannel extends BaseChannel {
    public readonly name = 'telegram';
    private offset = 0;
    private isPolling = false;
    private pollingTimeout: NodeJS.Timeout | null = null;
    private errorCount = 0;
    private botUsername: string | null = null;

    public async start(): Promise<void> {
        if (!this.config.channels.telegram.enabled) {
            return;
        }

        const token = this.config.channels.telegram.botToken;
        if (!token) {
            logger.error('Telegram enabled but no bot token provided');
            return;
        }

        // Fetch bot username for mention detection in groups
        try {
            const botInfo = await this.callApi<{ id: number; username: string }>(token, 'getMe', {});
            this.botUsername = botInfo.username;
            logger.info({ username: this.botUsername }, 'Telegram bot info fetched');
        } catch (err) {
            logger.warn({ err }, 'Failed to fetch bot username, mention detection may not work');
        }

        logger.info('Starting Telegram polling...');
        this.isPolling = true;
        this.poll();
    }

    public async stop(): Promise<void> {
        this.isPolling = false;
        if (this.pollingTimeout) {
            clearTimeout(this.pollingTimeout);
        }
    }

    // CHAN-017: Send typing indicator
    public async sendTyping(chatId: string): Promise<void> {
        const token = this.config.channels.telegram.botToken;
        if (!token || !chatId) return;

        try {
            await this.callApi(token, 'sendChatAction', {
                chat_id: chatId,
                action: 'typing',
            });
        } catch (err) {
            logger.debug({ err, chatId }, 'Failed to send typing indicator');
        }
    }

    public async send(sessionId: string, message: OutboundMessage): Promise<void> {
        // Retrieve session to get the real chat ID (senderId)
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            logger.error({ sessionId }, 'Session not found for outbound Telegram message');
            return;
        }

        const chatId = session.senderId;
        const token = this.config.channels.telegram.botToken;

        if (!token || !chatId) return;

        // Clean internal tags before formatting for Telegram
        const cleanedText = processResponse(message.text);

        // CHAN-018: Convert to Telegram MarkdownV2 format
        const markdownText = this.convertToTelegramMarkdown(cleanedText);

        // CHAN-002: Split messages into chunks ≤ 4096 chars (Telegram limit)
        const MAX_TELEGRAM_LENGTH = 4096;
        const chunks: string[] = [];
        for (let i = 0; i < markdownText.length; i += MAX_TELEGRAM_LENGTH) {
            chunks.push(markdownText.slice(i, i + MAX_TELEGRAM_LENGTH));
        }

        try {
            // Send each chunk as a separate message with MarkdownV2
            for (const chunk of chunks) {
                await this.callApi(token, 'sendMessage', {
                    chat_id: chatId,
                    text: chunk,
                    parse_mode: 'MarkdownV2',
                });
            }
            logger.info({ chatId, chunks: chunks.length }, 'Telegram message sent');
        } catch (err) {
            logger.error({ err, chatId }, 'Failed to send Telegram message');
        }
    }

    // CHAN-018: Convert markdown to Telegram MarkdownV2 format
    private convertToTelegramMarkdown(text: string): string {
        // First, extract and protect code blocks
        const codeBlocks: string[] = [];
        let protectedText = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || '';
            const index = codeBlocks.length;
            codeBlocks.push('```' + language + '\n' + code.trim() + '```');
            return `%%CODEBLOCK${index}%%`;
        });

        // Escape special MarkdownV2 characters
        const escapeSpecial = (str: string) => str
            .replace(/_/g, '\\_')
            .replace(/\*/g, '\\*')
            .replace(/\[/g, '\\[')
            .replace(/]/g, '\\]')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/~/g, '\\~')
            .replace(/`/g, '\\`')
            .replace(/>/g, '\\>')
            .replace(/#/g, '\\#')
            .replace(/\+/g, '\\+')
            .replace(/-/g, '\\-')
            .replace(/=/g, '\\=')
            .replace(/\|/g, '\\|')
            .replace(/\{/g, '\\{')
            .replace(/\}/g, '\\}')
            .replace(/\./g, '\\.')
            .replace(/!/g, '\\!');

        let escaped = escapeSpecial(protectedText);

        // Now convert markdown formatting (on escaped text)
        escaped = escaped
            .replace(/\*\*([^*]+)\*\*/g, '*$1*')  // Bold: **text** → *text*
            .replace(/%%CODEBLOCK(\d+)%%/g, (match, index) => codeBlocks[parseInt(index)]) // Restore code blocks
            .replace(/^### (.*$)/gm, '*$1*')       // H3 → bold italic
            .replace(/^## (.*$)/gm, '*$1*')        // H2 → bold italic
            .replace(/^# (.*$)/gm, '*$1*')         // H1 → bold italic
            .replace(/^• (.*$)/gm, '• $1')         // Keep bullet points
            .replace(/^\- (.*$)/gm, '• $1')        // Convert - bullets to •
            .replace(/^\d+\. (.*$)/gm, '• $1')     // Numbered lists to bullets
            .replace(/\n{3,}/g, '\n\n')            // Normalize line breaks
            .trim();

        return escaped;
    }

    private stripMarkdown(text: string): string {
        return text
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            // CHAN-004: Preserve code block content instead of removing it
            .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^\s*[-*+]\s+/gm, '  ')
            .replace(/^\s*\d+\.\s+/gm, '  ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // ─── Polling Logic ────────────────────────────────────────────

    private async poll(): Promise<void> {
        if (!this.isPolling) {
            logger.debug('Telegram polling stopped - isPolling is false');
            return;
        }

        const token = this.config.channels.telegram.botToken;
        if (!token) {
            logger.error('Telegram polling failed - no bot token in config');
            return;
        }

        logger.debug({ offset: this.offset }, 'Telegram polling...');

        try {
            const updates = await this.callApi<TelegramUpdate[]>(token, 'getUpdates', {
                offset: this.offset,
                timeout: 30, // Long polling timeout (seconds)
                allowed_updates: ['message'],
            });

            logger.debug({ updateCount: updates.length }, 'Telegram received updates');

            // Reset error count on success
            this.errorCount = 0;

            for (const update of updates) {
                // Update offset to acknowledge processing
                this.offset = update.update_id + 1;
                logger.debug({ updateId: update.update_id }, 'Processing Telegram update');
                await this.handleUpdate(update);
            }
        } catch (err) {
            // CHAN-008: Implement exponential backoff for polling errors
            this.errorCount++;
            const delay = Math.min(2000 * Math.pow(2, this.errorCount - 1), 60000); // 2s, 4s, 8s, 16s, 32s, max 60s
            logger.warn({ err, errorCount: this.errorCount, delay }, 'Telegram polling error, retrying with backoff');
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Schedule next poll immediately (or with small delay)
        if (this.isPolling) {
            this.pollingTimeout = setTimeout(() => this.poll(), 100);
        } else {
            logger.debug('Telegram polling stopped after poll completion');
        }
    }

    private async handleUpdate(update: TelegramUpdate): Promise<void> {
        const msg = update.message;
        if (!msg || !msg.text) {
            logger.debug({ hasMessage: !!msg, hasText: !!msg?.text }, 'Telegram update skipped - no message or text');
            return;
        } // Only handle text messages for now

        const chatId = msg.chat.id.toString();
        const userId = msg.from?.id.toString();
        const username = msg.from?.username || msg.from?.first_name || 'Unknown';
        const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

        logger.info({
            chatId,
            userId,
            username,
            isGroup,
            text: msg.text.substring(0, 50),
        }, 'Telegram message received');

        // Check explicit allowances
        const allowedUsers = this.config.channels.telegram.allowedUsers;
        const allowedGroups = this.config.channels.telegram.allowedGroups;

        if (isGroup) {
            if (allowedGroups.length > 0 && !allowedGroups.includes(chatId)) {
                logger.warn({ chatId }, 'Telegram group not in allowed list');
                // Ignore unauthorized groups
                return;
            }
            // CHAN-006: Implement proper mention check
            const activation = this.config.channels.telegram.groupActivation;
            if (activation === 'mention') {
                const isCommand = msg.text.startsWith('/');
                const isMentioned = this.botUsername && msg.text.includes(`@${this.botUsername}`);

                if (!isMentioned && !isCommand) {
                    logger.debug({ chatId, text: msg.text.substring(0, 50) }, 'Ignoring group message without mention');
                    return;
                }
            }
        } else {
            // DM
            if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
                // Ignore unauthorized users
                logger.warn({ userId, username }, 'Ignoring message from unauthorized Telegram user');
                return;
            }
        }

        logger.info({ chatId, username }, 'Telegram message passing authorization, ingesting...');

        // Ingest
        await this.ingestMessage(chatId, username, msg.text, {
            isGroup,
            groupId: isGroup ? chatId : undefined,
        });
        
        logger.info({ chatId }, 'Telegram message ingested successfully');
    }

    // ─── API Helper ───────────────────────────────────────────────

    private async callApi<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
        const url = `https://api.telegram.org/bot${token}/${method}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json() as TelegramResponse<T>;

        if (!data.ok) {
            throw new Error(`Telegram API Error: ${data.description}`);
        }

        return data.result;
    }
}
