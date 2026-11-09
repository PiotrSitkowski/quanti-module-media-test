# Dostęp do rejestru semantycznego — tylko przez bramę

## Najpierw: czy ten moduł w ogóle potrzebuje rejestru?

**Nie każdy moduł potrzebuje rejestru.** Moduł, który nie opisuje pól, nie waliduje ich klas i nie rysuje palety
pojęć, nie robi NICZEGO z tej reguły — nie dodaje typów, nie woła bramy „na zapas”. Reguła obowiązuje dopiero wtedy,
gdy moduł chce się czegoś z rejestru dowiedzieć (typ pola, klasa, PII, wymagalność, opis, lista wartości, archetyp,
podstawa prawna).

## Jeśli tak — dwie drzwi, jeden kontrakt

| Kod | Drzwi |
|---|---|
| worker modułu albo konektora | `env.BACKEND.semantics_registry({ op, args }, traceId)` — binding `BACKEND` ma każdy moduł, nowego nie dodajesz |
| kod w przeglądarce | `POST /api/semantics/registry` z ciałem `{ "op": "...", "args": [...] }` (zalogowany użytkownik) |

Operacje i kształt odpowiedzi: kontrakt `registry-gate-contract.ts` (wersja kontraktu w polu `contract`). Najczęstsze:
`fieldFacts(key)` (typ, klasa, PII, wymagalność, wartości listy), `fieldDescription(key)`, `group("domena.grupa")`,
`domain(d)`, `labelTargets(tekst)`, `archetype(key)`, `release()` (numer wydania do odcisku przy zapisie).

```ts
const a = await env.BACKEND.semantics_registry({ op: 'fieldFacts', args: ['party.person.first_name'] }, traceId);
if (!a.ok) {
    // a.code: REGISTRY_UNAVAILABLE | RELEASE_MISSING | VALUE_MISSING | VALUE_CORRUPT | GATE_OPERATION_UNKNOWN | GATE_ARGUMENT_INVALID
    // Zamknij się z powodem (a.reason) — NIGDY nie zgaduj klasy pola ani nie przepuszczaj wartości bez niej.
    throw new SaveError(a.code, a.reason);
}
if (a.value === null) { /* klucza nie ma w wydaniu a.version — powód w a.empty */ }
```

**Odmowa jest odpowiedzią, nie wyjątkiem.** Awarię KV, zapas w D1, powrót do poprzedniego wydania i nazwany błąd
obsługuje jądro — raz, w czytniku jądra, na którym stoi brama. Moduł tego nie powiela.

Starsze drzwi `BACKEND.semantics_describeFields(keys, traceId)` i `semantics_describeGroups(groups, traceId)` działają
dalej, w dotychczasowym kształcie, także przez bramę; nowy kod pisz na `semantics_registry`.

## Zakazy — każdy daje modułowi drugi rejestr albo drugą drabinę awarii

| ZAKAZ | Dlaczego |
|---|---|
| binding KV rejestru (`SEMANTIC_REGISTRY`) w `wrangler.toml` modułu | moduł nie ma D1 (`env.DB` zakazane), więc przy awarii KV zostałby bez zapasu |
| budowanie kluczy `sem:current`, `sem:blob:…`, `sem:<n>:manifest`, `src:current` | klucze buduje tylko czytnik jądra; ich kształt się zmienia |
| czytanie tabel `semantic_registry_*` | kopia w D1 to zapas jądra, nie magazyn modułu |
| kopia słownika w module (`src/generated/semantics.ts`, stałe z kluczami i opisami) | kopia się starzeje w ciszy (zmierzone: moduł na v29 przy platformie v31) |

Strażnik: `check-registry-gate-access` (jądro, `validate:fleet`) zgłasza każde z powyższych; moduł, który rejestru
nie czyta, przechodzi bez uwag.