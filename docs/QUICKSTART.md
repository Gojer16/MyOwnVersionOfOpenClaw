# Talon Gateway v0.3.3 — Quick Start Guide

**Status:** ✅ Production Ready  
**Date:** 2026-02-19

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Project

```bash
npm run build
```

### 3. Run Setup (First Time Only)

```bash
npm run setup
```

This will:
- Create `~/.talon/.env` for API keys
- Create `~/.talon/config.json` for configuration
- Copy workspace templates to `~/.talon/workspace/`
- Configure your LLM provider

### 4. Start the Gateway

**Option A: Gateway Only (WebSocket Server)**
```bash
talon gateway
```

**Option B: Gateway + CLI (Interactive)**
```bash
talon start
```

**Option C: Background Daemon**
```bash
talon start --daemon
```

### 5. Verify It's Running

```bash
talon health
```

Expected output:
```
🦅 Talon Health Check
─────────────────────
  Status:     ✅ OK
  Version:    0.3.3
  Uptime:     10s
  Sessions:   0
  WS Clients: 0
```

---

## 🧪 Run Tests

### End-to-End Gateway Tests

```bash
npm run test:gateway
```

This will:
1. Start the gateway
2. Test WebSocket connection
3. Test session creation
4. Test tool execution
5. Test safety checks
6. Test HTTP endpoints
7. Stop the gateway

### All Tests

```bash
npm test
```

---

## 🔌 Connect to Gateway

### Interactive WebSocket Client (Easy)

```bash
npm run ws
```

**Quick Commands:**
```
status          - Get gateway status
tools           - List available tools
echo Hello      - Echo text via shell
ls              - List files
pwd             - Print working directory
screenshot      - Take screenshot
test-safety     - Test dangerous command blocking
raw <json>      - Send raw JSON
quit            - Exit
```

**Example Session:**
```
talon-ws> status
→ Sending: {"type":"gateway.status"}
← Response: { "status": "ok", "version": "0.3.3", ... }

talon-ws> echo Hello Talon
→ Sending: {"type":"tools.invoke","toolName":"shell_execute",...}
← Response: { "type": "tools.result", "payload": { "result": "Hello Talon\n" } }

talon-ws> test-safety
→ Sending: {"type":"tools.invoke","toolName":"shell_execute","args":{"command":"rm -rf /"}}
← Response: { "type": "tools.result", "payload": { "result": "⚠️ BLOCKED: ..." } }
```

### Manual WebSocket Client (Advanced)

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c ws://127.0.0.1:19789/ws
```

**Example Commands:**

```json
# Get gateway status
{"type":"gateway.status"}

# Create a session
{"type":"session.create","senderId":"user_123","channel":"websocket","senderName":"Test User"}

# Send a message
{"type":"session.send_message","sessionId":"sess_abc123","text":"Hello!"}

# List tools
{"type":"tools.list"}

# Execute a tool
{"type":"tools.invoke","toolName":"shell_execute","args":{"command":"echo 'Hello'"}}
```

### HTTP API

```bash
# Health check
curl http://127.0.0.1:19789/api/health

# List sessions
curl http://127.0.0.1:19789/api/sessions

