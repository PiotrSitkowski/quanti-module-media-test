<!--
@quanti-example: CS-01-D1
@kernel-version: >=0.5.0
@last-verified: 2026-04-29
@status: canonical
-->

# CS-01: D1 — Relacyjna Baza Danych przez BACKEND Proxy + Self-Provisioning

> ⚠️ **Self-Provisioning (`install`/`uninstall`) to OPT-IN dla modułów, które realnie ownują własne tabele.**
> Moduły UI-only, proxy, agregatory cross-ref **POMIJAJĄ** całą sekcję — pusta tabela na shardzie każdego tenant'a, który aktywuje taki moduł, to czysty śmietnik w D1.
> Decyzja: jeśli moduł deklaruje tabele w `schema.ts` → MUSISZ wdrożyć install/uninstall poniżej. Jeśli nie ma własnych tabel → wyłącznie BACKEND proxy do CRUD na cudzych danych, bez install/uninstall.

## Cel i Wzorzec

**Problem:** Moduły Fleet nie mają bindingu `env.DB`. Agent (LLM) domyślnie generuje kod z bezpośrednim `env.DB.prepare(...)` — to powoduje runtime error, bo ten binding nie istnieje w kontekście Fleet Workera. Dodatkowo Kernel **nie zna** schematu tabel żadnego modułu — jeśli moduł owns tabele, musi sam je zakładać i czyścić.

**Rozwiązanie:** Każde zapytanie SQL w module przechodzi przez `BACKEND.sys_executeDbQuery(projectId, { sql, params, method, traceId })`. Jeśli moduł owns tabele, wystawia publiczne RPC `install(traceId, {projectId})` i `uninstall(traceId, {projectId})`, do których Kernel routuje przez Fleet service worker (dispatch → slot). Kernel nie ma żadnej hardcoded'owanej wiedzy o schemacie modułu.

**Kluczowy insight TDD:** `BACKEND` to service binding — można go zmockować jako zwykły obiekt z `vi.fn()`. Nie potrzebujesz żadnej biblioteki do mockowania HTTP. Test instalacji to po prostu sprawdzenie SQL strings przekazanych do mocka.

---

## Architektura: Self-Provisioning Flow

```
quanti deploy
  → bundle ESM na CDN (R2)
  → rejestracja w D1 module_registry
  → ŻADNEJ tabeli na tenantach jeszcze nie ma

User: system_toggleModule(projectId, 'my-module', 'enable')
  → Kernel: resolveModuleSlot('my-module') → { serviceBinding, slotBinding }
  → Kernel: env[serviceBinding].dispatch(slotBinding, 'install', traceId, { projectId })
  → Fleet service (tępy router): forwarduje do modułu na tym slocie
  → Moduł.install() — uruchamia CREATE TABLE IF NOT EXISTS
  → Tabele gotowe w shardzie tego tenanta

User: system_toggleModule(projectId, 'my-module', 'disable', deleteData=true)
  → analogiczny dispatch → Moduł.uninstall()
  → DELETE FROM ... WHERE project_id = ?  (NIE DROP — schema zostaje)
```

---

## KROK 1: RED — Testy install/uninstall przed implementacją

```typescript
// src/worker.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
    WorkerEntrypoint: class { ctx: any; env: any; constructor(c: any, e: any) { this.ctx = c; this.env = e; } },
}));

const { default: MyModule } = await import('./worker');

function makeEnv() {
    const queries: Array<{ projectId: number; sql: string; params: any[]; method: string }> = [];
    const sent: any[] = [];
    return {
        env: {
            BACKEND: {
                sys_executeDbQuery: vi.fn(async (projectId: number, q: any) => {
                    queries.push({ projectId, sql: q.sql, params: q.params, method: q.method });
                    return { results: [] };
                }),
            },
            QUEUE_MAIN: { send: vi.fn(async (m: any) => { sent.push(m); }) },
        },
        queries,
        sent,
    };
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

describe('MyModule.install (Lazy Provisioning)', () => {
    it('creates the table via CREATE TABLE IF NOT EXISTS', async () => {
        const { env, queries } = makeEnv();
        const mod = new MyModule(ctx, env);
        await mod.install('trace_install', { projectId: 7 });
        const ddl = queries.filter(q => q.sql.trim().startsWith('CREATE TABLE'));
        expect(ddl).toHaveLength(1);
        expect(ddl[0].sql).toMatch(/CREATE TABLE IF NOT EXISTS \w+\b/);
    });

    it('forwards projectId to BACKEND on every DDL call (anti-IDOR)', async () => {
        const { env, queries } = makeEnv();
        const mod = new MyModule(ctx, env);
        await mod.install('trace_install', { projectId: 42 });
        for (const q of queries) expect(q.projectId).toBe(42);
    });

    it('NEVER issues DROP TABLE during install', async () => {
        const { env, queries } = makeEnv();
        const mod = new MyModule(ctx, env);
        await mod.install('trace_install', { projectId: 1 });
        for (const q of queries) expect(q.sql).not.toMatch(/^DROP\b/i);
    });

    it('throws when projectId missing', async () => {
        const { env } = makeEnv();
        const mod = new MyModule(ctx, env);
        await expect(mod.install('trace', {} as any)).rejects.toThrow(/projectId/i);
    });
});

describe('MyModule.uninstall (Explicit Destruction, DELETE not DROP)', () => {
    it('deletes from owned tables filtered by project_id', async () => {
        const { env, queries } = makeEnv();
        const mod = new MyModule(ctx, env);
        await mod.uninstall('trace_uninstall', { projectId: 7 });
        const dml = queries.filter(q => q.sql.trim().startsWith('DELETE'));
        expect(dml.length).toBeGreaterThan(0);
        for (const q of dml) {
            expect(q.sql).toMatch(/WHERE project_id = \?/);
            expect(q.params).toEqual([7]);
        }
    });

    it('NEVER issues DROP TABLE (preserve schema for re-enable)', async () => {
        const { env, queries } = makeEnv();
        const mod = new MyModule(ctx, env);
        await mod.uninstall('trace', { projectId: 1 });
        for (const q of queries) expect(q.sql).not.toMatch(/\bDROP\b/i);
    });

    it('does not emit any QueueEvent (lifecycle RPC, not domain mutation)', async () => {
        const { env, sent } = makeEnv();
        const mod = new MyModule(ctx, env);
        await mod.uninstall('trace', { projectId: 1 });
        expect(sent).toHaveLength(0);
    });
});
```

