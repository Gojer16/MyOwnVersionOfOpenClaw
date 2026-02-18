# OpenClaw TUI Architecture

**Deep Dive into OpenClaw's Terminal User Interface**

---

## Overview

OpenClaw uses a sophisticated TUI (Terminal User Interface) built on `@mariozechner/pi-tui` v0.52.12, a custom terminal UI framework. The TUI provides a rich, interactive chat experience with real-time streaming, tool execution visualization, and advanced keyboard shortcuts.

---

## Architecture Layers

### 1. Core Framework (`@mariozechner/pi-tui`)

**Components Used:**
- `TUI` - Main application container
- `Container` - Layout container for child components
- `Editor` - Multi-line text input with autocomplete
- `Text` - Styled text rendering
- `Loader` - Loading spinner
- `ProcessTerminal` - Embedded terminal for shell commands
- `Markdown` - Markdown rendering with syntax highlighting

**Key Features:**
- Event-driven architecture
- Component-based UI
- Keyboard input handling
- ANSI color support
- Autocomplete system

---

## File Structure

```
src/tui/
├── tui.ts                          # Main TUI entry point
├── tui-types.ts                    # TypeScript types
├── gateway-chat.ts                 # Gateway WebSocket client
├── commands.ts                     # Slash command definitions
├── tui-command-handlers.ts         # Command execution logic
├── tui-event-handlers.ts           # Event handling (connect, disconnect, etc.)
├── tui-session-actions.ts          # Session management
├── tui-overlays.ts                 # Modal overlays (agent picker, model picker)
├── tui-formatters.ts               # Text formatting utilities
├── tui-waiting.ts                  # Loading/waiting messages
├── tui-local-shell.ts              # Local shell execution (! commands)
├── tui-stream-assembler.ts         # Stream message assembly
├── tui-status-summary.ts           # Status display
│
├── components/
│   ├── chat-log.ts                 # Main chat display
│   ├── user-message.ts             # User message component
│   ├── assistant-message.ts        # Assistant message component
│   ├── tool-execution.ts           # Tool call visualization
│   ├── custom-editor.ts            # Extended editor with shortcuts
│   ├── searchable-select-list.ts   # Fuzzy search list
│   ├── filterable-select-list.ts   # Filterable list
│   ├── selectors.ts                # Agent/model/session pickers
│   └── fuzzy-filter.ts             # Fuzzy search algorithm
│
└── theme/
    ├── theme.ts                    # Color palette and styling
    └── syntax-theme.ts             # Code syntax highlighting
```

---

## Core Components

### 1. Main TUI (`tui.ts`)

**Responsibilities:**
- Initialize TUI application
- Manage state (session, agent, connection)
- Handle keyboard shortcuts
- Coordinate between components

**Key Functions:**

```typescript
export async function runTui(opts: TuiOptions)
```
- Entry point for TUI
- Sets up gateway connection
- Initializes all components
- Starts event loop

```typescript
export function createEditorSubmitHandler(params)
```
- Handles user input submission
- Routes to commands, messages, or shell
- Manages input history

```typescript
export function createSubmitBurstCoalescer(params)
```
- Coalesces rapid paste events
- Prevents flooding gateway with individual lines
- 50ms burst window

**State Management:**

```typescript
const state: TuiStateAccess = {
  agentDefaultId: string,
  sessionMainKey: string,
  sessionScope: 'per-sender' | 'global',
  agents: AgentSummary[],
  currentAgentId: string,
  currentSessionKey: string,
  currentSessionId: string | null,
  activeChatRunId: string | null,
  historyLoaded: boolean,
  sessionInfo: SessionInfo,
  isConnected: boolean,
  toolsExpanded: boolean,
  showThinking: boolean,
  // ... more state
}
```

---

### 2. ChatLog Component (`components/chat-log.ts`)

**Purpose:** Main chat display with message history

**Features:**
- User messages
- Assistant messages (streaming + final)
- Tool execution visualization
- System messages

**Key Methods:**

