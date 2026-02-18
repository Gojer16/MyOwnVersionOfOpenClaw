---
summary: "Tool documentation and configuration"
read_when:
  - When using tools
  - Bootstrapping a workspace manually
---

# TOOLS

This file documents your available tools and how to use them effectively.

## Tool Categories

### File & System
- **file_read** - Read file contents
- **file_write** - Write or update files
- **file_list** - List directory contents
- **file_search** - Search for files by pattern
- **shell_execute** - Run shell commands

### Web & Research
- **web_search** - Search the web (DeepSeek, OpenRouter, Tavily, DuckDuckGo)
- **web_fetch** - Extract content from URLs

### Memory & Knowledge
- **memory_read** - Read from persistent memory
- **memory_write** - Write to persistent memory
- **notes_save** - Save notes with tags (stored in ~/.talon/workspace/notes/)
- **notes_search** - Search notes by keyword or tag

### Productivity
- **tasks_add** - Add tasks with priority (low/medium/high)
- **tasks_list** - List tasks by status (pending/completed/all)
- **tasks_complete** - Mark tasks as done

### Apple Integrations (macOS only)
- **apple_notes_create** - Create notes in Apple Notes app
- **apple_notes_search** - Search Apple Notes
- **apple_reminders_add** - Add reminders with due dates and priority
- **apple_reminders_list** - List reminders by list name
- **apple_reminders_complete** - Mark reminders as complete
- **apple_calendar_create_event** - Create calendar events
- **apple_calendar_list_events** - List upcoming events
- **apple_calendar_delete_event** - Delete events by title

### Delegation
- **delegate_to_subagent** - Delegate to specialized agents:
  - **research** - Gather information with sources
  - **writer** - Produce content (markdown/code/text)
  - **planner** - Create actionable plans
  - **critic** - Review work with feedback
  - **summarizer** - Compress information

## Environment-Specific Setup

Add your personal configuration here:

### SSH Hosts
- `home-server` → 192.168.1.100, user: admin

### Preferred Settings
- Default calendar: "Talon"
- Default reminders list: "Talon"
- Notes folder: "Talon"

### Device Nicknames
- Add your specific device names and locations here

## Usage Tips

- Use **notes_save** for important information you want to remember
- Use **tasks_add** for actionable items
- Use **apple_calendar_create_event** for scheduling
- Use **delegate_to_subagent** for complex research or writing tasks
- Use **memory_write** for long-term facts and decisions
