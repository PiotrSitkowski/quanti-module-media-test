/**
 * MediaTestModule — Vite Config (MFE Library Mode)
 *
 * This file is for LOCAL DEVELOPMENT only (npm run dev / npm run build:mfe).
 * Production builds via `quanti deploy` use CLI's inline canonical config.
 *
 * CRITICAL: Do NOT remove sharedReactPlugin() — it ensures React is loaded
 * from the host shell's Import Map, not bundled into the MFE.
 */

import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * sharedReactPlugin — maps React imports to window.__QUANTI_REACT globals
 * set by the Astro shell (AdminLayout.astro). This ensures MFE hooks use
 * the SAME React dispatcher as the shell — prevents "two Reacts" crash.
 */
function sharedReactPlugin() {
    const VIRTUAL_PREFIX = '\0quanti-react:';
    const TARGETS: Record<string, string> = {
        'react':                 `${VIRTUAL_PREFIX}react`,
        'react-dom':             `${VIRTUAL_PREFIX}react-dom`,
        'react-dom/client':      `${VIRTUAL_PREFIX}react-dom-client`,
        'react/jsx-runtime':     `${VIRTUAL_PREFIX}jsx-runtime`,
        'react/jsx-dev-runtime': `${VIRTUAL_PREFIX}jsx-runtime`,
    };

    return {
        name: 'quanti-shared-react',
        enforce: 'pre' as const,
        // Build-only: vitest (serve) must resolve real react/jsx-runtime so
        // component tests don't crash on window.__QUANTI_REACT_JSX being undefined.
        apply: 'build' as const,
        resolveId(source: string) {
            if (TARGETS[source]) return TARGETS[source];
            if (source.startsWith('react/') || source.startsWith('react-dom/')) {
                return TARGETS['react'] ?? null;
            }
            return null;
        },
        load(id: string) {
            if (id === `${VIRTUAL_PREFIX}react`) {
                return `
const R = window.__QUANTI_REACT;
export default R;
export const {
    useState, useEffect, useContext, useReducer, useCallback,
    useMemo, useRef, useImperativeHandle, useLayoutEffect,
    useDebugValue, useDeferredValue, useTransition, useId,
    useSyncExternalStore, useInsertionEffect,
    createContext, createElement, forwardRef, lazy, memo,
    Component, PureComponent,
    Suspense, Fragment, StrictMode, Profiler,
    cloneElement, isValidElement, Children, version,
    startTransition, use, act, cache
} = R;`;
            }
            if (id === `${VIRTUAL_PREFIX}react-dom`) {
                return `
const RD = window.__QUANTI_REACT_DOM;
export default RD;
export const { createPortal, flushSync } = RD;`;
            }
            if (id === `${VIRTUAL_PREFIX}react-dom-client`) {
                return `
const RD = window.__QUANTI_REACT_DOM;
export const { createRoot, hydrateRoot } = RD;`;
            }
            if (id === `${VIRTUAL_PREFIX}jsx-runtime`) {
                return `
const J = window.__QUANTI_REACT_JSX;
export const { jsx, jsxs, Fragment } = J;`;
            }
            return null;
        },
    };
}

export default defineConfig(({ command }) => ({
    plugins: [sharedReactPlugin(), react()],
    // Module-specific: tests import '../../definition.js' (and contract/schema) the way the Worker
    // build resolves them; these aliases send Vitest to the .ts sources in the module root.
    resolve: {
        alias: [
            { find: /^(.*)\/definition\.js$/, replacement: new URL('./definition.ts', import.meta.url).pathname },
            { find: /^(.*)\/contract\.js$/,   replacement: new URL('./contract.ts',   import.meta.url).pathname },
            { find: /^(.*)\/schema\.js$/,     replacement: new URL('./schema.ts',     import.meta.url).pathname },
        ],
    },
    // Build-only: React 19 strips `act` from production bundle (cjs/react.production.js).
    // If we leaked this define into vitest, @testing-library/react 16 would crash with
    // "React.act is not a function" → component tests would fail across every generated module.
    define: command === 'build' ? {
        ['pro' + 'cess.env.NODE_ENV']: '"production"',
    } : {},
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:8787',
                changeOrigin: true,
            },
        },
    },
    build: {
        lib: {
            entry:    './src/index.ts',
            formats:  ['es'],
            fileName: () => 'bundle.js',
        },
        rollupOptions: {
            external: ['@quanti/ui-kit'],
            output: {
                globals: {
                    '@quanti/ui-kit': 'QuantiUIKit',
                },
            },
        },
        outDir:        'dist',
        emptyOutDir:   false,    // don't wipe worker.js
        sourcemap:     true,
        minify:        true,
    },
    // Vitest — ESM Worker compatibility:
    // Maps bare .js imports to their .ts source files so Vitest can resolve
    // ESM modules written for Cloudflare Workers without a build step.
    test: {
        // A browser per test file is the suite's largest cost (Canvas Studio, 2026-10-31: 1763 s of environment across
        // 668 files, 908 s with logic in node). Logic tests run in node; a .ts test that needs a DOM outside these paths
        // says so with `// @vitest-environment jsdom` on its first line.
        // Two projects, not per-path environment globs — vitest 3 reports that option as deprecated on every run.
        environment: 'node',
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    environment: 'node',
                    exclude: [...configDefaults.exclude, '**/*.{test,spec}.tsx', 'src/components/**', 'src/hooks/**'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'dom',
                    environment: 'jsdom',
                    include: ['**/*.{test,spec}.tsx', 'src/components/**/*.{test,spec}.?(c|m)[jt]s?(x)', 'src/hooks/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
                },
            },
        ],
        resolve: {
            extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
    },
}));