```typescript
class ChatLog extends Container {
  clearAll()                                    // Clear all messages
  addSystem(text: string)                       // Add system message
  addUser(text: string)                         // Add user message
  startAssistant(text: string, runId?: string)  // Start streaming assistant message
  updateAssistant(text: string, runId?: string) // Update streaming message
  finalizeAssistant(text: string, runId?: string) // Finalize message
  dropAssistant(runId?: string)                 // Cancel streaming message
  startTool(toolCallId, toolName, args)         // Start tool execution
  updateToolResult(toolCallId, result, opts)    // Update tool result
  setToolsExpanded(expanded: boolean)           // Expand/collapse tools
}
```

**Message Flow:**
1. User types message → `addUser()`
2. Agent starts responding → `startAssistant()`
3. Agent streams text → `updateAssistant()` (multiple times)
4. Agent calls tool → `startTool()`
5. Tool completes → `updateToolResult()`
6. Agent finishes → `finalizeAssistant()`

---

### 3. CustomEditor (`components/custom-editor.ts`)

**Purpose:** Enhanced text input with keyboard shortcuts

**Extends:** `Editor` from pi-tui

**Custom Shortcuts:**

| Shortcut | Handler | Purpose |
|----------|---------|---------|
| `Escape` | `onEscape` | Cancel/close overlays |
| `Ctrl+C` | `onCtrlC` | Interrupt/cancel |
| `Ctrl+D` | `onCtrlD` | Exit (when empty) |
| `Ctrl+G` | `onCtrlG` | Open agent picker |
| `Ctrl+L` | `onCtrlL` | Clear screen |
| `Ctrl+O` | `onCtrlO` | Open model picker |
| `Ctrl+P` | `onCtrlP` | Open session picker |
| `Ctrl+T` | `onCtrlT` | Toggle tools expanded |
| `Shift+Tab` | `onShiftTab` | Toggle thinking display |
| `Alt+Enter` | `onAltEnter` | Multi-line input |

**Implementation:**

```typescript
class CustomEditor extends Editor {
  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl("l")) && this.onCtrlL) {
      this.onCtrlL();
      return;
    }
    // ... more shortcuts
    super.handleInput(data); // Fallback to default
  }
}
```

---

### 4. Gateway Chat Client (`gateway-chat.ts`)

**Purpose:** WebSocket client for gateway communication

**Key Methods:**

```typescript
class GatewayChatClient {
  connect(): Promise<void>                      // Connect to gateway
  disconnect(): void                            // Disconnect
  sendMessage(opts: ChatSendOptions): Promise   // Send chat message
  listSessions(params): Promise<GatewaySessionList> // List sessions
  patchSession(params): Promise                 // Update session config
  listAgents(): Promise<GatewayAgentsList>      // List available agents
  listModels(): Promise<GatewayModelChoice[]>   // List available models
  on(event, handler): void                      // Event listener
}
```

**Events:**
- `connected` - Gateway connected
- `disconnected` - Gateway disconnected
- `error` - Connection error
- `chat.stream` - Streaming message chunk
- `chat.done` - Message complete
- `tool.call` - Tool execution started
- `tool.result` - Tool execution complete

**Protocol:**
- Uses OpenClaw gateway protocol
- WebSocket-based
- JSON message format
- Supports streaming responses

---

### 5. Theme System (`theme/theme.ts`)

**Color Palette:**

```typescript
const palette = {
  text: "#E8E3D5",           // Main text
  dim: "#7B7F87",            // Dimmed text
  accent: "#F6C453",         // Accent color (yellow)
  accentSoft: "#F2A65A",     // Soft accent (orange)
  border: "#3C414B",         // Borders
  userBg: "#2B2F36",         // User message background
  userText: "#F3EEE0",       // User message text
  systemText: "#9BA3B2",     // System message text
  toolPendingBg: "#1F2A2F",  // Tool pending background
  toolSuccessBg: "#1E2D23",  // Tool success background
  toolErrorBg: "#2F1F1F",    // Tool error background
  toolTitle: "#F6C453",      // Tool title
  toolOutput: "#E1DACB",     // Tool output
  quote: "#8CC8FF",          // Markdown quote
  quoteBorder: "#3B4D6B",    // Quote border
  code: "#F0C987",           // Inline code
  codeBlock: "#1E232A",      // Code block background
  codeBorder: "#343A45",     // Code block border
  link: "#7DD3A5",           // Links
  error: "#F97066",          // Error text
  success: "#7DD3A5",        // Success text
}
```