# Deep health check
curl http://127.0.0.1:19789/api/health/deep
```

---

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `shell_execute` | Execute shell commands (with safety checks) |
| `desktop_screenshot` | Capture desktop screenshots |
| `file_read` | Read files |
| `file_write` | Write files |
| `file_search` | Search files by pattern |
| `web_search` | Search the web |
| `web_fetch` | Fetch web page content |
| `browser_navigate` | Open URLs in browser |
| `browser_click` | Click elements |
| `browser_type` | Type text |
| `browser_screenshot` | Screenshot web pages |
| `browser_extract` | Extract page content |
| `memory_read` | Read from memory |
| `memory_write` | Write to memory |
| `notes_save` | Save notes |
| `notes_search` | Search notes |
| `tasks_add` | Add tasks |
| `tasks_list` | List tasks |
| `tasks_complete` | Complete tasks |

**macOS Only:**
- `apple_notes_create` — Create Apple Notes
- `apple_notes_search` — Search Apple Notes
- `apple_reminders_add` — Add reminders
- `apple_reminders_list` — List reminders
- `apple_reminders_complete` — Complete reminders
- `apple_calendar_create_event` — Create calendar events
- `apple_calendar_list_events` — List events
- `apple_mail_list_emails` — List emails
- `apple_mail_read_email` — Read email
- `apple_mail_send_email` — Send email
- `apple_safari_open_url` — Open URL in Safari
- `apple_safari_get_tabs` — Get open tabs

---

## 🔒 Safety Features

### Dangerous Command Blocking

The gateway automatically blocks dangerous commands:

```bash
# These are BLOCKED:
rm -rf /
sudo rm
curl | sh
wget | sh
mkfs
dd if=
format
fdisk
```

**Test it:**
```json
{"type":"tools.invoke","toolName":"shell_execute","args":{"command":"rm -rf /"}}
```

**Expected Response:**
```json
{
  "type": "tools.result",
  "payload": {
    "result": "⚠️ BLOCKED: This command looks destructive...",
    "success": false
  }
}
```

### Configurable Safety

Edit `~/.talon/config.json`:

```json
{
  "tools": {
    "shell": {
      "enabled": true,
      "confirmDestructive": true,
      "blockedCommands": ["rm -rf", "sudo"],
      "defaultTimeout": 30000
    }
  }
}
```

---

## 📊 WebSocket Protocol

### Client → Server Events

| Event | Description |
|-------|-------------|
| `gateway.status` | Request gateway status |
| `session.list` | List all sessions |
| `session.create` | Create a new session |
| `session.send_message` | Send a message |
| `session.reset` | Reset session history |
| `tools.list` | List available tools |
| `tools.invoke` | Execute a tool directly |

### Server → Client Events

| Event | Description |
|-------|-------------|
| `gateway.status` | Gateway status response |
| `session.created` | Session created confirmation |
| `session.message.delta` | Streaming response chunk |
| `session.message.final` | Final response with metadata |
| `session.error` | Error during processing |
| `tool.call` | Agent is calling a tool |
| `tools.result` | Tool execution result |

**Full protocol spec:** See `docs/19fbIMPLEMENTATION.md`

---

## 🐛 Troubleshooting

### Gateway Won't Start

```bash
# Check if port 19789 is in use
lsof -ti :19789

# Stop any running gateway
talon stop

# Try again
talon gateway
```

### WebSocket Connection Fails

```bash
# Check gateway is running
talon health

# Check firewall settings
# Make sure port 19789 is not blocked
```

### Tools Not Working

```bash
# Check tool configuration
cat ~/.talon/config.json | grep -A 10 "tools"

# Check logs
# Gateway logs to stdout by default
```

### Session Persistence Issues

```bash
# Check sessions directory
ls -la ~/.talon/sessions/

# Verify permissions
chmod 755 ~/.talon/sessions/
```

---

## 📝 Configuration

### Environment Variables (`~/.talon/.env`)

```bash
# LLM Providers
DEEPSEEK_API_KEY=sk-your-key-here
OPENROUTER_API_KEY=sk-or-your-key-here
OPENAI_API_KEY=sk-your-key-here

# Channels (optional)
TELEGRAM_BOT_TOKEN=123456:ABC-your-token
WHATSAPP_PHONE_NUMBER=1234567890

# Security (optional)
TALON_TOKEN=your-auth-token
```

### Config File (`~/.talon/config.json`)

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "maxIterations": 10
  },
  "gateway": {
    "host": "127.0.0.1",
    "port": 19789,
    "auth": {
      "mode": "none"
    }
  },
  "tools": {
    "files": { "enabled": true },
    "shell": { "enabled": true },
    "browser": { "enabled": true }
  }
}
```

---

## 🎯 Next Steps

1. **Read the docs:** `docs/19fbIMPLEMENTATION.md`
2. **Run tests:** `npm run test:gateway`
3. **Try the TUI:** `talon tui`
4. **Build a client:** Use the WebSocket protocol
5. **Customize tools:** Edit `src/tools/`

---

## 📚 Documentation

- **Implementation Guide:** `docs/19fbIMPLEMENTATION.md`
- **Architecture:** `docs/01-ARCHITECTURE.md`
- **Tools:** `docs/03-TOOLS-AND-CAPABILITIES.md`
- **Security:** `docs/SECURITY.md`
- **Changelog:** `CHANGELOG.md`

---

## 🆘 Support

- **Issues:** https://github.com/yourusername/talon/issues
- **Docs:** `docs/`
- **Tests:** `npm run test:gateway`

---

**Made with ❤️ for personal AI freedom**

🦅 Talon v0.3.3 — Production Ready
