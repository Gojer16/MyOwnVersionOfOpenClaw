// ─── Ghost Messenger ──────────────────────────────────────────────
// Sends proactive messages to the gateway

import type { GhostMessage } from './types.js';
import { logger } from '../utils/logger.js';

export class GhostMessenger {
    private messages: GhostMessage[] = [];
    private onSend?: (message: GhostMessage) => void;

    setHandler(handler: (message: GhostMessage) => void): void {
        this.onSend = handler;
    }

    send(message: GhostMessage): void {
        this.messages.push(message);
        
        if (this.onSend) {
            this.onSend(message);
        }
        
        logger.debug({ message: message.message, priority: message.priority }, 'Ghost message sent');
    }

    getMessages(): GhostMessage[] {
        return this.messages;
    }

    clear(): void {
        this.messages = [];
    }
}
