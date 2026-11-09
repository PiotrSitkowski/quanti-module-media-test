# UI Extension Slots — Quanti Module Catalog

> **⚠️ DEPRECATED (H-MANIFEST-LEGACY-EXTENSIONS, deadline removal `2026-06-14`)** — patrz ADR
> [`adr-deprecate-ui-extensions.md`](../knowledge/L1/adr/adr-deprecate-ui-extensions.md) i regułę
> [`H-MANIFEST-LEGACY-EXTENSIONS`](anti-hallucination-patterns.md#h-manifest-legacy-extensions).
>
> **Nowe moduły MUSZĄ używać manifest v2:**
> - `widgets: [{ id, provides: <capability-id>, version, modes: { ... } }]` — dla rzeczy które moduł
>   OFERUJE innym (provider intent).
> - `consumesSlots: [{ slotId, consumerView, requires: { capability, binding } }]` — dla slotów które
>   moduł chce wypełnić cudzymi widgetami (consumer intent).
>
> Po `2026-06-14` kernel przestaje czytać `uiExtensions[]` / `scope` / `activeIn`. Moduły deklarujące
> tylko legacy fields znikną z resolvera SCW. `warnDeprecatedUiExtensions` (`src/lib/services/legacy-warnings.ts`)
> już emituje telemetry sample per moduł per isolat — sprawdź w dashboardzie.
>
> **Migracja istniejących modułów:** `quanti update` w katalogu modułu odświeża rules i pokazuje
> kierunek migracji. Pełna instrukcja w `MODULE_MIGRATION_PROMPT.md`.
>
> **Ten dokument zachowany WYŁĄCZNIE jako legacy reference** dla istniejących modułów przed
> migracją. NIE używaj `uiExtensions[].slot` w nowym kodzie.

---

> Source-of-truth dla agenta budującego moduł — **jakie sloty istnieją** i **jak ich używać** w `definition.ts → uiExtensions[].slot` (legacy path) lub `consumesSlots[].slotId` (manifest v2 path).
> Synchronizowane przez `@quanti/cli` przy `quanti create-module` / `quanti update`.

## Konwencja

- **snake_case wszędzie** (`dashboard_widget`, NIE `dashboardWidget` ani `DASHBOARD_WIDGET`).
- Sloty dzielą się na:
  - **Globalne** (shell renderuje je w skali całej aplikacji): `dashboard_primary`, `dashboard_widget`, `top_bar`, `bottom_bar`, `navigation_item`, `settings_panel`, `right_sidebar_*`, `left_module_primary`, `entity_detail_tab`, `list_actions`.
  - **Per-moduł** (dedykowane konkretnej domenie, custom string): `post_editor_sidebar`, `media_modal_sidebar`, `[table]_main_view`, etc.
- Lista globalnych slotów (`SystemSlotType`) jest **rozszerzalna** — `slot` ma typ `string`, więc moduł może wprowadzić własny custom slot dla swojej domeny. Nie wymaga to zmiany w kernelu.

## Globalne sloty (`SystemSlotType` enum)

| Slot | Gdzie się renderuje | Typowe użycie |
|---|---|---|
| `dashboard_primary` | Dashboard — główna strefa treści | Jeden moduł zajmuje całą strefę; `core_module_manager` domyślnie (priority 100) |
| `dashboard_widget` | Dashboard główny | KPI cards, charts, recent items |
| `list_actions` | Pasek akcji nad listą | Bulk actions, filtry, export |
| `top_bar` | Górny pasek shell | Quick actions, search, notifications |
| `bottom_bar` | Dolny pasek (content-driven edge panel) | Editor toolbar, status, save controls |
| `left_module_primary` | Lewy panel modułu | Module-side navigation / tree |
| `right_sidebar_header_actions` | Prawy sidebar — header | Per-entity quick actions |
| `right_sidebar_primary_tools` | Prawy sidebar — primary tools | Główny tool panel (np. inspektor) |
| `right_sidebar_secondary_tools` | Prawy sidebar — secondary tools | Secondary tool panel (history, comments) |
| `navigation_item` | Nawigacja główna | Wpis modułu w sidebar nav |
| `settings_panel` | Settings / Admin | Panel konfiguracji modułu |
| `entity_detail_tab` | Tab w widoku entity detail | Cross-module tabs (np. Posts → Comments tab) |

## Per-moduł / custom

- `[table]_main_view` (np. `invoices_main_view`, `categories_main_view`, `posts_main_view`) — **konwencja** dla głównego widoku modułu. **NIE ma globalnego enuma** dla module main view; każdy moduł deklaruje własny string `<table_name>_main_view`.
- Moduł może też definiować własne ekstensje, np. `post_editor_sidebar` — pod warunkiem że host modułu deklaruje ten slot w swoim renderingu.

## Pełnoekranowy edytor — bez globalnego slotu

Nie istnieje globalny systemowy slot dedykowany pełnoekranowemu edytorowi. Moduły obsługują takie widoki w **routingu wewnętrznym** modułu (np. główny widget decyduje, czy renderować listę vs editor dla `/posts/{id}`).

Rozszerzenia dla pełnoekranowych widoków wstrzykuj w istniejące sloty:
- `entity_detail_tab` — dodatkowe taby w detail view.
- `left_module_primary` — alternatywny side-tree gdy edytor otwarty.
- `bottom_bar` — toolbar/status w trybie edycji.

## Migracje (legacy → current)

Stare nazwy które **NIE istnieją** już w SystemSlotType — agent migrujący moduł MUSI je zamienić:

| Legacy | Current | Notatka |
|---|---|---|
| `sidebar_bottom` | `bottom_bar` | Content-driven edge panel — zmiana nazwy 2026-Q1. |
| `host.workspace.sidebar.functions` | `right_sidebar_primary_tools` lub `right_sidebar_secondary_tools` | Stara konwencja dot.notation ze spec — **nieistniejąca**. Wybierz właściwy panel po roli. |
| `host.workspace.main` | `[table]_main_view` (per-moduł) lub `dashboard_widget` (gdy widget) | j.w. — `host.*` to anti-pattern. |
| dowolny `host.*` / `workspace.*` z kropkami | snake_case slot z catalogu | **ZAKAZ** dot.notation w `slot` — zawsze snake_case. |

## Anti-patterns

- ❌ `slot: "host.workspace.sidebar.functions"` — dot.notation **nieistnieje**, nie pasuje do `SystemSlotType` ani konwencji custom.
- ❌ `slot: "MyDashboardWidget"` — camelCase / PascalCase. Używaj snake_case.
- ❌ `slot: "main"` bez prefiksu — kolizja z innymi modułami. Używaj `[table]_main_view`.
- ❌ Wymyślanie globalnego slotu który nie jest w tabeli wyżej — globalne sloty są deklarowane shell-side. Moduł **może** dodać custom slot, ale wtedy musi sam dostarczyć host który go renderuje (per-module, nie globalny).

## Przykład: `definition.ts uiExtensions`

```typescript
export const postsDefinition = {
  id: 'posts',
  uiExtensions: [
    { slot: 'navigation_item', component: 'PostsNavItem', priority: 100 },
    { slot: 'dashboard_widget', component: 'RecentPostsWidget', priority: 50, metadata: { preferredSize: 'h-32' } },
    { slot: 'list_actions', component: 'PostsBulkExport', priority: 10 },
    { slot: 'right_sidebar_primary_tools', component: 'PostInspector', priority: 100 },
    { slot: 'posts_main_view', component: 'PostsMainView', priority: 100 },
  ],
};
```

## Scope (`scope: 'module' | 'global'`, default `'module'`)

- `'module'` (default): ekstensja widoczna TYLKO gdy aktywny jest twój `<id>_main_view` (lub inna strona modułu objęta `requireModuleAccess`).
- `'global'`: ekstensja widoczna na każdej stronie shell (np. notification bell w `top_bar`).

Używaj `'global'` świadomie — większość ekstensji to widgety kontekstowe modułu, nie cross-page tools.