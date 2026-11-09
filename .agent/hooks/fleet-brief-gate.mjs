#!/usr/bin/env node
/**
 * H-FLEET-BRIEF-GATE (module-side, shipped by Quanti CLI) — the module's entry point
 * executes instead of asking nicely.
 *
 * Wired as a Claude Code PreToolUse hook via the module's .claude/settings.json. Blocks
 * EDITS inside the module until the session has run .agent/hooks/fleet-brief.mjs and
 * handed back the ack code printed at the END of the brief. Reading stays free —
 * exploration is not the gated act, changing the module is.
 *
 * Override for an explicit user instruction: QUANTI_FLEET_BRIEF_OVERRIDE=1.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { computeBriefChecksum, findModuleRoot, statePath } from './fleet-brief-lib.mjs';

const WRITE_PATTERNS = [
    /\bsed\s+-i\b/,
    /(^|[^-\w])>{1,2}\s*\S/,
    /\btee\s/,
    /\bgit\s+(add|commit|push|mv|rm)\b/,
    /\b(mv|cp|rm|touch|mkdir)\s/,
    /\bopen\([^)]*['"](w|a)\b/,
    /\bnpm\s+version\b/,
];

const ACK_CALL = /fleet-brief\.(?:mjs|ts)\s+(?:(\S+)\s+)?--ack\s+([0-9a-f]{6,})/;

function readStdinJSON() {
    try {
        const raw = readFileSync(0, 'utf-8');
        return raw.trim() ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function loadState(sessionId) {
    const p = statePath(sessionId, tmpdir());
    if (existsSync(p)) {
        try {
            return JSON.parse(readFileSync(p, 'utf-8'));
        } catch {}
    }
    return { fleet_briefs: {} };
}

function saveState(sessionId, state) {
    try {
        writeFileSync(statePath(sessionId, tmpdir()), JSON.stringify(state, null, 2));
    } catch {}
}

function briefIsAcked(sessionId, moduleRoot) {
    const entry = loadState(sessionId).fleet_briefs?.[moduleRoot];
    // An ack from before a document update is stale knowledge — it does not count.
    return Boolean(entry && entry.checksum === computeBriefChecksum(moduleRoot));
}

function block(moduleRoot, reason) {
    console.error(
        [
            `[H-FLEET-BRIEF-GATE] Edycja w module floty zablokowana (hard-block, exit 2).`, // code-language: user-facing
            `  Modul: ${moduleRoot}`, // code-language: user-facing
            `  Powod: ${reason}`, // code-language: user-facing
            ``,
            `  Punkt wejscia modulu floty to jego wlasny CLAUDE.md (KROK 0) + docs/module-context.md.`, // code-language: user-facing
            `  Przed pierwsza zmiana w module uruchom brief i potwierdz kodem z KONCA wydruku:`, // code-language: user-facing
            ``,
            `    node .agent/hooks/fleet-brief.mjs`,
            `    node .agent/hooks/fleet-brief.mjs ${moduleRoot} --ack <kod-z-konca-wydruku>`, // code-language: user-facing
            ``,
            `  Override (jawna decyzja usera): QUANTI_FLEET_BRIEF_OVERRIDE=1 w env wywolania.`, // code-language: user-facing
        ].join('\n'),
    );
    process.exit(2);
}

function main() {
    if (process.env.QUANTI_FLEET_BRIEF_OVERRIDE === '1') process.exit(0);

    const input = readStdinJSON();
    const sessionId = input.session_id ?? 'default';
    const projectRoot = findModuleRoot(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
    // A session outside a fleet module has nothing to gate.
    if (!projectRoot) process.exit(0);

    if (input.tool_name === 'Bash') {
        const command = input.tool_input?.command ?? '';

        // The ack is intercepted HERE: the gate recomputes the checksum itself, so a
        // guessed or stale code opens nothing, and the record stays per-session.
        const ack = ACK_CALL.exec(command);
        if (ack) {
            const root = ack[1] ? findModuleRoot(ack[1]) : projectRoot;
            if (!root) process.exit(0);
            const expected = computeBriefChecksum(root);
            if (ack[2] !== expected) {
                console.error(
                    [
                        `[H-FLEET-BRIEF-GATE] Kod potwierdzenia niezgodny z trescia briefu.`, // code-language: user-facing
                        `  Przeczytaj wydruk briefu do konca — kod stoi w ostatniej linii:`, // code-language: user-facing
                        `    node .agent/hooks/fleet-brief.mjs`,
                    ].join('\n'),
                );
                process.exit(2);
            }
            const state = loadState(sessionId);
            state.fleet_briefs = { ...state.fleet_briefs, [root]: { checksum: expected, ts: new Date().toISOString() } };
            saveState(sessionId, state);
            process.exit(0);
        }

        // Inside a module repository the working directory IS the module, so any writing
        // command is treated as touching it — relative paths make narrower matching a sieve.
        if (!WRITE_PATTERNS.some((p) => p.test(command))) process.exit(0);
        if (!briefIsAcked(sessionId, projectRoot)) {
            block(projectRoot, 'polecenie zapisujace w module bez potwierdzonego briefu w tej sesji'); // code-language: user-facing
        }
        process.exit(0);
    }

    const filePath = input.tool_input?.file_path ?? '';
    if (!filePath) process.exit(0);
    const root = findModuleRoot(filePath) ?? (filePath.startsWith(projectRoot) ? projectRoot : null);
    if (!root) process.exit(0);
    if (briefIsAcked(sessionId, root)) process.exit(0);
    block(root, 'edycja pliku modulu bez potwierdzonego briefu w tej sesji'); // code-language: user-facing
}

main();
