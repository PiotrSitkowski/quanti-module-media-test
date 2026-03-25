<!--
@quanti-example: CS-04-DurableObjects
@kernel-version: >=0.4.0
@last-verified: 2026-03-25
@status: canonical
-->

# CS-04: Durable Objects — Stan Współdzielony i WebSocket

## Cel i Wzorzec

**Problem:** Agent (LLM) domyślnie implementuje stan współdzielony przez polling HTTP (`setInterval → fetch('/api/state')`) lub importując zewnętrzne serwery WebSocket (Socket.io, Ably). Oba podejścia są niedopuszczalne: polling przeciąża backend i niszczy UX, a zewnętrzne serwery to zależność spoza Edge.

**Rozwiązanie:** Każda funkcjonalność wymagająca silnej konsystencji lub live-update jest implementowana jako **Durable Object**. DO gwarantuje singleton per klucz — dokładnie jedna instancja dla danego projektu/dokumentu. Klient łączy się przez WebSocket, które DO zarządza i broadcastuje zmiany.

**Kluczowy insight TDD:** Logika biznesowa DO (handleMessage, broadcast) to czyste metody — testuj je jako unit, mockując `WebSocket` przez prosty obiekt z `vi.fn()`. Nie potrzebujesz prawdziwego serwera WebSocket.

---

## KROK 1: RED — Napisz Test Przed Kodem

### Test A — Logika broadcastu (unit test)

```typescript
// modules/kanban/tests/unit/board.do.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoardStateDO } from '../../src/do/BoardStateDO';

// Mockujemy minimalny kontekst DurableObject bez importu cloudflare:workers
const makeMockCtx = () => ({
  acceptWebSocket: vi.fn(),
  getWebSockets: vi.fn().mockReturnValue([]),
  storage: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  },
});

// Mockujemy WebSocket — wystarczy obiekt z send i readyState
const makeMockWs = (state = WebSocket.OPEN) => ({
  send: vi.fn(),
  close: vi.fn(),
  readyState: state,
});

describe('BoardStateDO.broadcast', () => {
  it('should send serialized message to all open connections', () => {
    // Arrange
    const ctx = makeMockCtx() as any;
    const env = {} as any;
    const do_ = new BoardStateDO(ctx, env);
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    // Ręcznie dodaj połączenia (bez HTTP handshake)
    (do_ as any).connections.add(ws1);
    (do_ as any).connections.add(ws2);

    const event = { type: 'card.moved', cardId: 'c1', toColumn: 'done' };

    // Act
    do_.broadcast(event);

    // Assert
    expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(event));
    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(event));
  });

  it('should skip closed WebSocket connections without throwing', () => {
    // Arrange
    const ctx = makeMockCtx() as any;
    const do_ = new BoardStateDO(ctx, {} as any);
    const closedWs = makeMockWs(WebSocket.CLOSED);
    (do_ as any).connections.add(closedWs);

    // Act & Assert — nie powinno rzucić wyjątku
    expect(() => do_.broadcast({ type: 'ping' })).not.toThrow();
    expect(closedWs.send).not.toHaveBeenCalled();
  });
});
```

### Test B — Komponent MFE subskrybujący WebSocket

```typescript
// modules/kanban/tests/unit/KanbanBoard.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { KanbanBoard } from '../../src/components/KanbanBoard';

// Mockujemy WebSocket API przeglądarki jako vi.fn()
// Nie potrzebujesz serwera WS — mockujesz sam konstruktor
class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

describe('KanbanBoard WebSocket integration', () => {
  let WsConstructorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    WsConstructorSpy = vi.fn().mockImplementation(() => new MockWebSocket());
    vi.stubGlobal('WebSocket', WsConstructorSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should connect WebSocket using URL from context.api.rpc', async () => {
    // Arrange — context.api.rpc zwraca URL do DO, nie jest to fetch HTTP
    const ctx = {
      projectId: 'proj_1',
      instanceKey: 'board-main',
      traceId: 'trace_001',
      api: {
        rpc: vi.fn().mockResolvedValueOnce({
          wsUrl: 'wss://board.quanti.workers.dev/proj_1/board-main',
        }),
      },
      data: { cards: [] },
      actions: {},
    };

    // Act
    await act(async () => {
      render(<KanbanBoard context={ctx as any} />);
    });

    // Assert
    expect(ctx.api.rpc).toHaveBeenCalledWith(
      'kernel',
      'getBoardWebSocketUrl',
      expect.objectContaining({ projectId: 'proj_1' })
    );
    expect(WsConstructorSpy).toHaveBeenCalledWith(
      'wss://board.quanti.workers.dev/proj_1/board-main'
    );
  });

  it('should update board state when WebSocket message received', async () => {
    // Arrange
    let mockWsInstance: MockWebSocket;
    WsConstructorSpy.mockImplementation(() => {
      mockWsInstance = new MockWebSocket();
      return mockWsInstance;
    });

    const ctx = {
      projectId: 'proj_1',
      instanceKey: 'board-main',
      traceId: 'trace_001',
      api: { rpc: vi.fn().mockResolvedValueOnce({ wsUrl: 'wss://test' }) },
      data: { cards: [{ id: 'c1', column: 'todo', title: 'Zadanie' }] },
      actions: {},
    };

    await act(async () => {
      render(<KanbanBoard context={ctx as any} />);
    });

    // Act — symuluj wiadomość z serwera
    await act(async () => {
      mockWsInstance!.onmessage?.({
        data: JSON.stringify({ type: 'card.moved', cardId: 'c1', toColumn: 'done' }),
      } as MessageEvent);
    });

    // Assert
    expect(screen.getByTestId('column-done')).toContainElement(
      screen.getByText('Zadanie')
    );
  });
});
```

