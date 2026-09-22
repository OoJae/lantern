#!/usr/bin/env node
// Runs after `vite build`. Fails the build unless:
//   - exactly one .wasm ships (two runtime copies would mean two WASM instances whose objects
//     are not interchangeable);
//   - web/node_modules holds no Midnight package (the runtime must resolve from the repo root,
//     so the browser runs exactly the modules the tests run);
//   - the landing page's entry script pulls in no .wasm (the runtime loads only on /demo).
// Then prints a hash over every built file: rebuild from the same commit and compare.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const web = new URL('..', import.meta.url).pathname;
const dist = join(web, 'dist');
const fail = (m) => { console.error(`check-bundle: ${m}`); process.exit(1); };

const files = [];
const walk = (d) => readdirSync(d).forEach((n) => {
  const p = join(d, n);
  statSync(p).isDirectory() ? walk(p) : files.push(p);
});
walk(dist);

const wasm = files.filter((f) => f.endsWith('.wasm'));
if (wasm.length !== 1) fail(`expected exactly one .wasm, found ${wasm.length}`);
if (existsSync(join(web, 'node_modules', '@midnight-ntwrk'))) fail('web/node_modules must not contain @midnight-ntwrk');

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = html.match(/<script type="module"[^>]*src="\/([^"]+)"/)?.[1];
if (!entry) fail('no entry script in index.html');
if (/\.wasm/.test(readFileSync(join(dist, entry), 'utf8'))) fail('the landing entry references .wasm');

const h = createHash('sha256');
for (const f of files.map((f) => relative(dist, f)).sort()) {
  h.update(f).update('\0').update(createHash('sha256').update(readFileSync(join(dist, f))).digest()).update('\0');
}
console.log(`check-bundle: 1 .wasm (${(statSync(wasm[0]).size / 1e6).toFixed(1)} MB), no local Midnight packages, landing entry wasm-free`);
console.log(`check-bundle: build hash ${h.digest('hex')}`);
