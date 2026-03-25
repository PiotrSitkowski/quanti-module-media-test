<!--
@quanti-example: CS-06-Queues
@kernel-version: >=0.4.0
@last-verified: 2026-03-25
@status: canonical
-->

# CS-06: Cloudflare Queues — Dual-Write (CQRS) i Reagowanie na Zdarzenia

## Cel i Wzorzec

**Problem:** Agent (LLM) domyślnie implementuje side effecty synchronicznie (email po zapisie kontaktu przez bezpośredni `await sendEmail(...)`), albo wywołuje bezpośrednio funkcje innych modułów przez import. Oba wzorce tworzą silne sprzężenie i naruszają izolację modułów.

**Rozwiązanie — dwa wzorce:**

**Wzorzec A: Dual-Write** — każda operacja zapisu do D1 natychmiast emituje zdarzenie domenowe na Queue. Zapis i emisja to para — nigdy jedno bez drugiego.

**Wzorzec B: Queue Consumer** — `src/workers.ts` (lub `modules/[name]/src/workers.ts`) subskrybuje zdarzenia z Queue i realizuje efekty uboczne asynchronicznie, bez wiedzy o producencie.

**Kluczowy insight TDD:** `BACKEND.sys_enqueueEvent` to vi.fn() — prosty mock bez konfiguracji broker. Konsumer testuj jako czystą funkcję przyjmującą `msg.body`.

---

## KROK 1: RED — Napisz Test Przed Kodem

### Test A — Dual-Write: zapis + emisja zdarzenia

```typescript
// modules/crm/tests/unit/createContact.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContact } from '../../src/lib/contact.commands';

describe('createContact (Dual-Write)', () => {
  const mockBackend = {
    sys_rpc: vi.fn(),
    sys_enqueueEvent: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('should call sys_rpc to persist contact in D1', async () => {
    // Arrange
    mockBackend.sys_rpc.mockResolvedValueOnce({ id: 'c_1', name: 'Jan' });
    mockBackend.sys_enqueueEvent.mockResolvedValueOnce(undefined);

    // Act
    await createContact(mockBackend as any, {
      name: 'Jan Nowak',
      email: 'jan@example.com',
      projectId: 'proj_1',
      traceId: 'trace_001',
    });

    // Assert
    expect(mockBackend.sys_rpc).toHaveBeenCalledWith(
      'contacts',
      'create',
      expect.objectContaining({ name: 'Jan Nowak', projectId: 'proj_1' })
    );
  });

  it('should emit contact.created event after successful save', async () => {
    // Arrange
    const savedContact = { id: 'c_1', name: 'Jan Nowak', email: 'jan@example.com' };
    mockBackend.sys_rpc.mockResolvedValueOnce(savedContact);
    mockBackend.sys_enqueueEvent.mockResolvedValueOnce(undefined);

    // Act
    await createContact(mockBackend as any, {
      name: 'Jan Nowak',
      email: 'jan@example.com',
      projectId: 'proj_1',
      traceId: 'trace_abc',
    });

    // Assert — zdarzenie MUSI zawierać traceId i projectId
    expect(mockBackend.sys_enqueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contact.created',
        projectId: 'proj_1',
        traceId: 'trace_abc',
        payload: expect.objectContaining({ id: 'c_1' }),
      })
    );
  });

  it('should NOT emit event if save fails (no phantom events)', async () => {
    // Arrange — zapis do D1 zawodzi
    mockBackend.sys_rpc.mockRejectedValueOnce(new Error('DB error'));

    // Act & Assert
    await expect(
      createContact(mockBackend as any, {
        name: 'Jan', email: 'jan@e.com', projectId: 'proj_1', traceId: 'trace_1',
      })
    ).rejects.toThrow();

    // Kluczowe: brak zdarzenia gdy zapis się nie powiódł
    expect(mockBackend.sys_enqueueEvent).not.toHaveBeenCalled();
  });
});
```

### Test B — Consumer: obsługa zdarzenia contact.created

```typescript
// modules/email-notifications/tests/unit/contactCreatedHandler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleContactCreated } from '../../src/lib/handlers/contactCreated';

describe('handleContactCreated', () => {
  it('should send welcome email on contact.created event', async () => {
    // Arrange — handler otrzymuje czysty payload, bez QueueMessage overhead
    const mockBackend = {
      sys_rpc: vi.fn().mockResolvedValueOnce({ success: true }),
    };
    const eventPayload = {
      id: 'c_1',
      name: 'Anna Nowak',
      email: 'anna@example.com',
      projectId: 'proj_2',
    };
    const traceId = 'trace_handler_001';

    // Act
    await handleContactCreated(mockBackend as any, eventPayload, traceId);

    // Assert
    expect(mockBackend.sys_rpc).toHaveBeenCalledWith(
      'email',
      'sendTemplate',
      expect.objectContaining({
        to: 'anna@example.com',
        template: 'welcome',
        traceId: 'trace_handler_001',
      })
    );
  });
});
```