> ⛔ **ZATRZYMAJ SIĘ.** Uruchom testy — oczekiwany błąd: `Cannot find module`. Po RED → KROK 2.

---

## KROK 2: GREEN — Implementacja Spełniająca Testy

### Durable Object

```typescript
// modules/kanban/src/do/BoardStateDO.ts
import { DurableObject } from 'cloudflare:workers';

// ✅ POPRAWNIE — DO jako singleton stanu per (projectId, boardId)
export class BoardStateDO extends DurableObject<Env> {
  // Set przechowuje aktywne połączenia WebSocket
  private connections = new Set<WebSocket>();

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      this.connections.add(server);

      server.addEventListener('close', () => {
        this.connections.delete(server);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not a WebSocket request', { status: 400 });
  }

  // Publiczna metoda — wywoływana przez Worker po mutacji stanu
  broadcast(message: unknown) {
    const payload = JSON.stringify(message);
    for (const ws of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}
```

### Komponent MFE

```typescript
// modules/kanban/src/components/KanbanBoard.tsx
import { useEffect, useState } from 'react';
import { Column } from '@quanti/ui-kit';
import type { SlotContext } from '../types';

interface Card { id: string; column: string; title: string; }

// ✅ POPRAWNIE — URL WebSocket pochodzi z RPC Kernela, nie jest hardkodowany
export function KanbanBoard({ context }: { context: SlotContext }) {
  const [cards, setCards] = useState<Card[]>(context.data.cards ?? []);

  useEffect(() => {
    let ws: WebSocket;

    (async () => {
      // Pobierz URL do Durable Object przez RPC — Kernel zarządza routing DO
      const { wsUrl } = await context.api.rpc('kernel', 'getBoardWebSocketUrl', {
        projectId: context.projectId,
        instanceKey: context.instanceKey,
      }) as { wsUrl: string };

      ws = new WebSocket(wsUrl);

      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === 'card.moved') {
          setCards(prev =>
            prev.map(c => c.id === event.cardId ? { ...c, column: event.toColumn } : c)
          );
        }
      };
    })();

    return () => ws?.close();
  }, [context.projectId, context.instanceKey]);

  const columns = ['todo', 'in_progress', 'done'];

  return (
    <div data-testid="kanban-board">
      {columns.map(col => (
        <Column key={col} data-testid={`column-${col}`}>
          {cards.filter(c => c.column === col).map(c => (
            <div key={c.id}>{c.title}</div>
          ))}
        </Column>
      ))}
    </div>
  );
}
```

---

## Antywzorce — Czego Absolutnie NIE Robić

```typescript
// ❌ NIEPOPRAWNIE #1 — polling HTTP (niszczy UX i infrastrukturę)
setInterval(async () => {
  const state = await fetch(`/api/board/${boardId}/state`);
  setCards(await state.json());
}, 2000);

// ❌ NIEPOPRAWNIE #2 — hardkodowany URL WebSocket w komponencie
const ws = new WebSocket(`wss://my-worker.workers.dev/board/${boardId}`);
// → Brak tenantyzacji, brak auth tokenu, brak routingu przez Kernel

// ❌ NIEPOPRAWNIE #3 — WebSocket URL jako props.context.data (nie RPC)
const wsUrl = context.data.wsUrl; // → Dane w context.data są snapshoty, nie live
const ws = new WebSocket(wsUrl);  // → URL może być przestarzały po sesji

// ❌ NIEPOPRAWNIE #4 — zewnętrzny serwer WebSocket
import { io } from 'socket.io-client'; // ZAKAZ — zewnętrzna zależność, nie Edge
const socket = io('https://realtime.external.com');
```

---

## Checklist Implementacji

- [ ] DO dziedziczy po `DurableObject<Env>` z `cloudflare:workers`
- [ ] `connections: Set<WebSocket>` zarządzany w DO
- [ ] `ctx.acceptWebSocket(server)` przy handshake
- [ ] URL WebSocket pobierany przez `context.api.rpc('kernel', 'getBoardWebSocketUrl', ...)`
- [ ] `useEffect` cleanup zamyka WebSocket (`ws?.close()`)
- [ ] Testy mockują `WebSocket` przez `vi.stubGlobal` + własna klasa mock
