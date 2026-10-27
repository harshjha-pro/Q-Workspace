/// <reference types="vitest" />
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Writes dist/precache-manifest.json (every emitted file) for the service
 * worker, and stamps a build id into dist/sw.js so browsers detect updates.
 */
function precacheManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'fivew-oneh-precache',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    generateBundle(_, bundle) {
      // Fonts are split by unicode range; precache only the Latin woff2 subsets the UI uses.
      const files = Object.keys(bundle).filter(
        (f) => !f.endsWith('.map') && !f.endsWith('.woff') && !/inter-(cyrillic|greek|vietnamese)/.test(f),
      );
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify({ files }, null, 2) });
    },
    closeBundle() {
      const sw = resolve(outDir, 'sw.js');
      const id = Date.now().toString(36);
      writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD_ID__', id));
    },
  };
}

// The app is self-contained in /fivew-oneh. VITE_BASE lets it be served from a
// sub-path (e.g. "/fivew-oneh/"); the manifest and service worker use relative
// URLs so their scope always follows the deployment base.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE || '/';
  return {
    base,
    plugins: [react(), precacheManifest()],
    build: { outDir: 'dist', sourcemap: false },
    server: { port: 5180 },
    preview: { port: 4173 },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
    },
  };
});
