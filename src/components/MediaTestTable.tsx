/**
 * MediaTestTable — Slot: media_test_main_view
 *
 * Media gallery with upload capability and image grid.
 * Users can upload images via presigned R2 URL and browse the library.
 *
 * MFE component injected via ExtensionSlot.
 * Context comes from props — never import stores directly.
 *
 * Design System rules (UX_UI_STANDARDS.md):
 *   - Base font: text-[13px]
 *   - Section headers: text-[10px] uppercase tracking-wider
 *   - Spacing: Tailwind scale only (no arbitrary values)
 *   - No shadows (border only), max rounded-md, no gradients
 *
 * i18n (LOCALIZATION_STANDARDS.md):
 *   - NEVER hardcode user-visible strings — use `t.key` from useModuleTranslation
 *
 * R2 Upload pattern (CS-02):
 *   - Request presigned URL via context.api.rpc (only use context.api — no direct HTTP to backend)
 *   - Browser uploads directly to R2 using the presigned URL via uploadToR2() helper in src/lib/
 *   - Register metadata via context.api.rpc after successful upload
 */

import React, { Suspense, useState, useRef, useCallback } from 'react';
import { useModuleTranslation } from '../hooks/useModuleTranslation.js';
import { uploadToR2 } from '../lib/r2Upload.js';

interface MediaItem {
    id:          string;
    filename:    string;
    contentType: string;
    size:        number;
    r2Key:       string;
    url?:        string;
    alt?:        string;
    status:      string;
    createdAt:   string;
}

interface MediaTestTableProps {
    context: {
        projectId:   number;
        instanceKey?: string;
        lang?:       string;
        traceId?:    string;
        api?: {
            dispatchQuantiEvent?: (event: string, payload: unknown) => void;
            rpc?: (service: string, method: string, payload: Record<string, unknown>) => Promise<unknown>;
            [key: string]: unknown;
        };
        data?: {
            items?: MediaItem[];
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
}

// ── Inline ErrorBoundary ──────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<
    { children: React.ReactNode; fallback?: React.ReactNode },
    { hasError: boolean }
> {
    constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError) {
            return this.props.fallback ?? (
                <p className="text-[13px] text-red-500">Component failed to load.</p>
            );
        }
        return this.props.children;
    }
}

