# WhatsApp Setup Guide

## Quick Setup

### Method 1: Interactive QR Setup (Recommended)

```bash
# Run the WhatsApp setup command
talon ws-setup

# Or alternatively:
npm run ws:setup
```

This will:
1. ✅ Check if WhatsApp is enabled in config
2. ✅ Display QR code in terminal
3. ✅ Save session automatically
4. ✅ Exit when authenticated

### Method 2: Manual Setup

1. **Enable in config.json**:
   ```json
   "channels": {
     "whatsapp": {
       "enabled": true,
       "allowedUsers": ["584128449024"],
       "sessionName": "Talon"
     }
   }
   ```

2. **Restart Talon**:
   ```bash
   talon restart
   ```

3. **Wait for QR code** in logs and scan with phone

## Usage

### After Setup

Once authenticated, WhatsApp works automatically:
- Send messages to Talon's number
- Talon responds automatically
- Session persists across restarts

### Re-authentication

If WhatsApp disconnects:
```bash
# Session will auto-reconnect (up to 5 attempts)
# If all attempts fail, re-run setup:
talon ws-setup
```

### Delete Session and Start Fresh

```bash
# Remove saved session
rm -rf ~/.talon/auth/whatsapp

# Run setup again
talon ws-setup
```

## Troubleshooting

### "whatsapp-web.js not installed"
```bash
npm install whatsapp-web.js qrcode-terminal
```

### QR Code Not Appearing
- Make sure WhatsApp is enabled in config.json
- Check logs for errors: `tail -f ~/.talon/logs/talon.log`
- Try running with DEBUG mode: `DEBUG=true talon ws-setup`

### Authentication Failed
```bash
# Delete corrupted session
rm -rf ~/.talon/auth/whatsapp

# Run setup again
talon ws-setup
```

### Session Not Persisting
- Check auth folder permissions: `ls -la ~/.talon/auth/`
- Ensure Talon has write access
- Try running as same user each time

## Configuration Options

### config.json

```json
"whatsapp": {
  "enabled": true,                    // Enable/disable
  "allowedUsers": ["584128449024"],  // Phone numbers allowed
  "allowedGroups": [],                // Group IDs (optional)
  "groupActivation": "mention",       // "mention" or "always"
  "sessionName": "Talon"              // Session identifier
}
```

### Environment Variables

```bash
# Your phone number (for reference)
WHATSAPP_PHONE_NUMBER=584128449024
```

## Security Notes

- ✅ Session stored in `~/.talon/auth/whatsapp/` (outside workspace)
- ✅ No phone number stored in config (uses session cookies)
- ✅ Session encrypted by whatsapp-web.js
- ⚠️ Don't share auth folder contents
- ⚠️ Only authorize trusted phone numbers

## Advanced: WhatsApp Business API

For enterprise users needing official Business API:

See [README.md](../README.md#whatsapp-business-api-enterprise-alternative) for Twilio integration guide.

**Note**: The default `whatsapp-web.js` is FREE and recommended for personal use.
