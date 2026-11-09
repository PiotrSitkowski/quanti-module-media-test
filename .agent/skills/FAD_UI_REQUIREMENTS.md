# Skill — jak dostarczyć UI zgodnie z FaD

> Reguła normatywna: `.agent/rules/FAD_UI.md` (R-FAD-1 … R-FAD-12). Ten skill to procedura
> („jak zastosować"), nie kopia reguły. Przy wątpliwości co do brzmienia — czytaj `FAD_UI.md`.

## Krok 0 — sklasyfikuj powierzchnię (R-FAD-1)

Zanim napiszesz komponent, zdecyduj którym torem dostarczasz UI:

- **bucket-A — shell-composable widget:** mały komponent, który shell może upuścić w dowolny
  region swojego layoutu. Deklarujesz go w manifeście jako `widgets[]` (provider) i/lub
  `consumesSlots[]` (host). Musi renderować się bez założeń o rozmiarze/otoczeniu.
- **bucket-B — host MFE / pełna strona:** własny pełnoekranowy widok (edytor, kokpit),
  świadomie POZA shell-layoutem. Shell tylko do niego prowadzi.

Nie zostawiaj powierzchni bez klasyfikacji. Nie rób bucket-B „udającego" widget w dowolnym regionie.

## Krok 1 — deklaracja w manifest v2 (R-FAD-2, R-FAD-3)

Deklaruj UI w `src/definition.ts` przez manifest v2 (NIE legacy `uiExtensions[]`). Przykład —
provider widgetu (bucket-A) + host konsumujący cudzą capability:

```ts
// src/definition.ts (fragment)
export default {
  // ...
  // (a) PROVIDER — udostępniasz własny slot/widget:
  widgets: [
    { slot: 'my_module_main_view', component: 'MyWidget', priority: 20 },
  ],
  providesSlots: [
    { slotId: 'my_module_main_view', capability: 'mymodule.mainview' },
  ],
  // (b) HOST — konsumujesz cudzy slot przez capability (nie surowy wpis producencki):
  consumesSlots: [
    {
      slotId: 'right_sidebar_secondary_tools',
      consumerView: 'edit-item',
      requires: { capability: 'taxonomy.reference', binding: true },
    },
  ],
} satisfies ModuleDefinition;
```

Zakazane (R-FAD-3): celowanie w slot SYSTEMOWY (`dashboard_*`, `right_sidebar_*`), którego moduł
nie jest właścicielem, surowym wpisem producenckim. Cudze sloty konsumuj TYLKO przez
`consumesSlots[].requires.capability`.

Zakazane: koegzystencja `widgets[]` i `uiExtensions[]` dla tego samego slotu (CLI ostrzeże,
`quanti deploy`).

## Krok 2 — higiena komponentu

- **R-FAD-4 ui-kit-only:** prymitywy z `@quanti/ui-kit`; zero surowego HTML/Tailwind jako chrome.
- **R-FAD-5 externalizacja:** `vite.config.ts` musi mieć `external: ['@quanti/ui-kit']` + React przez
  `window.__QUANTI_REACT*`. Nigdy drugiego Reacta w bundlu.
- **R-FAD-6 ikony inline SVG:** zero `import ... from 'lucide-react'`.
- **R-FAD-7 i18n:** wszystko przez `useModuleTranslation` + `locales/{en,pl}.ts`. Zero hardcodów.
- **R-FAD-8 Reguła #6:** zero `window.location.reload()`; aktualizuj przez Signal-to-Wake.
- **R-FAD-9:** zero `window.confirm/alert/prompt`; modal + i18n.
- **R-FAD-11 Anti-IDOR:** D1 tylko przez `BACKEND.sys_executeDbQuery(projectId, …)` z predykatem
  `WHERE project_id = ? AND instance_key = ?`.

## Krok 3 — TDD i wersja reguł

- **R-FAD-10:** każda zmiana kodu RED-first (napisz test, uruchom, zobacz FAIL, potem GREEN).
- **R-FAD-12:** wersja rule-setu jest w `.agent/rules/.fad-rules-version`. Gdy `quanti deploy`
  ostrzega, że masz starszą wersję — uruchom `quanti update`, by odświeżyć `FAD_UI.md` i stempel.