> ⛔ **ZATRZYMAJ SIĘ.** Uruchom testy — oblecą. Po RED → KROK 2.

---

## KROK 2: GREEN — Implementacja Spełniająca Testy

### Dual-Write command (Wzorzec A)

```typescript
// modules/crm/src/lib/contact.commands.ts

interface BackendProxy {
  sys_rpc(service: string, method: string, payload: Record<string, unknown>): Promise<unknown>;
  sys_enqueueEvent(event: {
    type: string;
    payload: unknown;
    projectId: string;
    traceId: string;
  }): Promise<void>;
}

interface CreateContactInput {
  name: string;
  email: string;
  projectId: string;
  traceId: string;
}

// ✅ POPRAWNIE — Dual-Write: zapis + zdarzenie jako nierozdzielna para
export async function createContact(
  BACKEND: BackendProxy,
  input: CreateContactInput
) {
  // Zapis do D1 przez RPC (może rzucić — wtedy zdarzenie NIE jest emitowane)
  const contact = await BACKEND.sys_rpc('contacts', 'create', {
    name: input.name,
    email: input.email,
    projectId: input.projectId,
  }) as { id: string; name: string; email: string };

  // Emisja zdarzenia domenowego — ZAWSZE po potwierdzeniu zapisu
  await BACKEND.sys_enqueueEvent({
    type: 'contact.created',
    payload: contact,
    projectId: input.projectId,
    traceId: input.traceId,
  });

  return contact;
}
```

### Queue Consumer handler (Wzorzec B)

```typescript
// modules/email-notifications/src/lib/handlers/contactCreated.ts

interface BackendProxy {
  sys_rpc(service: string, method: string, payload: Record<string, unknown>): Promise<unknown>;
}

// ✅ POPRAWNIE — czysta funkcja handlera, bez zależności od QueueMessage
export async function handleContactCreated(
  BACKEND: BackendProxy,
  payload: { id: string; name: string; email: string; projectId: string },
  traceId: string
) {
  await BACKEND.sys_rpc('email', 'sendTemplate', {
    to: payload.email,
    template: 'welcome',
    data: { name: payload.name },
    projectId: payload.projectId,
    traceId,
  });
}
```

```typescript
// modules/email-notifications/src/workers.ts
import { handleContactCreated } from './lib/handlers/contactCreated';

interface QuantiEvent {
  type: string;
  payload: any;
  projectId: string;
  traceId: string;
}

// ✅ POPRAWNIE — consumer Queue jako workers.ts, brak importu z innego modułu
export default {
  async queue(batch: MessageBatch<QuantiEvent>, env: Env) {
    for (const msg of batch.messages) {
      try {
        if (msg.body.type === 'contact.created') {
          await handleContactCreated(
            env.BACKEND,
            msg.body.payload,
            msg.body.traceId
          );
        }
        msg.ack();
      } catch (err) {
        // Retry przez Queue — msg.retry() = ponowne dostarczenie
        msg.retry();
      }
    }
  },
};
```

---

## Antywzorce — Czego Absolutnie NIE Robić

```typescript
// ❌ NIEPOPRAWNIE #1 — synchroniczny side effect w komendzie
export async function createContact(input) {
  const contact = await BACKEND.sys_rpc('contacts', 'create', input);
  await sendWelcomeEmail(contact.email); // bezpośrednie wywołanie — silne sprzężenie
  return contact;
}
// → Awaria maila = cała operacja się cofa; brak retry; brak izolacji modułów

// ❌ NIEPOPRAWNIE #2 — bezpośredni import z innego modułu
import { sendEmail } from '../../email-notifications/src/lib/email';
// → Złamanie izolacji modułów — zablokowane przez quanti analyze

// ❌ NIEPOPRAWNIE #3 — bezpośredni env.QUEUE_MAIN z modułu Fleet
await env.QUEUE_MAIN.send({ type: 'contact.created', payload: contact });
// → env.QUEUE_MAIN niedostępne w Fleet module; użyj BACKEND.sys_enqueueEvent

// ❌ NIEPOPRAWNIE #4 — emisja zdarzenia PRZED zapisem do D1
await BACKEND.sys_enqueueEvent({ type: 'contact.created', payload: input });
const contact = await BACKEND.sys_rpc('contacts', 'create', input);
// → Phantom event: zdarzenie dla rekordu który może nie istnieć
```

---

## Checklist Implementacji

- [ ] Brak bezpośrednich importów między modułami
- [ ] Brak `env.QUEUE_MAIN` w module Fleet — wyłącznie `BACKEND.sys_enqueueEvent`
- [ ] Zdarzenie emitowane TYLKO po potwierdzeniu zapisu do D1
- [ ] `traceId` obecne w każdym zdarzeniu Queue
- [ ] `src/workers.ts` (lub moduł consumer) z obsługą `msg.ack()` / `msg.retry()`
- [ ] Handlery jako czyste funkcje testowalne bez `QueueMessage` overhead
