/**
 * MediaTestModule — Vite Config (MFE Library Mode)
 *
 * This file is for LOCAL DEVELOPMENT only (npm run dev / npm run build:mfe).
 * Production builds via `quanti deploy` use CLI's inline canonical config.
 *
 * CRITICAL: Do NOT remove sharedReactPlugin() — it ensures React is loaded
 * from the host shell's Import Map, not bundled into the MFE.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

// Derive project root without node:path — use import.meta.url + fileURLToPath
// fileURLToPath is a Web API equivalent available in Vite config context
const __filename = fileURLToPath(import.meta.url);
// Strip the filename to get the directory (manual dirname — no node:path)
const projectRoot = __filename.slice(0, __filename.lastIndexOf('/'));

/**
 * sharedReactPlugin — externalises React so the host shell provides it.
 * Without this, each MFE would bundle its own React copy → conflicts.
 */
function sharedReactPlugin() {
    return {
        name: 'quanti-shared-react',
        resolveId(source: string) {
            if (source === 'react' || source === 'react-dom' || source.startsWith('react/') || source.startsWith('react-dom/')) {
                return { id: source, external: true };
            }
            return null;
        },
        renderChunk(code: string) {
            return code
                .replace(/from\s*['"]react['"]/g, "from 'react'")
                .replace(/from\s*['"]react-dom['"]/g, "from 'react-dom'");
        },
    };
}

export default defineConfig({
    plugins: [sharedReactPlugin(), react()],
    resolve: {
        // Map explicit .js specifiers → .ts source files for Vitest.
        // worker.test.ts uses dynamic import('../../definition.js') — these aliases
        // redirect to the real .ts files in the project root.
        alias: [
            {
                find: /^(.*)\/definition\.js$/,
                replacement: projectRoot + '/definition.ts',
            },
            {
                find: /^(.*)\/contract\.js$/,
                replacement: projectRoot + '/contract.ts',
            },
            {
                find: /^(.*)\/schema\.js$/,
                replacement: projectRoot + '/schema.ts',
            },
        ],
    },
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
            external: ['react', 'react-dom', 'react/jsx-runtime', '@quanti/ui-kit'],
        },
        outDir:        'dist',
        emptyOutDir:   false,
        sourcemap:     true,
        minify:        true,
    },
    test: {
        environment: 'node',
        globals:     false,
    },
});
