/**
 * MediaTestModule — Vite Config (MFE Library Mode)
 *
 * This file is for LOCAL DEVELOPMENT only (npm run dev / npm run build:mfe).
 * Production builds via `quanti deploy` use CLI's inline canonical config
 * (Quanti-System/packages/quanti-cli/src/build/mfe-bundler.ts).
 *
 * CRITICAL: Do NOT remove sharedReactPlugin() — it rewrites bare 'react' /
 * 'react-dom' imports to virtual modules backed by window.__QUANTI_REACT
 * (set by the Astro shell's AdminLayout). Without it the MFE either bundles
 * its own React (two-React hook crash) or pulls a second instance from the
 * Import Map (esm.sh) — both break shared hook dispatch.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

// Derive project root without node:path — use import.meta.url + fileURLToPath.
const __filename  = fileURLToPath(import.meta.url);
const projectRoot = __filename.slice(0, __filename.lastIndexOf('/'));

/**
 * sharedReactPlugin — rewrites React bare imports to virtual modules whose
 * code reads from window.__QUANTI_REACT / __QUANTI_REACT_DOM / __QUANTI_REACT_JSX.
 * Mirrors the canonical CLI implementation in mfe-bundler.ts.
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
        name:    'quanti-shared-react',
        enforce: 'pre' as const,

        resolveId(source: string) {
            if (TARGETS[source]) return TARGETS[source];
            if (source.startsWith('react/') || source.startsWith('react-dom/')) {
                return TARGETS['react'] ?? null;
            }
            return null;
        },

        load(id: string) {
            if (id === `${VIRTUAL_PREFIX}react`) {
                return [
                    'const R = window.__QUANTI_REACT;',
                    'export default R;',
                    'export const {',
                    '  useState, useEffect, useContext, useReducer, useCallback,',
                    '  useMemo, useRef, useImperativeHandle, useLayoutEffect,',
                    '  useDebugValue, useDeferredValue, useTransition, useId,',
                    '  useSyncExternalStore, useInsertionEffect,',
                    '  createContext, createElement, forwardRef, lazy, memo,',
                    '  Component, PureComponent,',
                    '  Suspense, Fragment, StrictMode, Profiler,',
                    '  cloneElement, isValidElement, Children, version,',
                    '  startTransition, use, act, cache',
                    '} = R;',
                ].join('\n');
            }
            if (id === `${VIRTUAL_PREFIX}react-dom`) {
                return [
                    'const RD = window.__QUANTI_REACT_DOM;',
                    'export default RD;',
                    'export const { createPortal, flushSync } = RD;',
                ].join('\n');
            }
            if (id === `${VIRTUAL_PREFIX}react-dom-client`) {
                return [
                    'const RD = window.__QUANTI_REACT_DOM;',
                    'export const { createRoot, hydrateRoot } = RD;',
                ].join('\n');
            }
            if (id === `${VIRTUAL_PREFIX}jsx-runtime`) {
                return [
                    'const J = window.__QUANTI_REACT_JSX;',
                    'export const { jsx, jsxs, Fragment } = J;',
                ].join('\n');
            }
            return null;
        },
    };
}

// NODE_ENV='production' must be scoped to `command === 'build'` — otherwise
// vitest inherits it and React 19 strips React.act from the prod bundle,
// crashing component tests with "React.act is not a function".
export default defineConfig(({ command }) => ({
    // sharedReactPlugin only on production build — in dev/test vitest must load
    // real React from node_modules (window.__QUANTI_REACT exists only in shell).
    plugins: [...(command === 'build' ? [sharedReactPlugin()] : []), react()],
    define: command === 'build' ? { 'process.env.NODE_ENV': '"production"' } : {},
    resolve: {
        // Map explicit .js specifiers → .ts source files for Vitest.
        // worker.test.ts uses dynamic import('../../definition.js') — these aliases
        // redirect to the real .ts files in the project root.
        alias: [
            {
                find:        /^(.*)\/definition\.js$/,
                replacement: projectRoot + '/definition.ts',
            },
            {
                find:        /^(.*)\/contract\.js$/,
                replacement: projectRoot + '/contract.ts',
            },
            {
                find:        /^(.*)\/schema\.js$/,
                replacement: projectRoot + '/schema.ts',
            },
        ],
    },
    server: {
        proxy: {
            '/api': {
                target:       'http://localhost:8787',
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
            // react / react-dom are NOT external — sharedReactPlugin() rewrites
            // them to virtual modules backed by window.__QUANTI_REACT.
            external: ['@quanti/ui-kit'],
            output: {
                globals: { '@quanti/ui-kit': 'QuantiUIKit' },
            },
        },
        outDir:      'dist',
        emptyOutDir: false,
        sourcemap:   true,
        minify:      true,
    },
    test: {
        environment: 'node',
        globals:     false,
    },
}));
