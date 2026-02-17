import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

function escapeAppleScript(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export const appleRemindersTools = [
    {
        name: 'apple_reminders_add',
        description: 'Add a reminder to Apple Reminders app (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Reminder title' },
                list: { type: 'string', description: 'List name (default: "Talon")' },
                dueDate: { type: 'string', description: 'Due date in format "YYYY-MM-DD" (optional)' },
                priority: { type: 'number', description: 'Priority 0-9 (0=none, 1=high, 5=medium, 9=low)' },
            },
            required: ['title'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Reminders is only available on macOS';
            }

            const title = escapeAppleScript(args.title as string);
            const listName = escapeAppleScript((args.list as string) || 'Talon');
            const priority = (args.priority as number) || 0;

            let script = `tell application "Reminders"
    if not (exists list "${listName}") then
        make new list with properties {name:"${listName}"}
    end if
    set targetList to list "${listName}"
    set newReminder to make new reminder at end of targetList with properties {name:"${title}", priority:${priority}}`;

            if (args.dueDate) {
                const dueDate = args.dueDate as string;
                script += `\n    set due date of newReminder to date "${dueDate}"`;
            }

            script += '\nend tell';

            try {
                await execAsync(`osascript -e '${script}'`);
                logger.info({ title, list: listName }, 'Apple Reminder added');
                return `Reminder added: "${args.title}" (list: ${listName})`;
            } catch (error) {
                logger.error({ error }, 'Failed to add Apple Reminder');
                return `Error: ${(error as Error).message}`;
            }
        },
    },
    {
        name: 'apple_reminders_list',
        description: 'List reminders from Apple Reminders app (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                list: { type: 'string', description: 'List name (default: "Talon")' },
                completed: { type: 'boolean', description: 'Show completed reminders (default: false)' },
            },
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Reminders is only available on macOS';
            }

            const listName = escapeAppleScript((args.list as string) || 'Talon');
            const showCompleted = args.completed || false;

            const script = `tell application "Reminders"
    if not (exists list "${listName}") then
        return "List not found: ${listName}"
    end if
    set targetList to list "${listName}"
    set reminderList to {}
    repeat with aReminder in reminders of targetList
        set isCompleted to completed of aReminder
        if ${showCompleted} or not isCompleted then
            set reminderName to name of aReminder
            set reminderStatus to ""
            if isCompleted then
                set reminderStatus to "[✓] "
            else
                set reminderStatus to "[ ] "
            end if
            set end of reminderList to reminderStatus & reminderName
        end if
    end repeat
    if (count of reminderList) = 0 then
        return "No reminders found"
    else
        return reminderList as text
    end if
end tell`;

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`);
                return stdout.trim() || `No reminders in list "${listName}"`;
            } catch (error) {
                logger.error({ error }, 'Failed to list Apple Reminders');
                return `Error: ${(error as Error).message}`;
            }
        },
    },
    {
        name: 'apple_reminders_complete',
        description: 'Mark a reminder as complete in Apple Reminders app (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Reminder title to complete' },
                list: { type: 'string', description: 'List name (default: "Talon")' },
            },
            required: ['title'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Reminders is only available on macOS';
            }

            const title = escapeAppleScript(args.title as string);
            const listName = escapeAppleScript((args.list as string) || 'Talon');

            const script = `tell application "Reminders"
    if not (exists list "${listName}") then
        return "List not found: ${listName}"
    end if
    set targetList to list "${listName}"
    set found to false
    repeat with aReminder in reminders of targetList
        if name of aReminder is "${title}" then
            set completed of aReminder to true
            set found to true
            exit repeat
        end if
    end repeat
    if found then
        return "Completed"
    else
        return "Not found"
    end if
end tell`;

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`);
                if (stdout.trim() === 'Completed') {
                    logger.info({ title, list: listName }, 'Apple Reminder completed');
                    return `Reminder completed: "${args.title}"`;
                } else {
                    return `Reminder not found: "${args.title}" in list "${listName}"`;
                }
            } catch (error) {
                logger.error({ error }, 'Failed to complete Apple Reminder');
                return `Error: ${(error as Error).message}`;
            }
        },
    },
];