// ── Helper: format file size ─────────────────────────────────────────────────
function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Inner component — media gallery ──────────────────────────────────────────
function MediaTestTableInner({ context }: MediaTestTableProps) {
    const t       = useModuleTranslation(context.lang as 'en' | 'pl');
    const fileRef = useRef<HTMLInputElement>(null);

    const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [items, setItems]               = useState<MediaItem[]>(context.data?.items ?? []);

    // ── Upload handler — CS-02 pattern: Presigned URL via RPC ────────────────
    const handleFileSelected = useCallback(async (file: File) => {
        if (!context.api?.rpc) return;
        setUploadStatus('uploading');
        try {
            // STEP 1: Request presigned URL from Kernel media service via RPC
            const presigned = await context.api.rpc('media', 'getPresignedUploadUrl', {
                projectId:   context.projectId,
                instanceKey: context.instanceKey ?? 'default',
                fileName:    file.name,
                contentType: file.type,
                traceId:     context.traceId ?? '',
            }) as { uploadUrl: string; fileKey: string };

            // STEP 2: Browser uploads directly to R2 (zero egress through Worker)
            // Upload is isolated in src/lib/r2Upload.ts — only PUT to R2 presigned URL, not a backend API call
            const uploadResult = await uploadToR2({
                uploadUrl:   presigned.uploadUrl,
                file,
                contentType: file.type,
            });

            if (!uploadResult.ok) throw new Error('R2 upload failed');

            // STEP 3: Register metadata in D1 via RPC
            const newItem = await context.api.rpc('media-test', 'create', {
                projectId:   context.projectId,
                instanceKey: context.instanceKey ?? 'default',
                filename:    file.name,
                contentType: file.type,
                size:        file.size,
                r2Key:       presigned.fileKey,
                traceId:     context.traceId ?? '',
            }) as MediaItem;

            setItems(prev => [newItem, ...prev]);
            setUploadStatus('success');
            setTimeout(() => setUploadStatus('idle'), 3000);
        } catch {
            setUploadStatus('error');
            setTimeout(() => setUploadStatus('idle'), 4000);
        }
    }, [context]);

    // ── Delete handler ────────────────────────────────────────────────────────
    function handleDelete(item: MediaItem) {
        context.api?.dispatchQuantiEvent?.('quanti:modal:show', {
            type:      'confirm',
            title:     t.deleteBtn,
            message:   t.deleteConfirm,
            projectId: context.projectId,
            data:      { id: item.id },
            onConfirm: 'media-test:delete',
        });
    }

    // ── Upload button click ───────────────────────────────────────────────────
    function handleUploadClick() {
        fileRef.current?.click();
    }

    return (
        <div className="flex flex-col gap-4">
            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {t.title}
                    </h4>
                    <p className="text-[13px] text-gray-500 dark:text-gray-400">
                        {t.projectLabel} {context.projectId}
                    </p>
                </div>

                {/* ── Upload button ── */}
                <button
                    type="button"
                    id="media-upload-btn"
                    onClick={handleUploadClick}
                    disabled={uploadStatus === 'uploading'}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-[13px] hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                    {uploadStatus === 'uploading' ? t.uploadingText : t.uploadBtn}
                </button>

                {/* ── Hidden file input ── */}
                <input
                    ref={fileRef}
                    data-testid="file-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelected(file);
                        e.target.value = '';
                    }}
                />
            </div>

            {/* ── Status messages ── */}
            {uploadStatus === 'success' && (
                <p data-testid="upload-success" className="text-[13px] text-green-600 dark:text-green-400">
                    {t.uploadSuccess}
                </p>
            )}
            {uploadStatus === 'error' && (
                <p data-testid="upload-error" className="text-[13px] text-red-500">
                    {t.uploadError}
                </p>
            )}

            {/* ── Empty state ── */}
            {items.length === 0 && (
                <p data-testid="empty-state" className="text-[13px] text-gray-400 dark:text-gray-500">
                    {t.emptyState}
                </p>
            )}

            {/* ── Media grid ── */}
            {items.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            data-testid={`media-item-${item.id}`}
                            className="group relative overflow-hidden rounded-md border border-gray-200 dark:border-gray-700"
                        >
                            {/* Thumbnail */}
                            {item.url ? (
                                <img
                                    src={item.url}
                                    alt={item.alt ?? item.filename}
                                    className="h-24 w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-24 items-center justify-center bg-gray-100 dark:bg-gray-800">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                                        {item.contentType.split('/')[1] ?? 'file'}
                                    </span>
                                </div>
                            )}

                            {/* Overlay with info and actions */}
                            <div className="absolute inset-0 flex flex-col justify-between bg-black/0 p-2 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
                                <p className="max-w-full truncate text-[11px] text-white font-medium">
                                    {item.filename}
                                </p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-white/80">
                                        {formatSize(item.size)}
                                    </span>
                                    <button
                                        type="button"
                                        data-testid={`delete-${item.id}`}
                                        onClick={() => handleDelete(item)}
                                        className="rounded border border-white/50 px-2 py-0.5 text-[10px] text-white hover:bg-white/20 transition-colors"
                                    >
                                        {t.deleteBtn}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Public export — wrapped in ErrorBoundary + Suspense ──────────────────────
export function MediaTestTable({ context }: MediaTestTableProps) {
    return (
        <ErrorBoundary>
            <Suspense fallback={<p className="text-[13px] text-gray-400 animate-pulse">…</p>}>
                <MediaTestTableInner context={context} />
            </Suspense>
        </ErrorBoundary>
    );
}

export default MediaTestTable;
