/**
 * Report a failure this worker CATCHES to Analytics Engine, by code (H-ERROR-NOT-IN-AE).
 *
 * A failure that escapes an RPC method is already logged by the kernel's fleet gateway. The one the module
 * turns into a refusal ({ ok: false }) or swallows had no way there — `console.error` reaches only whoever
 * watches `wrangler tail` at that moment. The message is the CODE; a sentence is replaced, because an error's
 * text can carry the tenant's field values. Never throws. Source of truth: @quanti/cli templates.
 *
 *     } catch (err) {
 *         reportWorkerError(this.env, this.ctx, traceId, 'my-module', 'MY_MODULE_SAVE_REFUSED', { projectId, operation: 'create' });
 *         return { ok: false, error: { code: 'MY_MODULE_SAVE_REFUSED' } };
 *     }
 */

const CODE_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
const ID_RE = /^[A-Za-z0-9_.:-]{1,96}$/;

export interface ErrorSink {
    system_logEvent(traceId: string, service: string, level: string, message: string, metadata?: unknown): Promise<void>;
}

export function reportWorkerError(
    env: { BACKEND?: ErrorSink },
    ctx: { waitUntil(promise: Promise<unknown>): void } | undefined,
    traceId: string,
    moduleName: string,
    code: string,
    ids: { projectId?: number; instanceKey?: string; operation?: string } = {},
): void {
    const message = CODE_RE.test(code) ? code : 'WORKER_ERROR_INVALID_CODE';
    const metadata: Record<string, unknown> = { kind: 'worker-error' };
    if (typeof ids.projectId === 'number') metadata.projectId = ids.projectId;
    if (ids.instanceKey && ID_RE.test(ids.instanceKey)) metadata.instanceKey = ids.instanceKey;
    if (ids.operation && ID_RE.test(ids.operation)) metadata.operation = ids.operation;
    const pending = Promise.resolve()
        .then(() => {
            if (!env.BACKEND) throw new Error('BACKEND binding missing');
            return env.BACKEND.system_logEvent(traceId, 'module:' + moduleName, 'ERROR', message, metadata);
        })
        .catch((err) => console.error('[report-error] could not reach telemetry', { code: message, err }));
    try {
        ctx?.waitUntil(pending);
    } catch {
        // Outside a request (tests, scripts) there is no waitUntil; the promise still settles on its own.
    }
}

/**
 * The worker's sink for `reportModuleError` (./report-module-error): code that has no `this.env` — a reducer, a
 * compiler, a catalogue shared with the screen — reports through it. Install it in the entrypoint's constructor
 * (a WorkerEntrypoint is built per request, so `ctx` belongs to a live request):
 *
 *     constructor(ctx: ExecutionContext, env: Env) {
 *         super(ctx, env);
 *         installModuleErrorReporter(moduleErrorSinkForWorker(env, ctx, 'my-module'));
 *     }
 *
 * No trace and no project: the sink is shared by the requests of one isolate, so naming one would misattribute.
 * Where you HAVE them (an RPC method), call reportWorkerError directly.
 */
export function moduleErrorSinkForWorker(
    env: { BACKEND?: ErrorSink },
    ctx: { waitUntil(promise: Promise<unknown>): void } | undefined,
    moduleName: string,
): (code: string, details: { operation?: string }) => void {
    return (code, details) => reportWorkerError(env, ctx, 'no-trace', moduleName, code, details?.operation ? { operation: details.operation } : {});
}
