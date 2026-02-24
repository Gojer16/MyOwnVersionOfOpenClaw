// ─── File Utilities ──────────────────────────────────────────────
// Atomic file writes to avoid partial/corrupted files

import fs from 'node:fs';
import path from 'node:path';

export function writeFileAtomicSync(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const temp = path.join(dir, `.${base}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`);

    fs.writeFileSync(temp, content, 'utf-8');
    fs.renameSync(temp, filePath);
}
