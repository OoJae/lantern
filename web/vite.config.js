// WASM setup follows onepledge's working build (itself after midnightntwrk/example-zkloan, Apache-2.0).
// web/ declares no Midnight package: the runtime and the compiled contracts resolve from the repo
// root, so the browser runs exactly the modules `npm test` does.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
  plugins: [wasm(), react()],
  optimizeDeps: { exclude: ['@midnight-ntwrk/onchain-runtime-v3'] },
  // assetsInlineLimit 0: an inlined data: asset would violate the CSP.
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    commonjsOptions: { transformMixedEsModules: true },
  },
  preview: { headers: hostedHeaders },
  // The dev server does not send the CSP: React's hot-reload preamble is an inline script. The
  // production CSP is exercised by `vite preview`, which the e2e suite runs against.
  server: {
    fs: {
      // Only what the app imports: its own sources, the shared src/, the four compiled contract
      // modules and the root dependencies.
      allow: [
        '.', '../src', '../contracts/managed/contract', '../contracts/managed-host/contract',
        '../contracts/managed-public-guardians/contract', '../contracts/managed-lantern-v0/contract',
        '../node_modules', '../deployments',
      ],
      deny: ['.env', '.env.*', '**/.git/**', '**/buildplan.md', '**/.secrets/**'],
    },
  },
}));
