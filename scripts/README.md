# Talon Scripts

Utility scripts for development, testing, and maintenance.

## Test Scripts

### test-calendar-tool.mjs

**Isolated test harness for the Apple Calendar tool.**

Tests the tool directly, bypassing Talon's agent layer, to isolate whether bugs are in the tool itself or in how Talon passes parameters.

#### Usage

```bash
# Build first (required after code changes)
npm run build

# Run all tests
node scripts/test-calendar-tool.mjs

# Run specific test by name
node scripts/test-calendar-tool.mjs --test="ISO"

# Run with filter
node scripts/test-calendar-tool.mjs --test="today"
```

#### Test Cases

| # | Name | Description |
|---|------|-------------|
| 1 | ISO format | `2026-02-23 10:00` |
| 2 | Natural today | `today at 3pm` |
| 3 | Time range | `3:30pm to 4:30pm today` |
| 4 | Relative tomorrow | `tomorrow at 9am` |
| 5 | MM/DD/YYYY | `2/25/2026 14:00` |
| 6 | Explicit end date | Separate start and end params |
| 7 | Specific calendar | Using `calendar: "Personal"` |

#### Output

```
╔══════════════════════════════════════════════════════════════════════╗
║         APPLE CALENDAR TOOL TEST HARNESS                            ║
╚══════════════════════════════════════════════════════════════════════╝

════════════════════════════════════════════════════════════════════════
  TEST: ISO format (YYYY-MM-DD HH:MM)
════════════════════════════════════════════════════════════════════════

[HH:MM:SS] INPUT ARGS: { "title": "[TEST] ISO Format", ... }
[HH:MM:SS] EXPECTED DATE: { year: 2026, month: 2, day: 23, ... }

--- EXECUTING TOOL ---
[HH:MM:SS] Duration: 245ms

RAW OUTPUT:
{"success":true,"eventId":"ABC123",...}

--- VERIFYING EVENT IN CALENDAR ---
[HH:MM:SS] Event found in "Talon" calendar

--- DATE COMPARISON ---
✅ Start date matches expected

--- CLEANUP ---
[HH:MM:SS] Cleanup result: DELETED

✅ All checks passed

════════════════════════════════════════════════════════════════════════
  SUMMARY
════════════════════════════════════════════════════════════════════════

📊 Results: 7/7 passed, 0 failed
```

#### Interpreting Results

| Result | Diagnosis |
|--------|-----------|
| All tests pass | ✅ Tool works correctly → problem is in Talon agent layer |
| Date component mismatches | ⚠️ AppleScript date format / locale issue |
| Natural language fails | ⚠️ Date parser issue |
| All tests fail | ❌ Fundamental tool bug |

#### Configuration

Edit `CONFIG` in the script to customize:

```javascript
const CONFIG = {
    cleanupEvents: true,        // Delete test events after verification
    verbose: true,              // Debug logging
    defaultCalendar: 'Talon',   // Default calendar for tests
};
```

---

## Other Scripts

| Script | Purpose |
|--------|---------|
| `test-gateway-e2e.js` | End-to-end gateway tests |
| `verify-memory-fix.js` | Memory system verification |
| `verify-security.sh` | Security configuration check |
| `migrate-workspace.sh` | Workspace migration utility |
| `ws-client.js` | WebSocket client for testing |
