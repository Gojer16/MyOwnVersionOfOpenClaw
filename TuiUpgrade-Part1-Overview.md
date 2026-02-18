# Talon TUI Upgrade Implementation Plan - Part 1: Overview & Foundation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Talon's TUI from basic readline interface to a rich, component-based terminal UI using Ink (React for CLIs) with real-time tool visualization, overlays, and advanced keyboard shortcuts matching OpenClaw's capabilities.

**Architecture:** 
- Replace current readline-based TUI with Ink (React components for terminal)
- Maintain WebSocket connection to gateway (no protocol changes)
- Component-based architecture: ChatLog, MessageBubble, ToolCard, StatusBar, Overlays
- Shared state management using React hooks
- Preserve existing TerminalRenderer logic where applicable

**Tech Stack:**
- **ink** v4.x - React for CLIs
- **ink-text-input** - Text input component
- **ink-select-input** - Selection lists
- **ink-spinner** - Loading indicators
- **react** v18.x - Required by Ink
- **chalk** v5.x - Terminal colors (already installed)
- **cli-highlight** - Syntax highlighting for code blocks
- **fuse.js** - Fuzzy search for overlays

**Current State Analysis:**

**Existing Files:**
- `src/cli/tui.ts` - Main TUI entry (525 lines, readline-based)
- `src/channels/cli/renderer.ts` - Terminal renderer (317 lines)
- `src/channels/cli/utils.ts` - Utilities (211 lines)
- `src/channels/cli/commands.ts` - Command registry (555 lines)

**What Works:**
✅ WebSocket connection to gateway
✅ Message streaming
✅ Basic tool result display
✅ Slash commands
✅ Bang commands (shell execution)
✅ Command registry system

**What Needs Upgrade:**
❌ No component-based UI (uses raw readline)
❌ Limited tool visualization (just text output)
❌ No overlays (model/session pickers)
❌ Basic markdown rendering (no syntax highlighting)
❌ Limited keyboard shortcuts
❌ No expandable/collapsible sections
❌ No fuzzy search
❌ Basic theming

---

## Implementation Strategy

**Phase 1: Foundation (Part 2)**
- Install dependencies
- Create Ink component structure
- Port basic chat display
- Maintain WebSocket connection

**Phase 2: Core Components (Part 3)**
- ChatLog component
- Message components (User/Assistant)
- ToolCard component with expand/collapse
- StatusBar component

**Phase 3: Advanced Features (Part 4)**
- Overlays (Model/Session/Agent pickers)
- Enhanced markdown with syntax highlighting
- Keyboard shortcuts system
- Fuzzy search

**Phase 4: Polish & Testing (Part 5)**
- Theme system
- Performance optimization
- Integration tests
- Migration guide

---

## File Structure (New)

```
src/tui/
├── index.tsx                      # Main Ink app entry
├── app.tsx                        # Root App component
├── hooks/
│   ├── use-gateway.ts            # WebSocket connection hook
│   ├── use-keyboard.ts           # Keyboard shortcuts hook
│   └── use-session.ts            # Session state hook
├── components/
│   ├── chat-log.tsx              # Main chat display
│   ├── message-user.tsx          # User message bubble
│   ├── message-assistant.tsx     # Assistant message bubble
│   ├── tool-card.tsx             # Tool execution card
│   ├── status-bar.tsx            # Top status bar
│   ├── input-bar.tsx             # Bottom input bar
│   ├── markdown.tsx              # Markdown renderer
│   └── overlays/
│       ├── model-picker.tsx      # Model selection overlay
│       ├── session-picker.tsx    # Session selection overlay
│       └── agent-picker.tsx      # Agent selection overlay
├── theme/
│   ├── colors.ts                 # Color palette
│   └── styles.ts                 # Reusable styles
└── utils/
    ├── fuzzy.ts                  # Fuzzy search
    └── formatters.ts             # Text formatters
```

---

## Dependencies to Install

```json
{
  "dependencies": {
    "ink": "^4.4.1",
    "ink-text-input": "^5.0.1",
    "ink-select-input": "^5.0.0",
    "ink-spinner": "^5.0.0",
    "react": "^18.2.0",
    "cli-highlight": "^2.1.11",
    "fuse.js": "^7.0.0",
    "ink-markdown": "^1.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "ink-testing-library": "^3.0.0"
  }
}
```

---

## Migration Strategy

**Backward Compatibility:**
1. Keep old TUI as `tui-legacy.ts`
2. New TUI as `tui.ts` (Ink-based)
3. Add flag `--legacy` to use old TUI
4. Default to new TUI after testing

**Gradual Rollout:**
- Week 1: Foundation + Core Components
- Week 2: Advanced Features
- Week 3: Testing + Polish
- Week 4: Full migration

---

## Testing Strategy

**Unit Tests:**
- Component rendering tests (ink-testing-library)
- Hook tests (React Testing Library)
- Utility function tests

**Integration Tests:**
- WebSocket message handling
- Command execution
- Tool visualization
- Overlay interactions

**Manual Testing:**
- Real gateway connection
- Streaming performance
- Keyboard shortcuts
- Visual appearance

---

## Success Criteria

**Must Have:**
✅ All existing functionality preserved
✅ Real-time streaming works smoothly
✅ Tool calls visualized with expand/collapse
✅ Model/Session pickers work
✅ Keyboard shortcuts functional
✅ Markdown with syntax highlighting
✅ No performance regression

**Nice to Have:**
✅ Fuzzy search in pickers
✅ Theme customization
✅ Autocomplete enhancements
✅ Better error handling

---

## Risk Assessment

**High Risk:**
- Ink rendering performance with large chat history
- WebSocket message handling in React context
- Terminal compatibility issues

**Mitigation:**
- Virtual scrolling for chat history
- Efficient state updates (React.memo, useMemo)
- Test on multiple terminals (iTerm2, Terminal.app, Alacritty)

**Medium Risk:**
- Breaking existing workflows
- User learning curve

**Mitigation:**
- Keep legacy TUI available
- Comprehensive migration guide
- Similar keyboard shortcuts to old TUI

---

## Progress Tracking

**Status Legend:**
- ⬜ Not Started
- 🟨 In Progress
- ✅ Complete
- ❌ Blocked

**Phase 1: Foundation**
- ⬜ Install dependencies
- ⬜ Create project structure
- ⬜ Basic Ink app setup
- ⬜ WebSocket connection hook

**Phase 2: Core Components**
- ⬜ ChatLog component
- ⬜ Message components
- ⬜ ToolCard component
- ⬜ StatusBar component

**Phase 3: Advanced Features**
- ⬜ Model picker overlay
- ⬜ Session picker overlay
- ⬜ Markdown with syntax highlighting
- ⬜ Keyboard shortcuts

**Phase 4: Polish**
- ⬜ Theme system
- ⬜ Performance optimization
- ⬜ Tests
- ⬜ Documentation

---

**Next:** See `TuiUpgrade-Part2-Foundation.md` for detailed implementation steps.
