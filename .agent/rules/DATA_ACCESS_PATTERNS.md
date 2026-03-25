# Data Access Patterns — Fleet Modules

## ZAKAZ ABSOLUTNY: env.DB
Moduły Fleet NIE mają bezpośrednich bindingów D1.
Zawsze przez proxy: `BACKEND.sys_executeDbQuery(projectId, query)`

## Lazy Provisioning
Tabele NIE powstają przy deploymencie.
DDL uruchamiane automatycznie po system_toggleModule (włączenie modułu).

## 4 Obowiązkowe Kolumny
1. `id` (TEXT PK) — UUID/KSUID
2. `project_id` (INTEGER NOT NULL) — Tenant Isolation
3. `instance_key` (TEXT NOT NULL DEFAULT 'default') — Polimorfizm
4. `metadata` (TEXT JSON) — Elastyczne atrybuty

## Mandatory WHERE (Anti-IDOR)
KAŻDE zapytanie MUSI filtrować po: `project_id` AND `instance_key`

## Mega-JSON / No-JOINs
ZAKAZ .leftJoin() w modułach Fleet.
Zdenormalizuj dane powiązane do kolumny metadata przy zapisie.

## Explicit Query Batching (Optymalizacja N+1)
ZAKAZ używania `sys_executeDbQuery` w pętlach (N+1 query problem).
Dla operacji masowych (np. pobranie danych dla listy ID) OBOWIĄZEK użycia:
`BACKEND.sys_executeDbBatch(projectId, queriesArray)`
Gdy musisz wykonać wiele zapytań sekwencyjnie — zgrupuj je w tablicę
i wyślij jednym wywołaniem batch zamiast N osobnych requestów do backendu.

## Schema Version
Po każdej zmianie schema.ts → podbij `schemaVersion` w definition.ts
System automatycznie uruchomi migrację przy następnej aktywacji modułu.
