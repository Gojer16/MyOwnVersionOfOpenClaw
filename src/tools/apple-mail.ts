// ─── Bulletproof Apple Mail Tools ──────────────────────────────────
// Zod-validated, structured JSON output, safe AppleScript execution

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import {
    formatSuccess,
    formatError,
    escapeAppleScript,
    createBaseString,
    safeExecAppleScript,
    checkPlatform,
    checkAppPermission,
    handleAppleScriptError,
    getPermissionRecoverySteps,
    DELIMITER,
} from './apple-shared.js';

// ─── Zod Schemas ──────────────────────────────────────────────────

const ListEmailsSchema = z.object({
    count: z.number().int().min(1).max(50).default(10),
    mailbox: createBaseString(100, 'Mailbox name is too long').default('INBOX'),
    unreadOnly: z.boolean().default(false),
}).strict();

const GetRecentSchema = z.object({
    hours: z.number().int().min(1).max(720).default(24),
    count: z.number().int().min(1).max(50).default(10),
}).strict();

const SearchEmailsSchema = z.object({
    query: createBaseString(500, 'Search query is too long'),
    count: z.number().int().min(1).max(20).default(10),
    mailbox: createBaseString(100, 'Mailbox name is too long').optional(),
}).strict();

const GetEmailContentSchema = z.object({
    index: z.number().int().min(1, 'Index must be at least 1'),
    mailbox: createBaseString(100, 'Mailbox name is too long').default('INBOX'),
}).strict();

const CountEmailsSchema = z.object({
    mailbox: createBaseString(100, 'Mailbox name is too long').default('INBOX'),
    unreadOnly: z.boolean().default(false),
}).strict();

// ─── Permission Check ─────────────────────────────────────────────

async function checkMailPermission() {
    return checkAppPermission('Mail', `tell application "Mail"
    set acctCount to count of accounts
    return acctCount
end tell`);
}

// ─── Shared Sort Handler ──────────────────────────────────────────

const SORT_HANDLER = `
on sortMessagesByDate(messageList)
    set sortedList to {}
    repeat with msg in messageList
        set msgDate to date received of msg
        set insertIndex to 1
        repeat with i from 1 to count of sortedList
            if msgDate < date received of (item i of sortedList) then
                set insertIndex to i + 1
            else
                exit repeat
            end if
        end repeat
        if insertIndex > count of sortedList then
            set end of sortedList to msg
        else
            set sortedList to (items 1 thru (insertIndex - 1) of sortedList) & {msg} & (items insertIndex thru -1 of sortedList)
        end if
    end repeat
    return sortedList
end sortMessagesByDate`;

// ─── Tools ────────────────────────────────────────────────────────

