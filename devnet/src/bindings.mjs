// The devnet's runtime and the devnet flavour of the Lantern module. The module lives under
// devnet/build/, so its own `import '@midnight-ntwrk/compact-runtime'` resolves to devnet's
// node_modules: one runtime copy, shared with midnight-js.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as rt from '@midnight-ntwrk/compact-runtime';
import { buildDir } from './config.mjs';

export const LANTERN_ZK = path.join(buildDir, 'lantern');
export const SHIPPED_ZK = path.join(buildDir, 'shipped');

export async function loadBindings() {
  const entry = path.join(LANTERN_ZK, 'contract', 'index.js');
  if (!existsSync(entry)) throw new Error('devnet/build is missing: run `bash devnet/compile.sh` (npm run devnet does)');
  const Lantern = await import(pathToFileURL(entry).href);
  return { rt, Lantern };
}