**Markdown Theme:**
- Syntax highlighting with `cli-highlight`
- Custom code block rendering
- Quote styling
- Link formatting

---

### 6. Slash Commands (`commands.ts`)

**Built-in Commands:**

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/help` | Show command help | - |
| `/status` | Show gateway status | - |
| `/agent [id]` | Switch agent | agent ID or picker |
| `/agents` | Open agent picker | - |
| `/session [key]` | Switch session | session key or picker |
| `/sessions` | Open session picker | - |
| `/model [id]` | Set model | model ID or picker |
| `/models` | Open model picker | - |
| `/think [level]` | Set thinking level | off/low/medium/high |
| `/verbose [on\|off]` | Toggle verbose | on/off |
| `/reasoning [on\|off]` | Toggle reasoning | on/off |
| `/usage [level]` | Toggle usage display | off/tokens/full |
| `/elevated [level]` | Set elevated mode | on/off/ask/full |
| `/clear` | Clear screen | - |
| `/reset` | Reset session | - |
| `/new` | New session | - |
| `/exit` | Exit TUI | - |
| `/quit` | Exit TUI | - |

**Autocomplete:**
- Commands have argument completion
- Fuzzy matching
- Context-aware suggestions

---

### 7. Tool Execution Component (`components/tool-execution.ts`)

**Purpose:** Visualize tool calls and results

**Display States:**
- **Pending:** Tool called, waiting for result
- **Success:** Tool completed successfully
- **Error:** Tool failed
- **Streaming:** Partial results (for long-running tools)

**Features:**
- Expandable/collapsible
- Syntax-highlighted output
- Error formatting
- Timing information

**Example Display:**

```
🛠️  file_read(path="config.json")
   ✅ Success (120ms)
   {
     "gateway": {
       "port": 19789
     }
   }
```

---

### 8. Overlays (`tui-overlays.ts`)

**Purpose:** Modal dialogs for selection

**Types:**

1. **Agent Picker** (`Ctrl+G`)
   - List all available agents
   - Fuzzy search
   - Shows agent name and ID

2. **Model Picker** (`Ctrl+O`)
   - List all available models
   - Shows provider and context window
   - Reasoning indicator

3. **Session Picker** (`Ctrl+P`)
   - List all sessions
   - Shows last message preview
   - Token usage
   - Timestamp

**Implementation:**
- Uses `SearchableSelectList` component
- Fuzzy filtering
- Keyboard navigation (arrows, Enter, Escape)

---

### 9. Local Shell (`tui-local-shell.ts`)

**Purpose:** Execute local shell commands

**Trigger:** Lines starting with `!`

**Examples:**
```
!ls -la
!git status
!npm run build
```

**Features:**
- Runs in local shell (not through agent)
- Captures stdout/stderr
- Shows exit code
- Timeout protection

**Implementation:**

```typescript
export function createLocalShellRunner(params: {
  chatLog: ChatLog;
  shell?: string;
  cwd?: string;
  timeoutMs?: number;
})
```

---

## Message Flow

### User Message → Agent Response

```
1. User types message in CustomEditor
   ↓
2. Editor.onSubmit() → createEditorSubmitHandler()
   ↓
3. Determine type:
   - Starts with "/" → handleCommand()
   - Starts with "!" → handleBangLine()
   - Otherwise → sendMessage()
   ↓
4. sendMessage() → GatewayChatClient.sendMessage()
   ↓
5. Gateway processes message
   ↓
