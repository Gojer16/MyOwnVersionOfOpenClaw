// ─── Date Parser Utility ──────────────────────────────────────────
// Flexible date parsing supporting ISO, natural language, and relative dates

export interface ParsedDate {
    date: Date;
    confidence: number; // 0-1, where 1 is certain
    format: string;
    original: string;
}

export interface DateParseResult {
    success: boolean;
    parsed?: ParsedDate;
    suggestions?: ParsedDate[];
    error?: string;
}

/**
 * Parse a date string with multiple format support
 */
export function parseDate(input: string): DateParseResult {
    const trimmed = input.trim();
    const now = new Date();

    // Try parsers in order of specificity
    const parsers = [
        parseISO8601,
        parseRelativeDate,
        parseNaturalLanguage,
        parseCommonFormats,
    ];

    const results: ParsedDate[] = [];

    for (const parser of parsers) {
        const result = parser(trimmed, now);
        if (result) {
            results.push(result);
        }
    }

    if (results.length === 0) {
        return {
            success: false,
            error: `Unable to parse date: "${input}". Try formats like "2026-02-25 14:00", "tomorrow at 3pm", or "next Monday 2pm"`,
        };
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);

    // If top result has high confidence, return it
    if (results[0].confidence >= 0.8) {
        return {
            success: true,
            parsed: results[0],
        };
    }

    // If ambiguous (multiple interpretations with similar confidence)
    const ambiguous = results.filter(r => r.confidence >= 0.5);
    if (ambiguous.length > 1) {
        return {
            success: false,
            error: `Ambiguous date: "${input}". Did you mean one of these?`,
            suggestions: ambiguous.slice(0, 3),
        };
    }

    return {
        success: true,
        parsed: results[0],
    };
}

/**
 * Parse ISO 8601 formats: YYYY-MM-DD HH:MM, YYYY-MM-DDTHH:MM
 */
function parseISO8601(input: string, now: Date): ParsedDate | null {
    // YYYY-MM-DD HH:MM
    const match1 = input.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (match1) {
        const [, year, month, day, hour, minute] = match1;
        const date = new Date(+year, +month - 1, +day, +hour, +minute);
        if (!isNaN(date.getTime()) && date.getMonth() === +month - 1 && date.getDate() === +day) {
            return { date, confidence: 1.0, format: 'ISO8601', original: input };
        }
    }

    // YYYY-MM-DDTHH:MM
    const match2 = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})$/);
    if (match2) {
        const [, year, month, day, hour, minute] = match2;
        const date = new Date(+year, +month - 1, +day, +hour, +minute);
        if (!isNaN(date.getTime()) && date.getMonth() === +month - 1 && date.getDate() === +day) {
            return { date, confidence: 1.0, format: 'ISO8601', original: input };
        }
    }

    // YYYY-MM-DD (date only, default to 9am)
    const match3 = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match3) {
        const [, year, month, day] = match3;
        const date = new Date(+year, +month - 1, +day, 9, 0);
        if (!isNaN(date.getTime()) && date.getMonth() === +month - 1 && date.getDate() === +day) {
            return { date, confidence: 0.9, format: 'ISO8601_DATE', original: input };
        }
    }

    return null;
}

/**
 * Parse relative dates: tomorrow, today, next week, etc.
 */
function parseRelativeDate(input: string, now: Date): ParsedDate | null {
    const lower = input.toLowerCase();
    let date: Date | null = null;
    let confidence = 0.95;

    // Extract time if present (e.g., "tomorrow at 3pm")
    const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    let hour = 9;
    let minute = 0;

    if (timeMatch) {
        hour = parseInt(timeMatch[1]);
        minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        if (timeMatch[3] === 'pm' && hour < 12) hour += 12;
        if (timeMatch[3] === 'am' && hour === 12) hour = 0;
        confidence = 1.0;
    }

    // Today
    if (lower.includes('today')) {
        date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
    }
    // Tomorrow
    else if (lower.includes('tomorrow')) {
        date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute);
    }
    // Next week
    else if (lower.match(/next\s+week/)) {
        date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, hour, minute);
    }
    // Next [day of week]
    else if (lower.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/)) {
        const dayMatch = lower.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
        if (dayMatch) {
            const targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayMatch[1]);
            const currentDay = now.getDay();
            let daysToAdd = targetDay - currentDay;
            if (daysToAdd <= 0) daysToAdd += 7;
            date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd, hour, minute);
        }
    }
    // This [day of week]
    else if (lower.match(/this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/)) {
        const dayMatch = lower.match(/this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
        if (dayMatch) {
            const targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayMatch[1]);
            const currentDay = now.getDay();
            let daysToAdd = targetDay - currentDay;
            if (daysToAdd < 0) daysToAdd += 7;
            date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd, hour, minute);
            confidence = 0.7; // Ambiguous: this week or next week?
        }
    }

    if (date && !isNaN(date.getTime())) {
        return { date, confidence, format: 'RELATIVE', original: input };
    }

    return null;
}

