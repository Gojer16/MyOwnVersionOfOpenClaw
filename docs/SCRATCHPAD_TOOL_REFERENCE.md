# Scratchpad Tool - Quick Reference

## Overview

The scratchpad tool enables multi-step task tracking by maintaining progress state across tool calls.

## Tool Name

`scratchpad_update`

## Actions

### 1. `add_visited`
Track visited URLs or items.

```json
{
  "action": "add_visited",
  "value": "https://ollama.com/library/model1"
}
```

**Returns:** `Added "https://..." to visited list. Total visited: 5`

### 2. `add_collected`
Store collected results.

```json
{
  "action": "add_collected",
  "data": {
    "name": "translategemma",
    "size": "4b",
    "url": "/library/translategemma"
  }
}
```

**Returns:** `Added item to collected results. Total collected: 3`

### 3. `add_pending`
Add items to process queue.

```json
{
  "action": "add_pending",
  "value": "model2"
}
```

**Returns:** `Added "model2" to pending list. Total pending: 5`

### 4. `remove_pending`
Mark item as processed.

```json
{
  "action": "remove_pending",
  "value": "model1"
}
```

**Returns:** `Removed "model1" from pending list. Remaining: 4`

### 5. `set_progress`
Update custom progress state.

```json
{
  "action": "set_progress",
  "data": {
    "total": 10,
    "processed": 3,
    "current": "model3"
  }
}
```

**Returns:** `Updated progress state: {"total":10,"processed":3,"current":"model3"}`

### 6. `clear`
Reset scratchpad.

```json
{
  "action": "clear"
}
```

**Returns:** `Scratchpad cleared`

## Usage Pattern

### Multi-Step Browsing Task

```
1. Extract list of items
   → scratchpad_update(add_pending: item1, item2, ...)

2. For each item:
   → scratchpad_update(add_visited: item_url)
   → Navigate to item
   → Extract details
   → scratchpad_update(add_collected: {...})
   → scratchpad_update(remove_pending: item)

3. Check if done:
   → If scratchpad.pending is empty → return final summary
   → If not empty → continue loop
```

## Scratchpad State Structure

```typescript
{
  visited: string[];           // URLs or items visited
  collected: any[];            // Results collected
  pending: string[];           // Items to process
  progress: Record<string, any>;  // Custom state
}
```

## System Prompt Integration

The scratchpad state is automatically injected into the system prompt on every LLM call:

```
## Current Task Progress (Scratchpad)

**Visited:** url1, url2, url3
**Collected:** [{"name": "item1", ...}, ...]
**Pending:** item4, item5
**Progress:** {"total": 10, "processed": 3}

**Remember:** Continue iterating until scratchpad.pending is empty.
```

## Example: Ollama Model Search

```
User: "Find models with 4b or 8b"

Step 1: Navigate and extract list
→ scratchpad_update(add_pending: [model1, model2, model3, ...])

Step 2: Process first model
→ scratchpad_update(add_visited: "https://ollama.com/library/model1")
→ apple_safari_click("a[href='/library/model1']")
→ apple_safari_execute_js("...", waitMs: 2000)
→ scratchpad_update(add_collected: {"name": "model1", "size": "4b"})
→ scratchpad_update(remove_pending: "model1")

Step 3: Check progress
→ LLM sees: scratchpad.pending = [model2, model3, ...]
→ Continue loop

Step 4: Final summary
→ LLM sees: scratchpad.pending = []
→ Return: "Found 5 models with 4b or 8b: ..."
```

## Best Practices

1. **Initialize pending list early:** Extract all items first, then iterate
2. **Update after each item:** Keep scratchpad in sync with actual progress
3. **Check pending before responding:** Don't return final answer until pending is empty
4. **Use structured data in collected:** Store JSON objects, not raw text
5. **Clear between tasks:** Reset scratchpad when starting a new multi-step task

## Debugging

### View scratchpad state
```bash
cat ~/.talon/sessions/sess_*.json | jq '.scratchpad'
```

### Check if scratchpad is being used
```bash
# Look for scratchpad_update tool calls in logs
grep "scratchpad_update" ~/.talon/logs/talon.log
```

### Verify iteration is happening
```bash
# Count tool calls in a session
cat ~/.talon/sessions/sess_*.json | jq '.messages | map(select(.toolCalls)) | length'
```

## Troubleshooting

### Problem: Agent stops after one tool call
**Solution:** Check if scratchpad is being initialized with pending items

### Problem: Agent repeats same tool call
**Solution:** Ensure scratchpad is being updated after each iteration

### Problem: Scratchpad not visible in context
**Solution:** Verify session.scratchpad exists and has data

### Problem: Pending list never empties
**Solution:** Check if remove_pending is being called after processing each item

## Integration with Other Tools

### Safari Tools
```javascript
// Extract list as JSON
apple_safari_execute_js({
  script: "JSON.stringify(Array.from(document.querySelectorAll('.model')).map(el => el.textContent))",
  waitMs: 2000
})

// Store in scratchpad
scratchpad_update({
  action: "add_pending",
  value: "model1"
})
```

### File Tools
```javascript
// Save progress to file
file_write({
  path: "~/.talon/workspace/progress.json",
  content: JSON.stringify(session.scratchpad)
})
```

### Memory Tools
```javascript
// Store final results in memory
memory_write({
  key: "ollama_models_4b_8b",
  value: JSON.stringify(session.scratchpad.collected)
})
```

## Performance Notes

- **Token Overhead:** ~100-200 tokens per iteration (scratchpad state in context)
- **Memory Usage:** Minimal (scratchpad stored in session JSON)
- **Persistence:** Scratchpad persists across gateway restarts (stored in session file)

## Version

- **Added:** v0.4.0 (2026-02-20)
- **Status:** Stable
- **Breaking Changes:** None
