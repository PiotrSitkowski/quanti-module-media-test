/**
 * MediaTestDetailPanel — Slot: media_test_detail_panel
 *
 * Shows details of a selected media file: preview, metadata, editable alt text.
 * Allows updating alt text and soft-deleting the file.
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
 */

import React, { Suspense, useState } from 'react';
import { useModuleTranslation } from '../hooks/useModuleTranslation.js';

interface SelectedMedia {
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

interface MediaTestDetailPanelProps {
    context: {
        projectId:    number;
        instanceKey?: string;
        lang?:        string;
        traceId?:     string;
        api?: {
            dispatchQuantiEvent?: (event: string, payload: unknown) => void;
            rpc?: (service: string, method: string, payload: Record<string, unknown>) => Promise<unknown>;
            [key: string]: unknown;
        };
        data?: {
            selectedItem?: SelectedMedia;
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
    if (bytes === 0)           return '0 B';
    if (bytes < 1024)          return `${bytes} B`;
    if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Inner component ───────────────────────────────────────────────────────────
function MediaTestDetailPanelInner({ context }: MediaTestDetailPanelProps) {
    const t    = useModuleTranslation(context.lang as 'en' | 'pl');
    const item = context.data?.selectedItem;

    const [alt,     setAlt]     = useState(item?.alt ?? '');
    const [saving,  setSaving]  = useState(false);
    const [saved,   setSaved]   = useState(false);

    // ── Save alt text via RPC ─────────────────────────────────────────────────
    async function handleSave() {
        if (!item || !context.api?.rpc) return;
        setSaving(true);
        try {
            await context.api.rpc('media-test', 'update', {
                projectId:   context.projectId,
                instanceKey: context.instanceKey ?? 'default',
                id:          item.id,
                alt,
                traceId:     context.traceId ?? '',
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } finally {
            setSaving(false);
        }
    }

    // ── Delete via context.api.dispatchQuantiEvent (modal confirmation) ────────
    function handleDelete() {
        if (!item) return;
        context.api?.dispatchQuantiEvent?.('quanti:modal:show', {
            type:      'confirm',
            title:     t.deleteBtn,
            message:   t.deleteConfirm,
            projectId: context.projectId,
            data:      { id: item.id },
            onConfirm: 'media-test:delete',
        });
    }

    return (
        <div className="flex flex-col gap-4">
            {/* ── Section header with project indicator ── */}
            <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {t.detailTitle}
                </h4>
                <p className="text-[13px] text-gray-500 dark:text-gray-400">
                    {t.projectLabel} {context.projectId}
                </p>
            </div>

            {/* ── No item selected ── */}
            {!item && (
                <p data-testid="no-selection" className="text-[13px] text-gray-400 dark:text-gray-500">
                    {t.emptyState}
                </p>
            )}

            {/* ── Item detail ── */}
            {item && (
                <div className="flex flex-col gap-3">
                    {/* Preview */}
                    {item.url && item.contentType.startsWith('image/') ? (
                        <img
                            src={item.url}
                            alt={item.alt ?? item.filename}
                            data-testid="media-preview"
                            className="w-full rounded-md border border-gray-200 dark:border-gray-700 object-contain max-h-48"
                        />
                    ) : (
                        <div
                            data-testid="media-preview-placeholder"
                            className="flex h-24 items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                        >
                            <span className="text-[12px] text-gray-400 uppercase tracking-wider">
                                {item.contentType}
                            </span>
                        </div>
                    )}

                    {/* Metadata rows */}
                    <dl className="flex flex-col gap-1">
                        {(
                            [
                                [t.fieldFilename, item.filename],
                                [t.fieldSize,     formatSize(item.size)],
                                [t.fieldType,     item.contentType],
                                [t.fieldStatus,   item.status],
                                [t.fieldCreatedAt, item.createdAt],
                            ] as [string, string][]
                        ).map(([label, value]) => (
                            <div key={label} className="flex gap-2">
                                <dt className="w-28 shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                                    {label}
                                </dt>
                                <dd className="text-[13px] text-gray-700 dark:text-gray-300 truncate">
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>

                    {/* Alt text editor */}
                    <div className="flex flex-col gap-1">
                        <label
                            htmlFor="media-alt-input"
                            className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
                        >
                            {t.fieldAlt}
                        </label>
                        <textarea
                            id="media-alt-input"
                            data-testid="alt-input"
                            rows={2}
                            value={alt}
                            onChange={(e) => setAlt(e.target.value)}
                            placeholder={t.altPlaceholder}
                            className="w-full rounded-md border border-gray-200 px-2 py-1 text-[13px] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 resize-none"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            id="media-save-btn"
                            data-testid="save-btn"
                            onClick={handleSave}
                            disabled={saving}
                            className="rounded-md border border-gray-200 px-3 py-1.5 text-[13px] hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                            {saving ? t.loadingText : saved ? '✓' : t.saveBtn}
                        </button>

                        <button
                            type="button"
                            id="media-delete-btn"
                            data-testid="delete-btn"
                            onClick={handleDelete}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-[13px] text-red-500 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 transition-colors"
                        >
                            {t.deleteBtn}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Public export — wrapped in ErrorBoundary + Suspense ──────────────────────
export function MediaTestDetailPanel({ context }: MediaTestDetailPanelProps) {
    return (
        <ErrorBoundary>
            <Suspense fallback={<p className="text-[13px] text-gray-400 animate-pulse">…</p>}>
                <MediaTestDetailPanelInner context={context} />
            </Suspense>
        </ErrorBoundary>
    );
}

export default MediaTestDetailPanel;
