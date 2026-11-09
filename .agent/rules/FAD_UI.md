# FaD UI Standards — jak budować UI modułu zewnętrznego

> **Ta reguła jest dystrybuowana przez Quanti CLI** (`create-module` + `quanti update`). Kanoniczne źródło:
> kernel `.agent/rules/FAD_UI_STANDARDS.md`. **Nie edytuj kopii `.agent/rules/FAD_UI.md` w module** —
> edycja zawsze w kernelu, potem `npm run sync:cli-templates` + re-dystrybucja. Wersja: `fadRulesVersion 1.1.0`.
> Kontekst decyzji: ADR `adr-external-module-fad`; FaD to warstwa SHELL (`00-DESIGN §6`), moduł nadal NIE zna
> regionów — dostarcza UI przez sloty/capabilities, a shell komponuje layout.

## Dwa tory dostarczania UI (framing)

FaD (Frontend-as-Data / Layout-as-Data) to warstwa SHELL: resolver decyduje *gdzie* na stronie leży slot dla
tenanta, renderując manifest layoutu przez `LayoutRenderer → PlacementBoundary → <ExtensionSlot>`. Moduł styka
się z tym **dwutorowo**:

- **Tor (a) — shell-composable widget (bucket A):** mały komponent, który shell upuszcza w dowolny region
  swojego layoutu. Deklarowany w manifest v2 jako `widgets[]` (provider) i/lub konsumujący cudzy slot przez
  `consumesSlots[]` (host z `requires:{capability,binding}`).
- **Tor (b) — host MFE / pełnostronicowa UI (bucket B):** własna pełna strona modułu (edytor, kokpit),
  **świadomie POZA shell-layoutem**. Renderowana z CDN jako RemoteComponent; shell tylko do niej prowadzi.

## Reguły egzekwowalne (R-FAD-1 … R-FAD-13)

### R-FAD-1 — Rozróżnij dwa tory
Każda powierzchnia UI MUSI być świadomie zaklasyfikowana jako bucket-A (widget/host w manifest v2) albo bucket-B
(host MFE / pełna strona). Zakaz: powierzchnia bez klasyfikacji; zakaz: bucket-B „udający" widget shella w
dowolnym regionie.

### R-FAD-2 — Manifest v2 obowiązkowy
Deklaruj UI przez manifest v2: `widgets[]` (provider) + `capabilities` + `consumesSlots[]`/`providesSlots[]`
(kontrakt `src/types/manifest.ts`; wzór: `quanti-module-posts`). Legacy `uiExtensions[]` tylko w trybie
zgodności podczas migracji; **nigdy równolegle z `widgets[]` dla tego samego slotu**. (Legacy pola są
deprecated — patrz `adr-deprecate-ui-extensions`.)

### R-FAD-3 — Zakaz leaku na sloty systemowe (anty-DoD#4)
Żaden wpis (`uiExtensions[]` ani `widgets[]`) nie celuje w slot SYSTEMOWY (`dashboard_*`, `right_sidebar_*`…),
którego moduł nie jest właścicielem. Producent deklaruje sloty własne; host konsumuje cudze przez
`consumesSlots[].requires.capability`, nie surowym wpisem producenckim.

### R-FAD-4 — ui-kit-only
Prymitywy wizualne przez `@quanti/ui-kit` (`Button`, `Input`, `Tabs`…). Zakaz surowego HTML/Tailwind jako chrome
modułu. Wyjątek: renderery **treści autorskiej** (page-builder emitujący `h1/p/img` jako dokument użytkownika) —
output, nie chrome; oznacz jawnie.

### R-FAD-5 — Externalizacja: window globals + Import Map
MFE externalizuje React przez `window.__QUANTI_REACT`/`__QUANTI_REACT_DOM`/`__QUANTI_REACT_JSX` oraz
`@quanti/ui-kit` (global `QuantiUIKit`) w `vite.config.ts` (`external`). Zakaz drugiego Reacta w bundlu (crash
hooków). Rozwiązywane runtime przez Import Map shella.

### R-FAD-6 — Ikony inline SVG
Ikony jako inline SVG. Zakaz `import ... from 'lucide-react'` (i innych paczek ikon) — tylko `@quanti/ui-kit` +
React są externalizowane; import ikon rozbija bundle.

### R-FAD-7 — i18n przez `useModuleTranslation`
Zero hardcodowanych stringów user-facing. Wszystko przez `useModuleTranslation` + `locales/{en,pl}.ts` (`en`
bazowy, `pl` tłumaczenie). Copy bez żargonu/nazw technicznych.

