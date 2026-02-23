#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════════════
// APPLE CALENDAR TOOL TEST HARNESS
// ═══════════════════════════════════════════════════════════════════════════
// 
// Purpose: Isolate the Apple Calendar tool from Talon's agent layer
//          to determine if bugs are in the tool itself or in Talon.
//
// Usage:
//   npm run build
//   node scripts/test-calendar-tool.mjs
//   node scripts/test-calendar-tool.mjs --test "ISO format"
//
// ═══════════════════════════════════════════════════════════════════════════

import { appleCalendarTools } from '../dist/tools/apple-calendar.js';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
    cleanupEvents: true,        // Delete test events after verification
    verbose: true,              // Debug logging
    defaultCalendar: 'Talon',   // Default calendar for tests
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════════════

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

const TESTS = [
    {
        name: 'ISO format (YYYY-MM-DD HH:MM)',
        args: {
            title: '[TEST] ISO Format',
            startDate: '2026-02-23 10:00',
            endDate: '2026-02-23 11:00'
        },
        expected: {
            year: 2026,
            month: 2,  // February (1-indexed)
            day: 23,
            hour: 10,
            minute: 0
        }
    },
    {
        name: 'Natural language - today at 3pm',
        args: {
            title: '[TEST] Today 3pm',
            startDate: 'today at 3pm'
        },
        expected: {
            year: today.getFullYear(),
            month: today.getMonth() + 1,
            day: today.getDate(),
            hour: 15,  // 3pm = 15:00
            minute: 0
        }
    },
    {
        name: 'Time range - 3:30pm to 4:30pm today',
        args: {
            title: '[TEST] Time Range',
            startDate: '3:30pm to 4:30pm today'
        },
        expected: {
            year: today.getFullYear(),
            month: today.getMonth() + 1,
            day: today.getDate(),
            hour: 15,  // 3:30pm = 15:30
            minute: 30
        }
    },
    {
        name: 'Relative date - tomorrow at 9am',
        args: {
            title: '[TEST] Tomorrow 9am',
            startDate: 'tomorrow at 9am'
        },
        expected: {
            year: tomorrow.getFullYear(),
            month: tomorrow.getMonth() + 1,
            day: tomorrow.getDate(),
            hour: 9,
            minute: 0
        }
    },
    {
        name: 'MM/DD/YYYY format',
        args: {
            title: '[TEST] MM/DD/YYYY',
            startDate: '2/25/2026 14:00',
            endDate: '2/25/2026 15:00'
        },
        expected: {
            year: 2026,
            month: 2,
            day: 25,
            hour: 14,
            minute: 0
        }
    },
    {
        name: 'Explicit end date',
        args: {
            title: '[TEST] Explicit End',
            startDate: '2026-02-24 15:00',
            endDate: '2026-02-24 16:30'
        },
        expected: {
            year: 2026,
            month: 2,
            day: 24,
            hour: 15,
            minute: 0
        },
        expectedEnd: {
            year: 2026,
            month: 2,
            day: 24,
            hour: 16,
            minute: 30
        }
    },
    {
        name: 'Specific calendar - Personal',
        args: {
            title: '[TEST] Personal Calendar',
            startDate: 'today at 5pm',
            calendar: 'Personal'
        },
        expected: {
            year: today.getFullYear(),
            month: today.getMonth() + 1,
            day: today.getDate(),
            hour: 17,  // 5pm = 17:00
            minute: 0
        }
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function logDebug(...args) {
    if (CONFIG.verbose) {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
        console.log(`[${timestamp}]`, ...args);
    }
}

function logSection(title) {
    console.log('\n' + '═'.repeat(70));
    console.log(`  ${title}`);
    console.log('═'.repeat(70));
}

function logResult(passed, message) {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${message}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLESCRIPT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function runAppleScript(script) {
    const tempFile = join(tmpdir(), `test-calendar-${Date.now()}.scpt`);
    writeFileSync(tempFile, script, 'utf-8');
    
    try {
        const result = execSync(`osascript "${tempFile}"`, { 
            encoding: 'utf-8',
            timeout: 10000
        });
        return { success: true, output: result.trim() };
    } catch (err) {
        return { 
            success: false, 
            error: err.stderr?.toString() || err.message,
            stdout: err.stdout?.toString()
        };
    } finally {
        try { unlinkSync(tempFile); } catch (e) {}
    }
}

function queryEventByUID(uid) {
    const script = `tell application "Calendar"
    set targetUID to "${uid}"
    repeat with aCalendar in calendars
        repeat with anEvent in events of aCalendar
            if uid of anEvent is targetUID then
                set eventTitle to summary of anEvent
                set eventStart to start date of anEvent as text
                set eventEnd to end date of anEvent as text
                set eventCalendar to name of aCalendar
                return eventTitle & "|" & eventStart & "|" & eventEnd & "|" & eventCalendar
            end if
        end repeat
    end repeat
    return "NOT_FOUND"
end tell`;
    
    const result = runAppleScript(script);
    
    if (!result.success || result.output === 'NOT_FOUND') {
        return { found: false };
    }
    
    const parts = result.output.split('|');
    return {
        found: true,
        title: parts[0],
        startDate: parts[1],
        endDate: parts[2],
        calendar: parts[3]
    };
}

function deleteEventByTitle(title, calendarName) {
    const script = `tell application "Calendar"
    if not (exists calendar "${calendarName}") then
        return "CALENDAR_NOT_FOUND"
    end if
    set targetCalendar to calendar "${calendarName}"
    set found to false
    repeat with anEvent in events of targetCalendar
        if summary of anEvent is "${title}" then
            delete anEvent
            set found to true
            exit repeat
        end if
    end repeat
    if found then
        return "DELETED"
    else
        return "EVENT_NOT_FOUND"
    end if
end tell`;
    
    return runAppleScript(script);
}

function listAllCalendars() {
    const script = `tell application "Calendar"
    set calNames to name of every calendar
    return calNames as text
end tell`;
    
    const result = runAppleScript(script);
    if (result.success) {
        return result.output.split(', ').map(c => c.trim());
    }
    return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// DATE COMPARISON HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function parseAppleScriptDate(dateStr) {
    // AppleScript returns dates in various formats depending on locale:
    // - "Sunday, February 23, 2026 at 10:00:00 AM" (US)
    // - "Sunday, 22 February 2026 at 15:00:00" (24-hour, no AM/PM)
    // - "Monday, 23 February 2026 at 09:00:00"
    
    // Try format 1: "Day, Month DD, YYYY at HH:MM:SS AM/PM"
    let match = dateStr.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+):(\d+)\s+(AM|PM)/i);
    
    if (match) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
        
        let hour = parseInt(match[5]);
        const minute = parseInt(match[6]);
        const meridiem = match[8].toUpperCase();
        
        if (meridiem === 'PM' && hour < 12) hour += 12;
        if (meridiem === 'AM' && hour === 12) hour = 0;
        
        return {
            year: parseInt(match[4]),
            month: months.indexOf(match[2]) + 1,
            day: parseInt(match[3]),
            hour,
            minute
        };
    }
    
    // Try format 2: "Day, DD Month YYYY at HH:MM:SS" (24-hour, no AM/PM)
    match = dateStr.match(/(\w+),\s+(\d+)\s+(\w+)\s+(\d+)\s+at\s+(\d+):(\d+):(\d+)/i);
    
    if (match) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
        
        return {
            year: parseInt(match[4]),
            month: months.indexOf(match[3]) + 1,
            day: parseInt(match[2]),
            hour: parseInt(match[5]),
            minute: parseInt(match[6])
        };
    }
    
    return null;
}

