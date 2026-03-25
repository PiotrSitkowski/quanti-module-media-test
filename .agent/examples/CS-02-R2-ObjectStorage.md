<!--
@quanti-example: CS-02-R2
@kernel-version: >=0.4.0
@last-verified: 2026-03-25
@status: canonical
-->

# CS-02: R2 — Object Storage przez Presigned URL

## Cel i Wzorzec

**Problem:** Agent (LLM) domyślnie generuje endpoint REST `/api/upload` w module, który próbuje bezpośrednio zapisać plik przez `env.R2.put(...)`. Skutkuje to naruszeniem izolacji tenanta, omijaniem limitów, brakiem ACL i brakiem `traceId` na plikach. Ponadto — moduły Fleet nie mają bindingu `env.R2`.

**Rozwiązanie (3-krokowy przepływ):**
1. Komponent MFE żąda od Kernela **Presigned URL** przez RPC (wywołanie `context.api.rpc`)
2. Przeglądarka wysyła plik **bezpośrednio na R2** korzystając z `uploadUrl` (omija Worker — zero kosztów egress)
3. Moduł rejestruje metadane po zakończeniu uploadu

**Kluczowy insight TDD:** `props.context.api` to obiekt wstrzykiwany z zewnątrz — można go zmockować jako zwykły obiekt z `vi.fn()`. Nie potrzebujesz `msw`, `nock` ani `jest-fetch-mock`.

---

## KROK 1: RED — Napisz Test Przed Kodem

### Test A — Worker (funkcja serwisowa)

```typescript
// modules/media-module/tests/unit/upload.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestPresignedUrl } from '../../src/lib/upload.service';

describe('requestPresignedUrl', () => {
  const mockBackend = {
    // Mockujemy serwis mediów dostępny przez BACKEND proxy
    // vi.fn() zwraca undefined domyślnie — wymusza nas do .mockResolvedValue
    sys_rpc: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call sys_rpc with media service and getPresignedUploadUrl method', async () => {
    // Arrange
    mockBackend.sys_rpc.mockResolvedValueOnce({
      uploadUrl: 'https://r2.example.com/signed?token=abc',
      fileKey: 'proj_123/2026/03/photo.jpg',
    });

    // Act
    await requestPresignedUrl(mockBackend as any, {
      projectId: 'proj_123',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
    });

    // Assert
    expect(mockBackend.sys_rpc).toHaveBeenCalledOnce();
    expect(mockBackend.sys_rpc).toHaveBeenCalledWith(
      'media',
      'getPresignedUploadUrl',
      expect.objectContaining({
        projectId: 'proj_123',
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
      })
    );
  });

  it('should return uploadUrl and fileKey from RPC response', async () => {
    // Arrange
    const expected = {
      uploadUrl: 'https://r2.example.com/signed?token=abc',
      fileKey: 'proj_123/2026/03/photo.jpg',
    };
    mockBackend.sys_rpc.mockResolvedValueOnce(expected);

    // Act
    const result = await requestPresignedUrl(mockBackend as any, {
      projectId: 'proj_123',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
    });

    // Assert — test obleje, jeśli implementacja zmapuje złe pola
    expect(result.uploadUrl).toBe(expected.uploadUrl);
    expect(result.fileKey).toBe(expected.fileKey);
  });
});
```

### Test B — Komponent MFE (React)

```typescript
// modules/media-module/tests/unit/FileUploader.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploader } from '../../src/components/FileUploader';
import type { SlotContext } from '../../src/types';

describe('FileUploader component', () => {
  // Kluczowy wzorzec: props.context.api mockujemy jako zwykły obiekt.
  // NIE używamy msw, nock ani żadnego interceptora HTTP.
  // props.context.api.rpc to vi.fn() — pełna kontrola nad zwracanymi danymi.
  const buildMockContext = (overrides = {}): SlotContext => ({
    projectId: 'proj_test',
    instanceKey: 'media-main',
    traceId: 'trace_001',
    api: {
      rpc: vi.fn().mockResolvedValue({
        uploadUrl: 'https://r2.example.com/signed?token=test',
        fileKey: 'proj_test/file.pdf',
      }),
    },
    data: {},
    actions: {},
    ...overrides,
  });

  it('should call context.api.rpc when file is selected', async () => {
    // Arrange
    const ctx = buildMockContext();
    render(<FileUploader context={ctx} />);
    const input = screen.getByTestId('file-input');
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

    // Act
    fireEvent.change(input, { target: { files: [file] } });

    // Assert
    await waitFor(() => {
      expect(ctx.api.rpc).toHaveBeenCalledWith(
        'media',
        'getPresignedUploadUrl',
        expect.objectContaining({
          projectId: 'proj_test',
          fileName: 'test.pdf',
          contentType: 'application/pdf',
        })
      );
    });
  });

  it('should show success state after upload completes', async () => {
    // Arrange
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true });
    const ctx = buildMockContext();
    render(<FileUploader context={ctx} />);
    const input = screen.getByTestId('file-input');
    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });

    // Act
    fireEvent.change(input, { target: { files: [file] } });

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('upload-success')).toBeInTheDocument();
    });
  });

  it('should NOT call fetch directly without presigned URL', async () => {
    // Arrange — sprawdzamy, że fetch NIE jest wywoływany przed uzyskaniem URL
    const fetchSpy = vi.spyOn(global, 'fetch');
    const ctx = buildMockContext({
      api: {
        rpc: vi.fn().mockRejectedValueOnce(new Error('RPC failed')),
      },
    });
    render(<FileUploader context={ctx} />);

    // Act
    const input = screen.getByTestId('file-input');
    fireEvent.change(input, { target: { files: [new File(['x'], 'f.pdf')] } });

    // Assert — bez presigned URL nie ma fetch na R2
    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

> ⛔ **ZATRZYMAJ SIĘ.** Uruchom testy. Powinny oblec z błędem `Cannot find module`. Dopiero po potwierdzeniu RED przechodzisz do KROKU 2.

---

## KROK 2: GREEN — Implementacja Spełniająca Testy

### Worker — funkcja serwisowa

```typescript
// modules/media-module/src/lib/upload.service.ts

