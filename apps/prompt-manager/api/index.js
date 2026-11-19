// Vercel Function entry. The server is bundled during the build (npm run build:server) so that
// Node's ESM resolution doesn't depend on per-file TypeScript compilation.
export { default } from '../dist/server/server/vercel.mjs';