function compareDates(actual, expected) {
    const issues = [];
    
    if (actual.year !== expected.year) {
        issues.push(`Year: expected ${expected.year}, got ${actual.year}`);
    }
    if (actual.month !== expected.month) {
        issues.push(`Month: expected ${expected.month}, got ${actual.month}`);
    }
    if (actual.day !== expected.day) {
        issues.push(`Day: expected ${expected.day}, got ${actual.day}`);
    }
    if (actual.hour !== expected.hour) {
        issues.push(`Hour: expected ${expected.hour}, got ${actual.hour}`);
    }
    if (actual.minute !== expected.minute) {
        issues.push(`Minute: expected ${expected.minute}, got ${actual.minute}`);
    }
    
    return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTest(test) {
    logSection(`TEST: ${test.name}`);
    
    const result = {
        name: test.name,
        passed: false,
        issues: [],
        details: {}
    };
    
    // Get the tool
    const tool = appleCalendarTools.find(t => t.name === 'apple_calendar_create_event');
    
    if (!tool) {
        result.issues.push('Tool not found in registry');
        logResult(false, 'Tool not found');
        return result;
    }
    
    // Log input
    logDebug('INPUT ARGS:', JSON.stringify(test.args, null, 2));
    logDebug('EXPECTED DATE:', test.expected);
    
    try {
        // Execute tool
        logDebug('\n--- EXECUTING TOOL ---');
        const startTime = Date.now();
        const rawResult = await tool.execute(test.args);
        const duration = Date.now() - startTime;
        
        logDebug(`Duration: ${duration}ms`);
        logDebug('\nRAW OUTPUT:');
        console.log(rawResult);
        
        // Parse result
        const parsed = JSON.parse(rawResult);
        result.details.parsedResult = parsed;
        
        logDebug('\nPARSED RESULT:', JSON.stringify(parsed, null, 2));
        
        // Check if tool succeeded
        if (!parsed.success) {
            result.issues.push(`Tool returned error: ${parsed.error?.code} - ${parsed.error?.message}`);
            logResult(false, `Tool error: ${parsed.error?.code}`);
            return result;
        }
        
        // Verify event exists in Calendar
        logDebug('\n--- VERIFYING EVENT IN CALENDAR ---');
        
        // Handle both old format (eventId at root) and new format (eventId in data)
        const eventId = parsed.eventId || parsed.data?.eventId;
        const calendarUsed = parsed.calendar || parsed.data?.calendar;
        
        if (!eventId) {
            result.issues.push('No eventId returned from tool');
            logResult(false, 'No eventId returned');
            return result;
        }
        
        logDebug(`Querying event UID: ${eventId}`);
        const verification = queryEventByUID(eventId);
        result.details.verification = verification;
        
        logDebug('VERIFICATION RESULT:', verification);
        
        if (!verification.found) {
            result.issues.push('Event not found in Calendar.app');
            logResult(false, 'Event not found in Calendar.app');
            return result;
        }
        
        logDebug(`Event found in "${verification.calendar}" calendar`);
        logDebug(`Title: ${verification.title}`);
        logDebug(`Start: ${verification.startDate}`);
        logDebug(`End: ${verification.endDate}`);
        
        // Compare dates
        logDebug('\n--- DATE COMPARISON ---');
        
        const actualDate = parseAppleScriptDate(verification.startDate);
        logDebug('Actual date components:', actualDate);
        logDebug('Expected date components:', test.expected);
        
        if (!actualDate) {
            result.issues.push(`Could not parse AppleScript date: ${verification.startDate}`);
            logResult(false, 'Date parsing failed');
            return result;
        }
        
        const dateIssues = compareDates(actualDate, test.expected);
        
        if (dateIssues.length > 0) {
            result.issues.push(...dateIssues);
            dateIssues.forEach(issue => logDebug(`❌ ${issue}`));
        } else {
            logDebug('✅ Start date matches expected');
        }
        
        // Check end date if specified
        if (test.expectedEnd) {
            const actualEndDate = parseAppleScriptDate(verification.endDate);
            logDebug('Actual end date components:', actualEndDate);
            logDebug('Expected end date components:', test.expectedEnd);
            
            const endIssues = compareDates(actualEndDate, test.expectedEnd);
            
            if (endIssues.length > 0) {
                result.issues.push(...endIssues.map(i => `End ${i}`));
                endIssues.forEach(issue => logDebug(`❌ End ${issue}`));
            } else {
                logDebug('✅ End date matches expected');
            }
        }
        
        // Final verdict
        result.passed = result.issues.length === 0;
        
        if (result.passed) {
            logResult(true, 'All checks passed');
        } else {
            logResult(false, `${result.issues.length} issue(s) found`);
        }
        
        // Cleanup
        if (CONFIG.cleanupEvents && eventId) {
            logDebug('\n--- CLEANUP ---');
            const calendarToClean = calendarUsed || CONFIG.defaultCalendar;
            const cleanupResult = deleteEventByTitle(test.args.title, calendarToClean);
            logDebug(`Cleanup result: ${cleanupResult.output || cleanupResult.error}`);
        }
        
    } catch (err) {
        result.issues.push(`Exception: ${err.message}`);
        result.details.exception = {
            message: err.message,
            stack: err.stack
        };
        logResult(false, `Exception: ${err.message}`);
        logDebug('Stack:', err.stack);
    }
    
    return result;
}

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║         APPLE CALENDAR TOOL TEST HARNESS                            ║');
    console.log('║         Isolated Testing (Bypasses Talon Agent Layer)               ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    // Check prerequisites
    logSection('PREREQUISITES CHECK');
    
    if (process.platform !== 'darwin') {
        console.log('❌ This test requires macOS');
        process.exit(1);
    }
    logResult(true, 'Running on macOS');
    
    const calendars = listAllCalendars();
    logResult(true, `Found ${calendars.length} calendars: ${calendars.slice(0, 5).join(', ')}...`);
    
    // Filter tests if --test flag provided
    const args = process.argv.slice(2);
    const testFilter = args.find(a => a.startsWith('--test='))?.split('=')[1];
    const testsToRun = testFilter 
        ? TESTS.filter(t => t.name.toLowerCase().includes(testFilter.toLowerCase()))
        : TESTS;
    
    if (testsToRun.length === 0) {
        console.log(`\n❌ No tests match filter: "${testFilter}"`);
        console.log('Available tests:', TESTS.map(t => t.name).join(', '));
        process.exit(1);
    }
    
    console.log(`\n📋 Running ${testsToRun.length} test(s)${testFilter ? ` (filtered by: "${testFilter}")` : ''}`);
    
    // Run tests
    const results = [];
    for (const test of testsToRun) {
        const result = await runTest(test);
        results.push(result);
    }
    
    // Summary
    logSection('SUMMARY');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    console.log(`\n📊 Results: ${passed}/${results.length} passed, ${failed} failed\n`);
    
    // Results table
    console.table(results.map(r => ({
        'Test': r.name,
        'Passed': r.passed ? '✅' : '❌',
        'Issues': r.issues.length
    })));
    
    // Detailed failures
    if (failed > 0) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('FAILURE DETAILS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        for (const result of results.filter(r => !r.passed)) {
            console.log(`\n❌ ${result.name}:`);
            result.issues.forEach(issue => console.log(`   • ${issue}`));
        }
    }
    
    // Diagnosis
    logSection('DIAGNOSIS');
    
    if (passed === results.length) {
        console.log('\n✅ ALL TESTS PASSED');
        console.log('\n→ The tool is working correctly.');
        console.log('→ If events don\'t appear in Talon, the issue is in Talon\'s agent layer.');
    } else {
        console.log('\n⚠️  SOME TESTS FAILED');
        console.log('\n→ The tool has issues that need to be fixed.');
        console.log('→ Review the failure details above to identify root causes.');
        
        // Identify patterns
        const yearIssues = results.filter(r => r.issues.some(i => i.includes('Year:')));
        const monthIssues = results.filter(r => r.issues.some(i => i.includes('Month:')));
        const dayIssues = results.filter(r => r.issues.some(i => i.includes('Day:')));
        
        if (yearIssues.length > 0 || monthIssues.length > 0 || dayIssues.length > 0) {
            console.log('\n🔍 PATTERN DETECTED: Date component mismatches');
            console.log('   This likely indicates an AppleScript date format / locale issue.');
            console.log('   The tool may be using MM/DD/YYYY but system expects DD/MM/YYYY or vice versa.');
        }
    }
    
    console.log('\n');
    
    // Exit code
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('\n💥 FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
});
