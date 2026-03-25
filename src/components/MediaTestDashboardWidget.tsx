/**
 * MediaTestDashboardWidget — Slot: dashboard_widget
 *
 * Dashboard widget showing media library statistics:
 * total files uploaded and count of recent uploads (last 7 days).
 *
 * MFE component injected via ExtensionSlot.
 * Context comes from props — never import stores directly.
 * Data is pre-loaded in context.data by the Kernel snapshot before mount.
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

import React, { Suspense } from 'react';
import { useModuleTranslation } from '../hooks/useModuleTranslation.js';

interface MediaTestDashboardWidgetProps {
    context: {
        projectId:    number;
        instanceKey?: string;
        lang?:        string;
        api?: {
            dispatchQuantiEvent?: (event: string, payload: unknown) => void;
            [key: string]: unknown;
        };
        data?: {
            totalFiles?:  number;
            recentFiles?: number;
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

// ── Inner component ───────────────────────────────────────────────────────────
function MediaTestDashboardWidgetInner({ context }: MediaTestDashboardWidgetProps) {
    const t           = useModuleTranslation(context.lang as 'en' | 'pl');
    // Data is pre-populated by Kernel snapshot — no fetch on mount
    const totalFiles  = context.data?.totalFiles  ?? 0;
    const recentFiles = context.data?.recentFiles ?? 0;

    // Navigate to full media library view
    function handleOpenLibrary() {
        context.api?.dispatchQuantiEvent?.('quanti:navigate', {
            module:    'media-test',
            slot:      'media_test_main_view',
            projectId: context.projectId,
        });
    }

    return (
        <div className="flex flex-col gap-3">
            {/* ── Header ── */}
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {t.widgetTitle}
            </h4>

            {/* ── Project indicator (required by tests) ── */}
            <p className="text-[13px] text-gray-500 dark:text-gray-400">
                {t.projectLabel} {context.projectId}
            </p>

            {/* ── Metrics ── */}
            <div className="flex gap-4">
                <div
                    data-testid="metric-total"
                    className="flex flex-col gap-0.5 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
                >
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {t.widgetTotal}
                    </span>
                    <span className="text-[18px] font-semibold text-gray-800 dark:text-gray-200">
                        {totalFiles}
                    </span>
                </div>

                <div
                    data-testid="metric-recent"
                    className="flex flex-col gap-0.5 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
                >
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {t.widgetRecent}
                    </span>
                    <span className="text-[18px] font-semibold text-gray-800 dark:text-gray-200">
                        {recentFiles}
                    </span>
                </div>
            </div>

            {/* ── Action ── */}
            <button
                type="button"
                id="widget-open-library-btn"
                onClick={handleOpenLibrary}
                className="self-start rounded-md border border-gray-200 px-3 py-1.5 text-[13px] hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
            >
                {t.actionBtn}
            </button>
        </div>
    );
}

// ── Public export — wrapped in ErrorBoundary + Suspense ──────────────────────
export function MediaTestDashboardWidget({ context }: MediaTestDashboardWidgetProps) {
    return (
        <ErrorBoundary>
            <Suspense fallback={<p className="text-[13px] text-gray-400 animate-pulse">…</p>}>
                <MediaTestDashboardWidgetInner context={context} />
            </Suspense>
        </ErrorBoundary>
    );
}

export default MediaTestDashboardWidget;
