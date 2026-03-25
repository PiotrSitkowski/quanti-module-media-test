<!--
@quanti-example: CS-08-UIKit
@kernel-version: >=0.4.0
@last-verified: 2026-03-25
@status: canonical
-->

# CS-08: Quanti UI Kit — Inteligentne Sloty i Dane z `props.context`

## Cel i Wzorzec

**Problem:** Agent (LLM) domyślnie instaluje w module zewnętrzne biblioteki UI (shadcn/ui, MUI, Ant Design) i pobiera dane przez `fetch('/api/...')` wewnątrz komponentu. Skutkuje to duplikacją CSS, niespójnym designem, kolizjami zależności w bundlu MFE oraz omijaniem Kernela.

**Rozwiązanie:**
- Wszystkie komponenty UI z `@quanti/ui-kit` (peer dependency — nie bundlowane w module)
- Dane i akcje **wyłącznie** z `props.context` — wstrzykiwanego przez Kernel przy montowaniu slotu
- Żadnych bezpośrednich `fetch()` wewnątrz komponentów

**Typy slotów i ich przeznaczenie:**

| Slot | Komponent UI Kit | Zastosowanie |
|---|---|---|
| `main-view` | `<PageLayout>`, `<DataTable>` | Główny widok modułu (pełna strona) |
| `dashboard-widget` | `<MetricCard>`, `<MiniChart>` | Widget dashboardu (kafelek) |
| `sidebar-panel` | `<QuickActions>`, `<EntityDetail>` | Panel boczny |
| `modal-form` | `<FormBuilder>` | Formularz w modalu |
| `command-palette-item` | `<CommandItem>` | Pozycja w palecie poleceń |

**Kluczowy insight TDD:** `props.context` jest wstrzykiwanym obiektem — idealnym do mockowania przez `vi.fn()` bez żadnej biblioteki. Komponent czysty od zewnętrznych zależności = łatwy do testowania.

---

## KROK 1: RED — Napisz Test Przed Kodem

### Test A — main-view: lista z danymi z context

```typescript
// modules/crm/tests/unit/ContactsView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactsView } from '../../src/components/ContactsView';
import type { SlotContext } from '../../src/types';

// Fabryka kontekstu — buduje mock bez msw i bez fetch interceptorów
const buildCtx = (overrides = {}): SlotContext => ({
  projectId: 'proj_1',
  instanceKey: 'crm-main',
  traceId: 'trace_001',
  api: {
    rpc: vi.fn(),
  },
  data: {
    contacts: [
      { id: 'c1', name: 'Anna Nowak', email: 'anna@e.com' },
      { id: 'c2', name: 'Piotr Kowalski', email: 'piotr@e.com' },
    ],
  },
  actions: {
    openContact: vi.fn(),
    deleteContact: vi.fn(),
  },
  ...overrides,
});

describe('ContactsView (main-view slot)', () => {
  it('should render all contacts from context.data', () => {
    // Arrange
    const ctx = buildCtx();

    // Act
    render(<ContactsView context={ctx} />);

    // Assert
    expect(screen.getByText('Anna Nowak')).toBeInTheDocument();
    expect(screen.getByText('Piotr Kowalski')).toBeInTheDocument();
  });

  it('should call context.actions.openContact with contact id on row click', () => {
    // Arrange
    const ctx = buildCtx();
    render(<ContactsView context={ctx} />);

    // Act
    fireEvent.click(screen.getByTestId('contact-row-c1'));

    // Assert
    expect(ctx.actions.openContact).toHaveBeenCalledWith('c1');
  });

  it('should call context.api.rpc to delete contact on delete button click', async () => {
    // Arrange
    const ctx = buildCtx();
    (ctx.api.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: true });
    render(<ContactsView context={ctx} />);

    // Act
    fireEvent.click(screen.getByTestId('delete-contact-c1'));

    // Assert — mutacja przez RPC, nie bezpośredni fetch
    await waitFor(() => {
      expect(ctx.api.rpc).toHaveBeenCalledWith(
        'contacts',
        'delete',
        expect.objectContaining({ id: 'c1', projectId: 'proj_1' })
      );
    });
  });

  it('should render empty state when context.data.contacts is empty', () => {
    // Arrange
    const ctx = buildCtx({ data: { contacts: [] } });

    // Act
    render(<ContactsView context={ctx} />);

    // Assert
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('contact-row-c1')).not.toBeInTheDocument();
  });
});
```

