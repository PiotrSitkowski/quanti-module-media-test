# Localization Standards (i18n)

**Version:** 1.1
**Enforced by:** `quanti validate` (i18n-sync-check rule)

## ⛔ ABSOLUTNY ZAKAZ: Hardcoded Strings in .tsx Files

**FORBIDDEN in ALL .tsx component files:**
- String literals used as user-visible text (e.g. `<button>Upload</button>`, `<p>Ładowanie...</p>`)
- Any text that would change depending on the user's language

**Violations block deployment.** Agent: if you hardcode ANY user-visible string in a `.tsx` file,
the build will fail at `quanti validate`.

## Core Principles

### Rule 1 — EN is the Source of Truth
`src/locales/en.ts` defines the canonical set of translation keys.
All keys in `en.ts` MUST exist in every other locale file.

### Rule 2 — Key Symmetry
`en.ts` and `pl.ts` must have exactly the same keys.
Asymmetry (key in one file but not the other) is blocked by `quanti validate`.

### Rule 3 — No Hardcoded User-Facing Strings in .tsx
FORBIDDEN: string literals in .tsx components for user-visible text.
REQUIRED: `useModuleTranslation(resolveLang(props.context))` and reference translation keys.

### Rule 4 — Lang Comes from Context (dual channel)
The host shell sets the language via TWO channels: the FaD path
(PlacementBoundary) threads `context.locale`, the legacy module page threads
`context.lang`. ALWAYS resolve through `resolveLang(context)` from
src/hooks/useModuleTranslation.ts — reading a single channel makes the module
EN-only on the other path. Modules MUST NOT maintain lang state — consumers only.

### Rule 5 — Adding New Keys
When adding a new user-facing string:
1. Add the key to `src/locales/en.ts` first (EN = source of truth)
2. Add the translation to `src/locales/pl.ts`
3. Run `quanti validate` to confirm sync

## Translation File Format

```typescript
// src/locales/en.ts
export const translations = {
    title:          'My Module',
    loadingMessage: 'Loading...',
    emptyState:     'No items found.',
    errorTitle:     'An error occurred.',
    uploadBtn:      'Upload file',
    // add new keys here
};
```

## Hook Usage in .tsx

```tsx
import { useModuleTranslation, resolveLang } from '../hooks/useModuleTranslation.js';

export function MyComponent({ context }: Props) {
    const t = useModuleTranslation(resolveLang(context));
    return <button>{t.uploadBtn}</button>;  // ✅ CORRECT
    // return <button>Upload</button>;     // ❌ FORBIDDEN — hardcoded string
}
```

See project root `.agent/rules/LOCALIZATION_STANDARDS.md` for full reference.
