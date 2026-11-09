# CQRS Patterns — Dual-Write Protocol (FLAT QueueEvent)

Version: 2.0
Enforced by: `quanti validate` (cqrs-dual-write rule)
Source-of-truth: `@quanti/cli` templates (kernel mirror in `.agent/rules/CQRS_PATTERNS.md`)

## Zasada nadrzędna

Każda operacja modyfikująca dane (CREATE, UPDATE, DELETE) MUSI:
1. Zapisać dane do D1 przez `BACKEND.sys_executeDbQuery()` (proxy w `./utils/db-router`).
2. Wyemitować zdarzenie na `env.QUEUE_MAIN` przez helper `emitQueueEvent` z `./utils/emit-queue-event`.

Brak zdarzenia = Orchestrator/Workflows ślepe na zmianę. Brak zdarzeń = brak wektoryzacji, powiadomień, webhooków.

## Standardowy Event Payload — FLAT shape

```typescript
interface QueueEvent {
  type: string;                          // format: "module-id.event_name" (np. "posts.created")
  payload: Record<string, unknown>;      // free-form; instanceKey + id obowiązkowe per konwencja
  projectId?: number;                    // MUST — Tenant Isolation (TOP-LEVEL, nie w wrapperze)
  timestamp: number;                     // auto-fill przez emitQueueEvent (Date.now())
  traceId?: string;                      // MUST — Distributed Tracing (propaguj z requestu)
}
```

Producent zawsze przez helper:

```typescript
import { emitQueueEvent } from './utils/emit-queue-event';

await emitQueueEvent(env.QUEUE_MAIN, {
  type: 'posts.created',
  payload: { id: post.id, instanceKey, title: post.title },
  projectId,
}, traceId);
```

## Queue Consumer (src/workers.ts) — FLAT odbiór

Konsument czyta `msg.body` jako FLAT `QueueEvent` — bez warstwy `context.*` ani `data`:

```typescript
const { type, payload, projectId, traceId } = msg.body;
```

## Zombie Protection — sys_isModuleEnabled gate

Przed przetworzeniem zdarzenia sprawdź czy moduł jest enabled w projekcie:

```typescript
if (!projectId) { msg.ack(); return; }
const isEnabled = await env.BACKEND.sys_isModuleEnabled(projectId, 'my-module-id');
if (!isEnabled) { msg.ack(); return; }
```

Bez tej bramki disabled module nadal zużywa retries i może wykonać side-effecty.

## Anti-Patterns (Zakazy)

- ❌ `event_id` / `version` / `context` / `data` wrappery — runtime jest FLAT, dispatcher zgubi payload.
- ❌ `queue.send(...)` z pominięciem `emitQueueEvent` — gubi auto-fill `timestamp` / `traceId`.
- ❌ `msg.body.context.projectId` — projectId jest TOP-LEVEL.
- ❌ Brak `sys_isModuleEnabled` gate w consumer — Zombie events przejdą.
- ❌ Import `@/lib/queue/events` w module — moduł nie zna kernela. Używaj `./utils/emit-queue-event`.

## Konwencja typów zdarzeń

Format: `{module-id}.{akcja}` — snake_case, present tense pasywne.

```
posts.created       posts.updated        posts.deleted
products.created    products.price_changed
module.activated    module.deactivated
```