export const appleMailTools = [
    {
        name: 'apple_mail_list_emails',
        description: 'List emails from Apple Mail inbox (macOS only). Returns the most recent emails first.',
        parameters: {
            type: 'object',
            properties: {
                count: {
                    type: 'number',
                    description: 'Number of emails to return (default: 10, max: 50)'
                },
                mailbox: {
                    type: 'string',
                    description: 'Mailbox name (default: "INBOX")'
                },
                unreadOnly: {
                    type: 'boolean',
                    description: 'Only show unread emails (default: false)'
                }
            },
        },
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            const platformErr = checkPlatform('Apple Mail', startTime);
            if (platformErr) return platformErr;

            const parsed = ListEmailsSchema.safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format() }, startTime);
            }

            const args = parsed.data;

            const permCheck = await checkMailPermission();
            if (!permCheck.granted) {
                return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Mail', true, {}, startTime, getPermissionRecoverySteps('Mail'));
            }

            const mailbox = escapeAppleScript(args.mailbox);

            const script = `tell application "Mail"
    if not running then launch
    activate
    
    set targetMailbox to mailbox "${mailbox}" of first account
    set emailList to {}
    
    -- Get messages sorted by date (newest first)
    set allMessages to messages of targetMailbox
    
    -- Filter by read status if requested
    if ${args.unreadOnly} then
        set allMessages to (messages of targetMailbox whose read status is false)
    end if
    
    -- Sort by date (newest first) and limit count
    set sortedMessages to my sortMessagesByDate(allMessages)
    set resultCount to min(${args.count}, count of sortedMessages)
    if resultCount = 0 then return "NO_EMAILS"
    set limitedMessages to items 1 thru resultCount of sortedMessages
    
    repeat with i from 1 to count of limitedMessages
        set msg to item i of limitedMessages
        set msgSender to sender of msg
        if msgSender is missing value then
            set senderName to "Unknown"
            set senderEmail to ""
        else
            set senderName to name of msgSender
            set senderEmail to address of msgSender
            if senderName is "" then set senderName to senderEmail
        end if
        
        set msgSubject to subject of msg
        if msgSubject is missing value then set msgSubject to "(No Subject)"
        
        set msgDate to date received of msg
        set msgRead to read status of msg
        
        set emailInfo to "[" & i & "] " & msgSubject & " | From: " & senderName & " (" & senderEmail & ") | Date: " & (msgDate as string) & " | Read: " & msgRead
        set end of emailList to emailInfo
    end repeat
    
    return emailList as text
end tell
${SORT_HANDLER}`;

            try {
                const { stdout } = await safeExecAppleScript(script, 45000);
                const output = stdout.trim();

                if (output === 'NO_EMAILS') {
                    return formatSuccess({
                        emails: [],
                        count: 0,
                        message: `No emails found in ${args.mailbox}`,
                        mailbox: args.mailbox,
                    }, {}, startTime);
                }

                logger.info({ count: args.count, mailbox: args.mailbox, unreadOnly: args.unreadOnly, resultLength: output.length }, 'Apple Mail emails listed');

                return formatSuccess({
                    emails: output,
                    mailbox: args.mailbox,
                    requestedCount: args.count,
                    unreadOnly: args.unreadOnly,
                    message: `Listed emails from ${args.mailbox}`,
                }, {}, startTime);
            } catch (error) {
                return handleAppleScriptError(error, 'Mail', { mailbox: args.mailbox }, startTime);
            }
        },
    },
    {
        name: 'apple_mail_get_recent',
        description: 'Get the most recent emails from Apple Mail (macOS only). Shortcut for getting newest emails quickly.',
        parameters: {
            type: 'object',
            properties: {
                hours: {
                    type: 'number',
                    description: 'Get emails from last N hours (default: 24)'
                },
                count: {
                    type: 'number',
                    description: 'Maximum emails to return (default: 10)'
                }
            },
        },
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            const platformErr = checkPlatform('Apple Mail', startTime);
            if (platformErr) return platformErr;

            const parsed = GetRecentSchema.safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format() }, startTime);
            }

            const args = parsed.data;

            const permCheck = await checkMailPermission();
            if (!permCheck.granted) {
                return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Mail', true, {}, startTime, getPermissionRecoverySteps('Mail'));
            }

            const script = `tell application "Mail"
    if not running then launch
    activate
    
    set targetMailbox to mailbox "INBOX" of first account
    set cutoffDate to (current date) - (${args.hours} * hours)
    set emailList to {}
    
    -- Get recent messages only
    set recentMessages to (messages of targetMailbox whose date received ≥ cutoffDate)
    
    -- Sort by date (newest first)
    set sortedMessages to my sortMessagesByDate(recentMessages)
    
    -- Limit to requested count
    set resultCount to min(${args.count}, count of sortedMessages)
    if resultCount = 0 then return "NO_EMAILS"
    
    set limitedMessages to items 1 thru resultCount of sortedMessages
    
    repeat with i from 1 to count of limitedMessages
        set msg to item i of limitedMessages
        set msgSender to sender of msg
        if msgSender is missing value then
            set senderName to "Unknown"
        else
            set senderName to name of msgSender
            if senderName is "" then set senderName to address of msgSender
        end if
        
        set msgSubject to subject of msg
        if msgSubject is missing value then set msgSubject to "(No Subject)"
        
        set msgDate to date received of msg
        
        set emailInfo to "[" & i & "] " & msgSubject & " | From: " & senderName & " | " & (msgDate as string)
        set end of emailList to emailInfo
    end repeat
    
    return emailList as text
end tell
${SORT_HANDLER}`;

            try {
                const { stdout } = await safeExecAppleScript(script, 45000);
                const output = stdout.trim();

                if (output === 'NO_EMAILS') {
                    return formatSuccess({
                        emails: [],
                        count: 0,
                        message: `No emails from last ${args.hours} hours`,
                        hours: args.hours,
                    }, {}, startTime);
                }

                logger.info({ hours: args.hours, maxCount: args.count, resultLength: output.length }, 'Apple Mail recent emails retrieved');

                return formatSuccess({
                    emails: output,
                    hours: args.hours,
                    requestedCount: args.count,
                    message: `Recent emails from last ${args.hours} hours`,
                }, {}, startTime);
            } catch (error) {
                return handleAppleScriptError(error, 'Mail', { hours: args.hours }, startTime);
            }
        },
    },
    {
        name: 'apple_mail_search',
        description: 'Search for emails in Apple Mail by subject, sender, or content (macOS only).',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search term to look for in subject, sender, or content'
                },
                count: {
                    type: 'number',
                    description: 'Maximum results to return (default: 10)'
                },
                mailbox: {
                    type: 'string',
                    description: 'Mailbox to search (default: all mailboxes)'
                }
            },
            required: ['query'],
        },
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            const platformErr = checkPlatform('Apple Mail', startTime);
            if (platformErr) return platformErr;

            const parsed = SearchEmailsSchema.safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format() }, startTime);
            }

            const args = parsed.data;

            const permCheck = await checkMailPermission();
            if (!permCheck.granted) {
                return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Mail', true, {}, startTime, getPermissionRecoverySteps('Mail'));
            }

            const query = escapeAppleScript(args.query);

            let searchScript: string;
            if (args.mailbox) {
                const mailboxName = escapeAppleScript(args.mailbox);
                searchScript = `set targetMailbox to mailbox "${mailboxName}" of first account
    set foundMessages to (messages of targetMailbox whose subject contains "${query}" or sender contains "${query}" or content contains "${query}")`;
            } else {
                searchScript = `set foundMessages to {}
    repeat with acct in accounts
        repeat with mb in mailboxes of acct
            set mbMessages to (messages of mb whose subject contains "${query}" or sender contains "${query}" or content contains "${query}")
            set foundMessages to foundMessages & mbMessages
        end repeat
    end repeat`;
            }

            const script = `tell application "Mail"
    if not running then launch
    activate
    
    ${searchScript}
    
    if (count of foundMessages) = 0 then
        return "NO_RESULTS"
    end if
    
    -- Sort by date (newest first)
    set sortedMessages to my sortMessagesByDate(foundMessages)
    
    -- Limit results
    set resultCount to min(${args.count}, count of sortedMessages)
    set limitedMessages to items 1 thru resultCount of sortedMessages
    
    set emailList to {}
    repeat with i from 1 to count of limitedMessages
        set msg to item i of limitedMessages
        set msgSender to sender of msg
        if msgSender is missing value then
            set senderName to "Unknown"
        else
            set senderName to name of msgSender
            if senderName is "" then set senderName to address of msgSender
        end if
        
        set msgSubject to subject of msg
        if msgSubject is missing value then set msgSubject to "(No Subject)"
        
        set msgDate to date received of msg
        
        set emailInfo to "[" & i & "] " & msgSubject & " | From: " & senderName & " | " & (msgDate as string)
        set end of emailList to emailInfo
    end repeat
    
    return emailList as text
end tell
${SORT_HANDLER}`;

            try {
                const { stdout } = await safeExecAppleScript(script, 45000);
                const output = stdout.trim();

                if (output === 'NO_RESULTS') {
                    return formatSuccess({
                        emails: [],
                        count: 0,
                        message: `No emails found matching "${args.query}"`,
                        query: args.query,
                    }, {}, startTime);
                }

                logger.info({ query: args.query, count: args.count, resultLength: output.length }, 'Apple Mail search completed');

                return formatSuccess({
                    emails: output,
                    query: args.query,
                    requestedCount: args.count,
                    mailbox: args.mailbox || 'all',
                    message: `Search results for "${args.query}"`,
                }, {}, startTime);
            } catch (error) {
                return handleAppleScriptError(error, 'Mail', { query: args.query }, startTime);
            }
        },
    },
    {
        name: 'apple_mail_get_email_content',
        description: 'Get the full content of a specific email from Apple Mail (macOS only). Use after listing emails to read a specific one.',
        parameters: {
            type: 'object',
            properties: {
                index: {
                    type: 'number',
                    description: 'Index of the email from a previous list (1-based)'
                },
                mailbox: {
                    type: 'string',
                    description: 'Mailbox name (default: "INBOX")'
                }
            },
            required: ['index'],
        },
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            const platformErr = checkPlatform('Apple Mail', startTime);
            if (platformErr) return platformErr;

            const parsed = GetEmailContentSchema.safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format() }, startTime);
            }

            const args = parsed.data;

            const permCheck = await checkMailPermission();
            if (!permCheck.granted) {
                return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Mail', true, {}, startTime, getPermissionRecoverySteps('Mail'));
            }

            const mailbox = escapeAppleScript(args.mailbox);

            const script = `tell application "Mail"
    if not running then launch
    
    set targetMailbox to mailbox "${mailbox}" of first account
    set allMessages to messages of targetMailbox
    
    if ${args.index} > (count of allMessages) then
        return "INDEX_OUT_OF_RANGE"
    end if
    
    set targetMessage to item ${args.index} of allMessages
    
    set msgSubject to subject of targetMessage
    if msgSubject is missing value then set msgSubject to "(No Subject)"
    
    set msgSender to sender of targetMessage
    if msgSender is missing value then
        set senderInfo to "Unknown"
    else
        set senderInfo to name of msgSender & " <" & address of msgSender & ">"
    end if
    
    set msgDate to date received of targetMessage
    set msgContent to content of targetMessage
    if msgContent is missing value then set msgContent to "(No content)"
    
    -- Truncate if too long
    if length of msgContent > 5000 then
        set msgContent to (text 1 thru 5000 of msgContent) & "\\n\\n... [Content truncated, full email is " & (length of content of targetMessage) & " characters]"
    end if
    
    return "Subject: " & msgSubject & "\\nFrom: " & senderInfo & "\\nDate: " & (msgDate as string) & "\\n\\n" & msgContent
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 45000);
                const output = stdout.trim();

                if (output === 'INDEX_OUT_OF_RANGE') {
                    return formatError('INDEX_OUT_OF_RANGE', `Email index ${args.index} does not exist in "${args.mailbox}"`, true, {
                        index: args.index,
                        mailbox: args.mailbox,
                        suggestion: 'Use apple_mail_list_emails first to see available emails',
                    }, startTime);
                }

                logger.info({ index: args.index, mailbox: args.mailbox, resultLength: output.length }, 'Apple Mail email content retrieved');

                return formatSuccess({
                    content: output,
                    index: args.index,
                    mailbox: args.mailbox,
                    message: `Email content retrieved from ${args.mailbox}`,
                }, {}, startTime);
            } catch (error) {
                return handleAppleScriptError(error, 'Mail', { index: args.index, mailbox: args.mailbox }, startTime);
            }
        },
    },
    {
        name: 'apple_mail_count',
        description: 'Get the count of emails in Apple Mail inbox or specific mailbox (macOS only).',
        parameters: {
            type: 'object',
            properties: {
                mailbox: {
                    type: 'string',
                    description: 'Mailbox name (default: "INBOX")'
                },
                unreadOnly: {
                    type: 'boolean',
                    description: 'Count only unread emails (default: false)'
                }
            },
        },
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            const platformErr = checkPlatform('Apple Mail', startTime);
            if (platformErr) return platformErr;

            const parsed = CountEmailsSchema.safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format() }, startTime);
            }

            const args = parsed.data;

            const permCheck = await checkMailPermission();
            if (!permCheck.granted) {
                return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Mail', true, {}, startTime, getPermissionRecoverySteps('Mail'));
            }

            const mailbox = escapeAppleScript(args.mailbox);

            const script = args.unreadOnly
                ? `tell application "Mail"
    if not running then launch
    set targetMailbox to mailbox "${mailbox}" of first account
    set unreadCount to count of (messages of targetMailbox whose read status is false)
    return unreadCount as text
