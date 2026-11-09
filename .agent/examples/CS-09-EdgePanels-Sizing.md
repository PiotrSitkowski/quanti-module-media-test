<!--
@quanti-example: CS-09-EdgePanels
@kernel-version: >=0.5.0
@last-verified: 2026-04-23
@status: canonical
-->

# CS-09: Edge Panels — Content-Driven Visibility i Sterowanie Wymiarami z Poziomu Modułu

## Cel i Wzorzec

**Problem:** Agent (LLM) próbuje sterować wysokością/szerokością paneli krawędziowych (Top/Bottom/Left/Right) przez wstrzykiwanie `style={{ height: ... }}` w komponent albo przez ręczne `UPDATE` w D1 `module_registry`. Obie drogi są złe — pierwsza walczy z layoutem shella, druga to "kombinacje w bazie" poza kontrolą źródła modułu.

**Rozwiązanie:** Edge Panel deklaruje **default Tailwind class per edge**; moduł nadpisuje ją deklaratywnie przez `metadata.preferredSize` w definicji extensioni. Shell aplikuje klasę na zewnętrznym wrapperze; komponent modułu pozostaje czysty od wiedzy o wymiarach.

**Kluczowa zasada:** wymiar panelu jest **kontraktem shell ↔ moduł** wyrażonym w manifeście modułu (a NIE w JSX komponentu). Deploy pipeline syncuje manifest do `D1.module_registry.ui_extensions`.

---

## Cztery sloty krawędziowe + defaults

| Slot | Edge | Default Tailwind | Pixels |
|---|---|---|---|
| `top_bar` | top | `h-12` | 48px |
| `bottom_bar` | bottom | `h-8` | 32px |
| `left_module_primary` | left | `w-64` | 256px |
| `right_sidebar_header_actions` | right | `w-80` | 320px |
| `right_sidebar_primary_tools` | right | `w-80` | 320px |
| `right_sidebar_secondary_tools` | right | `w-80` | 320px |

**Zachowanie content-driven:** slot bez wstrzykniętej extensioni → wrapper panel kolapsuje do `empty:w-0` / `empty:h-0` (zero widoczności). Tailwind `transition-all duration-300 ease-in-out` animuje pojawianie/zwijanie. Brak state-machine, brak eventów — visibility jest pochodną obecności contentu.

**Force-open legacy (tylko prawy sidebar):** zdarzenie `quanti:sidebar:open` wymusza `data-force-open="true"` i nadpisuje `w-0` nawet przy braku treści (np. loading shell). Nigdy nie jest load-bearing — moduły preferują content-driven.

---

## KROK 1: Default — moduł bez deklaracji wymiaru

Moduł wstrzykuje widget, shell renderuje z domyślnym rozmiarem. Zero konfiguracji.

### Manifest modułu (src przed sync do D1)

```typescript
// src/manifest.ts (lub odpowiednik w pipeline)
export const uiExtensions = [
  {
    slot: 'dashboard_widget',
    component: 'PostsDashboardWidget',
    priority: 10,
    // brak metadata → shell używa default dla dashboard_widget
  },
];
```

---

## KROK 2: Custom Size — `metadata.preferredSize` w manifeście

Widget wymaga większej wysokości (np. bottom-bar z przyciskami Save/Publish/Cancel + status selector potrzebuje `h-16` zamiast defaultowego `h-8`).

### Manifest modułu — bottom_bar z podwojoną wysokością

```typescript
// src/manifest.ts
export const uiExtensions = [
  {
    slot: 'bottom_bar',
    component: 'PostsEditorActions',
    priority: 10,
    metadata: {
      preferredSize: 'h-16', // 64px zamiast defaultowego h-8 (32px)
    },
  },
];
```

### Forma w D1 po sync (read-only dla shella)

```json
{
  "slot": "bottom_bar",
  "component": "PostsEditorActions",
  "priority": 10,
  "metadata": { "preferredSize": "h-16" }
}
```

### Co robi shell

`EdgePanel` czyta `remoteExtensions[0].metadata.preferredSize`. Jeśli obecne — aplikuje tę klasę zamiast defaultu. `empty:` collapse nadal działa (kiedy widget zwróci `null`, panel i tak schowa się do 0).

---

## Przykłady per edge — gotowe do wklejki

### Wyższy Top Bar (globalny toolbar modułu)

```typescript
{
  slot: 'top_bar',
  component: 'MyModuleToolbar',
  priority: 10,
  metadata: { preferredSize: 'h-14' }, // 56px zamiast default h-12 (48px)
}
```

### Wąski Bottom Bar (pasek statusu tylko z ikoną)

```typescript
{
  slot: 'bottom_bar',
  component: 'StatusStrip',
  priority: 10,
  metadata: { preferredSize: 'h-6' }, // 24px zamiast default h-8
}
```

### Szerszy Left Module Panel (file tree, nawigacja hierarchiczna)

