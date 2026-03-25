<!--
@quanti-example: CS-05-KV
@kernel-version: >=0.4.0
@last-verified: 2026-03-25
@status: canonical
-->

# CS-05: KV — Globalny Odczyt o Niskim Opóźnieniu

## Cel i Wzorzec

**Problem:** Agent (LLM) domyślnie dodaje `env.KV.get(...)` bezpośrednio w module Fleet dla cache'owania wyników lub flag funkcyjnych. Moduły Fleet nie mają bindingu `env.KV` — to zarezerwowane dla Kernela. Ponadto bezpośredni dostęp pomija automatyczne odświeżanie cache per projekt.

**Rozwiązanie:** KV jest warstwą L1 cache zarządzaną przez Kernel. Moduł żąda danych przez `BACKEND.sys_rpc('kernel', 'getFeatureFlags', ...)` — Kernel samodzielnie obsługuje odczyt z KV, fallback do D1 i TTL invalidation. Moduł nie wie i nie powinien wiedzieć, że za odpowiedzią stoi KV.

**Kategorie danych w KV (wyłącznie):**
1. Cache wyników zapytań D1 (TTL: 60-300s)
2. Feature flags per projekt
3. Metadane sesji i tokeny krótkotrwałe (TTL: 15 min)

**Kluczowy insight TDD:** Skoro moduł komunikuje się przez `BACKEND.sys_rpc`, testy mockują tylko `sys_rpc` — nie potrzebujesz instancji `KVNamespace`.

---

## KROK 1: RED — Napisz Test Przed Kodem

```typescript
// modules/feature-gating/tests/unit/feature.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isFeatureEnabled } from '../../src/lib/feature.service';

describe('isFeatureEnabled', () => {
  const mockBackend = {
    sys_rpc: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call kernel getFeatureFlags with projectId', async () => {
    // Arrange
    mockBackend.sys_rpc.mockResolvedValueOnce({
      flags: { 'new-dashboard': true, 'beta-reports': false },
    });

    // Act
    await isFeatureEnabled(mockBackend as any, 'proj_abc', 'new-dashboard');

    // Assert
    expect(mockBackend.sys_rpc).toHaveBeenCalledWith(
      'kernel',
      'getFeatureFlags',
      expect.objectContaining({ projectId: 'proj_abc' })
    );
  });

  it('should return true when flag is enabled', async () => {
    // Arrange
    mockBackend.sys_rpc.mockResolvedValueOnce({
      flags: { 'new-dashboard': true },
    });

    // Act
    const result = await isFeatureEnabled(mockBackend as any, 'proj_1', 'new-dashboard');

    // Assert
    expect(result).toBe(true);
  });

  it('should return false when flag is absent', async () => {
    // Arrange
    mockBackend.sys_rpc.mockResolvedValueOnce({ flags: {} });

    // Act
    const result = await isFeatureEnabled(mockBackend as any, 'proj_1', 'missing-flag');

    // Assert — test obleje jeśli implementacja zwróci undefined lub null
    expect(result).toBe(false);
  });

  it('should return false when RPC fails (defensive default)', async () => {
    // Arrange — symuluj timeout lub błąd sieci
    mockBackend.sys_rpc.mockRejectedValueOnce(new Error('KV timeout'));

    // Act
    const result = await isFeatureEnabled(mockBackend as any, 'proj_1', 'some-flag');

    // Assert — feature flagi niedostępne = domyślnie wyłączone (bezpieczny fallback)
    expect(result).toBe(false);
  });
});
```

### Test komponentu MFE warunkowo renderującego UI

```typescript
// modules/feature-gating/tests/unit/FeatureGate.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FeatureGate } from '../../src/components/FeatureGate';

describe('FeatureGate', () => {
  it('should render children when feature flag is enabled', async () => {
    // Arrange — context.api.rpc jako vi.fn(), bez env.KV
    const ctx = {
      projectId: 'proj_1',
      traceId: 'trace_001',
      api: {
        rpc: vi.fn().mockResolvedValueOnce({
          flags: { 'ai-assistant': true },
        }),
      },
      data: {},
      actions: {},
    };

    // Act
    render(
      <FeatureGate context={ctx as any} feature="ai-assistant">
        <div data-testid="protected-content">AI Features</div>
      </FeatureGate>
    );

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  it('should not render children when feature flag is disabled', async () => {
    // Arrange
    const ctx = {
      projectId: 'proj_1',
      traceId: 'trace_001',
      api: {
        rpc: vi.fn().mockResolvedValueOnce({ flags: { 'ai-assistant': false } }),
      },
      data: {},
      actions: {},
    };

    // Act
    render(
      <FeatureGate context={ctx as any} feature="ai-assistant">
        <div data-testid="protected-content">AI Features</div>
      </FeatureGate>
    );

    // Assert
    await waitFor(() => {
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });
});
```

