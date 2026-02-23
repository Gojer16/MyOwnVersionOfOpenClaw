// ─── Bulletproof Apple Notes Tools ─────────────────────────────────
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

const CreateNoteSchema = z.object({
    title: createBaseString(500, 'Note title is too long'),
    content: z.string().trim().min(1, 'Content cannot be empty').max(50000, 'Content is too long (max 50000 chars)'),
    folder: createBaseString(100, 'Folder name is too long').default('Talon'),
}).strict();

const SearchNotesSchema = z.object({
    query: createBaseString(200, 'Search query is too long'),
    limit: z.number().int().min(1).max(50).default(5),
}).strict();

// ─── Permission Check ─────────────────────────────────────────────

async function checkNotesPermission() {
    return checkAppPermission('Notes', `tell application "Notes"
    set testFolder to name of folder 1
    return testFolder
end tell`);
}

// ─── Tools ────────────────────────────────────────────────────────

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
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            const platformErr = checkPlatform('Apple Notes', startTime);
            if (platformErr) return platformErr;

            const parsed = CreateNoteSchema.safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format() }, startTime);
            }

            const args = parsed.data;

            const permCheck = await checkNotesPermission();
            if (!permCheck.granted) {
                return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Notes', true, {}, startTime, getPermissionRecoverySteps('Notes'));
            }

            const title = escapeAppleScript(args.title);
            const content = escapeAppleScript(args.content);
            const folder = escapeAppleScript(args.folder);

            const script = `tell application "Notes"
    if not (exists folder "${folder}") then
        make new folder with properties {name:"${folder}"}
    end if
    set newNote to make new note at folder "${folder}" with properties {name:"${title}", body:"${content}"}
    return name of newNote
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 10000);
                const output = stdout.trim();

                logger.info({ title: args.title, folder }, 'Apple Note created');

                return formatSuccess({
                    message: `Note created: "${args.title}"`,
                    title: args.title,
                    folder: args.folder,
                    contentLength: args.content.length,
                }, { applescriptOutput: output }, startTime);
            } catch (error) {
                return handleAppleScriptError(error, 'Notes', { title: args.title, folder }, startTime);
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
        async execute(rawArgs: Record<string, unknown>): Promise<string> {
            const startTime = Date.now();

            const platformErr = checkPlatform('Apple Notes', startTime);
            if (platformErr) return platformErr;

            const parsed = SearchNotesSchema.safeParse(rawArgs);
            if (!parsed.success) {
                return formatError('VALIDATION_ERROR', 'Input validation failed', false, { errors: parsed.error.format() }, startTime);
            }

            const args = parsed.data;

            const permCheck = await checkNotesPermission();
            if (!permCheck.granted) {
                return formatError('PERMISSION_DENIED', 'Terminal does not have permission to access Notes', true, {}, startTime, getPermissionRecoverySteps('Notes'));
            }

            const query = escapeAppleScript(args.query);

            const script = `tell application "Notes"
    set foundNotes to {}
    set noteCount to 0
    repeat with aNote in notes
        if (name of aNote contains "${query}") or (body of aNote contains "${query}") then
            set noteCount to noteCount + 1
            set noteTitle to name of aNote
            set noteBody to body of aNote as text
            set notePreview to text 1 thru (min of {200, length of noteBody}) of noteBody
            set end of foundNotes to noteTitle & "${DELIMITER}" & notePreview
            if noteCount ≥ ${args.limit} then exit repeat
        end if
    end repeat
    if (count of foundNotes) = 0 then
        return "NO_RESULTS"
    else
        set AppleScript's text item delimiters to linefeed
        set resultText to foundNotes as text
        set AppleScript's text item delimiters to ""
        return resultText
    end if
end tell`;

            try {
                const { stdout } = await safeExecAppleScript(script, 15000);
                const output = stdout.trim();

                if (output === 'NO_RESULTS') {
                    return formatSuccess({
                        notes: [],
                        count: 0,
                        message: `No notes found matching "${args.query}"`,
                    }, {}, startTime);
                }

                // Parse results using delimiter
                const notes = output.split('\n').map(line => {
                    const parts = line.split(DELIMITER);
                    return {
                        title: parts[0] || 'Untitled',
                        preview: parts[1] || '',
                    };
                });

                return formatSuccess({
                    notes,
                    count: notes.length,
                    message: `Found ${notes.length} note(s) matching "${args.query}"`,
                    query: args.query,
                }, { applescriptOutput: output }, startTime);
            } catch (error) {
                return handleAppleScriptError(error, 'Notes', { query: args.query }, startTime);
            }
        },
    },
];