> ⛔ **ZATRZYMAJ SIĘ.** Uruchom test. Wszystkie testy `install`/`uninstall` MUSZĄ oblec z `is not a function`. Dopiero po potwierdzeniu RED przechodzisz do KROKU 2.

---

## KROK 2: GREEN — Implementacja w worker.ts

```typescript
// src/worker.ts
import { WorkerEntrypoint } from 'cloudflare:workers';
import { getTenantDb } from './utils/db-router';

interface Env {
    BACKEND: any;
    QUEUE_MAIN?: Queue<any>;
}

export default class MyModule extends WorkerEntrypoint<Env> {

    async fetch(_req: Request): Promise<Response> {
        return Response.json({ module: 'quanti-module-mymodule', status: 'ok' });
    }

    /**
     * Self-provisioning install RPC. Wywoływane przez Kernel przez Fleet service:
     *   env.SVC_X.dispatch(slotBinding, 'install', traceId, { projectId })
     */
    async install(traceId: string, payload: { projectId: number }): Promise<void> {
        const { projectId } = payload;
        if (!projectId) throw new Error('Missing projectId');

        const db = getTenantDb(this.env, projectId, traceId);

        await db.prepare(
            `CREATE TABLE IF NOT EXISTS my_table (
                id            TEXT    NOT NULL PRIMARY KEY,
                project_id    INTEGER NOT NULL,
                instance_key  TEXT    NOT NULL DEFAULT 'default',
                metadata      TEXT,
                -- module-specific columns…
                name          TEXT    NOT NULL,
                status        TEXT    NOT NULL DEFAULT 'ACTIVE',
                created_at    INTEGER DEFAULT (unixepoch()),
                updated_at    INTEGER DEFAULT (unixepoch())
            )`,
        ).run();
        await db.prepare(`CREATE INDEX IF NOT EXISTS my_table_project_idx ON my_table (project_id)`).run();
        await db.prepare(`CREATE INDEX IF NOT EXISTS my_table_instance_key_idx ON my_table (project_id, instance_key)`).run();
    }

    /**
     * Explicit Destruction. Wywoływane przez Kernel przy disable+deleteData.
     * DELETE only — schema zostaje, żeby re-enable był no-op install().
     */
    async uninstall(traceId: string, payload: { projectId: number }): Promise<void> {
        const { projectId } = payload;
        if (!projectId) throw new Error('Missing projectId');
        await getTenantDb(this.env, projectId, traceId)
            .prepare('DELETE FROM my_table WHERE project_id = ?')
            .bind(projectId)
            .run();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Domain RPC poniżej — list / getById / create / update / delete itd.
    // Wszystkie używają tego samego getTenantDb proxy.
    // ──────────────────────────────────────────────────────────────────────

    async list(traceId: string, payload: { projectId: number; instanceKey?: string }): Promise<any[]> {
        const { projectId, instanceKey = 'default' } = payload;
        if (!projectId) throw new Error('Missing projectId');

        const result = await getTenantDb(this.env, projectId, traceId)
            .prepare('SELECT * FROM my_table WHERE project_id = ? AND instance_key = ? ORDER BY created_at DESC LIMIT 50')
            .bind(projectId, instanceKey)
            .all();

        return (result.results ?? []).map(mapRaw);
    }
}

function mapRaw(row: any) {
    return {
        id:          row.id,
        projectId:   row.project_id,
        instanceKey: row.instance_key,
        metadata:    row.metadata ? JSON.parse(row.metadata) : null,
        name:        row.name,
        status:      row.status,
        createdAt:   new Date(row.created_at * 1000),
        updatedAt:   new Date(row.updated_at * 1000),
    };
}
```