> ⛔ **ZATRZYMAJ SIĘ.** Uruchom testy — oblecą z błędem `Cannot find module`. Po RED → KROK 2.

---

## KROK 2: GREEN — Implementacja Spełniająca Testy

### Funkcja serwisowa

```typescript
// modules/feature-gating/src/lib/feature.service.ts

interface BackendProxy {
  sys_rpc(service: string, method: string, payload: Record<string, unknown>): Promise<unknown>;
}

// ✅ POPRAWNIE — flagi przez RPC, Kernel zarządza KV cache
export async function isFeatureEnabled(
  BACKEND: BackendProxy,
  projectId: string,
  flagName: string
): Promise<boolean> {
  try {
    const response = await BACKEND.sys_rpc('kernel', 'getFeatureFlags', { projectId }) as {
      flags: Record<string, boolean>;
    };
    return response.flags[flagName] ?? false;
  } catch {
    // Bezpieczny fallback — brak danych = flaga wyłączona
    return false;
  }
}
```

### Komponent MFE

```typescript
// modules/feature-gating/src/components/FeatureGate.tsx
import { useEffect, useState, ReactNode } from 'react';
import type { SlotContext } from '../types';

interface Props {
  context: SlotContext;
  feature: string;
  children: ReactNode;
}

// ✅ POPRAWNIE — brak env.KV, brak bezpośredniego fetch flag service
export function FeatureGate({ context, feature, children }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    context.api.rpc('kernel', 'getFeatureFlags', { projectId: context.projectId })
      .then((res: any) => setEnabled(res.flags[feature] ?? false))
      .catch(() => setEnabled(false)); // defensywny fallback
  }, [context.projectId, feature]);

  if (enabled === null) return null; // loading state
  if (!enabled) return null;
  return <>{children}</>;
}
```

---

## Antywzorce — Czego Absolutnie NIE Robić

```typescript
// ❌ NIEPOPRAWNIE #1 — bezpośredni dostęp env.KV z modułu Fleet
const flags = await env.KV.get(`flags:${projectId}`, 'json');
// → env.KV jest undefined w Fleet module — ReferenceError

// ❌ NIEPOPRAWNIE #2 — odpytywanie D1 bezpośrednio dla każdego flag check
const row = await BACKEND.sys_executeDbQuery(projectId, {
  sql: 'SELECT value FROM feature_flags WHERE name = ? AND project_id = ?',
  params: ['ai-assistant', projectId],
});
// → D1 jest bazą do danych biznesowych, nie cache'iem flag — użyj KV przez Kernel

// ❌ NIEPOPRAWNIE #3 — feature flags hardkodowane w kodzie modułu
if (projectId === 'proj_premium_123') {
  // pokaż premium feature
}
// → Niemożliwe zarządzanie z panelu admina; zmiany wymagają redeploy

// ❌ NIEPOPRAWNIE #4 — renderowanie przed sprawdzeniem flagi (race condition)
export function DangerousFeatureGate({ feature, children }) {
  // Brak useEffect, flaga nigdy nie sprawdzana — zawsze renderuje
  return <>{children}</>;
}
```

---

## Checklist Implementacji

- [ ] Brak `env.KV` w module Fleet
- [ ] Feature flags przez `BACKEND.sys_rpc('kernel', 'getFeatureFlags', { projectId })`
- [ ] Defensywny fallback `false` gdy RPC zawiedzie
- [ ] Testy mockują `BACKEND.sys_rpc` jako `vi.fn()` — bez `KVNamespace`
- [ ] `FeatureGate` komponent obsługuje stan loading (null guard)