interface BackendProxy {
  sys_rpc(
    service: string,
    method: string,
    payload: Record<string, unknown>
  ): Promise<unknown>;
}

interface PresignedUrlRequest {
  projectId: string;
  fileName: string;
  contentType: string;
}

interface PresignedUrlResponse {
  uploadUrl: string;
  fileKey: string;
}

// ✅ POPRAWNIE — żąda Presigned URL przez BACKEND proxy
export async function requestPresignedUrl(
  BACKEND: BackendProxy,
  req: PresignedUrlRequest
): Promise<PresignedUrlResponse> {
  const result = await BACKEND.sys_rpc('media', 'getPresignedUploadUrl', {
    projectId: req.projectId,
    fileName: req.fileName,
    contentType: req.contentType,
  });

  return result as PresignedUrlResponse;
}
```

### Komponent MFE — React

```typescript
// modules/media-module/src/components/FileUploader.tsx
import { useState } from 'react';
import { Button, FileDropZone, StatusBadge } from '@quanti/ui-kit';
import type { SlotContext } from '../types';

interface Props {
  context: SlotContext;
}

// ✅ POPRAWNIE — wszystkie dane i operacje przez props.context
// Brak fetch('/api/upload'), brak env.R2, brak bezpośredniego importu z Kernela
export function FileUploader({ context }: Props) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');

  async function handleFileSelected(file: File) {
    try {
      setStatus('uploading');

      // KROK 1: Żądaj Presigned URL od media service przez RPC Kernela
      // context.api.rpc jest wstrzykiwane — w testach mockujemy ten obiekt
      const { uploadUrl, fileKey } = await context.api.rpc(
        'media',
        'getPresignedUploadUrl',
        {
          projectId: context.projectId,
          fileName: file.name,
          contentType: file.type,
        }
      ) as { uploadUrl: string; fileKey: string };

      // KROK 2: Przeglądarka wysyła plik BEZPOŚREDNIO na R2
      // Worker nie jest w tym przepływie — zero kosztów egress
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadResponse.ok) throw new Error('Upload failed');

      // KROK 3: Rejestruj metadane przez RPC po potwierdzeniu uploadu
      await context.api.rpc('media', 'registerUpload', {
        projectId: context.projectId,
        fileKey,
        fileName: file.name,
        contentType: file.type,
        traceId: context.traceId,
      });

      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div>
      <input
        data-testid="file-input"
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
      />
      {status === 'success' && (
        <StatusBadge data-testid="upload-success" variant="success">
          Plik przesłany
        </StatusBadge>
      )}
      {status === 'error' && (
        <StatusBadge data-testid="upload-error" variant="error">
          Błąd przesyłania
        </StatusBadge>
      )}
    </div>
  );
}
```

---

## Antywzorce — Czego Absolutnie NIE Robić

```typescript
// ❌ NIEPOPRAWNIE #1 — endpoint REST w module (moduły nie eksponują endpointów)
app.post('/api/upload', async (request, env) => {
  const file = await request.arrayBuffer();
  await env.R2.put(`files/${Date.now()}`, file);
  // → env.R2 jest undefined w Fleet module runtime
  // → Brak tenantyzacji — pliki różnych projektów w tej samej przestrzeni
  // → Zablokowane przez quanti analyze (req.method violation)
});

// ❌ NIEPOPRAWNIE #2 — bezpośredni fetch('/api/upload') z komponentu
async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  await fetch('/api/upload', { method: 'POST', body: formData });
  // → Omija Kernel (brak auth, brak tracing, brak tenantyzacji)
  // → Łamie zasadę: "no business logic fetch() from MFE component"
}

// ❌ NIEPOPRAWNIE #3 — mockowanie fetch zamiast context.api w testach
global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({ url: '...' }) });
// → Testuje szczegóły implementacji, nie kontrakt
// → Pozwala przejść testowi nawet gdy wzorzec RPC jest zły
// → Testy stają się ślepe na zmianę architektury

// ❌ NIEPOPRAWNIE #4 — brak traceId w metadanych pliku
await context.api.rpc('media', 'registerUpload', {
  projectId: context.projectId,
  fileKey,
  // BRAKUJE: traceId: context.traceId
  // → Niemożliwe debugowanie, kto i kiedy wgrał plik
});
```

---

## Checklist Implementacji

- [ ] Brak endpointu REST w module dla uploadu plików
- [ ] Presigned URL żądany przez `context.api.rpc('media', 'getPresignedUploadUrl', ...)`
- [ ] Upload bezpośrednio na R2 z przeglądarki (nie przez Worker)
- [ ] Rejestracja metadanych po uploadzie przez osobne RPC
- [ ] `traceId` przekazywany w metadanych
- [ ] Testy jednostkowe mockują `context.api.rpc` jako `vi.fn()` — bez `msw`
