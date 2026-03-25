/**
 * MediaTestDetailPanel — Slot: media_test_detail_panel
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
 * Modals (CORE_UI_MODULES.md):
 *   - NEVER use native browser dialogs — use context.api?.dispatchQuantiEvent('quanti:modal:show', ...) instead
 *   - dispatchQuantiEvent is provided by the host shell via props.context.api (never import from @quanti/kernel)
 */

import React, { Suspense } from 'react';
import { useModuleTranslation } from '../hooks/useModuleTranslation.js';

// dispatchQuantiEvent is provided by the host shell via props.context.api.
// Do NOT import from @quanti/kernel — that package is not bundled with the module.

interface MediaTestDetailPanelProps {
    context: {
        projectId: number;
        instanceKey?: string;
        lang?: string;
        api?: {
            dispatchQuantiEvent?: (event: string, payload: unknown) => void;
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
}

// ── Inline ErrorBoundary (replace with shared @quanti/ui-kit version if available) ──
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

// ── Inner component — implement business logic here ──────────────────────────

function MediaTestDetailPanelInner({ context }: MediaTestDetailPanelProps) {
    const t = useModuleTranslation(context.lang as 'en' | 'pl');

    // ✅ Correct pattern: communicate via context.api — NEVER call fetch directly
    function handleAction() {
        context.api?.dispatchQuantiEvent?.('quanti:modal:show', {
            type:      'info',
            title:     t.title,
            projectId: context.projectId,
            message:   'Implement MediaTestDetailPanel business logic here.',
        });
    }

    return (
        <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {t.title}
            </h4>

            <p className="text-[13px] text-gray-500 dark:text-gray-400">
                Implement MediaTestDetailPanel business logic here.
            </p>

            {/* Example: correct event-driven action via context.api */}
            <button
                type="button"
                onClick={handleAction}
                className="self-start rounded-md border border-gray-200 px-3 py-1.5 text-[13px] hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
            >
                {t.actionBtn}
            </button>
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
