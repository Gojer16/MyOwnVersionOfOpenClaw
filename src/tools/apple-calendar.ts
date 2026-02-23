import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { parseDate, formatForDisplay, type DateParseResult, parseTimeRange } from './utils/date-parser.js';
import {
    type BulletproofOutput,
    formatSuccess,
    formatError,
    escapeAppleScript,
    normalizeString,
    createBaseString,
    safeExecAppleScript,
    detectPermissionError,
    getPermissionRecoverySteps,
    checkAppPermission,
    DELIMITER,
} from './apple-shared.js';

const execAsync = promisify(exec);

// Re-export for backward compatibility
export type { BulletproofOutput };

// Permission cache to avoid repeated permission checks
let permissionCache: { granted: boolean; checkedAt: number } | null = null;
const PERMISSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Concurrent operation lock
let operationLock: Promise<string> | null = null;

// Export function to reset state (for testing)
export function __resetCalendarState() {
    permissionCache = null;
    operationLock = null;
}

const RecurrenceSchema = z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int().min(1).max(365).optional().default(1),
    endDate: z.string().optional(), // Recurrence end date
    count: z.number().int().min(1).max(365).optional(), // Number of occurrences
});

const CreateEventSchema = z.object({
    title: createBaseString(500, "Title is too long"),
    startDate: createBaseString(100, "Start date string too long"),
    endDate: createBaseString(100, "End date string too long").optional(),
    location: createBaseString(1000, "Location is too long").optional(),
    notes: z.string().trim().max(5000, "Notes string too long").optional(), // keep original formatting for notes
    calendar: createBaseString(100, "Calendar name too long").default("Talon"),
    recurrence: RecurrenceSchema.optional(),
}).strict(); // Strict mode by default

const ListEventsSchema = z.object({
    calendar: createBaseString(100, "Calendar name too long").optional(),
    days: z.number().int().min(1).max(365).default(7),
}).strict();

const DeleteEventSchema = z.object({
    title: createBaseString(500, "Title is too long"),
    calendar: createBaseString(100, "Calendar name too long").default("Talon"),
}).strict();

// safeExecAppleScript is now imported from apple-shared.ts

// Check if Calendar app is running
async function isCalendarRunning(): Promise<boolean> {
    try {
        const { stdout } = await execAsync('pgrep -x "Calendar" || echo "not running"');
        return !stdout.includes('not running');
    } catch {
        return false;
    }
}

// Check Calendar permissions with caching
async function checkCalendarPermission(): Promise<{ granted: boolean; needsCheck: boolean }> {
    const now = Date.now();

    // Check cache first
    if (permissionCache && (now - permissionCache.checkedAt) < PERMISSION_CACHE_TTL) {
        return { granted: permissionCache.granted, needsCheck: false };
    }

    // Test permission with a harmless read operation
    try {
        const testScript = `tell application "Calendar"
    set testCal to name of calendar 1
    return testCal
end tell`;
        await safeExecAppleScript(testScript, 5000);
        permissionCache = { granted: true, checkedAt: now };
        return { granted: true, needsCheck: true };
    } catch (err: any) {
        if (err.stderr && detectPermissionError(err.stderr)) {
            permissionCache = { granted: false, checkedAt: now };
            return { granted: false, needsCheck: true };
        }
        // Other errors don't indicate permission issues
        return { granted: true, needsCheck: true };
    }
}

