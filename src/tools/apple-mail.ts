import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

function escapeAppleScript(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

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
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Mail is only available on macOS';
            }

            const count = Math.min((args.count as number) || 10, 50);
            const mailbox = escapeAppleScript((args.mailbox as string) || 'INBOX');
            const unreadOnly = args.unreadOnly === true;

            const script = `tell application "Mail"
    if not running then launch
    activate
    
    set targetMailbox to mailbox "${mailbox}" of first account
    set emailList to {}
    
    -- Get messages sorted by date (newest first)
    set allMessages to messages of targetMailbox
    
    -- Filter by read status if requested
    if ${unreadOnly} then
        set allMessages to (messages of targetMailbox whose read status is false)
    end if
    
    -- Sort by date (newest first) and limit count
    set sortedMessages to my sortMessagesByDate(allMessages)
    set limitedMessages to items 1 thru (min(${count}, count of sortedMessages)) of sortedMessages
    
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
    
    if (count of emailList) = 0 then
        return "No emails found in ${mailbox}"
    else
        return emailList as text
    end if
end tell

-- Helper handler to sort messages by date
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

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                const result = stdout.trim();
                logger.info({ count, mailbox, unreadOnly, resultLength: result.length }, 'Apple Mail emails listed');
                return result || `No emails found in ${mailbox}`;
            } catch (error) {
                logger.error({ error, mailbox }, 'Failed to list Apple Mail emails');
                return `Error: ${(error as Error).message}`;
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
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Mail is only available on macOS';
            }

            const hours = (args.hours as number) || 24;
            const maxCount = (args.count as number) || 10;

            const script = `tell application "Mail"
    if not running then launch
    activate
    
    set targetMailbox to mailbox "INBOX" of first account
    set cutoffDate to (current date) - (${hours} * hours)
    set emailList to {}
    
    -- Get recent messages only
    set recentMessages to (messages of targetMailbox whose date received ≥ cutoffDate)
    
    -- Sort by date (newest first)
    set sortedMessages to my sortMessagesByDate(recentMessages)
    
    -- Limit to requested count
    set resultCount to min(${maxCount}, count of sortedMessages)
    if resultCount = 0 then return "No emails from last ${hours} hours"
    
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

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                const result = stdout.trim();
                logger.info({ hours, maxCount, resultLength: result.length }, 'Apple Mail recent emails retrieved');
                return result || `No emails from last ${hours} hours`;
            } catch (error) {
                logger.error({ error, hours }, 'Failed to get recent Apple Mail emails');
                return `Error: ${(error as Error).message}`;
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
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Mail is only available on macOS';
            }

            const query = escapeAppleScript(args.query as string);
            const count = Math.min((args.count as number) || 10, 20);
            const mailbox = args.mailbox as string | undefined;

            let searchScript: string;
            
            if (mailbox) {
                const mailboxName = escapeAppleScript(mailbox);
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
        return "No emails found matching '${args.query}'"
    end if
    
    -- Sort by date (newest first)
    set sortedMessages to my sortMessagesByDate(foundMessages)
    
    -- Limit results
    set resultCount to min(${count}, count of sortedMessages)
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

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                const result = stdout.trim();
                logger.info({ query, count, resultLength: result.length }, 'Apple Mail search completed');
                return result || `No emails found matching '${args.query}'`;
            } catch (error) {
                logger.error({ error, query }, 'Failed to search Apple Mail');
                return `Error: ${(error as Error).message}`;
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
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Mail is only available on macOS';
            }

            const index = args.index as number;
            const mailbox = escapeAppleScript((args.mailbox as string) || 'INBOX');

            const script = `tell application "Mail"
    if not running then launch
    
    set targetMailbox to mailbox "${mailbox}" of first account
    set allMessages to messages of targetMailbox
    
    if ${index} > (count of allMessages) then
        return "Error: Email index ${index} not found (only " & (count of allMessages) & " emails in inbox)"
    end if
    
    set targetMessage to item ${index} of allMessages
    
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
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 30000 });
                const result = stdout.trim();
                logger.info({ index, mailbox, resultLength: result.length }, 'Apple Mail email content retrieved');
                return result || 'Could not retrieve email content';
            } catch (error) {
                logger.error({ error, index }, 'Failed to get Apple Mail email content');
                return `Error: ${(error as Error).message}`;
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
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Mail is only available on macOS';
            }

            const mailbox = escapeAppleScript((args.mailbox as string) || 'INBOX');
            const unreadOnly = args.unreadOnly === true;

            let script: string;
            
            if (unreadOnly) {
                script = `tell application "Mail"
    if not running then launch
    set targetMailbox to mailbox "${mailbox}" of first account
    set unreadCount to count of (messages of targetMailbox whose read status is false)
    return "Unread emails in ${mailbox}: " & unreadCount
end tell`;
            } else {
                script = `tell application "Mail"
    if not running then launch
    set targetMailbox to mailbox "${mailbox}" of first account
    set totalCount to count of messages of targetMailbox
    set unreadCount to count of (messages of targetMailbox whose read status is false)
    return "Total emails in ${mailbox}: " & totalCount & "\\nUnread: " & unreadCount
end tell`;
            }

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 10000 });
                const result = stdout.trim();
                logger.info({ mailbox, unreadOnly, result }, 'Apple Mail count retrieved');
                return result;
            } catch (error) {
                logger.error({ error, mailbox }, 'Failed to count Apple Mail emails');
                return `Error: ${(error as Error).message}`;
            }
        },
    },
];
