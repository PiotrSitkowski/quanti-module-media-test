## ⚡ KROK 0 — BEZWZGLĘDNY WYMÓG (URUCHOM PRZED PIERWSZĄ LINIĄ KODU)

**Zanim napiszesz JAKĄKOLWIEK linię kodu**, Twoim absolutnym obowiązkiem jest zapoznać się ze Złotymi Ścieżkami w katalogu `.agent/examples/`. Szczególną uwagę zwróć na implementację interfejsu (CS-08) i użycie wstrzykiwanego Quanti UI Kit. **ZAKAZ używania surowego HTML.**

Twoja **pierwsza odpowiedź** w KAŻDYM nowym zadaniu MUSI zawierać wypunktowaną listę reguł i używanych komponentów w formacie **max. 2-10 słów na regułę**.

**Jeśli zaczniesz pisać kod bez tego podsumowania, łamiesz krytyczny protokół platformy.**

---

# QUANTI FLEET PROTOCOL v3.5.1

You are an AI Agent operating inside the Quanti Fleet module `media-test`.
You MUST follow ALL rules in this file and the linked documents. No exceptions.

---

## ⚡ Critical Rules (from active skills)

These are the MUST/MUST NOT constraints from every active skill in `.agent/skills/`.
**Read this table BEFORE any edit.** Every row has a `Verify` command that MUST exit 0
after your change. A failing verify = the change is wrong and MUST be reverted or fixed.

- (no active skills found — run `quanti update` to refresh the module-side set)

---

## 🗺 Knowledge Base Router

Quanti knowledge vault lives under `.agent/knowledge/`. Use this router as the routing
table: *what am I editing? → which layer do I need to consult?*

- (no knowledge base — run `quanti update` or `quanti kb regen --all`)

---

## 🔁 Skill Application Protocol

Before editing any file in `modules/`, `services/`, or `src/`:

1. **Locate applicable skill.** Scan `.agent/skills/` for a skill whose `applies_when`
   matches the file path, the user intent, or the task at hand. If none matches, proceed
   with the generic architecture rules in §1 and §2.
2. **Echo hard constraints BEFORE your first edit.** Paste the skill's
   `hard_constraints[].must` as a bulleted comment in your response. This is anti-drift:
   the agent has to acknowledge the rules out loud, not just read them silently.
3. **Run verify commands.** Every `hard_constraints[].verify` shell command MUST run
   clean after the change (exit code 0). If you cannot run it, say so explicitly.
4. **Emit verify checklist at the end.** List each `Verify before commit` bullet from the
   skill with `[x]` / `[ ]` / `[skip: reason]` — no silent skips.

If an active skill's `hard_constraints` contradict the task, STOP and surface the
conflict to the user. Do NOT silently override.

Tooling support: `quanti skill apply --list` shows active skills;
`quanti skill apply <id>` prints the full contract (constraints + procedure + verify).

---

## 1. Architecture Fundamentals

Read these first — they define what is and is not allowed in every Fleet module:

- [CODE STANDARDS](./.agent/rules/CODE_STANDARDS.md)
- [CORE UI MODULES](./.agent/rules/CORE_UI_MODULES.md)
- [CQRS PATTERNS](./.agent/rules/CQRS_PATTERNS.md)
- [DATA ACCESS PATTERNS](./.agent/rules/DATA_ACCESS_PATTERNS.md)
- [DDD DOCS FIRST](./.agent/rules/DDD_DOCS_FIRST.md)
- [EDGE CONSTRAINTS](./.agent/rules/EDGE_CONSTRAINTS.md)
- [FAD UI](./.agent/rules/FAD_UI.md)
- [LOCALIZATION STANDARDS](./.agent/rules/LOCALIZATION_STANDARDS.md)
- [MFE PATTERNS](./.agent/rules/MFE_PATTERNS.md)
- [MODULE MIGRATION PROMPT](./.agent/rules/MODULE_MIGRATION_PROMPT.md)
- [REGISTRY ACCESS](./.agent/rules/REGISTRY_ACCESS.md)
- [SELF DOCUMENTING STANDARDS](./.agent/rules/SELF_DOCUMENTING_STANDARDS.md)
- [TESTING STANDARDS](./.agent/rules/TESTING_STANDARDS.md)
- [UI EXTENSION SLOTS](./.agent/rules/UI_EXTENSION_SLOTS.md)
- [VERSIONING STANDARDS](./.agent/rules/VERSIONING_STANDARDS.md)

### This module lives in its OWN repository

An external module is external because it owns its repository — separate from the
kernel and from every other module. `quanti create-module` already ran `git init`
and made the first commit here; what is still on you is the **remote**:

```bash
gh repo create <module-name> --private --source=. --remote=origin && git push -u origin main
```

`quanti deploy` refuses to run until `origin` is set. That is not bureaucracy: the
bundle goes to a CDN under an immutable versioned URL and lives in tenants' hands
from that moment. If the source is not in a remote repository by then, one lost
directory means a deployed module nobody can fix or reproduce.

Never move this module into the kernel repository. The kernel holds orchestration
only — routing, auth, tenant management — and knows nothing about what any module does.

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
- [CS-09: Edge Panels — Content-Driven Visibility i Sterowanie Wymiarami z Poziomu Modułu](./.agent/examples/CS-09-EdgePanels-Sizing.md)

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
*Regenerated on: `quanti create-module`, `quanti update`, `quanti deploy`*
