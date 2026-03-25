import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '/Users/piotr/internet-web/Universal_media/Quanti/Quanti-CLI/quanti-module-media-test/.quanti-dev',
  plugins: [react()],
  server: {
    port: 5174,
    open: true,
  },
  resolve: {
    alias: {
      '@components': '/Users/piotr/internet-web/Universal_media/Quanti/Quanti-CLI/quanti-module-media-test/src/components',
      '@hooks':      '/Users/piotr/internet-web/Universal_media/Quanti/Quanti-CLI/quanti-module-media-test/src/hooks',
      '@locales':    '/Users/piotr/internet-web/Universal_media/Quanti/Quanti-CLI/quanti-module-media-test/src/locales',
    },
  },
});
