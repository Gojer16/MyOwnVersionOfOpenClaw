# Talon — Vision & Identity

> **Talon** is a local-first, privacy-centric personal AI assistant that lives on your machine, sees your full desktop, and talks to you on the platforms you already use.

---

## Why Talon?

Commercial AI assistants live in someone else's cloud. Your files, your commands, your browsing history — everything flows through third-party servers. Talon inverts that model:

- **Your machine, your rules.** The Gateway runs locally. Nothing leaves unless you say so.
- **Your channels, your choice.** Talk to it on Telegram, Discord, WebChat, or your terminal. Same assistant, same memory, same personality — everywhere.
- **Your data, your AI.** It remembers you, adapts to you, and evolves a persistent persona (the *Soul*) that is uniquely yours.

---

## Core Principles

| Principle | What it means |
|---|---|
| **Privacy First** | All data stays local by default. LLM calls are the only external network requests (and even those can use local models). |
| **Full System Access** | Read files, run commands, control browsers, observe filesystem changes — the AI has the same access you do. |
| **Proactive Intelligence** | The *Shadow Loop* watches for system events (build failures, file saves, errors) and proposes actions before you ask. |
| **Persistent Persona** | The *Soul* (`SOUL.md`) defines identity, tone, and values. It evolves as Talon learns your preferences. |
| **Channel-Agnostic** | One assistant, many surfaces: Telegram, Discord, WebChat, CLI, and eventually WhatsApp, Slack, iMessage, and native apps. |
| **Extensible** | Skills, plugins, and community packages extend capabilities without touching core code. |

---

## What Talon Does

```
┌──────────────────────────────────────────────────────────────────┐
│                        YOU (the user)                            │
│  Telegram · Discord · WebChat · CLI · (future: WhatsApp, Slack) │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Talon Gateway   │
                 │    (control plane)  │
                 │  ws://127.0.0.1:19789  │
                 └──────────┬──────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   ┌───────────┐     ┌───────────┐     ┌───────────┐
   │   Agent   │     │  Shadow   │     │  Memory   │
   │  Runtime  │     │   Loop    │     │  & Soul   │
   │ (LLM+Tools)│    │(Proactive)│     │(Persistent)│
   └───────────┘     └───────────┘     └───────────┘
         │
    ┌────┴────────────────────────┐
    ▼         ▼         ▼        ▼
 Files     Shell    Browser   OS/System
```

### Key Capabilities

| Capability | Description |
|---|---|
| **File Management** | Read, write, edit, search your filesystem |
| **Shell Execution** | Run any command, script, or process |
| **Browser Control** | Navigate web pages, fill forms, extract data via CDP |
| **Persistent Memory** | Two-tier memory: short-term context + long-term knowledge |
| **Shadow Loop** | Proactive filesystem/error watching with "Ghost Message" proposals |
| **Persona Evolution** | Self-updating Soul that learns your style and preferences |
| **Multi-Channel Inbox** | One conversation thread across all your messaging platforms |
| **Skills & Plugins** | Community-extensible capability system |

---

## Inspiration: OpenClaw

