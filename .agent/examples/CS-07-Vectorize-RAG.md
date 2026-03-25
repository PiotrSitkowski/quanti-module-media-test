<!--
@quanti-example: CS-07-Vectorize
@kernel-version: >=0.4.0
@last-verified: 2026-03-25
@status: canonical
-->

# CS-07: Vectorize & AI — Wektoryzacja w Tle (RAG)

## Cel i Wzorzec

**Problem:** Agent (LLM) domyślnie generuje embeddinga synchronicznie w ścieżce HTTP: `const emb = await env.AI.run(...); return Response.json({ emb })`. Worker ma limit 30s CPU — generowanie embeddingów dla dużych dokumentów przekroczy ten limit. Ponadto moduły Fleet nie mają dostępu do `env.AI` ani `env.VECTORIZE`.

**Rozwiązanie (2-fazowy pipeline):**
1. **Zapis dokumentu** → Dual-Write: D1 + zdarzenie `document.created` na Queue
2. **Wektoryzacja w tle** → `src/workers.ts` odczytuje zdarzenie, generuje embedding przez Kernel RPC, zapisuje do Vectorize
3. **Wyszukiwanie RAG** → przez dedykowane RPC `kernel.semantic_search`

**Kluczowy insight TDD:** Logika wyboru i przetwarzania zdarzeń w workerze to czyste funkcje. Mockuj `env.BACKEND.sys_rpc` przez `vi.fn()` — nie potrzebujesz działającej instancji Vectorize ani AI.

---

## KROK 1: RED — Napisz Test Przed Kodem

### Test A — Worker: obsługa document.created (wektoryzacja asynchroniczna)

```typescript
// modules/knowledge-base/tests/unit/documentIndexer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDocumentCreated } from '../../src/lib/handlers/documentIndexer';

describe('handleDocumentCreated', () => {
  const mockBackend = {
    sys_rpc: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('should call kernel vectorize_document with document content', async () => {
    // Arrange
    mockBackend.sys_rpc.mockResolvedValueOnce({ vectorId: 'vec_abc123' });
    const payload = {
      id: 'doc_1',
      content: 'Treść dokumentu do wektoryzacji',
      projectId: 'proj_1',
    };

    // Act
    await handleDocumentCreated(mockBackend as any, payload, 'trace_001');

    // Assert
    expect(mockBackend.sys_rpc).toHaveBeenCalledWith(
      'kernel',
      'vectorize_document',
      expect.objectContaining({
        documentId: 'doc_1',
        content: 'Treść dokumentu do wektoryzacji',
        projectId: 'proj_1',
        traceId: 'trace_001',
      })
    );
  });

  it('should return vectorId from kernel response', async () => {
    // Arrange
    mockBackend.sys_rpc.mockResolvedValueOnce({ vectorId: 'vec_xyz' });

    // Act
    const result = await handleDocumentCreated(
      mockBackend as any,
      { id: 'doc_2', content: 'content', projectId: 'proj_1' },
      'trace_002'
    );

    // Assert
    expect(result).toMatchObject({ vectorId: 'vec_xyz' });
  });

  it('should throw on kernel RPC failure (for Queue retry)', async () => {
    // Arrange — symuluj niedostępność AI API
    mockBackend.sys_rpc.mockRejectedValueOnce(new Error('AI API timeout'));

    // Act & Assert — rzucenie błędu → Queue wykona msg.retry()
    await expect(
      handleDocumentCreated(
        mockBackend as any,
        { id: 'doc_3', content: 'x', projectId: 'proj_1' },
        'trace_003'
      )
    ).rejects.toThrow('AI API timeout');
  });
});
```

### Test B — Komponent MFE: wyszukiwanie semantyczne

```typescript
// modules/knowledge-base/tests/unit/SemanticSearch.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SemanticSearch } from '../../src/components/SemanticSearch';

describe('SemanticSearch component', () => {
  it('should call context.api.rpc semantic_search on form submit', async () => {
    // Arrange — context.api.rpc jest vi.fn(), brak fetch do zewnętrznego API
    const ctx = {
      projectId: 'proj_1',
      traceId: 'trace_001',
      api: {
        rpc: vi.fn().mockResolvedValueOnce({
          results: [
            { id: 'doc_1', title: 'Polityka urlopowa', score: 0.92 },
          ],
        }),
      },
      data: {},
      actions: {},
    };
    render(<SemanticSearch context={ctx as any} />);

    // Act
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'jak wziąć urlop' },
    });
    fireEvent.submit(screen.getByTestId('search-form'));

    // Assert
    await waitFor(() => {
      expect(ctx.api.rpc).toHaveBeenCalledWith(
        'kernel',
        'semantic_search',
        expect.objectContaining({
          query: 'jak wziąć urlop',
          projectId: 'proj_1',
        })
      );
    });
  });

  it('should display results returned by semantic_search', async () => {
    // Arrange
    const ctx = {
      projectId: 'proj_1',
      traceId: 'trace_001',
      api: {
        rpc: vi.fn().mockResolvedValueOnce({
          results: [{ id: 'doc_1', title: 'Polityka urlopowa', score: 0.92 }],
        }),
      },
      data: {},
      actions: {},
    };
    render(<SemanticSearch context={ctx as any} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'urlop' } });
    fireEvent.submit(screen.getByTestId('search-form'));

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Polityka urlopowa')).toBeInTheDocument();
    });
  });
});
```

