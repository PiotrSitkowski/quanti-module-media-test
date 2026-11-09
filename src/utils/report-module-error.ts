/**
 * Report a failure to Analytics Engine, by CODE, from anywhere in the module (H-ERROR-NOT-IN-AE).
 *
 * `console.error` is not a record: it reaches only whoever has the console open. 2026-11-08: the canvas reducer
 * refused a frame, logged it, and Analytics Engine held 0 errors — a pure function had no `context` to report with.
 *
 *     reportModuleError('MY_MODULE_FRAME_REFUSED', { operation: 'reduce.applyFrame' });        // anywhere
 *     reportModuleError('MY_MODULE_SAVE_FAILED', { operation: 'save' }, context);             // a screen with its context
 *
 * Where it goes is installed ONCE per environment:
 * - screen: `installModuleErrorReporter(context)` when the widget mounts → the shell's `context.api.reportError`
 *   → /api/telemetry/client-error → an ERROR row of TELEMETRY_LOGS (the errors place: its own index, not sampled);
 * - worker: `installModuleErrorReporter(moduleErrorSinkForWorker(env, ctx, 'my-module'))` (./report-error).
 * A report made before the install waits (at most 20) and is delivered on install.
 * The message is the CODE; a sentence is replaced, because an error's text can carry the tenant's values.
 * Never throws. Source of truth: @quanti/cli templates — `quanti update` rewrites this file.
 */

export type ModuleErrorDetails = { operation?: string };
export type ModuleErrorSink = (code: string, details: ModuleErrorDetails) => void;
/** The part of the shell's context this helper reads — `context.api.reportError` (kernel: mfe-context.ts). */
export interface ModuleErrorContext {
    api?: { reportError?: (code: string, details?: ModuleErrorDetails) => void } | null;
}

const CODE_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
const ID_RE = /^[A-Za-z0-9_.:-]{1,96}$/;
const MAX_PENDING = 20;

let sink: ModuleErrorSink | null = null;
let pending: Array<[string, ModuleErrorDetails]> = [];

function sinkOf(target: unknown): ModuleErrorSink | null {
    if (typeof target === 'function') return target as ModuleErrorSink;
    const report = (target as ModuleErrorContext | null | undefined)?.api?.reportError;
    return typeof report === 'function' ? (code, details) => report(code, details) : null;
}

function deliver(to: ModuleErrorSink, code: string, details: ModuleErrorDetails): void {
    try {
        to(code, details);
    } catch {
        // Reporting must never break the screen or the request it reports on.
    }
}

/** Where reports go from now on: a screen's context, or a sink (the worker's). Delivers what waited. */
export function installModuleErrorReporter(target: ModuleErrorContext | ModuleErrorSink | null | undefined): void {
    const next = sinkOf(target);
    if (!next) return;
    sink = next;
    const waiting = pending;
    pending = [];
    for (const [code, details] of waiting) deliver(next, code, details);
}

export function reportModuleError(code: string, details: ModuleErrorDetails = {}, via?: ModuleErrorContext | null): void {
    const safeCode = CODE_RE.test(code) ? code : 'MODULE_ERROR_INVALID_CODE';
    const safe: ModuleErrorDetails = {};
    if (details?.operation && ID_RE.test(details.operation)) safe.operation = details.operation;
    const to = (via ? sinkOf(via) : null) ?? sink;
    if (to) {
        deliver(to, safeCode, safe);
        return;
    }
    if (pending.length < MAX_PENDING) pending.push([safeCode, safe]);
}

/** Tests only: forget the installed sink and what waited. */
export function __resetModuleErrorReporterForTests(): void {
    sink = null;
    pending = [];
}
