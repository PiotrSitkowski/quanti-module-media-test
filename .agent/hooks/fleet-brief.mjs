#!/usr/bin/env node
/**
 * fleet-brief — the module's entry point, made executable (shipped by Quanti CLI).
 *
 * Prints the module's CLAUDE.md (KROK 0) and docs/module-context.md in full, then an
 * ack code derived from their content. The companion gate refuses edits until the same
 * session hands the code back via --ack; the code sits in the LAST line of this output,
 * so handing it back proves the whole brief passed through the agent's context.
 *
 *   node .agent/hooks/fleet-brief.mjs [moduleRoot]
 *   node .agent/hooks/fleet-brief.mjs [moduleRoot] --ack <code>
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { BRIEF_DOCUMENTS, computeBriefChecksum, findModuleRoot } from './fleet-brief-lib.mjs';

function fail(message) {
    console.error(`[fleet-brief] ${message}`);
    process.exit(1);
}

const args = process.argv.slice(2);
const ackIdx = args.indexOf('--ack');
// `--ack <code>` consumes two slots; whatever remains is the optional module dir.
const positional = args.filter((a, i) => (ackIdx < 0 || (i !== ackIdx && i !== ackIdx + 1)) && !a.startsWith('--'));
const target = resolve(positional[0] ?? process.cwd());

const moduleRoot = findModuleRoot(target);
if (!moduleRoot) fail(`${target} nie lezy w module floty (brak quanti.manifest.json + CLAUDE.md w gore drzewa)`); // code-language: user-facing

const checksum = computeBriefChecksum(moduleRoot);

if (ackIdx >= 0) {
    const given = args[ackIdx + 1] ?? '';
    if (given !== checksum) {
        fail(`kod niezgodny z trescia briefu (podano ${given || '(nic)'}, oczekiwany stoi na koncu wydruku briefu)`); // code-language: user-facing
    }
    console.log(`[fleet-brief] Potwierdzono brief modulu ${moduleRoot} (kod ${checksum}).`); // code-language: user-facing
    console.log('[fleet-brief] KROK 0 nadal obowiazuje: wypunktuj reguly modulu w swojej odpowiedzi.'); // code-language: user-facing
    process.exit(0);
}

const separator = '─'.repeat(78);
console.log(`[fleet-brief] Punkt wejscia modulu: ${moduleRoot}`); // code-language: user-facing

for (const rel of BRIEF_DOCUMENTS) {
    const p = join(moduleRoot, rel);
    console.log(`\n${separator}\n### ${rel}\n${separator}`);
    console.log(existsSync(p) ? readFileSync(p, 'utf-8') : `(brak pliku ${rel} — modul bez tej warstwy dokumentacji)`); // code-language: user-facing
}

for (const dir of ['.agent/rules', '.agent/examples', '.agent/skills']) {
    const p = join(moduleRoot, dir);
    if (!existsSync(p)) continue;
    const entries = readdirSync(p).filter((f) => !f.startsWith('.'));
    if (entries.length === 0) continue;
    console.log(`\n### ${dir}/ (${entries.length}):`);
    for (const entry of entries) console.log(`  - ${dir}/${entry}`);
}

console.log(`\n${separator}`);
console.log('Brief dobiegl konca. Zanim zmienisz cokolwiek w module:'); // code-language: user-facing
console.log('  1. Wykonaj KROK 0 z CLAUDE.md powyzej (wypunktuj reguly w odpowiedzi).'); // code-language: user-facing
console.log('  2. Potwierdz przyswojenie briefu kodem z linii ponizej:'); // code-language: user-facing
console.log(`\n  node .agent/hooks/fleet-brief.mjs ${moduleRoot} --ack ${checksum}`);
