<!--
@quanti-example: CS-03-Workflows
@kernel-version: >=0.4.0
@last-verified: 2026-03-25
@status: canonical
-->

# CS-03: Cloudflare Workflows — Trwałe Wykonanie (Saga)

## Cel i Wzorzec

**Problem:** Agent (LLM) domyślnie implementuje wieloetapowe procesy jako sekwencję `await fetch(...)` z `Promise.all` lub `setTimeout`. Skutkuje to utratą postępu przy timeoucie Workera (limit 30s), brakiem możliwości wznowienia po awarii i niemożnością monitorowania etapów.

**Rozwiązanie:** Każdy wieloetapowy proces biznesowy (onboarding, generowanie raportu, pipeline przetwarzania) jest implementowany jako `WorkflowEntrypoint`. Workflow jest wywoływany przez `BACKEND.sys_triggerWorkflow(...)`. Stan jest trwały — awaria środkowego kroku nie cofa wcześniejszych.

**Kluczowy insight TDD:** Logika kroków (`step.do(...)`) to czyste async funkcje — testuj je jako jednostki. Workflow jako całość testuj przez mockowanie `WorkflowStep`.

---

## KROK 1: RED — Napisz Test Przed Kodem

### Test A — Logika kroku (unit test, czysta funkcja)

```typescript
// modules/onboarding/tests/unit/onboarding.steps.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createUserProfile, sendWelcomeEmail } from '../../src/lib/onboarding.steps';

describe('createUserProfile', () => {
  it('should call sys_rpc with profile service and create method', async () => {
    // Arrange
    const mockBackend = { sys_rpc: vi.fn().mockResolvedValueOnce({ id: 'usr_1', name: 'Anna' }) };
    const payload = { name: 'Anna Nowak', email: 'anna@example.com', projectId: 'proj_1' };

    // Act
    const result = await createUserProfile(mockBackend as any, payload);

    // Assert
    expect(mockBackend.sys_rpc).toHaveBeenCalledWith(
      'contacts',
      'create',
      expect.objectContaining({ name: 'Anna Nowak', projectId: 'proj_1' })
    );
    expect(result).toMatchObject({ id: 'usr_1' });
  });
});

describe('sendWelcomeEmail', () => {
  it('should enqueue welcome event with userId and traceId', async () => {
    // Arrange
    const mockBackend = { sys_enqueueEvent: vi.fn().mockResolvedValueOnce(undefined) };

    // Act
    await sendWelcomeEmail(mockBackend as any, {
      userId: 'usr_1',
      projectId: 'proj_1',
      traceId: 'trace_xyz',
    });

    // Assert
    expect(mockBackend.sys_enqueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'email.send',
        payload: expect.objectContaining({ userId: 'usr_1' }),
        traceId: 'trace_xyz',
      })
    );
  });
});
```

### Test B — Wyzwalacz Workflow z MFE

```typescript
// modules/onboarding/tests/unit/OnboardingTrigger.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingTrigger } from '../../src/components/OnboardingTrigger';

describe('OnboardingTrigger', () => {
  it('should call context.api.rpc sys_triggerWorkflow on submit', async () => {
    // Arrange — context.api.rpc jest vi.fn(), bez msw
    const ctx = {
      projectId: 'proj_1',
      traceId: 'trace_001',
      api: { rpc: vi.fn().mockResolvedValueOnce({ workflowId: 'wf_abc' }) },
      data: {},
      actions: {},
    };
    const { getByTestId } = render(<OnboardingTrigger context={ctx as any} />);

    // Act
    fireEvent.click(getByTestId('start-onboarding-btn'));

    // Assert
    await waitFor(() => {
      expect(ctx.api.rpc).toHaveBeenCalledWith(
        'kernel',
        'sys_triggerWorkflow',
        expect.objectContaining({
          workflowName: 'OnboardingWorkflow',
          projectId: 'proj_1',
          traceId: 'trace_001',
        })
      );
    });
  });
});
```

> ⛔ **ZATRZYMAJ SIĘ.** Uruchom testy. Powinny oblec. Dopiero po RED przechodzisz do GREEN.

---

## KROK 2: GREEN — Implementacja Spełniająca Testy

### Kroki Workflow (czyste funkcje)