### R-FAD-8 — Reguła #6: brak `window.location.reload`
Aktualizacja UI przez Signal-to-Wake (Nanostores → fetch → DO), nie przeładowanie strony. Zakaz
`window.location.reload()` / `window.location =`.

### R-FAD-9 — Brak natywnego `confirm/alert` — modal + i18n
Potwierdzenia i komunikaty przez modal (`confirmModal` / `@/modules/core/modal-message`), treść przez i18n.
Zakaz `window.confirm`/`alert`/`prompt`.

### R-FAD-10 — TDD RED-first
Każda zmiana kodu: napisz test, **uruchom** i zobacz FAIL, dopiero potem GREEN. RED bez uruchomionego FAIL nie
liczy się. Ratio sad:happy wg `TESTING_STANDARDS.md`.

### R-FAD-11 — Anti-IDOR / tenant-filter
Zero `env.DB`. Dostęp do D1 przez proxy kernela (`BACKEND.sys_executeDbQuery(projectId, …)`); każdy query z
`WHERE project_id = ? AND instance_key = ?`; inserty bindują `(id, project_id, instance_key, …)`. Waliduj
`projectId` (throw gdy brak).

### R-FAD-12 — Wersjonowanie rule-setu
Moduł stempluje przyjętą wersję w `.agent/rules/.fad-rules-version` (robi to CLI przy `create-module`/`update`).
`quanti deploy` ostrzega, gdy wersja modułu < aktualnej z CLI, i blokuje przy niezgodności MAJOR. Nieaktualne
reguły domykasz przez `quanti update` (re-emisja szablonów).

### R-FAD-13 — Formularz modułu odmawia na polu, środkami kitu
Okno albo panel modułu z polami do wypełnienia **nie rysuje własnej odmowy** (czerwonego zdania pod
formularzem, własnej ramki). Staje na kontrakcie formularza kitu, a obwódkę, dymek z powodem i ocenę pól
daje kit — ten sam, który obsługuje ekrany z kanwy:

| Element | Co nosi |
|---|---|
| kontener formularza | `data-cs-form` |
| pole (etykieta + podpowiedź + kontrolka) | `className="cs-field"` |
| pudełko wokół SAMEJ kontrolki | `className="cs-field__box"` — dymek kotwiczy się do niego; bez niego staje nad etykietą i zasłania pole wyżej |
| kontrolka | `className="cs-field__control"`, niepuste `name`, `required` gdzie trzeba; własne zdanie odmowy: `data-cs-error` |
| etykieta pola wymaganego | gwiazdka `*` w kolorze `hsl(var(--destructive))` |

```tsx
import { attachRefusalMarks, collectProblems, formWordsI18n } from '@quanti/ui-kit';

useEffect(() => attachRefusalMarks(formRef.current!, formWordsI18n[lang]), [lang]); // obwódka + dymek po opuszczeniu pola

function submit() {
  const problems = collectProblems(formRef.current!, formWordsI18n[lang]);        // ta sama ocena co w kanwie
  if (problems.length > 0) {
    for (const p of problems) p.control.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    problems[0].control.focus();                                                   // dymek otwiera się przy pierwszym
    return;
  }
  // …
}
```

Czego kit nie wie (np. „ta nazwa jest już zajęta w tej kopii”), okno mówi **pod tym polem**, którego to dotyczy,
nie pod formularzem. Okno stoi na warstwie powłoki (`z-index: 50`) z `aria-modal="true"` — od ui-kit 1.57.0 dymek
pola w takim oknie staje nad nim. Pole adresu/identyfikatora: `SlugInput` (+ `useFollowingSlug`, gdy wynika z nazwy).
Wzór: `NewScreenDialog.tsx` w `quanti-module-canvas-studio`; w jądrze `ConnectorManagerConsole.tsx`.

## Egzekwowalność
- Statycznie (guardy CLI + `validate:fleet`): R-FAD-2 (manifest v2), R-FAD-3 (leak systemowy), koegzystencja
  `widgets[]`+`uiExtensions[]` (warning).
- Grep/build modułu: R-FAD-6 (lucide), R-FAD-8 (`location.reload`), R-FAD-9 (`confirm/alert`).
- Inspekcja: R-FAD-4 (ui-kit), R-FAD-5 (`vite.config.ts` external), R-FAD-1 (klasyfikacja w manifeście).
- `quanti deploy`: R-FAD-12 (`fadRulesVersion` warn/block).
- `pretool-tdd-gate`: R-FAD-10.
- Inspekcja + test modułu: R-FAD-13 (kontrakt formularza: `data-cs-form`, `cs-field`, `cs-field__box`,
  `cs-field__control` + `name`; test sprawdza atrybuty i przekazanie formularza do `attachRefusalMarks`).