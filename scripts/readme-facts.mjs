#!/usr/bin/env node
// The README states measured numbers. Each one lives in a generated block, rebuilt here from
// the file that holds it, so the prose can never drift from the evidence.
//
//   node scripts/readme-facts.mjs          check: exit 1 if any block differs (npm run readme:check)
//   node scripts/readme-facts.mjs --write  rewrite the blocks
//
// The circuit-size table (<!-- facts:circuits -->) needs the Compact toolchain, so
// scripts/check-cost.mjs maintains and checks that one.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(`deployments/${f}`, root), 'utf8'));
const full = load('local-devnet.json');
const quick = load('local-devnet-quick.json');
const bench = load('bench-shipped-finalize.json');

const HOST = new Set(['attestVote', 'openEpoch', 'openRotation', 'requireCurrentOwnerAttested', 'rotateVote', 'sealEpoch', 'sealRotation']);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const sponsored = (r) => r.steps.filter((s) => s.sponsorship).length;
const s = (x) => `${x} s`;

function chain() {
  const col = (r) => r.summary;
  const rows = [
    ['Recorded', full.recordedAt.slice(0, 10), quick.recordedAt.slice(0, 10)],
    ['Steps: accepted · refused · off chain', ...[full, quick].map((r) => { const x = col(r); return `${x.steps}: ${x.accepted} · ${x.refused} · ${x.steps - x.accepted - x.refused}`; })],
    ['Transactions (including 2 deploys and 2 freezes)', col(full).transactions, col(quick).transactions],
    ['Paid by a sponsor; the device holds no wallet', sponsored(full), sponsored(quick)],
    ['Proof time: min / median / max', `${col(full).proveSeconds.min} / ${col(full).proveSeconds.median} / ${col(full).proveSeconds.max} s`, `${col(quick).proveSeconds.min} / ${col(quick).proveSeconds.median} / ${col(quick).proveSeconds.max} s`],
    ['Call to finalized, median', s(col(full).callToFinalizedSeconds.median), s(col(quick).callToFinalizedSeconds.median)],
    ['Wall-clock time of the story', `${col(full).wallClockMinutes} min`, `${col(quick).wallClockMinutes} min`],
  ];
  const m = full.machine;
  const b = bench.proveSeconds;
  return [
    '| | Full story ([`local-devnet.json`](deployments/local-devnet.json)) | Core recovery ([`local-devnet-quick.json`](deployments/local-devnet-quick.json)) |',
    '|---|---:|---:|',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
    `Machine: ${m.cpuModel} (${m.cpus} cores), Node ${m.node}; ${full.images.map((i) => i.replace('midnightntwrk/', '')).join(', ')}; a single local node, network id \`undeployed\`. The contracts ran as the devnet flavour: line ${full.flavour.line} of \`lantern.compact\` changed, a ${full.flavour.recoveryDelaySeconds}-second timelock in place of ${full.flavour.shipped / 3600} hours.`,
    '',
    `The **shipped** 72-hour \`finalizeRecovery\`, proved without being submitted ([\`bench-shipped-finalize.json\`](deployments/bench-shipped-finalize.json), ${bench.recordedAt.slice(0, 10)}): ${b[0]} s for the first, cold proof, then ${Math.min(...b.slice(1))}–${Math.max(...b.slice(1))} s. The same finalize ${bench.negativeControl.match(/(\d+) h/)[1]} hours after the open is refused locally: "timelock has not elapsed".`,
  ].join('\n');
}

function chainCircuits() {
  const by = new Map();
  for (const r of [full, quick]) {
    for (const st of r.steps) {
      if (!st.tx?.txId) continue;
      const e = by.get(st.circuit) ?? { prove: [], total: [], sponsored: 0 };
      e.prove.push(st.timings.prove); e.total.push(st.timings.total);
      if (st.sponsorship) e.sponsored++;
      by.set(st.circuit, e);
    }
  }
  return [
    '| Contract | Circuit | Transactions | Proof, median | Proof, range | Call to finalized, median |',
    '|---|---|---:|---:|---:|---:|',
    ...[...by].sort(([a], [b]) => (HOST.has(a) - HOST.has(b)) || a.localeCompare(b)).map(([c, e]) =>
      `| ${HOST.has(c) ? 'host' : 'lantern'} | \`${c}\` | ${e.prove.length}${e.sponsored ? ` (${e.sponsored} sponsored)` : ''} | ${s(median(e.prove))} | ${Math.min(...e.prove)}–${Math.max(...e.prove)} s | ${s(median(e.total))} |`),
    '',
    'Both committed runs merged. For an even number of samples the median shown is the upper of the two middle values.',
  ].join('\n');
}

function attack() {
  return execFileSync(process.execPath, ['scripts/enumerate.mjs', '--markdown'], { cwd: new URL('.', root) }).toString().trim();
}

const BLOCKS = { chain, 'chain-circuits': chainCircuits, attack };

const file = new URL('README.md', root);
let readme = readFileSync(file, 'utf8');
const stale = [];
for (const [name, make] of Object.entries(BLOCKS)) {
  const re = new RegExp(`(<!-- facts:${name}:start -->\\n)([\\s\\S]*?)(\\n<!-- facts:${name}:end -->)`);
  const m = readme.match(re);
  if (!m) { stale.push(`${name}: block missing`); continue; }
  const body = make();
  if (m[2] !== body) { stale.push(name); readme = readme.replace(re, `$1${body}$3`); }
}
if (process.argv.includes('--write')) {
  writeFileSync(file, readme);
  console.log(stale.length ? `readme-facts: rewrote ${stale.join(', ')}` : 'readme-facts: already current');
} else if (stale.length) {
  console.error(`readme-facts: README.md is out of date with the evidence: ${stale.join(', ')}. Run: node scripts/readme-facts.mjs --write`);
  process.exit(1);
} else {
  console.log(`readme-facts: all ${Object.keys(BLOCKS).length} generated blocks match their sources`);
}