/**
 * Parse natural language: "Monday 2pm", "Feb 25 at 3pm"
 */
function parseNaturalLanguage(input: string, now: Date): ParsedDate | null {
    const lower = input.toLowerCase();

    // Day of week + time: "Monday 2pm", "Friday at 3:30pm"
    const dayTimeMatch = lower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (dayTimeMatch) {
        const targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayTimeMatch[1]);
        const currentDay = now.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7; // Next occurrence

        let hour = parseInt(dayTimeMatch[2]);
        const minute = dayTimeMatch[3] ? parseInt(dayTimeMatch[3]) : 0;
        if (dayTimeMatch[4] === 'pm' && hour < 12) hour += 12;
        if (dayTimeMatch[4] === 'am' && hour === 12) hour = 0;

        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd, hour, minute);
        return { date, confidence: 0.85, format: 'NATURAL', original: input };
    }

    // Month day: "Feb 25", "March 3"
    const monthDayMatch = input.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})/i);
    if (monthDayMatch) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const month = months.indexOf(monthDayMatch[1].toLowerCase().slice(0, 3));
        const day = parseInt(monthDayMatch[2]);

        // Extract time if present
        const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
        let hour = 9;
        let minute = 0;
        if (timeMatch) {
            hour = parseInt(timeMatch[1]);
            minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            if (timeMatch[3] === 'pm' && hour < 12) hour += 12;
            if (timeMatch[3] === 'am' && hour === 12) hour = 0;
        }

        let year = now.getFullYear();
        // If date is in the past, assume next year
        const date = new Date(year, month, day, hour, minute);
        if (date < now) {
            date.setFullYear(year + 1);
        }

        return { date, confidence: 0.8, format: 'NATURAL', original: input };
    }

    return null;
}

/**
 * Parse common formats: MM/DD/YYYY, DD/MM/YYYY (ambiguous)
 */
function parseCommonFormats(input: string, now: Date): ParsedDate | null {
    // MM/DD/YYYY HH:MM or DD/MM/YYYY HH:MM (ambiguous)
    const match = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (match) {
        const [, a, b, year, hour, minute] = match;
        const num1 = parseInt(a);
        const num2 = parseInt(b);

        // If one is clearly a month (>12), use it
        if (num1 > 12 && num2 <= 12) {
            // DD/MM/YYYY
            const date = new Date(+year, num2 - 1, num1, +hour, +minute);
            if (!isNaN(date.getTime())) {
                return { date, confidence: 0.9, format: 'DD/MM/YYYY', original: input };
            }
        } else if (num2 > 12 && num1 <= 12) {
            // MM/DD/YYYY
            const date = new Date(+year, num1 - 1, num2, +hour, +minute);
            if (!isNaN(date.getTime())) {
                return { date, confidence: 0.9, format: 'MM/DD/YYYY', original: input };
            }
        } else {
            // Ambiguous - return null to trigger suggestions
            return null;
        }
    }

    return null;
}

/**
 * Format date for AppleScript (expects "Month Day, Year Hour:Minute:Second")
 */
export function formatForAppleScript(date: Date): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hour = date.getHours();
    const minute = date.getMinutes().toString().padStart(2, '0');
    const second = date.getSeconds().toString().padStart(2, '0');
    
    return `${month} ${day}, ${year} ${hour}:${minute}:${second}`;
}

/**
 * Format date for display
 */
