// ─── Message Router ───────────────────────────────────────────────
// Routes inbound channel messages to the correct session

import type { InboundMessage, OutboundMessage } from '../utils/types.js';
import type { SessionManager } from './sessions.js';
import type { EventBus } from './events.js';
import { logger } from '../utils/logger.js';

/**
 * Routes messages between channels and sessions.
 * Decides which session handles each inbound message.
 */
export class MessageRouter {
    constructor(
        private sessionManager: SessionManager,
        private eventBus: EventBus,
    ) { }

    /**
     * Handle an inbound message from any channel.
     * Resolves the correct session and emits the event.
     */
    handleInbound(message: InboundMessage): string {
        const session = this.sessionManager.resolveSession(message);

        logger.info({
            sessionId: session.id,
            channel: message.channel,
            sender: message.senderName,
            text: typeof message.text === 'string' ? message.text.substring(0, 50) : '[no text]',
            msgCount: session.messages.length,
        }, 'handleInbound called');

        // Add the message to the session's history
        const msg = {
            id: `msg_${Date.now().toString(36)}`,
            role: 'user' as const,
            content: message.text,
            timestamp: Date.now(),
            channel: message.channel,
        };
        session.messages.push(msg);
        session.metadata.messageCount++;
        session.metadata.lastActiveAt = Date.now();

        // Index in vector memory
        this.sessionManager.indexMessage(msg, session.id);

        logger.debug({ sessionId: session.id, msgId: msg.id }, 'Emitting message.inbound');
        // Emit for the agent loop to pick up
        this.eventBus.emit('message.inbound', {
            message,
            sessionId: session.id,
        });

        return session.id;
    }

    private lastOutboundMessage: Map<string, number> = new Map();

    /**
     * Handle an outbound message from the agent to a channel.
     */
    handleOutbound(sessionId: string, text: string): void {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            logger.warn({ sessionId }, 'Outbound message for unknown session');
            return;
        }

        // Deduplication: Prevent duplicate outbound messages within 5 seconds
        const now = Date.now();
        const lastTime = this.lastOutboundMessage.get(sessionId);
        if (lastTime && (now - lastTime) < 5000) {
            logger.warn({ sessionId }, 'Duplicate outbound message detected, skipping');
            return;
        }
        this.lastOutboundMessage.set(sessionId, now);

        logger.info({ sessionId, textLength: text.length, textPreview: text.substring(0, 50) }, 'handleOutbound called');

        const outbound: OutboundMessage = {
            sessionId,
            text,
        };

        // NOTE: We do NOT push to session.messages here.
        // The agent loop (loop.ts) already adds the assistant message to history.
        // Adding it here would create a duplicate entry.

        logger.info({ sessionId }, 'Emitting message.outbound');
        this.eventBus.emit('message.outbound', {
            message: outbound,
            sessionId,
        });
    }
}