end tell`
                : `tell application "Mail"
    if not running then launch
    set targetMailbox to mailbox "${mailbox}" of first account
    set totalCount to count of messages of targetMailbox
    set unreadCount to count of (messages of targetMailbox whose read status is false)
    return totalCount & "${DELIMITER}" & unreadCount
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 15000);
                const output = stdout.trim();

                if (args.unreadOnly) {
                    const unreadCount = parseInt(output, 10) || 0;
                    logger.info({ mailbox: args.mailbox, unreadCount }, 'Apple Mail unread count retrieved');

                    return formatSuccess({
                        mailbox: args.mailbox,
                        unreadCount,
                        message: `Unread emails in ${args.mailbox}: ${unreadCount}`,
                    }, {}, startTime);
                } else {
                    const parts = output.split(DELIMITER);
                    const totalCount = parseInt(parts[0], 10) || 0;
                    const unreadCount = parseInt(parts[1], 10) || 0;

                    logger.info({ mailbox: args.mailbox, totalCount, unreadCount }, 'Apple Mail count retrieved');

                    return formatSuccess({
                        mailbox: args.mailbox,
                        totalCount,
                        unreadCount,
                        message: `Total emails in ${args.mailbox}: ${totalCount}, Unread: ${unreadCount}`,
                    }, {}, startTime);
                }
            } catch (error) {
                return handleAppleScriptError(error, 'Mail', { mailbox: args.mailbox }, startTime);
            }
        },
    },
];
