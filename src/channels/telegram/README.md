# Telegram Channel

> **Status**: ✅ Production Ready | **Lines**: 228 | **Dependencies**: None (uses native fetch)

## Overview

Lightweight Telegram bot integration using long-polling via the Telegram Bot API. No heavy dependencies — uses native `fetch` for all API calls.

## Features

- **Long-polling** for real-time message reception
- **User authorization** via `allowedUsers` whitelist
- **Group support** with mention-based activation
- **Message chunking** for responses > 4096 characters
- **Exponential backoff** for polling error recovery
- **Markdown stripping** for plain text delivery

## Configuration

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "allowedUsers": ["123456789"],
      "allowedGroups": ["-987654321"],
      "groupActivation": "mention"
    }
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | No | `false` | Enable/disable channel |
| `botToken` | string | Yes | - | Bot token from @BotFather |
| `allowedUsers` | string[] | No | `[]` | Numeric user IDs (empty = allow all) |
| `allowedGroups` | string[] | No | `[]` | Group IDs (empty = allow all) |
| `groupActivation` | enum | No | `"mention"` | `"mention"` or `"always"` |

## Environment Variables

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
```

**Get bot token**: Create a bot via [@BotFather](https://t.me/BotFather)

**Find your user ID**: Message [@userinfobot](https://t.me/userinfobot)

## Public API

### `TelegramChannel` class

**Extends**: `BaseChannel`

**Methods**:
- `start(): Promise<void>` — Start polling loop
- `stop(): Promise<void>` — Stop polling
- `send(sessionId: string, message: OutboundMessage): Promise<void>` — Send message to chat

## Technical Details

### Message Flow
```
User → Telegram → poll() → handleUpdate() → ingestMessage() → Router → Agent
Agent → send() → chunking → Telegram API → User
```

### Rate Limits
- **Telegram API**: 30 messages/second (global), 20 messages/minute (per bot)
- **Polling**: 100ms between polls, exponential backoff on errors
- **Max message length**: 4096 characters (auto-chunked)

### Group Activation Modes
- **`"mention"`**: Responds only when bot is @mentioned or command starts with `/`
- **`"always"`**: Responds to all messages in allowed groups

## Error Handling

| Error | Behavior |
|-------|----------|
| Invalid bot token | Log error, skip channel start |
| API rate limit | Exponential backoff (2s, 4s, 8s, 16s, 32s, max 60s) |
| Network error | Retry with backoff, continue polling |
| Message too long | Auto-split into 4096-char chunks |

## Fixed Issues

- ✅ **CHAN-002**: Message chunking for 4096 char limit
- ✅ **CHAN-004**: Code block content preservation
- ✅ **CHAN-006**: Group mention detection
- ✅ **CHAN-008**: Exponential backoff for polling errors

## Example Usage

```typescript
// In gateway/index.ts
const telegram = new TelegramChannel(config, eventBus, sessionManager, router);
await telegram.start();
```

## Testing

```bash
# Start Talon with Telegram enabled
npm start

# Send message to bot on Telegram
# Check logs for:
# - "Telegram bot info fetched"
# - "Telegram message sent"
```

## Related

- `../base.ts` — Base channel class
- `../../gateway/router.ts` — Message routing
- [Telegram Bot API Docs](https://core.telegram.org/bots/api)