export function formatForDisplay(date: Date): string {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

export interface TimeRangeResult {
    success: boolean;
    start?: DateParseResult;
    end?: DateParseResult;
    error?: string;
}

export function parseTimeRange(input: string): TimeRangeResult {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();
    const now = new Date();

    const rangePatterns = [
        /\s+to\s+/,
        /\s+until\s+/,
        /\s+–\s+/,
        /\s+-\s+/,
    ];

    let rangeMatch: RegExpExecArray | null = null;
    let separator = '';

    for (const pattern of rangePatterns) {
        rangeMatch = pattern.exec(lower);
        if (rangeMatch) {
            separator = rangeMatch[0];
            break;
        }
    }

    if (!rangeMatch) {
        return {
            success: false,
            error: `No time range separator found in "${input}". Use "to", "until", or "-" between times.`,
        };
    }

    const parts = lower.split(separator);
    if (parts.length !== 2) {
        return {
            success: false,
            error: `Could not parse time range: "${input}"`,
        };
    }

    const startPart = parts[0].trim();
    const endPart = parts[1].trim();

    const extractedStart = extractTimeWithContext(startPart, now);
    const extractedEnd = extractTimeWithContext(endPart, now, extractedStart.dateContext);

    if (!extractedStart.time) {
        return {
            success: false,
            error: `Could not parse start time: "${startPart}"`,
        };
    }

    if (!extractedEnd.time) {
        return {
            success: false,
            error: `Could not parse end time: "${endPart}"`,
        };
    }

    const startDate = buildDateFromContextAndTime(
        extractedStart.dateContext || extractedEnd.dateContext || getDateContext(lower) || 'today',
        extractedStart.time,
        now
    );

    const endDate = buildDateFromContextAndTime(
        extractedEnd.dateContext || extractedStart.dateContext || getDateContext(lower) || 'today',
        extractedEnd.time,
        now
    );

    if (!startDate || !endDate) {
        return {
            success: false,
            error: `Could not build dates from time range: "${input}"`,
        };
    }

    return {
        success: true,
        start: {
            success: true,
            parsed: {
                date: startDate,
                confidence: 0.95,
                format: 'TIME_RANGE',
                original: startPart,
            },
        },
        end: {
            success: true,
            parsed: {
                date: endDate,
                confidence: 0.95,
                format: 'TIME_RANGE',
                original: endPart,
            },
        },
    };
}

interface TimeExtraction {
    time: { hour: number; minute: number } | null;
    dateContext: string | null;
}

function extractTimeWithContext(part: string, now: Date, fallbackContext?: string | null): TimeExtraction {
    const lower = part.trim();

    const dateContext = getDateContext(lower) ?? fallbackContext ?? null;

    const timePatterns = [
        /(\d{1,2}):(\d{2})\s*(am|pm)/i,
        /(\d{1,2}):(\d{2})/,
        /(\d{1,2})\s*(am|pm)/i,
    ];

    for (const pattern of timePatterns) {
        const match = lower.match(pattern);
        if (match) {
            let hour: number;
            let minute: number = 0;

            if (pattern === timePatterns[0] || pattern === timePatterns[1]) {
                hour = parseInt(match[1]);
                minute = parseInt(match[2]);
                if (match[3]) {
                    const meridiem = match[3].toLowerCase();
                    if (meridiem === 'pm' && hour < 12) hour += 12;
                    if (meridiem === 'am' && hour === 12) hour = 0;
                }
            } else {
                hour = parseInt(match[1]);
                const meridiem = match[2].toLowerCase();
                if (meridiem === 'pm' && hour < 12) hour += 12;
                if (meridiem === 'am' && hour === 12) hour = 0;
            }

            return {
                time: { hour, minute },
                dateContext,
            };
        }
    }

    return {
        time: null,
        dateContext,
    };
}

function getDateContext(input: string): string | null {
    const lower = input.toLowerCase();

    if (lower.includes('tomorrow')) return 'tomorrow';
    if (lower.includes('today')) return 'today';
    if (lower.includes('next week')) return 'next week';

    const dayMatch = lower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (dayMatch) {
        return dayMatch[1];
    }

    return null;
}

function buildDateFromContextAndTime(
    context: string,
    time: { hour: number; minute: number },
    now: Date
): Date | null {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    switch (context) {
        case 'today':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.hour, time.minute);
        case 'tomorrow':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, time.hour, time.minute);
        case 'next week':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, time.hour, time.minute);
        default:
            const dayIndex = days.indexOf(context);
            if (dayIndex !== -1) {
                const currentDay = now.getDay();
                let daysToAdd = dayIndex - currentDay;
                if (daysToAdd <= 0) daysToAdd += 7;
                return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd, time.hour, time.minute);
            }
            return null;
    }
}
