# Documentation-Driven Development (DDD) — Docs-First Protocol

**Version:** 1.0
**Severity:** BLOCKING — naruszenie tej reguły jest traktowane jako błąd krytyczny

## ABSOLUTNY ZAKAZ

> **Nie wolno Ci napisać ani jednej linijki kodu TypeScript/React, dopóki nie
> stworzysz/zaktualizujesz pliku `docs/module-context.md` oraz nie zdefiniujesz
> kontraktu API i struktury `definition.ts`.**
>
> **Architektura i dokumentacja ZAWSZE wyprzedzają kodowanie.**

## Obowiązkowa kolejność pracy

### Faza 1: PLANOWANIE (zanim dotkniesz kodu)
1. Stwórz/zaktualizuj `docs/module-context.md`:
   - Overview: co moduł robi i dlaczego istnieje
   - File Map: jakie pliki powstaną i co będą zawierać
   - Rules & Constraints: reguły biznesowe, invarianty
   - Orchestration Guide: jakie eventy emituje/konsumuje
2. Zdefiniuj kontrakt w `definition.ts`:
   - id, name, serviceType, description (>50 słów)
   - slots, mcpTools, emitsEvents, consumesEvents
   - configSchema + configUi (jeśli moduł wymaga konfiguracji)
3. Zdefiniuj payloady w `contract.ts`:
   - Zod schemas dla list/getById/create/update/delete
4. Zdefiniuj schemat w `schema.ts` (jeśli moduł ma DB):
   - Mandatory columns + module-specific columns

### Faza 2: IMPLEMENTACJA (dopiero teraz)
5. Implementuj `src/worker.ts` — CRUD + CQRS events
6. Implementuj `src/workers.ts` — Queue consumer
7. Implementuj `src/components/` — React MFE

### Faza 3: WERYFIKACJA
8. Testy: `npm run test`
9. Walidacja: `quanti validate`
10. Deploy: `quanti deploy`

## Dlaczego?

- `docs/module-context.md` jest odczytywany przez AI Orchestrator do RAG/Vectorize.
  Brak tego pliku = moduł niewidoczny dla AI.
- `definition.ts` jest Single Source of Truth dla runtime.
  Brak opisu >50 słów = moduł nie zostanie poprawnie zaindeksowany.
- Kontrakt API (`contract.ts`) definiuje kształt danych PRZED implementacją.
  Zmiana kontraktu PO implementacji = regresje.