```typescript
// modules/onboarding/src/lib/onboarding.steps.ts

interface BackendProxy {
  sys_rpc(service: string, method: string, payload: Record<string, unknown>): Promise<unknown>;
  sys_enqueueEvent(payload: { type: string; payload: unknown; traceId: string; projectId: string }): Promise<void>;
}

// ✅ POPRAWNIE — czyste async funkcje, łatwe do przetestowania
export async function createUserProfile(
  BACKEND: BackendProxy,
  data: { name: string; email: string; projectId: string }
) {
  return BACKEND.sys_rpc('contacts', 'create', {
    name: data.name,
    email: data.email,
    projectId: data.projectId,
  });
}

export async function sendWelcomeEmail(
  BACKEND: BackendProxy,
  data: { userId: string; projectId: string; traceId: string }
) {
  await BACKEND.sys_enqueueEvent({
    type: 'email.send',
    payload: { userId: data.userId, template: 'welcome' },
    projectId: data.projectId,
    traceId: data.traceId,
  });
}
```

### Workflow (Saga) — Cloudflare Workflow class

```typescript
// modules/onboarding/src/workflows/OnboardingWorkflow.ts
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { createUserProfile, sendWelcomeEmail } from '../lib/onboarding.steps';

export interface OnboardingParams {
  name: string;
  email: string;
  projectId: string;
  traceId: string;
}

// ✅ POPRAWNIE — Workflow dla trwałego, wieloetapowego procesu
export class OnboardingWorkflow extends WorkflowEntrypoint<Env, OnboardingParams> {
  async run(event: WorkflowEvent<OnboardingParams>, step: WorkflowStep) {
    const { name, email, projectId, traceId } = event.payload;

    // Krok 1 jest idempotentny — awaria po zapisie nie tworzy duplikatu
    const profile = await step.do('create-profile', async () =>
      createUserProfile(this.env.BACKEND, { name, email, projectId })
    ) as { id: string };

    // Poczekaj na weryfikację (Worker może być odcięty — stan jest trwały)
    await step.sleep('await-email-verification', '24 hours');

    // Krok 3 wykona się nawet po restarcie Workera
    await step.do('send-welcome-email', async () =>
      sendWelcomeEmail(this.env.BACKEND, {
        userId: profile.id,
        projectId,
        traceId,
      })
    );
  }
}
```

### Komponent MFE — wyzwalacz

```typescript
// modules/onboarding/src/components/OnboardingTrigger.tsx
import { Button } from '@quanti/ui-kit';
import type { SlotContext } from '../types';

export function OnboardingTrigger({ context }: { context: SlotContext }) {
  async function handleStart() {
    // ✅ Wyzwalanie Workflow przez RPC Kernela — nie przez bezpośredni import klasy
    await context.api.rpc('kernel', 'sys_triggerWorkflow', {
      workflowName: 'OnboardingWorkflow',
      projectId: context.projectId,
      traceId: context.traceId,
      payload: context.data.formValues,
    });
  }

  return (
    <Button data-testid="start-onboarding-btn" onClick={handleStart}>
      Rozpocznij onboarding
    </Button>
  );
}
```

---

## Antywzorce — Czego Absolutnie NIE Robić

```typescript
// ❌ NIEPOPRAWNIE #1 — sekwencja fetch bez trwałości stanu
async function runOnboarding(data: OnboardingParams) {
  const profile = await fetch('/api/profile/create', { method: 'POST', body: JSON.stringify(data) });
  // → Worker timeout = 30s; jeśli zabraknie czasu, postęp utracony
  await new Promise(r => setTimeout(r, 86400000)); // ABSOLUTNY ZAKAZ
  await fetch('/api/email/send', { method: 'POST' });
}

// ❌ NIEPOPRAWNIE #2 — Promise.all dla operacji zależnych
const [profile, _email] = await Promise.all([
  createProfile(data),
  sendWelcomeEmail(data), // email wysyłany zanim profil jest stworzony!
]);

// ❌ NIEPOPRAWNIE #3 — bezpośrednie tworzenie instancji Workflow w module
import { OnboardingWorkflow } from '../workflows/OnboardingWorkflow';
const wf = new OnboardingWorkflow(); // → Workflow nie są klas instancjonowanymi ręcznie
await wf.run(event, step);

// ❌ NIEPOPRAWNIE #4 — polling statusu z frontendu
setInterval(async () => {
  const status = await fetch(`/api/workflow/${id}/status`);
  // → Omija Signal Bus, niszczy UX, nadwyręża infrastrukturę
}, 2000);
```

---

## Checklist Implementacji

- [ ] Logika kroków wydzielona do czystych funkcji (testowalnych bez Workflow runtime)
- [ ] Workflow dziedziczy po `WorkflowEntrypoint<Env, Params>`
- [ ] Każdy krok w `step.do(name, fn)` — idempotentny z nazwą
- [ ] `step.sleep(name, duration)` zamiast `setTimeout`
- [ ] Wyzwalanie przez `BACKEND.sys_triggerWorkflow` lub `context.api.rpc('kernel', 'sys_triggerWorkflow', ...)`
- [ ] Testy jednostkowe dla kroków z mockowanym `BACKEND` jako `vi.fn()`