`getTenantDb` (z `src/utils/db-router.ts`) opakowuje `BACKEND.sys_executeDbQuery` w fluent API `prepare(sql).bind(...).run()` / `.all()`. Pełen kontrakt:

```typescript
// src/utils/db-router.ts
export interface BackendBinding {
    sys_executeDbQuery(projectId: number, query: {
        sql: string;
        params: unknown[];
        method: 'all' | 'run' | 'first' | 'raw';
        traceId?: string;
    }): Promise<{ results?: any[]; meta?: { changes?: number } }>;
}

export function getTenantDb(env: { BACKEND: BackendBinding }, projectId: number, traceId?: string) {
    return {
        prepare(sql: string) {
            const params: unknown[] = [];
            return {
                bind(...args: unknown[]) { params.push(...args); return this; },
                async all()   { return env.BACKEND.sys_executeDbQuery(projectId, { sql, params, method: 'all',   traceId }); },
                async run()   { return env.BACKEND.sys_executeDbQuery(projectId, { sql, params, method: 'run',   traceId }); },
                async first() { return env.BACKEND.sys_executeDbQuery(projectId, { sql, params, method: 'first', traceId }); },
            };
        },
    };
}
```

---

## Antywzorce — Czego Absolutnie NIE Robić

```typescript
// ❌ NIEPOPRAWNIE #1 — bezpośredni env.DB (moduł Fleet go nie ma!)
const rows = await env.DB.prepare('SELECT * FROM my_table').all();
// → ReferenceError: env.DB is undefined at runtime

// ❌ NIEPOPRAWNIE #2 — DROP TABLE w uninstall (skasuje cudze dane na shardzie!)
async uninstall(traceId, { projectId }) {
    await db.prepare('DROP TABLE my_table').run();
}
// → Inni tenanci na tym samym shardzie tracą tabelę. ZAWSZE: DELETE WHERE project_id = ?

// ❌ NIEPOPRAWNIE #3 — DDL w Kernelu/service workerze
// services/quanti-svc-content/src/index.ts (Kernel/service worker)
async install(projectId) {
    await db.prepare('CREATE TABLE IF NOT EXISTS my_table ...').run();
}
// → Kernel hardcoduje schemat modułu = silne sprzężenie. Modu owns DDL.

// ❌ NIEPOPRAWNIE #4 — uninstall bez WHERE project_id
async uninstall(traceId, { projectId }) {
    await db.prepare('DELETE FROM my_table').run();    // brak WHERE!
}
// → IDOR: skasuje dane wszystkich tenantów na tym shardzie

// ❌ NIEPOPRAWNIE #5 — install nie-idempotentny (CREATE TABLE bez IF NOT EXISTS)
await db.prepare('CREATE TABLE my_table (...)').run();
// → Drugie wywołanie install (np. po retry) wybuchnie z "table already exists"

// ❌ NIEPOPRAWNIE #6 — emisja QueueEvent z install/uninstall
async install(traceId, { projectId }) {
    /* ... CREATE ... */
    await this.env.QUEUE_MAIN.send({ type: 'my_table.installed' });
}
// → install/uninstall to lifecycle RPC, nie domain mutation. Bez eventów.

// ❌ NIEPOPRAWNIE #7 — RAW SQL z JOIN (zakaz w Fleet)
await db.prepare('SELECT a.*, b.name FROM a JOIN b ON a.b_id = b.id').all();
// → Złamanie No-JOINs w Fleet; używaj płaskich odczytów + Mega-JSON
```

---

## Checklist Implementacji

- [ ] Worker eksportuje publiczne RPC `install(traceId, {projectId})` i `uninstall(traceId, {projectId})`
- [ ] `install()` używa wyłącznie `CREATE TABLE IF NOT EXISTS` i `CREATE INDEX IF NOT EXISTS`
- [ ] `uninstall()` używa wyłącznie `DELETE FROM <tab> WHERE project_id = ?` — **żadnego DROP**
- [ ] Każda metoda waliduje `payload.projectId` (throw przy braku)
- [ ] `traceId` jest przekazywany do `getTenantDb` w każdym wywołaniu
- [ ] Brak importu `env.DB` lub bezpośredniego bindingu D1 w module
- [ ] Wszystkie zapytania domenowe (list/getById/...) filtrują po `project_id` AND `instance_key`
- [ ] Brak JOIN — tylko płaskie odczyty + Mega-JSON denormalizacja
- [ ] Test jednostkowy z mockowanym `BACKEND` jako `vi.fn()` — Sad Path Ratio ≥ 2:1 (idempotency, anti-IDOR, no-DROP, no-queue, missing-projectId)
- [ ] Manifest `quanti.manifest.json` ma `contract.methods` zawierające `"install"` i `"uninstall"`
