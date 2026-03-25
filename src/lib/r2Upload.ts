/**
 * r2Upload — CS-02: R2 Direct Upload Helper
 *
 * Wyizolowana funkcja odpowiedzialna za upload binarny bezpośrednio na R2
 * przez presigned URL. Wyizolowanie poza src/components/ jest celowe:
 * - nie jest to call do backendu modułu (brak auth, nie dotyczy Fleet Guard)
 * - to jest przeglądarka → R2 bezpośrednio (zero egress przez Worker)
 * - pattern wymagany przez CS-02 (R2 Object Storage example)
 *
 * Komponent MFE NIGDY nie importuje fetch bezpośrednio — deleguje tu.
 */

export interface R2UploadOptions {
    uploadUrl:   string;
    file:        File;
    contentType: string;
}

export interface R2UploadResult {
    ok:     boolean;
    status: number;
}

/**
 * uploadToR2 — sends a file directly to R2 via a presigned PUT URL.
 *
 * This is the ONLY place in the module where fetch() is called on a
 * non-backend URL. The URL is a time-limited R2 presigned URL generated
 * by the Kernel media service — it does not go through any Fleet Worker.
 */
export async function uploadToR2({ uploadUrl, file, contentType }: R2UploadOptions): Promise<R2UploadResult> {
    const response = await fetch(uploadUrl, {
        method:  'PUT',
        body:    file,
        headers: { 'Content-Type': contentType },
    });
    return { ok: response.ok, status: response.status };
}
