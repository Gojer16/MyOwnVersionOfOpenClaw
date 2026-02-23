// ─── Channel Status Tool ─────────────────────────────────────────────
// Tool to check configured communication channels

import type { ToolDefinition } from './registry.js';
import type { TalonConfig } from '../config/schema.js';

export function createChannelStatusTool(config: TalonConfig): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // Channel status tool - always available
    tools.push({
        name: 'channel_status',
        description: 'Check the status and configuration of communication channels (Telegram, WhatsApp, CLI). Use this to know which channels are enabled and configured before sending messages.',
        parameters: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
        execute: async () => {
            const channels: Record<string, any> = {};

            // Telegram channel
            if (config.channels.telegram) {
                channels.telegram = {
                    enabled: config.channels.telegram.enabled,
                    hasBotToken: !!config.channels.telegram.botToken,
                    allowedUsers: config.channels.telegram.allowedUsers?.length || 0,
                    allowedGroups: config.channels.telegram.allowedGroups?.length || 0,
                    groupActivation: config.channels.telegram.groupActivation,
                };
            }

            // WhatsApp channel
            if (config.channels.whatsapp) {
                channels.whatsapp = {
                    enabled: config.channels.whatsapp.enabled,
                    allowedUsers: config.channels.whatsapp.allowedUsers?.length || 0,
                    allowedGroups: config.channels.whatsapp.allowedGroups?.length || 0,
                    groupActivation: config.channels.whatsapp.groupActivation,
                };
            }

            // CLI channel
            if (config.channels.cli) {
                channels.cli = {
                    enabled: config.channels.cli.enabled,
                };
            }

            // WebChat channel
            if (config.channels.webchat) {
                channels.webchat = {
                    enabled: config.channels.webchat.enabled,
                };
            }

            // Build status message
            let status = '## Configured Communication Channels\n\n';
            
            for (const [name, info] of Object.entries(channels)) {
                const enabled = (info as any).enabled;
                status += `### ${name.charAt(0).toUpperCase() + name.slice(1)}\n`;
                status += `- **Status**: ${enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
                
                if (name === 'telegram') {
                    status += `- **Bot Token**: ${(info as any).hasBotToken ? '✅ Configured' : '❌ Missing'}\n`;
                    status += `- **Allowed Users**: ${(info as any).allowedUsers} user(s)\n`;
                    status += `- **Allowed Groups**: ${(info as any).allowedGroups} group(s)\n`;
                    status += `- **Group Activation**: ${(info as any).groupActivation}\n`;
                } else if (name === 'whatsapp') {
                    status += `- **Allowed Users**: ${(info as any).allowedUsers} user(s)\n`;
                    status += `- **Allowed Groups**: ${(info as any).allowedGroups} group(s)\n`;
                    status += `- **Group Activation**: ${(info as any).groupActivation}\n`;
                }
                
                status += '\n';
            }

            status += '\n**Note**: When you respond to messages from these channels, your response is automatically delivered to the user on the same channel they used to contact you.\n';

            return JSON.stringify({
                success: true,
                data: channels,
                summary: status,
            });
        },
    });

    return tools;
}
