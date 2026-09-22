#!/usr/bin/env node
// Measured cost of every circuit that ran on the local chain, as a markdown table for the
// README: proving time and time to finalization, per circuit, from the committed records.
import { existsSync, readFileSync } from 'node:fs';
import { recordPath } from './record.mjs';

const records = [{}, { quick: true }].map(recordPath).filter(existsSync).map((f) => JSON.parse(readFileSync(f, 'utf8')));
if (!records.length) { console.error('no devnet record yet: npm run devnet'); process.exit(1); }

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const by = new Map();
for (const r of records) {
  for (const s of r.steps) {
    if (!s.tx?.txId || !s.timings) continue;
    const e = by.get(s.circuit) ?? { prove: [], total: [], cold: 0, sponsored: 0 };
    e.prove.push(s.timings.prove); e.total.push(s.timings.total);
    if (s.timings.cold) e.cold++;
    if (s.sponsorship) e.sponsored++;
    by.set(s.circuit, e);
  }
}
const m = records[0].machine;
console.log(`Measured on ${m.cpuModel ?? m.platform} (${m.cpus} cores), Node ${m.node}, proof-server 8.1.0, local single-node chain.\n`);
console.log('| circuit | transactions | proof (median) | proof (range) | call → finalized (median) |');
console.log('|---|---:|---:|---:|---:|');
for (const [c, e] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`| \`${c}\` | ${e.prove.length}${e.sponsored ? ` (${e.sponsored} sponsored)` : ''} | ${median(e.prove)} s | ${Math.min(...e.prove)}–${Math.max(...e.prove)} s | ${median(e.total)} s |`);
}