```typescript
{
  slot: 'left_module_primary',
  component: 'FileTreeNav',
  priority: 10,
  metadata: { preferredSize: 'w-72' }, // 288px zamiast default w-64 (256px)
}
```

### Węższy Right Sidebar (kompaktowy toolbar)

```typescript
{
  slot: 'right_sidebar_header_actions',
  component: 'QuickActions',
  priority: 10,
  metadata: { preferredSize: 'w-64' }, // 256px zamiast default w-80 (320px)
}
```

---

## Dozwolone klasy Tailwind

Shell zawiera w compiled CSS standardowy zakres Tailwind spacing. Bezpiecznie używać:

- **height:** `h-6`, `h-8`, `h-10`, `h-12`, `h-14`, `h-16`, `h-20`, `h-24`, `h-28`, `h-32`
- **width:** `w-48`, `w-56`, `w-60`, `w-64`, `w-72`, `w-80`, `w-96`

**Custom wartości** (np. `h-[72px]`, `w-[420px]`) — wymagają dodania do safelisty Tailwinda po stronie shella. Jeśli potrzebujesz niestandardowego rozmiaru, skoordynuj się z shellem lub użyj najbliższej standardowej klasy.

---

## Antywzorce

### Wymiar hardcode'owany w JSX komponentu

```tsx
// ŹLE — walka z layoutem shella; EdgePanel ma overflow-hidden i własny wrapper
export function PostsEditorActions() {
  return (
    <div style={{ height: '64px' }}> {/* shell narzuca h-8, to się przytnie */}
      <Button>Save</Button>
    </div>
  );
}
```

**Dlaczego źle:** `EdgePanel` wrapper ma `h-8 overflow-hidden` — Twój `64px` zostaje przycięty do `32px`. Poprawnie: deklaruj w manifeście, komponent renderuje bez height constraints.

### Ręczny `UPDATE` w D1

```sql
-- ŹLE — źródłem prawdy staje się baza, nie kod modułu
UPDATE module_registry
SET ui_extensions = '[..., {"slot":"bottom_bar", ..., "metadata":{"preferredSize":"h-16"}}]'
WHERE id = 'posts';
```

**Dlaczego źle:** przy kolejnym `quanti-cli deploy` Twoja ręczna edycja zostanie nadpisana wartością z manifestu w kodzie modułu. Źródło prawdy = manifest modułu, D1 = tylko cache zsynchronizowany przez pipeline.

### `style={{ height: 'auto' }}` + próba animacji

```tsx
// ŹLE — CSS nie animuje 0 → auto
<div style={{ height: 'auto', transition: 'height 300ms' }}>...</div>
```

**Dlaczego źle:** przeglądarki nie interpolują `height: auto`. Shell używa fixed-target transition (`h-0 ↔ h-16`) właśnie żeby animacja była płynna. Nie próbuj obejść mechanizmu — deklaruj fixed class przez `metadata.preferredSize`.

### Zmiana rozmiaru dynamicznie w runtime z komponentu

```tsx
// ŹLE — shell czyta preferredSize raz przy mount, runtime mutation ignorowana
useEffect(() => {
  if (hasLongContent) {
    document.querySelector('[data-edge="bottom"]').classList.add('h-24');
  }
}, [hasLongContent]);
```

**Dlaczego źle:** (a) Tailwind JIT może nie mieć `h-24` w compiled CSS, (b) mutacja DOM z komponentu modułu łamie separation of concerns, (c) przy next re-render shell przywróci default. Dla dynamicznego rozmiaru: widget self-gate (render `null` gdy nie potrzebny) + statyczny `preferredSize` dla pełnego stanu.

---

## Weryfikacja po deploy

1. Uruchom deploy modułu (`quanti-cli deploy`).
2. Odśwież stronę (Ctrl+Shift+R — ExtensionSlot fetchuje `/api/extensions` na mount bez HMR).
3. DevTools → Inspect element z `data-edge="bottom"` (lub odpowiednim dla Twojego edge).
4. `className` powinien zawierać Twój `preferredSize` (np. `h-16`) + `empty:h-0` + `overflow-hidden` + `transition-all duration-300 ease-in-out`.
5. Test collapse: wstrzyknięty widget zwraca `null` → panel zwija się do `h-0` z animacją.

---

## Decyzyjna tabelka: gdzie deklarować rozmiar?

| Chcę | Gdzie | Jak |
|---|---|---|
| Użyć defaultu shella | nigdzie | Nie dodawaj `metadata` |
| Ustawić stały custom rozmiar | manifest modułu | `metadata: { preferredSize: 'h-16' }` |
| Rozmiar zależny od stanu widgetu | logika w widgecie | Widget renderuje różną zawartość ale ten sam wrapper — shell nie wie o stanie |
| Ukryć panel warunkowo | widget | Widget zwraca `null` → `empty:h-0` zwija |
| Force-open prawy sidebar | event | `dispatchQuantiEvent('quanti:sidebar:open', {...})` (legacy) |
