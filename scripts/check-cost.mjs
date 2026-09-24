#!/usr/bin/env node
// Fails unless every proving circuit of both shipped contracts is at k <= 14, and fails
// just as loudly if it cannot tell: exactly 17 rows must parse, each with a numeric k.
// A check that passes when it measured nothing would be worse than no check.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const EXPECTED = [
  'addGuardian', 'approveRecovery', 'enrollIdentity', 'finalizeRecovery', 'hostGatedAction', 'openRecovery',
  'proveHeadOwnership', 'proveSuccession', 'rotateGuardianSet', 'vetoRecovery',
  'attestVote', 'openEpoch', 'openRotation', 'requireCurrentOwnerAttested', 'rotateVote', 'sealEpoch', 'sealRotation',
];
const MAX_K = 14;

const run = spawnSync('bash', ['scripts/cost.sh'], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(run.stderr || run.stdout);
  console.error(`check-cost: scripts/cost.sh failed (exit ${run.status})`);
  process.exit(1);
}
process.stdout.write(run.stdout);

const rows = run.stdout.split('\n')
  .map((l) => l.match(/^\|\s*`([A-Za-z]+)`\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/))
  .filter(Boolean)
  .map(([, name, k, rows]) => ({ name, k: Number(k), rows: Number(rows) }));

const names = rows.map((r) => r.name).sort();
const problems = [];
if (JSON.stringify(names) !== JSON.stringify([...EXPECTED].sort())) {
  problems.push(`expected exactly these ${EXPECTED.length} circuits, parsed ${rows.length}: ${names.join(', ')}`);
}
for (const r of rows) if (!(r.k >= 1 && r.k <= MAX_K)) problems.push(`${r.name}: k=${r.k} exceeds ${MAX_K}`);
if (problems.length) {
  for (const p of problems) console.error(`check-cost: ${p}`);
  process.exit(1);
}
// The README's circuit table (<!-- facts:circuits -->) is generated from this measurement:
// --write-readme rewrites it; otherwise it must match exactly.
const HOST = new Set(EXPECTED.slice(10));
const block = [
  '| Contract | Circuit | k | Rows | Share of 2^k |',
  '|---|---|---:|---:|---:|',
  ...[...rows].sort((a, b) => (HOST.has(a.name) - HOST.has(b.name)) || a.name.localeCompare(b.name))
    .map((r) => `| ${HOST.has(r.name) ? 'host' : 'lantern'} | \`${r.name}\` | ${r.k} | ${r.rows.toLocaleString('en')} | ${Math.round((100 * r.rows) / 2 ** r.k)}% |`),
].join('\n');
const readmeUrl = new URL('../README.md', import.meta.url);
let readme = '';
try { readme = readFileSync(readmeUrl, 'utf8'); } catch { /* no README yet */ }
const re = /(<!-- facts:circuits:start -->\n)([\s\S]*?)(\n<!-- facts:circuits:end -->)/;
const found = readme.match(re);
if (found && process.argv.includes('--write-readme')) {
  writeFileSync(readmeUrl, readme.replace(re, `$1${block}$3`));
  console.log('check-cost: README circuit table rewritten');
} else if (found && found[2] !== block) {
  console.error('check-cost: the README circuit table differs from this measurement. Run: node scripts/check-cost.mjs --write-readme');
  process.exit(1);
}

const tight = rows.reduce((a, b) => (b.rows > a.rows ? b : a));
console.log(`check-cost: all ${rows.length} circuits at k <= ${MAX_K}; tightest ${tight.name}, ${tight.rows} of ${2 ** tight.k} rows`);
