import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Base path is fixed at build time so the PWA scope, service worker and cookies
// stay isolated from any other app hosted on the same domain.
const base = (process.env.PPM_BASE_PATH || '/').replace(/\/?$/, '/');

export default defineConfig({
  root: 'client',
  base,
  publicDir: 'public',
  build: { outDir: '../dist/client', emptyOutDir: true, chunkSizeWarningLimit: 1500, sourcemap: false },
  server: {
    port: 5173,
    proxy: { [`${base}api`]: { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      scope: base,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest,mjs}'], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
      manifest: {
        id: `${base}#ppm`,
        name: 'Prompt & Project Manager',
        short_name: 'Prompt Manager',
        description: 'Private workspace for projects, prompts, files and AI outputs.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#FFFFFF',
        theme_color: '#000000',
        categories: ['productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