Talon is inspired by [OpenClaw](https://openclaw.ai/), an open-source personal AI assistant. Key ideas borrowed:

| OpenClaw Concept | Talon Adaptation |
|---|---|
| Gateway control plane | WebSocket Gateway at `ws://127.0.0.1:19789` |
| Multi-channel inbox | Telegram + Discord + WebChat (MVP), expandable |
| Pi agent runtime | Multi-provider agent (Anthropic, OpenAI, local models) |
| SOUL.md + AGENTS.md | Persistent, self-evolving Soul system |
| Skills platform | Workspace-based skills with SKILL.md definitions |
| Browser control (CDP) | Dedicated Chromium via Playwright |
| Tailscale remote access | SSH tunnels + optional Tailscale (later) |

Talon differentiates with the **Shadow Loop** (proactive observation) and a stronger focus on single-user, maximum-depth system integration.

---

## Test-Driven Development Strategy

Talon follows **Test-Driven Development (TDD)** for all features:

> **Rule:** Write tests first, then implement the feature.

### TDD Workflow

1. **Write failing tests** that define expected behavior
2. **Run tests** to confirm they fail (red)
3. **Implement feature** to make tests pass (green)
4. **Refactor** while keeping tests green
5. **Commit** with tests + implementation together

### Test Coverage by Feature Type

#### Core Features (Required - 80%+ coverage)

**Status:** ✅ Tests exist, features implemented

| Feature | Tests | Coverage | Status |
|---------|-------|----------|--------|
| Gateway Server | Integration | 80% | ✅ |
| Agent Loop | Unit + Integration | 75% | ✅ |
| Memory Manager | Unit | 100% | ✅ |
| Model Router | Unit | 100% | ✅ |
| Fallback System | Unit | 100% | ✅ |
| Session Manager | Unit | 100% | ✅ |
| Context Guard | Unit | 100% | ✅ |
| Event Bus | Unit | 100% | ✅ |
| Config System | Unit | 100% | ✅ |
| Prompts | Unit | 100% | ✅ |

**Next Core Features (TDD Required):**

| Feature | Test Type | Priority |
|---------|-----------|----------|
| File Tools | Unit + Integration | P0 |
| Shell Tools | Unit + Integration | P0 |
| Web Search | Unit + Integration | P0 |
| Memory Compression | Integration | P0 |
| Tool Registry | Unit | P0 |

---

#### Optional Features (60%+ coverage)

**Status:** ❌ Tests needed before implementation

| Feature | Test Type | Priority | Status |
|---------|-----------|----------|--------|
| **Subagent System** | Unit + Integration | P1 | ❌ Write tests first |
| **Shadow Loop** | Integration | P1 | ❌ Write tests first |
| **Browser Automation** | Integration | P1 | ❌ Write tests first |
| **Discord Channel** | Integration | P2 | ❌ Write tests first |
| **WebChat UI** | E2E | P2 | ❌ Write tests first |
| **Productivity Tools** | Unit | P2 | ❌ Write tests first |
| **Smart Routing** | Unit | P2 | ❌ Write tests first |

**TDD Example - Subagent System:**

```typescript
// tests/unit/subagents.test.ts - WRITE THIS FIRST
describe('Subagent System', () => {
    it('should spawn research subagent', async () => {
        const subagent = await spawnSubagent('research', task);
        expect(subagent.type).toBe('research');
    });
    
    it('should return structured JSON', async () => {
        const result = await subagent.execute(task);
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('findings');
    });
});

// THEN implement src/subagents/base.ts
```

---

#### Future Features (40%+ coverage)

**Status:** ❌ Tests needed before implementation

| Feature | Test Type | Priority | Status |
|---------|-----------|----------|--------|
| **Voice Features** | Integration | P3 | ❌ Write tests first |
| **Canvas/A2UI** | E2E | P3 | ❌ Write tests first |
| **Native Apps** | E2E | P3 | ❌ Write tests first |
| **Vector Memory** | Unit + Integration | P2 | ❌ Write tests first |
| **Docker Sandbox** | Integration | P1 | ❌ Write tests first |
| **Cron Scheduler** | Unit + Integration | P2 | ❌ Write tests first |

**TDD Example - Shadow Loop:**

```typescript
// tests/integration/shadow-loop.test.ts - WRITE THIS FIRST
describe('Shadow Loop', () => {
    it('should detect file changes', async () => {
        const watcher = new ShadowLoop(config);
        const events: any[] = [];
        
        watcher.on('file.changed', (e) => events.push(e));
        
        // Trigger file change
        await fs.writeFile('/tmp/test.txt', 'content');
        await wait(100);
        
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].path).toContain('test.txt');
    });
    
    it('should send ghost messages for errors', async () => {
        const watcher = new ShadowLoop(config);
        const messages: any[] = [];
        
        watcher.on('ghost.message', (m) => messages.push(m));
        
        // Trigger error
        await exec('npm run build-fail');
        await wait(100);
        
        expect(messages.length).toBeGreaterThan(0);
        expect(messages[0].content).toContain('error');
    });
});

// THEN implement src/shadow/watcher.ts
```

---

### Test Organization

```
tests/
├── unit/                    # Fast, isolated tests
│   ├── config-schema.test.ts
│   ├── memory-manager.test.ts
│   ├── model-router.test.ts
│   ├── subagents.test.ts        # TODO: Write first
│   └── ...
├── integration/             # Component interaction tests
│   ├── agent-loop.test.ts       # TODO: Write first
│   ├── shadow-loop.test.ts      # TODO: Write first
│   ├── tools.test.ts            # TODO: Write first
│   └── channels.test.ts         # TODO: Write first
└── e2e/                     # End-to-end tests
    ├── webchat.test.ts          # TODO: Write first
    └── voice.test.ts            # TODO: Write first
```

---

### TDD Benefits for Talon

1. **Prevents regressions** - Core features stay stable
2. **Documents behavior** - Tests show how features work
3. **Enables refactoring** - Change internals safely
4. **Catches edge cases** - Think through failure modes first
5. **Speeds development** - Less debugging, more confidence

---

## Naming

| Item | Name |
|---|---|
| **Project** | Talon |
| **CLI command** | `talon` |
| **Config directory** | `~/.talon/` |
| **Default port** | `19789` |
| **Persona file** | `SOUL.md` |
| **Facts store** | `FACTS.json` |
| **Gateway workspace** | `~/.talon/workspace/` |
