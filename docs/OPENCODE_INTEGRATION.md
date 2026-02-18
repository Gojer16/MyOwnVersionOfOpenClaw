# OpenCode Integration

## Overview

Talon now supports **100% FREE** AI models from OpenCode! No API key required, unlimited usage.

## Available Models

| Model | Status | Description |
|-------|--------|-------------|
| **minimax-m2.5-free** | ✅ Working | MiniMax M2.5 - Fast and reliable |
| **big-pickle** | ✅ Working | Big Pickle - Good for general tasks |
| **glm-5-free** | ✅ Working | GLM 5 - Returns reasoning content |
| **kimi-k2.5-free** | ✅ Working | Kimi K2.5 - Advanced reasoning |

## Setup

### Option 1: Use Setup Wizard

```bash
npm run setup
# Select "OpenCode (FREE)" as your provider
# No API key needed!
```

### Option 2: Manual Configuration

1. **Edit `~/.talon/config.json`:**

```json
{
  "agent": {
    "model": "opencode/minimax-m2.5-free",
    "subagentModel": "opencode/big-pickle",
    "providers": {
      "opencode": {
        "apiKey": "sk-opencode-free-no-key-required",
        "models": [
          "minimax-m2.5-free",
          "big-pickle",
          "glm-5-free",
          "kimi-k2.5-free"
        ]
      }
    }
  }
}
```

2. **Restart Talon:**

```bash
npm start
```

## Switching Models

Use the CLI to switch between OpenCode models:

```bash
# Interactive model switcher
talon switch

# Or use provider command
talon provider
```

## Technical Details

### Why No Authorization Header?

OpenCode's free models work **without** an Authorization header. Some models (like `big-pickle`) are actually **disabled** when you send an API key!

We created a special `OpenCodeProvider` that:
- Makes direct fetch requests to OpenCode API
- **Does NOT send Authorization header**
- Works with all 4 free models
- Handles reasoning content from GLM-5 and Kimi

### Architecture

```
┌─────────────────────────────────────┐
│  ModelRouter                        │
│  ├─ OpenCodeProvider (no auth)     │
│  ├─ DeepSeekProvider                │
│  ├─ OpenRouterProvider              │
│  └─ OpenAIProvider                  │
└─────────────────────────────────────┘
```

### Files Modified

- `src/agent/providers/opencode.ts` - New OpenCode provider (no auth)
- `src/agent/router.ts` - Router support for OpenCode
- `src/agent/fallback.ts` - Error handling for OpenCode
- `src/cli/provider.ts` - CLI commands for OpenCode
- `src/cli/providers.ts` - Provider definitions
- `config.example.json` - Default config with OpenCode

## Cost Comparison

| Provider | Input (1M tokens) | Output (1M tokens) | OpenCode |
|----------|-------------------|-------------------|----------|
| OpenAI GPT-4o | $2.50 | $10.00 | **FREE** |
| DeepSeek Chat | $0.14 | $0.28 | **FREE** |
| OpenRouter | $0.15+ | $0.60+ | **FREE** |
| **OpenCode** | **$0.00** | **$0.00** | **FREE** |

## Usage Examples

### Basic Chat

```bash
talon start

You > Hello! What can you do?
🦅 Talon > I'm Talon, your AI assistant running on OpenCode's free models...
```

### Model Selection

```bash
# Use minimax for speed
talon switch
> Choose provider: OpenCode (FREE)
> Choose model: MiniMax M2.5 Free

# Use big-pickle for general tasks
talon switch
> Choose provider: OpenCode (FREE)
> Choose model: Big Pickle Free
```

### Subagent Delegation

Talon automatically uses cheap models for subagents. With OpenCode, **everything is free**!

```json
{
  "agent": {
    "model": "opencode/minimax-m2.5-free",
    "subagentModel": "opencode/big-pickle"
  }
}
```

## Limitations

1. **No Streaming** - OpenCode provider doesn't support streaming (not needed for free tier)
2. **Rate Limits** - Free tier has rate limits (but very generous)
3. **Reasoning Content** - GLM-5 and Kimi return reasoning in separate field

## Troubleshooting

### "Rate limit exceeded"

Switch to another OpenCode model:

```bash
talon switch
# Select a different OpenCode model
```

### "Model is disabled"

This happens if you accidentally send an API key. Make sure your config uses:

```json
"apiKey": "sk-opencode-free-no-key-required"
```

### Empty Responses

Some models (minimax, kimi) return reasoning content in a separate field. The provider handles this automatically.

## Testing

Run the integration test:

```bash
node test-opencode-integration.js
```

Expected output:
```
🎉 All OpenCode models integrated successfully!
  ✅ minimax-m2.5-free
  ✅ big-pickle
  ✅ glm-5-free
  ✅ kimi-k2.5-free
```

## Contributing

Found an issue with OpenCode integration? Open an issue or PR!

## Credits

- OpenCode for providing free AI models
- Talon community for testing and feedback
