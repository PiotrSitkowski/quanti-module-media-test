# MFE Patterns — Micro-Frontend Standards

## Smart Slots
Moduł NIE tworzy własnego sidebara / panelu.
Wstrzykuje się do istniejących slotów platformy:
- right_sidebar_header_actions
- right_sidebar_primary_tools
- right_sidebar_secondary_tools

## Event Communication
Dla zdarzeń systemowych (otwieranie sidebara, etc.):
UŻYWAJ: dispatchQuantiEvent('quanti:sidebar:open', { ... })
ZAKAZ: new CustomEvent('quanti:...') — brak type-safety

Dla zdarzeń modułowych:
Konwencja: window.dispatchEvent(new CustomEvent('[module-id]:[action]'))

## Wywołania i błędy — kontekst od powłoki (od 2026-10-31)
Funkcja wywołań workera modułu jest pod `context.api.rpc` ORAZ `context.rpc` — to ta sama funkcja
(`MFEContext` deklaruje obie). Atrapa w teście modułu buduje kontekst tak samo, inaczej test przechodzi
na adresie, którego powłoka nie podaje (Data Flow Studio 1.2.1: ekran „nie udało się", zero zapytań).

Każda gałąź `catch` i każdy stan „nie udało się” na ekranie zgłasza KOD przez
`context.api?.reportError?.('MODUL_CO_SIE_STALO', { operation: 'useAppMap' })` (`H-ERROR-NOT-IN-AE`).
Powłoka dopisuje moduł, instancję i `traceId` i zapisuje wpis w Analytics Engine. `console.error`
może zostać obok, nigdy zamiast. Kod to `UPPER_SNAKE`; zdanie zamiast kodu zostaje podmienione,
żeby treść błędu (z wartościami pól) nie wyszła. Nieudane `rpc`, niezaładowany pakiet i awarię
rysowania zgłasza sama powłoka — moduł zgłasza to, co wie tylko on.

## DS Compliance
- Używaj komponentów z Design System (Button, Input, etc.)
- Tokeny CSS (text-primary, border-border) zamiast hardcoded hex
- Kolor w SVG/stylu inline: `hsl(var(--muted))`, NIGDY `var(--muted, #hex)` — zmienne motywu to trójki
  HSL, więc gołe `var()` daje kolor nieprawidłowy, a SVG maluje go na czarno (DFS 2026-10-31)
- text-[13px] jako base — NIE text-base / text-lg
- Brak cieni (shadow-md/lg) — borders do separacji
- Max rounded-md (6px)

## Context-Aware
Component MUSI pobierać projectId / instanceKey z props.context.
NIGDY z localStorage / globalnego stanu.

## Powierzchnia RPC modułu — co jądro egzekwuje od 2026-08-09

### Metody cyklu życia są WYŁĄCZNIE dla jądra (SH-1e)

`install`, `uninstall`, `uninstallInstance` i `migrate` woła jądro, gdy właściciel
projektu włącza moduł, wyłącza go albo usuwa jego kopię. Nie są częścią powierzchni żądania i jądro odrzuca je na każdym
kanale zewnętrznym: trasa `POST /api/v1/{moduł}/{metoda}` oddaje `404
METHOD_NOT_DISPATCHABLE`, brama MCP oddaje `TOOL_NOT_FOUND`.

- NADAL JE IMPLEMENTUJESZ — jądro ich potrzebuje. Nic nie usuwaj z workera.
- NIGDY nie wołaj ich z interfejsu modułu (`context.rpc`, `callModuleRpc`).
- Dotyczy to także `uninstallInstance`. Usunięcie kopii modułu jest operacją
  platformy, mimo że kasuje dane tylko jednej instancji.
- NIGDY nie deklaruj ich w `mcpTools` w manifeście. Deklaracja nie zadziała,
  a narzędzie i tak zostanie odrzucone.
- Nie licz na to, że wystarczy rola administratora. To lista NAZW po stronie
  jądra, nie drabina uprawnień — nie przechodzi nikt.

Powód jest po stronie najemcy, nie porządku: `uninstall` kasuje wszystkie dane
modułu w projekcie, a wcześniej jedno żądanie od dowolnej zalogowanej osoby
z tym projektem w sesji wystarczało, żeby to wywołać.

Nazwa dopasowuje się w całości i bez względu na wielkość liter, więc własna
metoda dziedzinowa typu `reinstallTemplate` czy `migrateReport` przechodzi
normalnie.

### Odmowy, które interfejs modułu musi umieć obsłużyć (SH-1a)

Jądro sprawdza przed dyspozycją, czy moduł jest zarejestrowany, aktywny
i włączony w tym projekcie. Twój interfejs może dostać odpowiedzi, których
wcześniej nie było:

| kod | HTTP | kiedy |
|---|---|---|
| `MODULE_NOT_ENABLED` | 403 | moduł wyłączony w tym projekcie |
| `MODULE_INACTIVE` | 403 | moduł oznaczony jako nieaktywny w rejestrze |
| `MODULE_NOT_REGISTERED` | 404 | modułu nie ma w rejestrze |
| `NO_ACTIVE_PROJECT` | 403 | sesja nie ma wybranego projektu |
| `MODULE_ACCESS_CHECK_FAILED` | 503 | jądro nie mogło zweryfikować dostępu |

Traktuj je jak stan, nie jak awarię: pokaż komunikat i nie ponawiaj w pętli.
Wyjątkiem jest 503, które jest przejściowe i wolno je ponowić z odczekaniem.

## Zero-Touch UI (Auto-Generated Forms)
Formularze konfiguracyjne modułu SĄ GENEROWANE AUTOMATYCZNIE przez platformę.
Moduł NIE implementuje własnego formularza ustawień — zamiast tego:
1. Zdefiniuj `configSchema` (Zod) w `definition.ts` — struktura i walidacja ustawień
2. Zdefiniuj `configUi` w `definition.ts` — etykiety, typy widgetów (select/toggle/slider)
3. Platforma Admin UI odczyta te definicje i wygeneruje formularz automatycznie
Klucze `configSchema` MUSZĄ odpowiadać kluczom `configUi` (wymuszane przez `quanti validate`).