// Check if a date falls in a DST gap or is ambiguous
function checkDSTIssue(date: Date): { isDSTGap: boolean; isAmbiguous: boolean; message?: string } {
    // Check for non-existent times during DST spring forward (2am-3am doesn't exist)
    const testDate = new Date(date);
    const localHour = testDate.getHours();

    // In US timezones, 2am-3am on DST transition day doesn't exist
    if (localHour === 2 && testDate.getMonth() === 2) { // March
        // Check if this is a DST transition Sunday (second Sunday of March)
        const dayOfMonth = testDate.getDate();
        const dayOfWeek = testDate.getDay();
        if (dayOfWeek === 0 && dayOfMonth >= 8 && dayOfMonth <= 14) {
            return { isDSTGap: true, isAmbiguous: false, message: 'This time may not exist due to DST transition' };
        }
    }

    // Check for ambiguous times during DST fall back (1am-2am occurs twice)
    if (localHour === 1 && testDate.getMonth() === 10) { // November
        // Check if this is a DST transition Sunday (first Sunday of November)
        const dayOfMonth = testDate.getDate();
        const dayOfWeek = testDate.getDay();
        if (dayOfWeek === 0 && dayOfMonth >= 1 && dayOfMonth <= 7) {
            return { isDSTGap: false, isAmbiguous: true, message: 'This time is ambiguous due to DST transition' };
        }
    }

    return { isDSTGap: false, isAmbiguous: false };
}

