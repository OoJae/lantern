#!/usr/bin/env node
// Lantern v2's cost check (docs/v2.md §8), kept apart from scripts/check-cost.mjs, which
// pins v1's 17 circuits and must not change. Fails unless every one of v2's 13 proving
// circuits is at k <= 14, and just as loudly if it cannot tell: exactly 13 rows must
// parse, each with a numeric k. It then checks both of docs/v2.md's cost tables (§8, v1
// against v2, and §14.1, the built contract's k and rows) against this measurement, and
// every tree depth the document shows against the contract's. compile.yml runs it on every
// push that touches code, README.md or docs/v2.md, so the tables cannot drift unnoticed.
//
//   node scripts/check-cost-v2.mjs               check
//   node scripts/check-cost-v2.mjs --write-doc   rewrite the v2 columns of §8 and §14.1
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const EXPECTED = [
  'addGuardian', 'approveRecovery', 'checkIn', 'enrollIdentity', 'finalizeRecovery', 'hostGatedAction',
  'lockIdentity', 'openRecovery', 'proveHeadOwnership', 'proveSuccession', 'rotateGuardianSet',
  'unlockIdentity', 'vetoRecovery',
];
const MAX_K = 14;

const run = spawnSync('bash', ['scripts/cost-v2.sh'], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(run.stderr || run.stdout);
  console.error(`check-cost-v2: scripts/cost-v2.sh failed (exit ${run.status})`);
  process.exit(1);
}
process.stdout.write(run.stdout);

const rows = run.stdout.split('\n')
  .map((l) => l.match(/^\|\s*`([A-Za-z]+)`\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/))
  .filter(Boolean)
  .map(([, name, k, n]) => ({ name, k: Number(k), rows: Number(n) }));

const names = rows.map((r) => r.name).sort();
const problems = [];
if (JSON.stringify(names) !== JSON.stringify([...EXPECTED].sort())) {
  problems.push(`expected exactly these ${EXPECTED.length} circuits, parsed ${rows.length}: ${names.join(', ')}`);
}
for (const r of rows) if (!(r.k >= 1 && r.k <= MAX_K)) problems.push(`${r.name}: k=${r.k} exceeds ${MAX_K}`);

// docs/v2.md §8: | `name` | v1 rows (k) | v2 rows (k) | share |
const docUrl = new URL('../docs/v2.md', import.meta.url);
const whole = readFileSync(docUrl, 'utf8');
// The rows are measured at the contract's tree depth, so every circuit excerpt in the
// document must show that depth too: after F5 deepened the trees, two excerpts kept 20.
const depthsOf = (s) => [...s.matchAll(/(?:merkleTreePathRoot|MerkleTreePath|HistoricMerkleTree)<(\d+),/g)]
  .map((m) => Number(m[1]));
const built = [...new Set(depthsOf(readFileSync(new URL('../contracts/v2/lantern2.compact', import.meta.url), 'utf8')))];
if (built.length !== 1) problems.push(`lantern2.compact uses tree depths ${built.join(', ')}; expected one`);
for (const d of depthsOf(whole)) {
  if (d !== built[0]) problems.push(`docs/v2.md shows a tree of depth ${d}; lantern2.compact's is ${built[0]}`);
}
// Only §8: other tables in the document name the same circuits.
const at = whole.indexOf('\n## 8. Cost');
const end = whole.indexOf('\n## 9.', at);
if (at < 0 || end < 0) { console.error('check-cost-v2: docs/v2.md has no §8 Cost section'); process.exit(1); }
let doc = whole.slice(at, end);
const fmt = (r) => `${r.rows.toLocaleString('en')} (${r.k})`;
const share = (r) => `${Math.round((100 * r.rows) / 2 ** r.k)}%`;
const lineRe = (name) => new RegExp(`^(\\| \`${name}\` \\| [^|]+ \\| )([^|]+)( \\| )([^|]+)( \\|)$`, 'm');
const stale = [];
for (const r of rows) {
  const m = doc.match(lineRe(r.name));
  if (!m) { problems.push(`docs/v2.md §8 has no row for ${r.name}`); continue; }
  if (m[2].trim() !== fmt(r) || m[4].trim() !== share(r)) {
    stale.push(`${r.name}: doc says ${m[2].trim()}, measured ${fmt(r)}`);
    doc = doc.replace(lineRe(r.name), `$1${fmt(r)}$3${share(r)}$5`);
  }
}
// docs/v2.md §14.1: | `name` | k | rows | share |, the built contract's own table.
const at14 = whole.indexOf('\n### 14.1 ');
const end14 = whole.indexOf('\n### 14.2 ', at14);
if (at14 < 0 || end14 < 0) { console.error('check-cost-v2: docs/v2.md has no §14.1 table'); process.exit(1); }
let doc14 = whole.slice(at14, end14);
const lineRe14 = (name) => new RegExp(`^(\\| \`${name}\` \\| )([^|]+)( \\| )([^|]+)( \\| )([^|]+)( \\|)$`, 'm');
const stale14 = [];
for (const r of rows) {
  const m = doc14.match(lineRe14(r.name));
  if (!m) { problems.push(`docs/v2.md §14.1 has no row for ${r.name}`); continue; }
  const rowsFmt = r.rows.toLocaleString('en');
  if (m[2].trim() !== String(r.k) || m[4].trim() !== rowsFmt || m[6].trim() !== share(r)) {
    stale14.push(`${r.name}: doc says k=${m[2].trim()} ${m[4].trim()} rows, measured k=${r.k} ${rowsFmt}`);
    doc14 = doc14.replace(lineRe14(r.name), `$1${r.k}$3${rowsFmt}$5${share(r)}$7`);
  }
}
if ((stale.length || stale14.length) && process.argv.includes('--write-doc')) {
  writeFileSync(docUrl, whole.slice(0, at) + doc + whole.slice(end, at14) + doc14 + whole.slice(end14));
  console.log(`check-cost-v2: docs/v2.md rewritten (§8: ${stale.length} row(s), §14.1: ${stale14.length} row(s))`);
} else {
  for (const s of stale) problems.push(`docs/v2.md §8 is stale: ${s}. Run: node scripts/check-cost-v2.mjs --write-doc`);
  for (const s of stale14) problems.push(`docs/v2.md §14.1 is stale: ${s}. Run: node scripts/check-cost-v2.mjs --write-doc`);
}
if (problems.length) {
  for (const p of problems) console.error(`check-cost-v2: ${p}`);
  process.exit(1);
}

const tight = rows.reduce((a, b) => (b.rows / 2 ** b.k > a.rows / 2 ** a.k ? b : a));
console.log(`check-cost-v2: all ${rows.length} v2 circuits at k <= ${MAX_K}, matching docs/v2.md §8 and §14.1; `
  + `tightest ${tight.name}, ${tight.rows} of ${2 ** tight.k} rows`);