### Test B — dashboard-widget: MetricCard

```typescript
// modules/crm/tests/unit/CrmDashboardWidget.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrmDashboardWidget } from '../../src/components/CrmDashboardWidget';

describe('CrmDashboardWidget (dashboard-widget slot)', () => {
  it('should display total contacts count from context.data', () => {
    // Arrange — dane są już w context.data (Kernel zapełnił snapshot)
    const ctx = {
      projectId: 'proj_1',
      instanceKey: 'crm-widget',
      traceId: 'trace_001',
      api: { rpc: vi.fn() },
      data: { totalContacts: 142, newThisWeek: 8 },
      actions: {},
    };

    // Act
    render(<CrmDashboardWidget context={ctx as any} />);

    // Assert — widget renderuje dane z context, bez dodatkowych fetch
    expect(screen.getByTestId('metric-total')).toHaveTextContent('142');
    expect(screen.getByTestId('metric-new')).toHaveTextContent('8');
  });

  it('should NOT call context.api.rpc on mount (data already in context)', () => {
    // Arrange
    const ctx = {
      projectId: 'proj_1',
      instanceKey: 'crm-widget',
      traceId: 'trace_001',
      api: { rpc: vi.fn() },
      data: { totalContacts: 10, newThisWeek: 2 },
      actions: {},
    };

    // Act
    render(<CrmDashboardWidget context={ctx as any} />);

    // Assert — widget nie powinien fetchować przy każdym renderze
    expect(ctx.api.rpc).not.toHaveBeenCalled();
  });
});
```

> ⛔ **ZATRZYMAJ SIĘ.** Uruchom testy — oblecą. Po RED → KROK 2.

---

## KROK 2: GREEN — Implementacja Spełniająca Testy

### main-view: Lista kontaktów

```typescript
// modules/crm/src/components/ContactsView.tsx
// ✅ POPRAWNIE — importy WYŁĄCZNIE z @quanti/ui-kit
import { PageLayout, DataTable, Button, EmptyState } from '@quanti/ui-kit';
import type { SlotContext } from '../types';

interface Contact {
  id: string;
  name: string;
  email: string;
}

// ✅ POPRAWNIE — dane z props.context, akcje przez context.api.rpc i context.actions
export function ContactsView({ context }: { context: SlotContext }) {
  const contacts: Contact[] = context.data.contacts ?? [];

  async function handleDelete(id: string) {
    // Mutacja przez RPC — nie bezpośredni fetch('/api/contacts/delete')
    await context.api.rpc('contacts', 'delete', {
      id,
      projectId: context.projectId,
      traceId: context.traceId,
    });
  }

  if (contacts.length === 0) {
    return <EmptyState data-testid="empty-state" message="Brak kontaktów" />;
  }

  return (
    <PageLayout title="Kontakty">
      <DataTable
        data={contacts}
        columns={[
          { key: 'name', label: 'Imię i nazwisko' },
          { key: 'email', label: 'Email' },
        ]}
        onRowClick={(row) => context.actions.openContact(row.id)}
        rowProps={(row) => ({ 'data-testid': `contact-row-${row.id}` })}
        actions={(row) => (
          <Button
            data-testid={`delete-contact-${row.id}`}
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(row.id)}
          >
            Usuń
          </Button>
        )}
      />
    </PageLayout>
  );
}
```

### dashboard-widget: Metryki

