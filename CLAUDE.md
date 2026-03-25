# QUANTI FLEET PROTOCOL v3.5.1

You are an AI Agent operating inside the Quanti Fleet module `media-test`.
You MUST follow ALL rules in this file and the linked documents. No exceptions.

---

## 1. Architecture Fundamentals

Read these first — they define what is and is not allowed in every Fleet module:

- [CORE UI MODULES](./.agent/rules/CORE_UI_MODULES.md)
- [CQRS PATTERNS](./.agent/rules/CQRS_PATTERNS.md)
- [DATA ACCESS PATTERNS](./.agent/rules/DATA_ACCESS_PATTERNS.md)
- [DDD DOCS FIRST](./.agent/rules/DDD_DOCS_FIRST.md)
- [EDGE CONSTRAINTS](./.agent/rules/EDGE_CONSTRAINTS.md)
- [LOCALIZATION STANDARDS](./.agent/rules/LOCALIZATION_STANDARDS.md)
- [MFE PATTERNS](./.agent/rules/MFE_PATTERNS.md)
- [SELF DOCUMENTING STANDARDS](./.agent/rules/SELF_DOCUMENTING_STANDARDS.md)
- [TESTING STANDARDS](./.agent/rules/TESTING_STANDARDS.md)
- [VERSIONING STANDARDS](./.agent/rules/VERSIONING_STANDARDS.md)

---

## 2. Golden Path Examples (In-Context Learning)

**READ THESE BEFORE WRITING ANY CODE.**
Each file shows the ONLY correct pattern for a given Cloudflare primitive.
Each example contains ✅ CORRECT and ❌ INCORRECT patterns with TDD steps.

- [CS-01: D1 — Relacyjna Baza Danych przez proxy Kernela](./.agent/examples/CS-01-D1-DatabaseAccess.md)
- [CS-02: R2 — Object Storage przez Presigned URL](./.agent/examples/CS-02-R2-ObjectStorage.md)
- [CS-03: Cloudflare Workflows — Trwałe Wykonanie (Saga)](./.agent/examples/CS-03-Workflows-DurableExecution.md)
- [CS-04: Durable Objects — Stan Współdzielony i WebSocket](./.agent/examples/CS-04-DurableObjects-RealtimeState.md)
- [CS-05: KV — Globalny Odczyt o Niskim Opóźnieniu](./.agent/examples/CS-05-KV-GlobalRead.md)
- [CS-06: Cloudflare Queues — Dual-Write (CQRS) i Reagowanie na Zdarzenia](./.agent/examples/CS-06-Queues-CQRS.md)
- [CS-07: Vectorize & AI — Wektoryzacja w Tle (RAG)](./.agent/examples/CS-07-Vectorize-RAG.md)
- [CS-08: Quanti UI Kit — Inteligentne Sloty i Dane z context](./.agent/examples/CS-08-UIKit-Slots.md)

---

## 3. This Module's Context

- [Module Brief](./.agent/MODULE_BRIEF.md)

---

## 5. Available Capabilities

These are the ONLY external dependencies allowed in this module.
They are vendored in `vendor/` — do NOT install npm packages.

- (no capabilities injected — run: `quanti cap:add <name>`)

---

## 6. Permissions

Read `.agent/PERMISSIONS.json` before making any changes.
It defines which paths you MAY edit and which are READ_ONLY.

---

## 7. Proposing Rule Changes (Overrides)

If an architecture rule blocks you from implementing something, do NOT modify
files in `.agent/rules/` or `vendor/`. Instead:

1. Create a file in `.agent/overrides/override-<reason>.md`
2. Explain what you want to override and why
3. The override will be evaluated by Mentor AI during `quanti deploy`
4. APPROVED overrides become active; REJECTED overrides are explained in `.agent/FEEDBACK.md`

---

## ⛔ BŁĘDY KRYTYCZNE — NATYCHMIASTOWE ODRZUCENIE KODU

Poniższe naruszenia powodują wynik **Score: 0** w `quanti analyze` i **blokują `quanti deploy`**.

### ZAKAZ TWORZENIA ENDPOINTÓW REST
**NIGDY** nie używaj `req.method`, `url.pathname` ani switch-case po HTTP methods w `src/worker.ts`.
Jedynym dozwolonym API jest klasa `WorkerEntrypoint` z publicznymi metodami RPC.

❌ ZAKAZANE:
```ts
// src/worker.ts — TO JEST BŁĄD KRYTYCZNY
if (req.method === 'POST') { ... }
const url = new URL(req.url); if (url.pathname === '/create') { ... }
```
✅ WYMAGANE:
```ts
export default class MyModule extends WorkerEntrypoint<Env> {
    async create(payload: CreatePayload): Promise<CreateResult> { ... }
}
```

### ZAKAZ UŻYWANIA FETCH NA FRONCIE
**NIGDY** nie wywołuj `fetch()` bezpośrednio w komponentach React (`src/components/*.tsx`).
Komunikacja frontu z backendem idzie WYŁĄCZNIE przez `props.context.api`.

❌ ZAKAZANE:
```tsx
// src/components/MyTable.tsx — TO JEST BŁĄD KRYTYCZNY
const data = await fetch('/api/items');
```
✅ WYMAGANE:
```tsx
context.api?.dispatchQuantiEvent?.('quanti:modal:show', { ... });
```

### KODOWANIE BEZ DOKUMENTACJI W DEFINITION.TS ZAKOŃCZY SIĘ ODRZUCENIEM KODU
Każdy wpis w `uiExtensions[]` MUSI mieć pole `description` z min. 10 słowami opisującymi logikę biznesową.
Wartości zaczynające się od `"TODO"` są traktowane jako dług dokumentacyjny i **blokują analizę**.

---

## FORBIDDEN PATTERNS

These are hard violations. Fleet Guard will block your code at `quanti validate` and `quanti deploy`:

| Pattern | Why forbidden | Correct alternative |
|---------|--------------|---------------------|
| `import ... from 'node:*'` | Edge Workers have no Node.js runtime | Use Web APIs (fetch, crypto, etc.) |
| `env.DB` directly | Breaks tenant isolation | Use `BACKEND.sys_executeDbQuery()` |
| `req.method` / `url.pathname` in worker.ts | REST is forbidden — use RPC only | Public methods on `WorkerEntrypoint` |
| `fetch()` in src/components/*.tsx | Frontend must use context.api | `context.api?.dispatchQuantiEvent()` |
| `uiExtensions[].description` missing/TODO | Documentation Debt blocks deploy | Write ≥10-word business description |
| `.leftJoin()`, `.rightJoin()`, `.innerJoin()` | No JOINs — use Mega-JSON pattern | Flat reads + denormalized data |
| `npm install <pkg>` | Supply chain risk, bundle bloat | Use capabilities via `quanti cap:add` |
| Modify `.agent/rules/*` | Rules are managed by CLI | Create override in `.agent/overrides/` |
| Modify `vendor/*` | Capabilities are immutable | Update via `quanti cap:update` |
| Modify `CLAUDE.md` | Regenerated by CLI | This file is READ_ONLY |

---

*Auto-generated by `quanti` CLI — Protocol v3.5.1*
*Regenerated on: `quanti create`, `quanti rules:sync`, `quanti deploy`*
