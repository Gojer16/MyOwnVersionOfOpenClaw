# WhatsApp Channel

> **Status**: ✅ Production Ready | **Lines**: 337 | **Dependencies**: `whatsapp-web.js`, `qrcode-terminal`, `puppeteer`

## Overview

Full WhatsApp Web integration using the `whatsapp-web.js` library. Provides QR code authentication, session persistence, and bidirectional messaging.

## Features

- **QR code authentication** with terminal display
- **Session persistence** (no re-scan needed)
- **User authorization** via `allowedUsers` whitelist
- **Group support** with mention-based activation
- **Automatic reconnection** with exponential backoff
- **Message rate limiting** to prevent flooding
- **Message chunking** for responses > 65000 characters

## Configuration

```json
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowedUsers": ["584128449024"],
      "allowedGroups": ["123456789@g.us"],
      "groupActivation": "mention",
      "sessionName": "Talon"
    }
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | No | `false` | Enable/disable channel |
| `allowedUsers` | string[] | No | `[]` | Phone numbers (empty = allow all) |
| `allowedGroups` | string[] | No | `[]` | Group IDs (empty = allow all) |
| `groupActivation` | enum | No | `"mention"` | `"mention"` or `"always"` |
| `sessionName` | string | No | `"Talon"` | Session identifier for auth storage |

## Environment Variables

```bash
WHATSAPP_PHONE_NUMBER=584128449024
```

**Note**: Phone number format should include country code without `+` (e.g., `584128449024` for Venezuela)

## Installation

```bash
npm install whatsapp-web.js qrcode-terminal
```

## Public API

### `WhatsAppChannel` class

**Extends**: `BaseChannel`

**Properties**:
- `name: 'whatsapp'` — Channel identifier
- `isReady: boolean` — Connection status
- `qrCode: string | null` — Current QR code data

**Methods**:
- `start(): Promise<void>` — Initialize client and start listening
- `stop(): Promise<void>` — Destroy client and cleanup
- `send(sessionId: string, message: OutboundMessage): Promise<void>` — Send message
- `getStatus(): { ready: boolean; qrCode: string | null }` — Get connection status

## Technical Details

### Authentication Flow
```
1. Client initializes
2. QR code generated → displayed in terminal
3. User scans QR with WhatsApp phone app
4. Session saved to ~/.talon/whatsapp-auth/
5. Future startups use saved session (no re-scan)
```

### Message Flow
```
User → WhatsApp → message_create → handleMessage() → ingestMessage() → Router → Agent
Agent → send() → queue → rate limit → WhatsApp → User
```

### Rate Limits
- **Outbound**: 1 second between messages (configurable via `RATE_LIMIT_MS`)
- **Queue limit**: 10 messages max (prevents flooding)
- **Max message length**: 65536 characters (auto-chunked at 65000)

### Reconnection Strategy
- **Max attempts**: 5
- **Backoff**: 5s, 10s, 20s, 40s, 80s (capped at 60s)
- **Reset**: Counter resets on successful reconnect

## Error Handling

| Error | Behavior |
|-------|----------|
| Dependencies missing | Log error, skip channel, show install instructions |
| QR scan timeout | Auto-regenerate QR code |
| Authentication failure | Log error, suggest deleting auth folder |
| Disconnection | Auto-reconnect with exponential backoff |
| Message send failure | Log error, continue processing queue |

## Session Storage

**Location**: `~/.talon/whatsapp-auth/`

**Contents**:
- `session-<SESSION_NAME>.json` — Encrypted session credentials
- `WWebJS` — WhatsApp Web.js cache data

**Security**: ⚠️ Session data provides full WhatsApp access — protect this directory!

## Fixed Issues

- ✅ **CHAN-003**: Outbound message routing
- ✅ **CHAN-005**: Non-blocking initialization
- ✅ **CHAN-009**: Automatic reconnection logic
- ✅ **CHAN-010**: Rate limiting for messages
- ✅ **CHAN-020**: Message chunking for length limit

## Example Usage

```typescript
// In gateway/index.ts
const whatsapp = new WhatsAppChannel(config, eventBus, sessionManager, router);
// Non-blocking start - runs in background
whatsapp.start().catch(err => logger.error({ err }, 'WhatsApp start failed'));
```

## Troubleshooting

### "whatsapp-web.js not installed"
```bash
npm install whatsapp-web.js qrcode-terminal
```

### QR code not appearing
- Install `qrcode-terminal`: `npm install qrcode-terminal`
- Check terminal supports UTF-8

### Authentication failed
```bash
# Delete session and re-scan
rm -rf ~/.talon/whatsapp-auth/
# Restart Talon
```

### Browser launch fails
```bash
# For Linux/Docker, ensure dependencies:
sudo apt-get install -y chromium-browser
# Or use Puppeteer's bundled Chrome
```

## Testing

```bash
# Start Talon
npm start

# Expected output:
# 📱 Scan this QR code with WhatsApp on your phone:
# [QR code displayed]
# 🟢 WhatsApp connected successfully!
```

## Related

- `../base.ts` — Base channel class
- `../../gateway/router.ts` — Message routing
- [whatsapp-web.js Docs](https://wwebjs.dev/)
- [Puppeteer Docs](https://pptr.dev/)
