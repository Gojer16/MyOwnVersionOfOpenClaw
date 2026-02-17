import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

function escapeAppleScript(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export const appleNotesTools = [
    {
        name: 'apple_notes_create',
        description: 'Create a note in Apple Notes app (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Note title' },
                content: { type: 'string', description: 'Note content' },
                folder: { type: 'string', description: 'Folder name (default: "Talon")' },
            },
            required: ['title', 'content'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Notes is only available on macOS';
            }

            const title = escapeAppleScript(args.title as string);
            const content = escapeAppleScript(args.content as string);
            const folder = escapeAppleScript((args.folder as string) || 'Talon');

            const script = `tell application "Notes"
    if not (exists folder "${folder}") then
        make new folder with properties {name:"${folder}"}
    end if
    make new note at folder "${folder}" with properties {name:"${title}", body:"${content}"}
end tell`;

            try {
                await execAsync(`osascript -e '${script}'`);
                logger.info({ title, folder }, 'Apple Note created');
                return `Note created in Apple Notes: "${args.title}" (folder: ${folder})`;
            } catch (error) {
                logger.error({ error }, 'Failed to create Apple Note');
                return `Error: ${(error as Error).message}`;
            }
        },
    },
    {
        name: 'apple_notes_search',
        description: 'Search notes in Apple Notes app (macOS only)',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'number', description: 'Max results (default: 5)' },
            },
            required: ['query'],
        },
        async execute(args: Record<string, unknown>): Promise<string> {
            if (process.platform !== 'darwin') {
                return 'Error: Apple Notes is only available on macOS';
            }

            const query = args.query as string;
            const limit = (args.limit as number) || 5;

            const script = `tell application "Notes"
    set foundNotes to {}
    set noteCount to 0
    repeat with aNote in notes
        if (name of aNote contains "${escapeAppleScript(query)}") or (body of aNote contains "${escapeAppleScript(query)}") then
            set noteCount to noteCount + 1
            set noteTitle to name of aNote
            set noteBody to body of aNote as text
            set notePreview to text 1 thru (min of {200, length of noteBody}) of noteBody
            set end of foundNotes to "Title: " & noteTitle & "\\nPreview: " & notePreview & "\\n---"
            if noteCount ≥ ${limit} then exit repeat
        end if
    end repeat
    if (count of foundNotes) = 0 then
        return "No notes found"
    else
        return foundNotes as text
    end if
end tell`;

            try {
                const { stdout } = await execAsync(`osascript -e '${script}'`);
                return stdout.trim() || `No notes found matching "${query}"`;
            } catch (error) {
                logger.error({ error }, 'Failed to search Apple Notes');
                return `Error: ${(error as Error).message}`;
            }
        },
    },
];
