// WASM setup follows onepledge's working build (itself after midnightntwrk/example-zkloan, Apache-2.0).
// web/ declares no Midnight package: the runtime and the compiled contracts resolve from the repo
// root, so the browser runs the exact modules `npm test` does.
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import vercel from './vercel.json' with { type: 'json' };

// `vite preview` serves the hosted site's security headers, so the CSP is tested locally.
const hostedHeaders = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));

export default defineConfig(({ mode }) => ({
  base: '/',
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    global: 'globalThis',
  },
  plugins: [wasm()],
  optimizeDeps: { exclude: ['@midnight-ntwrk/onchain-runtime-v3'] },
  // assetsInlineLimit 0: an inlined data: asset would violate the CSP.
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    commonjsOptions: { transformMixedEsModules: true },
  },
  preview: { headers: hostedHeaders },
  server: {
    headers: hostedHeaders,
    fs: {
      allow: ['.', '../src', '../contracts', '../test', '../node_modules'],
      deny: ['.env', '.env.*', '**/.git/**', '**/buildplan.md'],
    },
  },
}));
