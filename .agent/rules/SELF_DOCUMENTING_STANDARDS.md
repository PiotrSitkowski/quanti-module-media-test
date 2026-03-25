# Self-Documenting Module Standards

**Version:** 1.1
**Enforced by:** `quanti validate` (logic-coverage-check rule)

## Rules

### Rule 0 — Documentation-Before-Code (DDD)
**BEZWZGLĘDNY:** Zanim napiszesz JAKIKOLWIEK plik .ts/.tsx implementacji:
1. Uzupełnij `docs/module-context.md` → sekcje Overview, File Map, Rules & Constraints, Orchestration Guide
2. Uzupełnij `.agent/MODULE_BRIEF.md` → opis domenowy, przypadki użycia, ograniczenia
3. Dopiero PO zatwierdzeniu dokumentacji przez użytkownika → pisz kod

Naruszenie tej reguły jest blokowane przez `quanti deploy` (Fleet Guard: docs-integrity).

### Rule 1 — File-First Logic
Before creating a new `.ts` or `.tsx` file, add an entry in `docs/module-context.md` under the `## File Map` section.

### Rule 2 — Business Logic Updates
Every commit that changes business logic MUST update the File Map entry to reflect the new behavior.

### Rule 3 — Semantic Summary
After completing a feature, update `## Overview` and `## Orchestration Guide`.

### Rule 4 — Test Files Are Exempt
Files matching `*.test.ts` or `*.test.tsx` do NOT require File Map entries.

## File Map Format

```markdown
| src/worker.ts | Main WorkerEntrypoint — handles RPC methods |
```

See project root `.agent/rules/SELF_DOCUMENTING_STANDARDS.md` for full reference.
