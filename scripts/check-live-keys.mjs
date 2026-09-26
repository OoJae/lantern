#!/usr/bin/env node
// /live compares each verifier key on Preprod with a SHA-256 pinned in web/src/live/keys.js. The key
// files themselves are not committed (contracts/managed*/keys is gitignored; `npm run compile` makes
// them), so this checks the pins against a compile: every key file must have its hash pinned, and
// every pin must have its key file. Run it after `npm run compile`; CI's compile job does.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const { COMMITTED_KEYS } = await import(new URL('web/src/live/keys.js', root));
const DIRS = { lantern: 'contracts/managed/keys/', host: 'contracts/managed-host/keys/' };

const problems = [];
let checked = 0;
for (const [kind, dir] of Object.entries(DIRS)) {
  const url = new URL(dir, root);
  if (!existsSync(url)) { problems.push(`${dir} does not exist: run npm run compile first`); continue; }
  const files = readdirSync(url).filter((f) => f.endsWith('.verifier')).map((f) => f.replace(/\.verifier$/, '')).sort();
  const pinned = Object.keys(COMMITTED_KEYS[kind] ?? {}).sort();
  for (const n of files.filter((f) => !pinned.includes(f))) problems.push(`${kind}.${n}: compiled, but not pinned in web/src/live/keys.js`);
  for (const n of pinned.filter((p) => !files.includes(p))) problems.push(`${kind}.${n}: pinned, but ${dir}${n}.verifier was not compiled`);
  for (const n of files.filter((f) => pinned.includes(f))) {
    const sha = createHash('sha256').update(readFileSync(new URL(`${n}.verifier`, url))).digest('hex');
    if (sha !== COMMITTED_KEYS[kind][n]) problems.push(`${kind}.${n}: web/src/live/keys.js pins ${COMMITTED_KEYS[kind][n]}, the compile gives ${sha}`);
    else checked++;
  }
}
if (problems.length) {
  for (const p of problems) console.error(`check-live-keys: ${p}`);
  process.exit(1);
}
console.log(`check-live-keys: all ${checked} verifier-key hashes /live pins match this compile`);
