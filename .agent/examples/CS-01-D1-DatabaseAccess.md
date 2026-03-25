<!--
@quanti-example: CS-01-D1
@kernel-version: >=0.4.0
@last-verified: 2026-03-25
@status: canonical
-->

# CS-01: D1 — Relacyjna Baza Danych przez BACKEND Proxy

## Cel i Wzorzec

**Problem:** Moduły Fleet nie mają bindingu `env.DB`. Agent (LLM) domyślnie generuje kod z bezpośrednim `env.DB.prepare(...)` lub `getTenantDb(env, projectId)` — oba wzorce powodują runtime error, bo te symbole nie istnieją w kontekście Fleet Workera.

**Rozwiązanie:** Każde zapytanie SQL w module musi przechodzić przez `BACKEND.sys_executeDbQuery(projectId, { sql, params })`. Kernel automatycznie aplikuje izolację tenanta (`project_id`, `instance_key`), Row-Level Security i tracing.

**Kluczowy insight TDD:** `BACKEND` to service binding — można go zmockować jako zwykły obiekt z `vi.fn()`. Nie potrzebujesz żadnej biblioteki do mockowania HTTP.

---

## KROK 1: RED — Napisz Test Przed Kodem

Celem testu jest weryfikacja, że funkcja serwisowa:
1. Wywołuje `BACKEND.sys_executeDbQuery` z prawidłowym SQL i `projectId`
2. Zwraca zmapowane dane
3. **NIE** wywołuje `env.DB` bezpośrednio

```typescript
// modules/crm/tests/unit/contacts.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchContacts } from '../../src/lib/contacts.service';

describe('fetchContacts', () => {
  // Arrange — mock BACKEND jako plain object z vi.fn()
  // Nie potrzebujesz msw, jest-fetch-mock ani żadnej zewnętrznej biblioteki.
  const mockBackend = {
    sys_executeDbQuery: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call sys_executeDbQuery with correct projectId and SQL', async () => {
    // Arrange
    const projectId = 'proj_abc123';
    mockBackend.sys_executeDbQuery.mockResolvedValueOnce([
      { id: '1', name: 'Jan Kowalski', email: 'jan@example.com' },
    ]);

    // Act
    await fetchContacts(mockBackend as any, projectId);

    // Assert
    expect(mockBackend.sys_executeDbQuery).toHaveBeenCalledOnce();
    expect(mockBackend.sys_executeDbQuery).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({
        sql: expect.stringContaining('SELECT'),
        params: expect.any(Array),
      })
    );
  });

  it('should return mapped contact list from query result', async () => {
    // Arrange
    const projectId = 'proj_abc123';
    mockBackend.sys_executeDbQuery.mockResolvedValueOnce([
      { id: '1', name: 'Jan Kowalski', email: 'jan@example.com', metadata: '{}' },
    ]);

    // Act
    const result = await fetchContacts(mockBackend as any, projectId);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: '1', name: 'Jan Kowalski' });
  });

  it('should return empty array when query returns no rows', async () => {
    // Arrange
    mockBackend.sys_executeDbQuery.mockResolvedValueOnce([]);

    // Act
    const result = await fetchContacts(mockBackend as any, 'proj_empty');

    // Assert — test obleje jeśli implementacja zwróci null lub undefined
    expect(result).toEqual([]);
  });
});
```

> ⛔ **ZATRZYMAJ SIĘ.** Uruchom test. Powinien oblec z błędem `Cannot find module '../../src/lib/contacts.service'`. Dopiero po potwierdzeniu RED przechodzisz do KROKU 2.

---

## KROK 2: GREEN — Implementacja Spełniająca Test

```typescript
// modules/crm/src/lib/contacts.service.ts

// Typ pomocniczy opisujący kontrakt BACKEND proxy (nie importuj z Kernela!)
interface BackendProxy {
  sys_executeDbQuery(
    projectId: string,
    query: { sql: string; params: (string | number | null)[] }
  ): Promise<unknown[]>;
}

interface Contact {
  id: string;
  name: string;
  email: string;
}

// ✅ POPRAWNIE — przez BACKEND proxy, brak env.DB
export async function fetchContacts(
  BACKEND: BackendProxy,
  projectId: string
): Promise<Contact[]> {
  const rows = await BACKEND.sys_executeDbQuery(projectId, {
    sql: 'SELECT id, name, email FROM contacts WHERE project_id = ? ORDER BY name',
    params: [projectId],
  });

  return (rows as Contact[]).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
  }));
}
```

```typescript
// modules/crm/src/index.ts — Worker entry point
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { projectId } = await getProjectContext(request, env);

    // BACKEND jest service bindingiem wstrzykiwanym przez Cloudflare
    const contacts = await fetchContacts(env.BACKEND, projectId);

    return Response.json({ contacts });
  },
};
```

---

## Antywzorce — Czego Absolutnie NIE Robić

```typescript
// ❌ NIEPOPRAWNIE #1 — bezpośredni env.DB (moduł Fleet go nie ma!)
const rows = await env.DB.prepare(
  'SELECT * FROM contacts WHERE project_id = ?'
).bind(projectId).all();
// → ReferenceError: env.DB is undefined at runtime

// ❌ NIEPOPRAWNIE #2 — getTenantDb (dostępne tylko w Kernelu)
import { getTenantDb } from '@quanti/db';
const db = getTenantDb(env, projectId);
// → Zablokowane przez quanti analyze (ImportDeclaration violation)

// ❌ NIEPOPRAWNIE #3 — RAW SQL z JOIN (zakaz w Fleet)
const rows = await BACKEND.sys_executeDbQuery(projectId, {
  sql: 'SELECT c.*, p.name as project_name FROM contacts c JOIN projects p ON c.project_id = p.id',
  params: [],
});
// → Złamanie zasady No-JOINs w Fleet; używaj płaskich odczytów + Mega-JSON

// ❌ NIEPOPRAWNIE #4 — endpoint REST zamiast RPC
app.get('/api/contacts', async (req) => { ... });
// → Moduły Fleet nie eksponują endpointów REST
```

---

## Checklist Implementacji

- [ ] Brak importu `env.DB` lub `getTenantDb` w module
- [ ] Wszystkie zapytania przez `BACKEND.sys_executeDbQuery`
- [ ] Tabela zawiera kolumny: `id`, `project_id`, `instance_key`, `metadata`
- [ ] Brak JOIN — tylko płaskie odczyty
- [ ] Test jednostkowy z mockowanym `BACKEND` jako `vi.fn()`