> ⛔ **ZATRZYMAJ SIĘ.** Uruchom testy — oblecą z błędem `Cannot find module`. Po RED → KROK 2.

---

## KROK 2: GREEN — Implementacja Spełniająca Testy

### Handler wektoryzacji (workers.ts)

```typescript
// modules/knowledge-base/src/lib/handlers/documentIndexer.ts

interface BackendProxy {
  sys_rpc(service: string, method: string, payload: Record<string, unknown>): Promise<unknown>;
}

// ✅ POPRAWNIE — wektoryzacja przez Kernel RPC (Kernel ma env.AI i env.VECTORIZE)
export async function handleDocumentCreated(
  BACKEND: BackendProxy,
  payload: { id: string; content: string; projectId: string },
  traceId: string
): Promise<{ vectorId: string }> {
  // Kernel generuje embedding przez env.AI.run() i zapisuje do env.VECTORIZE.upsert()
  // Moduł Fleet nie wie JAK to się dzieje — tylko żąda operacji
  const result = await BACKEND.sys_rpc('kernel', 'vectorize_document', {
    documentId: payload.id,
    content: payload.content,
    projectId: payload.projectId,
    traceId,
  }) as { vectorId: string };

  return result;
}
```

```typescript
// modules/knowledge-base/src/workers.ts
import { handleDocumentCreated } from './lib/handlers/documentIndexer';

interface DocumentCreatedEvent {
  type: 'document.created';
  payload: { id: string; content: string; projectId: string };
  projectId: string;
  traceId: string;
}

// ✅ POPRAWNIE — wektoryzacja asynchroniczna przez workers.ts
export default {
  async queue(batch: MessageBatch<DocumentCreatedEvent>, env: Env) {
    for (const msg of batch.messages) {
      if (msg.body.type === 'document.created') {
        try {
          await handleDocumentCreated(
            env.BACKEND,
            msg.body.payload,
            msg.body.traceId
          );
          msg.ack();
        } catch {
          // AI API zawodne — retry po czasie (domyślnie 3 próby)
          msg.retry();
        }
      } else {
        msg.ack(); // nieznany event — nie blokuj Queue
      }
    }
  },
};
```

### Komponent MFE — wyszukiwarka semantyczna

```typescript
// modules/knowledge-base/src/components/SemanticSearch.tsx
import { useState, FormEvent } from 'react';
import { SearchInput, ResultsList, ResultItem } from '@quanti/ui-kit';
import type { SlotContext } from '../types';

interface SearchResult {
  id: string;
  title: string;
  score: number;
}

// ✅ POPRAWNIE — semantic_search przez context.api.rpc, nie bezpośredni fetch
export function SemanticSearch({ context }: { context: SlotContext }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    const { results: hits } = await context.api.rpc('kernel', 'semantic_search', {
      query,
      projectId: context.projectId,
      topK: 5,
    }) as { results: SearchResult[] };

    setResults(hits);
  }

  return (
    <form data-testid="search-form" onSubmit={handleSearch}>
      <SearchInput
        data-testid="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Wyszukaj w bazie wiedzy..."
      />
      <ResultsList>
        {results.map(r => (
          <ResultItem key={r.id} title={r.title} score={r.score} />
        ))}
      </ResultsList>
    </form>
  );
}
```

---

## Antywzorce — Czego Absolutnie NIE Robić

```typescript
// ❌ NIEPOPRAWNIE #1 — synchroniczne generowanie embeddingu w service.ts
export async function addDocument(content: string, env: Env) {
  const { data: [embedding] } = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [content],
  });
  // → env.AI niedostępne w Fleet module; blokuje odpowiedź HTTP; brak retry
}

// ❌ NIEPOPRAWNIE #2 — bezpośredni env.VECTORIZE w module
await env.VECTORIZE.upsert([{ id: docId, values: embedding }]);
// → env.VECTORIZE niedostępne w Fleet module; brak izolacji per project_id

// ❌ NIEPOPRAWNIE #3 — wyszukiwanie przez REST endpoint zamiast RPC
const results = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
// → Omija Kernel (brak auth, brak tracing, brak filtrowania per projectId)

// ❌ NIEPOPRAWNIE #4 — embedding w ścieżce requestu HTTP (blokuje odpowiedź)
app.post('/api/documents', async (req) => {
  const { content } = await req.json();
  const embedding = await env.AI.run(...); // BLOKUJE — 2-5 sekund CPU
  await env.VECTORIZE.upsert([...]);
  return new Response('ok');
  // → Worker timeout dla dużych dokumentów; brak retry; brak UX feedback
});
```

---

## Checklist Implementacji

- [ ] Wektoryzacja wywołana asynchronicznie przez Queue event `document.created`
- [ ] Brak `env.AI` i `env.VECTORIZE` w module Fleet
- [ ] Kernel RPC `vectorize_document` zamiast bezpośrednich bindingów
- [ ] `msg.retry()` przy błędzie AI API (nie `msg.ack()`)
- [ ] Wyszukiwanie przez `context.api.rpc('kernel', 'semantic_search', ...)`
- [ ] Testy handlerów z mockowanym `BACKEND.sys_rpc` jako `vi.fn()`
