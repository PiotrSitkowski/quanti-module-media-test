/**
 * Shared pieces of the module-side fleet-brief gate (H-FLEET-BRIEF-GATE).
 *
 * A fleet module's entry point is its own CLAUDE.md (KROK 0) plus the file map in
 * docs/module-context.md. The demand to read them first used to live in prose only;
 * these hooks, shipped with Quanti CLI into every module, make it executable in any
 * agent session started inside the module repository.
 *
 * The ack code is a checksum of the two documents, printed at the END of the brief
 * output — handing it back proves the whole brief passed through the agent's context.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MODULE_MARKERS = ['quanti.manifest.json', 'CLAUDE.md'];

export const BRIEF_DOCUMENTS = ['CLAUDE.md', 'docs/module-context.md'];

export function findModuleRoot(startPath) {
    let dir = startPath;
    for (let i = 0; i < 40; i++) {
        if (MODULE_MARKERS.every((m) => existsSync(join(dir, m)))) return dir;
        const parent = dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
    return null;
}

/** Changes whenever either document changes — a stale ack stops opening the gate. */
export function computeBriefChecksum(moduleRoot) {
    const hash = createHash('sha256');
    for (const rel of BRIEF_DOCUMENTS) {
        const p = join(moduleRoot, rel);
        hash.update(existsSync(p) ? readFileSync(p) : Buffer.from(`missing:${rel}`));
    }
    return hash.digest('hex').slice(0, 10);
}

export function statePath(sessionId, tmpdir) {
    const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
    return join(tmpdir, `quanti-fleet-brief-${safe}.json`);
}