6. Gateway streams response:
   - chat.stream events → updateAssistant()
   - tool.call events → startTool()
   - tool.result events → updateToolResult()
   - chat.done event → finalizeAssistant()
   ↓
7. ChatLog updates display in real-time
```

---

## State Management

### Session State

```typescript
type SessionInfo = {
  model?: string;
  provider?: string;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  contextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
```

**Persistence:**
- Session state stored in gateway
- Survives TUI restarts
- Per-session configuration

### Connection State

```typescript
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type ActivityStatus = 'idle' | 'thinking' | 'streaming' | 'tool_executing';
```

**Status Display:**
- Top-right corner
- Shows connection + activity
- Auto-updates

---

## Event System

### Gateway Events

```typescript
client.on('connected', () => {
  // Gateway connected
  state.isConnected = true;
  loadSessionHistory();
});

client.on('disconnected', () => {
  // Gateway disconnected
  state.isConnected = false;
  showReconnectMessage();
});

client.on('chat.stream', (data) => {
  // Streaming message chunk
  chatLog.updateAssistant(data.text, data.runId);
});

client.on('chat.done', (data) => {
  // Message complete
  chatLog.finalizeAssistant(data.text, data.runId);
  updateSessionInfo(data.usage);
});

client.on('tool.call', (data) => {
  // Tool execution started
  chatLog.startTool(data.toolCallId, data.toolName, data.args);
});

client.on('tool.result', (data) => {
  // Tool execution complete
  chatLog.updateToolResult(data.toolCallId, data.result, {
    isError: data.isError,
  });
});
```

---

## Advanced Features

### 1. Burst Coalescing

**Problem:** Pasting large text floods gateway with individual lines

**Solution:** `createSubmitBurstCoalescer()`
- Buffers rapid submissions
- 50ms window
- Combines into single message

### 2. Autocomplete

**Features:**
- Command completion
- Argument completion
- Context-aware
- Fuzzy matching

**Providers:**
- Slash commands
- Command arguments
- File paths (for shell commands)

### 3. Markdown Rendering

**Supported:**
- Headers
- Bold, italic, strikethrough
- Code blocks with syntax highlighting
- Inline code
- Links
- Quotes
- Lists
- Horizontal rules

**Syntax Highlighting:**
- Uses `cli-highlight` library
- Auto-detects language
- Custom color theme

### 4. Streaming Display

**Challenges:**
- Real-time updates
- Smooth rendering
- No flicker

**Solution:**
- Component-based updates
- Efficient re-rendering
- Buffered output

---

## Keyboard Shortcuts Reference

### Global

| Shortcut | Action |
|----------|--------|
| `Enter` | Submit message |
| `Alt+Enter` | Multi-line mode |
| `Ctrl+C` | Interrupt/cancel |
| `Ctrl+D` | Exit (when input empty) |
| `Ctrl+L` | Clear screen |
| `Escape` | Close overlay/cancel |

### Navigation

| Shortcut | Action |
|----------|--------|
| `Ctrl+G` | Agent picker |
| `Ctrl+O` | Model picker |
| `Ctrl+P` | Session picker |
| `Up/Down` | Navigate history |

### Display

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | Toggle tools expanded |
| `Shift+Tab` | Toggle thinking display |

### In Overlays

| Shortcut | Action |
|----------|--------|
| `Up/Down` | Navigate list |
| `Enter` | Select |
| `Escape` | Cancel |
| `Type` | Fuzzy filter |

---

## Performance Optimizations

### 1. Lazy Loading
- Components created on-demand
- Overlays loaded when opened
- History loaded incrementally

### 2. Efficient Rendering
- Only update changed components
- Batch updates
- Debounced re-renders

### 3. Memory Management
- Limit chat history in memory
- Clear old tool results
- Garbage collect unused components

---

## Comparison: OpenClaw TUI vs Talon TUI

| Feature | OpenClaw | Talon |
|---------|----------|-------|
| **Framework** | `@mariozechner/pi-tui` | Custom (chalk + inquirer) |
| **Streaming** | ✅ Real-time | ✅ Real-time |
| **Tool Visualization** | ✅ Rich | ⚠️ Basic |
| **Markdown** | ✅ Full support | ⚠️ Limited |
| **Syntax Highlighting** | ✅ Yes | ❌ No |
| **Overlays** | ✅ Agent/Model/Session pickers | ❌ No |
| **Autocomplete** | ✅ Commands + args | ⚠️ Commands only |
| **Keyboard Shortcuts** | ✅ 10+ shortcuts | ⚠️ Basic |
| **Local Shell** | ✅ `!command` | ✅ `!command` |
| **Session Management** | ✅ Advanced | ⚠️ Basic |
| **Theme System** | ✅ Comprehensive | ⚠️ Basic colors |

---

## Implementation Recommendations for Talon

### High Priority

1. **Adopt pi-tui Framework**
   - More robust than custom solution
   - Built-in components
   - Better performance

2. **Add Tool Visualization**
   - Show tool calls in real-time
   - Expandable results
   - Error handling

3. **Implement Overlays**
   - Model picker
   - Session picker
   - Better UX than inline commands

4. **Enhance Markdown**
   - Syntax highlighting
   - Better code block rendering
   - Quote styling

### Medium Priority

5. **Add More Shortcuts**
   - `Ctrl+G` for quick actions
   - `Ctrl+T` for tool toggle
   - `Shift+Tab` for thinking

6. **Improve Streaming**
   - Smoother updates
   - Better buffering
   - Cancel support

7. **Session Management**
   - List sessions
   - Switch easily
   - Show usage stats

### Low Priority

8. **Autocomplete Enhancement**
   - Argument completion
   - File path completion
   - Context-aware

9. **Theme Customization**
   - User-defined colors
   - Multiple themes
   - Dark/light mode

10. **Performance**
    - Lazy loading
    - Memory optimization
    - Faster rendering

---

## Code Examples

### Creating a Custom Component

```typescript
import { Container, Text } from "@mariozechner/pi-tui";
import { theme } from "../theme/theme.js";

export class MyComponent extends Container {
  private textComponent: Text;

  constructor(initialText: string) {
    super();
    this.textComponent = new Text(theme.accent(initialText));
    this.addChild(this.textComponent);
  }

  updateText(newText: string) {
    this.textComponent.setText(theme.accent(newText));
  }
}
```

### Handling Gateway Events

```typescript
const client = new GatewayChatClient();

client.on('chat.stream', (data) => {
  chatLog.updateAssistant(data.text, data.runId);
});

client.on('tool.call', (data) => {
  const tool = chatLog.startTool(
    data.toolCallId,
    data.toolName,
    data.args
  );
});

client.on('tool.result', (data) => {
  chatLog.updateToolResult(
    data.toolCallId,
    data.result,
    { isError: data.isError }
  );
});
```

### Adding a Slash Command

```typescript
const commands: SlashCommand[] = [
  {
    name: "mycommand",
    description: "My custom command",
    getArgumentCompletions: (prefix) => {
      return ["option1", "option2"]
        .filter(v => v.startsWith(prefix))
        .map(value => ({ value, label: value }));
    }
  }
];
```

---

## Resources

- **pi-tui Library:** `@mariozechner/pi-tui` v0.52.12
- **OpenClaw Source:** `/Users/orlandoascanio/openclaw/src/tui/`
- **Gateway Protocol:** OpenClaw gateway WebSocket protocol
- **Syntax Highlighting:** `cli-highlight` library
- **Colors:** `chalk` library

---

## Conclusion

OpenClaw's TUI is a sophisticated, production-ready terminal interface with:
- Rich component system
- Real-time streaming
- Advanced keyboard shortcuts
- Beautiful theming
- Excellent UX

Talon can significantly improve its TUI by adopting similar patterns and the pi-tui framework.

---

**Status:** ✅ Complete Analysis

This document provides a comprehensive overview of OpenClaw's TUI architecture for reference when enhancing Talon's interface.