```typescript
// modules/crm/src/components/CrmDashboardWidget.tsx
// ✅ POPRAWNIE — MetricCard z @quanti/ui-kit, dane z context.data (snapshot)
import { MetricCard, MetricRow } from '@quanti/ui-kit';
import type { SlotContext } from '../types';

// ✅ Dashboard widget NIE fetchuje danych — Kernel zapełnił context.data
// przed montowaniem komponentu (Server-Side snapshot przez ProjectDO)
export function CrmDashboardWidget({ context }: { context: SlotContext }) {
  return (
    <MetricCard title="CRM — Kontakty">
      <MetricRow
        data-testid="metric-total"
        label="Łącznie"
        value={context.data.totalContacts}
      />
      <MetricRow
        data-testid="metric-new"
        label="Nowe w tym tygodniu"
        value={context.data.newThisWeek}
        trend="up"
      />
    </MetricCard>
  );
}
```

### Rejestracja slotów w definition.ts

```typescript
// modules/crm/definition.ts (fragment)
uiExtensions: [
  {
    slot: 'main-view',
    component: 'ContactsView',
    // ✅ OBOWIĄZKOWE — opis walidowany przez Zod (min 10 znaków)
    description: 'Główny widok listy kontaktów z filtrowaniem, sortowaniem i akcjami CRUD.',
    props: {
      enableBulkActions: true,
    },
  },
  {
    slot: 'dashboard-widget',
    component: 'CrmDashboardWidget',
    description: 'Kafelek dashboardu pokazujący liczbę kontaktów i tygodniowy przyrost.',
  },
],
```

---

## Antywzorce — Czego Absolutnie NIE Robić

```typescript
// ❌ NIEPOPRAWNIE #1 — zewnętrzna biblioteka UI w module
import { Button } from 'shadcn/ui';        // ZAKAZ
import { Table } from '@mui/material';      // ZAKAZ
import { Button } from '@headlessui/react'; // ZAKAZ
// → Duplikacja bundlu CSS, kolizje wersji, niespójny design

// ❌ NIEPOPRAWNIE #2 — fetch danych wewnątrz komponentu
export function ContactsView({ context }) {
  const [contacts, setContacts] = useState([]);
  useEffect(() => {
    fetch('/api/contacts').then(r => r.json()).then(setContacts);
    // → Omija Kernel; brak auth; brak tenantyzacji; brak tracing
  }, []);
}

// ❌ NIEPOPRAWNIE #3 — dane hardkodowane zamiast context.data
export function CrmDashboardWidget() {
  return <MetricCard value={42} />; // Skąd 42? Brak dynamiki
  // → Dane muszą pochodzić z props.context, nie być hardkodowane
}

// ❌ NIEPOPRAWNIE #4 — brak description w definition.ts
uiExtensions: [
  {
    slot: 'main-view',
    component: 'ContactsView',
    // BRAKUJE: description — błąd kompilacji Zod
  }
]

// ❌ NIEPOPRAWNIE #5 — bezpośredni import komponentu z innego modułu
import { ContactCard } from '../../other-module/src/components/ContactCard';
// → Złamanie izolacji MFE; zablokowane przez quanti analyze
```

---

## Checklist Implementacji

- [ ] Wszystkie importy UI z `@quanti/ui-kit` — zero zewnętrznych bibliotek komponentów
- [ ] Dane odczytywane z `context.data` (snapshot) lub żądane przez `context.api.rpc`
- [ ] Brak bezpośrednich `fetch(...)` wewnątrz komponentów
- [ ] Akcje mutacyjne przez `context.api.rpc` z `traceId`
- [ ] `description` uzupełnione w każdym wpisie `uiExtensions` (min 10 znaków)
- [ ] Sloty rejestrowane w prawidłowym polu `definition.ts` (walidacja Zod)
- [ ] Testy mockują `props.context` jako zwykły obiekt z `vi.fn()` — zero `msw`
- [ ] `@quanti/ui-kit` w `vite.config.ts` jako `external` (nie bundlowany)
