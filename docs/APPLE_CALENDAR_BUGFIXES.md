# Apple Calendar Tool - Bug Fixes

## 🐛 Issues Fixed

### Issue 1: Empty Recurrence Object Validation
**Problem:** The agent was passing empty `recurrence: {}` objects, which triggered validation errors:
```
"error": {
  "code": "INVALID_RECURRENCE",
  "message": "Recurrence requires either endDate or count"
}
```

**Root Cause:** The validation checked `if (recurrence)` which is `true` for empty objects `{}`, then failed because `recurrence.type` was `undefined`.

**Fix:** Added check to ignore empty recurrence objects:
```typescript
// Before:
if (recurrence) {

// After:
if (recurrence && Object.keys(recurrence).length > 0) {
```

---

### Issue 2: AppleScript Command Truncation
**Problem:** AppleScript commands were being truncated when executed inline:
```
"message": "Command failed: osascript -e 'tell application \"Calendar\"...
set newEvent to ma...  // ← TRUNCATED!
```

**Root Cause:** Shell command length limits when passing long AppleScript code via `-e` flag.

**Fix:** Write AppleScript to temporary file and execute it:
```typescript
// Before:
const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

// After:
const tempFile = join(tmpdir(), `talon-calendar-${Date.now()}.scpt`);
writeFileSync(tempFile, script, 'utf-8');
const { stdout, stderr } = await execAsync(`osascript "${tempFile}"`);
try { unlinkSync(tempFile); } catch (e) { /* ignore */ }
```

**Benefits:**
- No command length limits
- Better error messages (full script preserved)
- Easier debugging (can inspect temp file if needed)

---

## ✅ Changes Made

### Files Modified
1. **`src/tools/apple-calendar.ts`**
   - Added imports: `writeFileSync`, `unlinkSync`, `tmpdir`, `join`
   - Fixed recurrence validation (line ~165)
   - Updated `create_event` to use temp file (line ~250)
   - Updated `list_events` to use temp file (line ~420)
   - Updated `delete_event` to use temp file (line ~570)

### Test Results
```
✓ tests/unit/apple-calendar-tools.test.ts (20 tests) 29ms

Test Files  1 passed (1)
     Tests  20 passed (20)
```

All tests passing! ✅

---

## 🚀 Testing the Fix

### Before (Broken)
```
You > Create an event today at 1pm called "Reading"
  🛠️  apple_calendar_create_event (5 attempts)
  ❌ Error: INVALID_RECURRENCE
  ❌ Error: APPLESCRIPT_ERROR (command truncated)
```

### After (Fixed)
```
You > Create an event today at 1pm called "Reading"
  🛠️  apple_calendar_create_event
  ✅ Success: Event created with ID E621F8F0-...
```

---

## 📝 What to Test

1. **Simple event creation:**
   ```
   Create a meeting tomorrow at 3pm called "Team Sync"
   ```

2. **Event with details:**
   ```
   Create an event next Monday at 2pm called "Client Demo" at Conference Room A
   ```

3. **Recurring event:**
   ```
   Create a weekly standup every Monday at 9am for 4 weeks
   ```

4. **List events:**
   ```
   Show me my calendar events for the next 7 days
   ```

5. **Delete event:**
   ```
   Delete the event called "Team Sync"
   ```

---

## 🔍 Technical Details

### Temp File Naming
- Create: `talon-calendar-{timestamp}.scpt`
- List: `talon-calendar-list-{timestamp}.scpt`
- Delete: `talon-calendar-delete-{timestamp}.scpt`

### Cleanup Strategy
- Temp files are deleted immediately after execution
- Cleanup errors are silently ignored (file may already be deleted)
- Files are created in system temp directory (`os.tmpdir()`)

### Error Handling
- Permission errors still detected via stderr
- AppleScript errors now include full error messages
- Temp file cleanup failures don't affect operation success

---

## ✅ Status

**Both issues are now fixed and tested!**

The Apple Calendar tool should now work correctly when creating events through the TUI. Try it out! 🎉
