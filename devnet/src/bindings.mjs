// The devnet's runtime, the Foundation's Schnorr library, and the devnet builds of both
// contracts. The modules live under devnet/build/, so their own
// `import '@midnight-ntwrk/compact-runtime'` resolves to devnet's node_modules: one runtime
// copy, shared with midnight-js.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as rt from '@midnight-ntwrk/compact-runtime';
import * as schnorr from '@midnight-ntwrk/midnight-did-jubjub-schnorr';
import { buildDir } from './config.mjs';

export const LANTERN_ZK = path.join(buildDir, 'lantern');
export const HOST_ZK = path.join(buildDir, 'host');
export const SHIPPED_ZK = path.join(buildDir, 'shipped');

export async function loadBindings() {
  const load = async (dir) => {
    const entry = path.join(dir, 'contract', 'index.js');
    if (!existsSync(entry)) throw new Error('devnet/build is missing: run `bash devnet/compile.sh` (npm run devnet does)');
    return import(pathToFileURL(entry).href);
  };
  return { rt, schnorr, Lantern: await load(LANTERN_ZK), Host: await load(HOST_ZK) };
}