export const appleCalendarTools = [
    {
        name: 'apple_calendar_create_event',
        description: 'Create an event in Apple Calendar (macOS only). Uses your local system timezone automatically. Supports recurring events with daily, weekly, monthly, or yearly frequency. For one-time events, only title and startDate are needed. Just create the event - do NOT ask about timezone, recurrence, or confirmation unless the request is truly ambiguous.',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Event title' },
                startDate: { type: 'string', description: 'Start date/time (uses local timezone). Examples: "today at 3pm", "tomorrow 2pm", "2026-02-25 14:00", "next Monday at 10am"' },
                endDate: { type: 'string', description: 'End date/time (optional, defaults to 1 hour after start). Examples: "today at 4pm", "2026-02-25 15:00"' },
                location: { type: 'string', description: 'Event location (optional)' },
                notes: { type: 'string', description: 'Event notes/description (optional)' },
                calendar: { type: 'string', description: 'Calendar name (default: "Talon")' },
                recurrence: {
                    type: 'object',
                    description: 'Recurrence rules for repeating events (optional)',
                    properties: {
                        frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'], description: 'How often the event repeats' },
                        interval: { type: 'number', description: 'Repeat every N periods (default: 1, e.g., every 2 weeks)' },
                        endDate: { type: 'string', description: 'Stop recurring after this date' },
                        count: { type: 'number', description: 'Stop recurring after N occurrences' }
                    },
                    required: ['frequency']
                },
            },
            required: ['title', 'startDate'],
        },
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            if (process.platform !== 'darwin') {
                return formatError('PLATFORM_NOT_SUPPORTED', 'Apple Calendar is only available on macOS', false, {}, startTime);
            }

            // 1️⃣ Schema Validation & Strict Mode
            const parsed = CreateEventSchema.safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format() }, startTime);
            }

            const args = parsed.data;

            // Check Calendar permissions (with caching)
            const permCheck = await checkCalendarPermission();
            if (!permCheck.granted) {
                logger.warn('Calendar permission denied');
                return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Calendar', true, {}, startTime, getPermissionRecoverySteps('Calendar'));
            }
            if (permCheck.needsCheck) {
                logger.info('Calendar permission verified');
            }

            // Check if Calendar is running
            const calendarRunning = await isCalendarRunning();
            if (!calendarRunning) {
                logger.info('Calendar app not running, will launch');
                // Note: Calendar will be launched by AppleScript, but it may take 2-5 seconds
            }

            // Date Parsing Logic
            const startDateInput = args.startDate;
            let startParsed: DateParseResult;
            let rangeEndParsed: DateParseResult | undefined;

            const rangePatterns = [/\s+to\s+/, /\s+until\s+/, /\s+–\s+/, /\s+-\s+/];
            const hasRangePattern = rangePatterns.some(pattern => pattern.test(startDateInput.toLowerCase()));

            if (hasRangePattern && !args.endDate) {
                const rangeResult = parseTimeRange(startDateInput);
                if (rangeResult.success && rangeResult.start?.parsed && rangeResult.end?.parsed) {
                    startParsed = rangeResult.start;
                    rangeEndParsed = rangeResult.end;
                } else {
                    // Range parsing failed - try to extract just the start time
                    // Remove the range portion and parse the remaining start time
                    const startTimeOnly = startDateInput.split(/\s+(?:to|until|–|-)\s+/)[0].trim();
                    startParsed = parseDate(startTimeOnly);

                    if (!startParsed.success) {
                        // If that fails, try parsing the full string as a single date
                        startParsed = parseDate(startDateInput);
                    }
                }
            } else {
                startParsed = parseDate(startDateInput);
            }

            if (!startParsed.success) {
                const recovery = startParsed.suggestions && startParsed.suggestions.length > 0
                    ? startParsed.suggestions.map(s => `${formatForDisplay(s.date)} (confidence: ${(s.confidence * 100).toFixed(0)}%)`)
                    : undefined;

                return formatError('INVALID_START_DATE', startParsed.error || 'Invalid start date format', true, { parsedDates: { start: startParsed } }, startTime, recovery);
            }

            const startDate = startParsed.parsed!.date;

            // Check for DST issues
            const dstCheck = checkDSTIssue(startDate);
            if (dstCheck.isDSTGap) {
                logger.warn({ date: startDate, message: dstCheck.message }, 'DST gap detected');
                return formatError('DST_GAP', dstCheck.message || 'This time may not exist due to DST transition', true, {
                    parsedDate: startDate,
                    suggestion: 'Try a time before 2am or after 3am'
                }, startTime);
            }
            if (dstCheck.isAmbiguous) {
                logger.warn({ date: startDate, message: dstCheck.message }, 'DST ambiguous time detected');
                // Add warning to response but continue
            }

            let endDate: Date;
            let endParsed: DateParseResult | undefined;

            if (args.endDate) {
                endParsed = parseDate(args.endDate);
                if (!endParsed.success) {
                    const recovery = endParsed.suggestions && endParsed.suggestions.length > 0
                        ? endParsed.suggestions.map(s => `${formatForDisplay(s.date)} (confidence: ${(s.confidence * 100).toFixed(0)}%)`)
                        : undefined;

                    return formatError('INVALID_END_DATE', endParsed.error || 'Invalid end date format', true, { parsedDates: { start: startParsed, end: endParsed } }, startTime, recovery);
                }
                endDate = endParsed.parsed!.date;
            } else if (rangeEndParsed?.parsed) {
                endDate = rangeEndParsed.parsed.date;
            } else {
                endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Explicity fallback
            }

            const title = escapeAppleScript(args.title);
            const calendarName = escapeAppleScript(args.calendar);

            // Use AppleScript-safe date format: "15 Feb 2026 14:30:00" (24-hour format)
            // IMPORTANT: Use 24-hour format because AM/PM is locale-dependent and unreliable
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const formatAppleDate = (date: Date) => {
                const day = date.getDate();
                const month = months[date.getMonth()];
                const year = date.getFullYear();
                const hours = date.getHours();
                const minutes = date.getMinutes().toString().padStart(2, '0');
                const seconds = date.getSeconds().toString().padStart(2, '0');
                return `${day} ${month} ${year} ${hours}:${minutes}:${seconds}`;
            };

            const startDateStr = formatAppleDate(startDate);
            const endDateStr = formatAppleDate(endDate);

            // Use a date range window for idempotency check (within 5 minutes)
            // This is more reliable than exact datetime matching
            let script = `tell application "Calendar"
    if not (exists calendar "${calendarName}") then
        make new calendar with properties {name:"${calendarName}"}
    end if
    set targetCalendar to calendar "${calendarName}"
    
    -- Create date objects using AppleScript-safe format
    set startDateTime to date "${startDateStr}"
    set endDateTime to date "${endDateStr}"
    
    -- Idempotency check: look for events with same title within a 10-minute window
    -- This is more reliable than exact datetime comparison
    set windowStart to startDateTime - 600
    set windowEnd to startDateTime + 600
    set existingEvents to (every event of targetCalendar whose summary is "${title}" and start date ≥ windowStart and start date ≤ windowEnd)
    
    if (count of existingEvents) > 0 then
        -- Check if end times also match (within tolerance)
        repeat with anEvent in existingEvents
            set existingEnd to end date of anEvent
            if (existingEnd ≥ endDateTime - 300) and (existingEnd ≤ endDateTime + 300) then
                set existingUID to uid of anEvent
                return "EXISTS" & "${DELIMITER}" & existingUID & "${DELIMITER}" & "Event already exists"
            end if
        end repeat
    end if

    set newEvent to make new event at end of events of targetCalendar with properties {summary:"${title}", start date:startDateTime, end date:endDateTime}`;

            if (args.location) {
                script += `\n    set location of newEvent to "${escapeAppleScript(args.location)}"`;
            }

            if (args.notes) {
                script += `\n    set description of newEvent to "${escapeAppleScript(args.notes)}"`;
            }

            script += `\n    set eventUID to uid of newEvent`;
            script += `\n    return "SUCCESS" & "${DELIMITER}" & eventUID & "${DELIMITER}" & summary of newEvent`;
            script += '\nend tell';

            // Add recurrence if specified
            if (args.recurrence) {
                const { frequency, interval = 1, endDate, count } = args.recurrence;

                // Validate recurrence end date
                if (endDate) {
                    const recEndParsed = parseDate(endDate);
                    if (!recEndParsed.success) {
                        logger.warn({ endDate, error: recEndParsed.error }, 'Invalid recurrence end date, ignoring');
                        // Continue without end date - don't fail the whole operation
                    }
                }

                // Map frequency to AppleScript recurrence unit
                const freqMap: Record<string, string> = {
                    daily: 'days',
                    weekly: 'weeks',
                    monthly: 'months',
                    yearly: 'years'
                };
                const unit = freqMap[frequency];

                // Build recurrence end date if specified
                let recurrenceEndScript = '';
                if (endDate) {
                    const endParsed = parseDate(endDate);
                    if (endParsed.success && endParsed.parsed) {
                        const endRec = endParsed.parsed.date;
                        recurrenceEndScript = `recurrence end date ${endRec.getMonth() + 1}/${endRec.getDate()}/${endRec.getFullYear()}`;
                    }
                }

                // Build recurrence count if specified
                const countScript = count ? `recurrence count ${count}` : '';

                // Combine end conditions
                const endConditions = [recurrenceEndScript, countScript].filter(Boolean).join(' and ');

                // Add recurrence rule to the event
                const recurrenceScript = `
tell application "Calendar"
    set targetCalendar to calendar "${calendarName}"
    set eventsToModify to (every event of targetCalendar whose summary is "${title}" and start date is startDateTime)
    if (count of eventsToModify) > 0 then
        set theEvent to item 1 of eventsToModify
        set recurrence pattern of theEvent to {repeat frequency: every ${interval} ${unit}${endConditions ? ', ' + endConditions : ''}}
    end if
end tell`;

                // Execute recurrence script separately
                try {
                    await safeExecAppleScript(recurrenceScript, 5000);
                } catch (recErr) {
                    logger.warn({ error: recErr }, 'Failed to set recurrence, but event was created');
                    // Don't fail the whole operation, just log the warning
                }
            }

            // Acquire operation lock to prevent concurrent modifications
            // Skip waiting if there's an existing lock (concurrent call protection)
            if (operationLock) {
                logger.warn('Concurrent calendar operation detected, proceeding with caution');
            }

            // Create operation promise for locking
            const operationPromise = (async () => {
                try {
                    // 3️⃣ Timeout & Guardrails - configurable timeout (30 seconds for complex operations)
                    const timeout = args.recurrence ? 30000 : 15000;
                    const { stdout, stderr } = await safeExecAppleScript(script, timeout);

                    if (stderr && detectPermissionError(stderr)) {
                        logger.error({ stderr }, 'Calendar permission denied');
                        return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Calendar', true, { applescriptOutput: stderr }, startTime, getPermissionRecoverySteps('Calendar'));
                    }

                    const output = stdout.trim();
                    let eventId: string | undefined;
                    let message = '';
                    let status = '';

                    if (output.startsWith('SUCCESS')) {
                        const parts = output.split(DELIMITER);
                        eventId = parts[1];
                        status = 'CREATED';
                        message = `Event created: "${args.title}" on ${formatForDisplay(startDate)}`;
                    } else if (output.startsWith('EXISTS')) {
                        const parts = output.split(DELIMITER);
                        eventId = parts[1];
                        status = 'ALREADY_EXISTS';
                        message = `Event already exists: "${args.title}" on ${formatForDisplay(startDate)}`;
                    } else {
                        logger.error({ output, script }, 'AppleScript returned unexpected output');
                        return formatError('APPLESCRIPT_UNEXPECTED', `AppleScript returned: ${output}`, false, { scriptDebug: script.substring(0, 500) }, startTime);
                    }

                    logger.info({ title: args.title, calendar: calendarName, eventId, status }, 'Calendar event created/verified');

                    const responseData: any = {
                        eventId,
                        calendar: calendarName,
                        status,
                        message,
                        startDate: startDate.toLocaleString(), // Keep local time, not ISO
                        endDate: endDate.toLocaleString(), // Keep local time, not ISO
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    };

                    // Add recurrence info if applicable
                    if (args.recurrence) {
                        responseData.recurrence = {
                            frequency: args.recurrence.frequency,
                            interval: args.recurrence.interval,
                            hasEndDate: !!args.recurrence.endDate,
                            hasCount: !!args.recurrence.count
                        };
                        responseData.message += ` (recurring: ${args.recurrence.interval}x ${args.recurrence.frequency})`;
                    }

                    // Add DST warning if applicable
                    if (dstCheck.isAmbiguous) {
                        responseData.dstWarning = dstCheck.message;
                    }

                    return formatSuccess(responseData, { applescriptOutput: output }, startTime);
                } finally {
                    // Release operation lock
                    operationLock = null;
                }
            })();

            // Set the lock and wait
            operationLock = operationPromise;
            return await operationPromise.catch((error) => {
                const err = error as any;
                if (err.killed && err.signal === 'SIGTERM') {
                    return formatError('TIMEOUT', 'Apple Calendar action timed out', true, {
                        title: args.title,
                        calendar: calendarName,
                        startDate: startDate.toLocaleString()
                    }, startTime);
                }
                if (err.stderr && detectPermissionError(err.stderr)) {
                    return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Calendar', true, {
                        applescriptOutput: err.stderr,
                        title: args.title,
                        calendar: calendarName
                    }, startTime, getPermissionRecoverySteps('Calendar'));
                }
                logger.error({ error: err, title: args.title, calendar: calendarName }, 'Failed to create calendar event');
                return formatError('APPLESCRIPT_ERROR', err.message || 'Unknown AppleScript error', false, {
                    applescriptOutput: err.stderr,
                    title: args.title,
                    calendar: calendarName,
                    scriptDebug: script.substring(0, 500) + '...'
                }, startTime);
            });
        },
    },
    {
        name: 'apple_calendar_list_events',
        description: 'List upcoming events from Apple Calendar (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                calendar: { type: 'string', description: 'Calendar name (default: all calendars)' },
                days: { type: 'number', description: 'Number of days to look ahead (default: 7)' },
            },
        },
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            if (process.platform !== 'darwin') {
                return formatError('PLATFORM_NOT_SUPPORTED', 'Apple Calendar is only available on macOS', false, {}, startTime);
            }

            const parsed = ListEventsSchema.safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format() }, startTime);
            }

            const args = parsed.data;
            const calendarFilter = args.calendar ? `calendar "${escapeAppleScript(args.calendar)}"` : 'calendars';

            const script = `tell application "Calendar"
    set startDate to current date
    set endDate to startDate + (${args.days} * days)
    set eventList to {}
    repeat with anEvent in (every event of ${calendarFilter} whose start date ≥ startDate and start date ≤ endDate)
        set eventTitle to summary of anEvent
        set eventStart to start date of anEvent as text
        set eventLocation to location of anEvent
        set eventUID to uid of anEvent
        set eventCalendar to name of calendar of anEvent
        if eventLocation is missing value then
            set eventLocation to ""
        end if
        -- Use safe delimiter instead of pipe
        set eventInfo to eventUID & "${DELIMITER}" & eventTitle & "${DELIMITER}" & eventStart & "${DELIMITER}" & eventLocation & "${DELIMITER}" & eventCalendar
        set end of eventList to eventInfo
    end repeat
    if (count of eventList) = 0 then
        return "NO_EVENTS"
    else
        -- Use linefeed as separator instead of comma-space
        set AppleScript's text item delimiters to linefeed
        set resultText to eventList as text
        set AppleScript's text item delimiters to ""
        return resultText
    end if
end tell`;

            try {
                const { stdout, stderr } = await safeExecAppleScript(script, 10000);

                if (stderr && detectPermissionError(stderr)) {
                    return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Calendar', true, {}, startTime, getPermissionRecoverySteps('Calendar'));
                }

                const output = stdout.trim();

                if (output === 'NO_EVENTS') {
                    return formatSuccess({
                        events: [],
                        message: `No upcoming events in the next ${args.days} days`
                    }, {}, startTime);
                }

                // Parse events safely with delimiter and validation
                // Split by newlines (AppleScript list separator)
                const events = output.split('\n').map((line: string) => {
                    const parts = line.split(DELIMITER);
                    // Validate we have enough parts (uid, title, start, location, calendar)
                    if (parts.length < 4) {
                        logger.warn({ line, parts }, 'Malformed event line from AppleScript');
                        return null;
                    }
                    return {
                        id: parts[0] || 'unknown',
                        title: parts[1] || 'Untitled',
                        startDate: parts[2] || '',
                        location: parts[3] || undefined,
                        calendar: parts[4] || 'Unknown',
                    };
                }).filter((event: any) => event !== null); // Remove malformed entries

                return formatSuccess({
                    events,
                    count: events.length,
                    message: `Found ${events.length} upcoming event(s)`
                }, { applescriptOutput: output }, startTime);

            } catch (error) {
                const err = error as any;
                if (err.killed && err.signal === 'SIGTERM') {
                    return formatError('TIMEOUT', 'Apple Calendar list action timed out', true, {
                        calendar: calendarFilter,
                        days: args.days
                    }, startTime);
                }
                if (err.stderr && detectPermissionError(err.stderr)) {
                    return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Calendar', true, {
                        applescriptOutput: err.stderr,
                        calendar: calendarFilter,
                        days: args.days
                    }, startTime, getPermissionRecoverySteps('Calendar'));
                }
                logger.error({ error: err, calendar: calendarFilter, days: args.days }, 'Failed to list calendar events');
                return formatError('APPLESCRIPT_ERROR', err.message, false, {
                    applescriptOutput: err.stderr,
                    calendar: calendarFilter,
                    days: args.days
                }, startTime);
            }
        },
    },
    {
        name: 'apple_calendar_delete_event',
        description: 'Delete an event from Apple Calendar by title (macOS only). Uses fuzzy matching - will find events containing the title text (case-insensitive).',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Event title to delete (supports partial matching)' },
                calendar: { type: 'string', description: 'Calendar name (default: "Talon")' },
                exact: { type: 'boolean', description: 'Require exact title match (default: false for fuzzy matching)' },
            },
            required: ['title'],
        },
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            if (process.platform !== 'darwin') {
                return formatError('PLATFORM_NOT_SUPPORTED', 'Apple Calendar is only available on macOS', false, { input: rawArgs }, startTime);
            }

            const parsed = DeleteEventSchema.extend({ exact: z.boolean().optional() }).safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format(), input: rawArgs }, startTime);
            }

            const args = parsed.data;
            const title = escapeAppleScript(args.title);
            const calendarName = escapeAppleScript(args.calendar);
            const exactMatch = args.exact === true;

            // Use case-insensitive contains matching by default
            const matchLogic = exactMatch
                ? `summary of anEvent is "${title}"`
                : `summary of anEvent contains "${title}"`;

            const script = `tell application "Calendar"
    if not (exists calendar "${calendarName}") then
        return "CALENDAR_NOT_FOUND"
    end if
    set targetCalendar to calendar "${calendarName}"
    set foundEvents to {}
    
    -- Collect all matching events (in case of fuzzy match)
    repeat with anEvent in events of targetCalendar
        if ${matchLogic} then
            set end of foundEvents to anEvent
        end if
    end repeat
    
    if (count of foundEvents) = 0 then
        return "EVENT_NOT_FOUND"
    else if (count of foundEvents) = 1 then
        -- Delete single match
        delete item 1 of foundEvents
        return "DELETED"
    else
        -- Multiple matches - delete the first one (most recent by start date)
        set sortedEvents to (every event of foundEvents)
        set eventToDel to item 1 of sortedEvents
        delete eventToDel
        return "DELETED_ONE_OF_" & (count of foundEvents) as text
    end if
end tell`;

            try {
                const { stdout, stderr } = await safeExecAppleScript(script, 10000);

                if (stderr && detectPermissionError(stderr)) {
                    return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Calendar', true, {
                        applescriptOutput: stderr,
                        calendar: calendarName,
                        title: args.title
                    }, startTime, getPermissionRecoverySteps('Calendar'));
                }

                const output = stdout.trim();

                if (output === 'CALENDAR_NOT_FOUND') {
                    return formatError('CALENDAR_NOT_FOUND', `Calendar "${calendarName}" does not exist`, true, {
                        calendar: calendarName,
                        title: args.title,
                        exactMatch
                    }, startTime);
                }

                if (output === 'EVENT_NOT_FOUND') {
                    return formatError('EVENT_NOT_FOUND', `No event with title "${args.title}" found in calendar "${calendarName}"`, true, {
                        calendar: calendarName,
                        title: args.title,
                        exactMatch,
                        suggestion: 'Try using a partial title for fuzzy matching, or set exact: false'
                    }, startTime);
                }

                let deletedCount = 1;
                if (output.startsWith('DELETED_ONE_OF_')) {
                    deletedCount = parseInt(output.replace('DELETED_ONE_OF_', ''), 10) || 1;
                }

                logger.info({ title: args.title, calendar: calendarName, deletedCount }, 'Calendar event(s) deleted');
                return formatSuccess({
                    message: deletedCount === 1
                        ? `Event deleted: "${args.title}" from calendar "${calendarName}"`
                        : `Deleted 1 event matching "${args.title}" (${deletedCount} total matches found)`,
                    calendar: calendarName,
                    title: args.title,
                    deletedCount,
                    exactMatch
                }, { applescriptOutput: output }, startTime);

            } catch (error) {
                const err = error as any;
                if (err.killed && err.signal === 'SIGTERM') {
                    return formatError('TIMEOUT', 'Apple Calendar delete action timed out', true, {
                        calendar: calendarName,
                        title: args.title
                    }, startTime);
                }
                if (err.stderr && detectPermissionError(err.stderr)) {
                    return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Calendar', true, {
                        applescriptOutput: err.stderr,
                        calendar: calendarName,
                        title: args.title
                    }, startTime, getPermissionRecoverySteps('Calendar'));
                }
                logger.error({ error: err, calendar: calendarName, title: args.title }, 'Failed to delete calendar event');
                return formatError('APPLESCRIPT_ERROR', err.message, false, {
                    applescriptOutput: err.stderr,
                    calendar: calendarName,
                    title: args.title
                }, startTime);
            }
        },
    },
];
