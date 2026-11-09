# Module Migration Prompt — Quanti CLI v2.x → current

Cel: agent budujący moduł Quanti przepisuje istniejący moduł na aktualny kontrakt CLI.
Ten plik jest emitowany przez `quanti update`. Wykonaj checklist po kolei.

## 1. FLAT QueueEvent migration

Anti-pattern do USUNIĘCIA z modułu (nested wrapper):

```typescript
this.env.QUEUE_MAIN.send({
  event_id: crypto.randomUUID(),
  type:    'posts.created',
  version: 1,
  context: { projectId, instanceKey, traceId },
  data:    { id, ...fields },
});
```

Aktualny FLAT shape (przez helper `./utils/emit-queue-event`):

```typescript
import { emitQueueEvent } from './utils/emit-queue-event';

await emitQueueEvent(this.env.QUEUE_MAIN, {
  type:    'posts.created',
  payload: { id, instanceKey, ...fields },
  projectId,
}, traceId);
```

- [ ] Zastąp `event_id`/`version`/`context`/`data` wrappery na FLAT `{type, payload, projectId, traceId}`.
- [ ] W consumer (`src/workers.ts`) odczytuj `msg.body.{type,payload,projectId,traceId}` — NIGDY `msg.body.context.*`.
- [ ] Usuń `crypto.randomUUID()` w `event_id` (dispatcher nie czyta tego pola).

## 2. Module-side helpers (NEW)

Quanti CLI ≥ 2.2 emituje dwa pomocnicze pliki w module:

- `src/utils/db-router.ts` — `getTenantDb(env, projectId, traceId)` proxy do `BACKEND.sys_executeDbQuery`.
- `src/utils/emit-queue-event.ts` — module-side kopia helpera (FLAT shape).

- [ ] Wszystkie odczyty/zapisy do D1 w workerze idą przez `getTenantDb` z `./utils/db-router`.
- [ ] Wszystkie emity Queue idą przez `emitQueueEvent` z `./utils/emit-queue-event`.
- [ ] **NIGDY** import z kernel-side ścieżki (alias rozwiązywany do kernela) — moduł jest standalone.

## 3. Zombie Protection (sys_isModuleEnabled)

Każdy queue consumer musi mieć bramkę przed side-effectami:

```typescript
if (!msg.body.projectId) { msg.ack(); continue; }
const isEnabled = await env.BACKEND.sys_isModuleEnabled(msg.body.projectId, MODULE_ID);
if (!isEnabled) { msg.ack(); continue; }
```

- [ ] Bramka `sys_isModuleEnabled` jest wywołana przed switch'em na `type`.
- [ ] Disabled module → `msg.ack()` (NIE retry — nie ma co przetwarzać).

## 4. UI Extension Slots — migracja legacy nazw

Pełna lista aktualnych slotów + konwencje: `.agent/rules/UI_EXTENSION_SLOTS.md`.

Nazwy slotów które MUSISZ zamienić w `definition.ts → uiExtensions[].slot`:

- `sidebar_bottom` → `bottom_bar` (content-driven edge panel).
- `host.workspace.sidebar.functions` → `right_sidebar_primary_tools` lub `right_sidebar_secondary_tools` (wybierz po roli).
- `host.workspace.main` → `[table]_main_view` (per-moduł, np. `posts_main_view`) lub `dashboard_widget` gdy widget.
- dowolny `host.*` / `workspace.*` z dot.notation → snake_case slot z catalogu (`UI_EXTENSION_SLOTS.md`).

- [ ] `grep -r 'host\.workspace\|sidebar_bottom\|workspace\.main' src/ docs/` zwraca brak wyników.
- [ ] Każdy `uiExtensions[].slot` jest snake_case.
- [ ] Każdy `uiExtensions[].slot` jest albo z catalogu `SystemSlotType` (`UI_EXTENSION_SLOTS.md` §Globalne sloty), albo follow-uje konwencję `[table]_main_view` / per-module custom.

## 5. Anti-patterns do usunięcia

- ❌ `getTenantDb` lokalnie inline — używaj helpera z `./utils/db-router`.
- ❌ `env.DB` w handlerze — moduły nie bindują D1 bezpośrednio (H-FLEET-ENVDB).
- ❌ Node-style global procesowy (zob. H-CFCORE-001) — V8 Isolate nie eksponuje tego globala. Czytaj sekrety z argumentu `env`.
- ❌ Node `crypto` import (zob. H-CFCORE-006) — używaj WebCrypto: `crypto.randomUUID()`.
- ❌ `UPPER_CASE_EVENT_TYPES` — konwencja: `module-id.action_past` (np. `posts.created`).
- ❌ Identyfikator typu `POST_CREATED` — używaj `posts.created` snake_case + kropka.
- ❌ `slot: 'host.workspace.*'` lub jakikolwiek dot.notation w `uiExtensions` — patrz §4.

## 5. Test contract

- [ ] Każda mutacja w handlerze ma test sprawdzający emit FLAT QueueEvent.
- [ ] Consumer test: bramka Zombie Protection blokuje gdy `isEnabled=false` (mock backend).
- [ ] `vitest run` exit 0 przed deploy.

## 6. Akceptacja

- [ ] Wykonałem wszystkie sekcje 1-5.
- [ ] `quanti validate` zwraca exit 0.
- [ ] Wersja CLI w `package.json` projektu jest aktualna (porównanie z `https://cdn.quanti-system.cloud/cli/version.txt`).
