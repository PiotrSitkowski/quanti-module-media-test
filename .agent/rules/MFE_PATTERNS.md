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

## DS Compliance
- Używaj komponentów z Design System (Button, Input, etc.)
- Tokeny CSS (text-primary, border-border) zamiast hardcoded hex
- text-[13px] jako base — NIE text-base / text-lg
- Brak cieni (shadow-md/lg) — borders do separacji
- Max rounded-md (6px)

## Context-Aware
Component MUSI pobierać projectId / instanceKey z props.context.
NIGDY z localStorage / globalnego stanu.

## Zero-Touch UI (Auto-Generated Forms)
Formularze konfiguracyjne modułu SĄ GENEROWANE AUTOMATYCZNIE przez platformę.
Moduł NIE implementuje własnego formularza ustawień — zamiast tego:
1. Zdefiniuj `configSchema` (Zod) w `definition.ts` — struktura i walidacja ustawień
2. Zdefiniuj `configUi` w `definition.ts` — etykiety, typy widgetów (select/toggle/slider)
3. Platforma Admin UI odczyta te definicje i wygeneruje formularz automatycznie
Klucze `configSchema` MUSZĄ odpowiadać kluczom `configUi` (wymuszane przez `quanti validate`).
