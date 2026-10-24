import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

/**
 * Emits asset-manifest.json (every built file) and stamps a build id into sw.js so the
 * service worker can precache the whole app shell and pick up each new deployment.
 */
function pwaManifestPlugin(): Plugin {
  const buildId = Date.now().toString(36);
  return {
    name: 'one-bhilwara-pwa',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: JSON.stringify({ buildId, files }, null, 0) });
      const sw = readFileSync(fileURLToPath(new URL('./src/sw/sw.js', import.meta.url)), 'utf8').replace('__BUILD_ID__', buildId);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pwaManifestPlugin()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2020', chunkSizeWarningLimit: 700 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
} as never);
