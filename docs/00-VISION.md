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
