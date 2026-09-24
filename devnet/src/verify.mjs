#!/usr/bin/env node
// npm run devnet:verify [-- --quick]
//
// Re-checks the local chain against a devnet record, independently of the run that wrote
// it: each contract exists and its maintenance authority is frozen; every on-chain verifier
// key equals a fresh compile; Lantern's flavour differs from the shipped build in
// finalizeRecovery alone; every sponsored transaction came from a device with no wallet;
// every recorded transaction is on the chain at its recorded block; and both ledgers end
// where the record says.
//
// The chain is local and one-shot: this checks the chain that produced the record, so run it
// before `npm run devnet:down`.
import './ws.mjs'; // before anything that loads the wallet SDK: see ws.mjs
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { network } from './config.mjs';
import { recordPath } from './record.mjs';
import { loadBindings, LANTERN_ZK, HOST_ZK, SHIPPED_ZK } from './bindings.mjs';
import { publicRecord, hostRecord } from '../../src/demo/story.mjs';

const color = process.stdout.isTTY;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? c('32;1', '✓') : c('31;1', '✗')} ${name}${detail ? c('2', `  ${detail}`) : ''}`);
};
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const keyFile = (dir, op) => path.join(dir, 'keys', `${op}.verifier`);

const RECORD_PATH = recordPath({ quick: process.argv.includes('--quick'), selfPay: process.argv.includes('--self-pay') });
if (!existsSync(RECORD_PATH)) { console.error(`devnet:verify: no record at ${RECORD_PATH}; run npm run devnet first`); process.exit(1); }
const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'));
const { Lantern, Host } = await loadBindings();
const pdp = indexerPublicDataProvider(network.indexer, network.indexerWS);

console.log();
console.log(`  verifying ${path.relative(process.cwd(), RECORD_PATH)} (${record.mode}, recorded ${record.recordedAt})`);
console.log();
check('every recorded step went as the story expected', record.steps.every((s) => s.ok), `${record.steps.length} steps`);

const SPEC = {
  lantern: { zk: LANTERN_ZK, circuits: 10, mod: Lantern, summary: publicRecord, final: record.finalPublicRecord },
  host: { zk: HOST_ZK, circuits: 7, mod: Host, summary: hostRecord, final: record.finalHostRecord },
};
for (const [key, meta] of Object.entries(record.contracts)) {
  const spec = SPEC[key];
  const state = await pdp.queryContractState(meta.address);
  check(`${meta.name}: exists on this chain`, Boolean(state), meta.address);
  if (!state) continue;
  const ma = state.maintenanceAuthority;
  check(`${meta.name}: maintenance authority frozen, so its rules can never change`, ma.committee.length === 0 && ma.threshold >= 1,
    `committee ${ma.committee.length}, threshold ${ma.threshold}`);
  const ops = state.operations().map(String).sort();
  const matching = ops.filter((op) => existsSync(keyFile(spec.zk, op)) && same(state.operation(op).verifierKey, readFileSync(keyFile(spec.zk, op))));
  check(`${meta.name}: every on-chain verifier key is byte-identical to a fresh compile`, matching.length === ops.length && ops.length === spec.circuits,
    `${matching.length} of ${ops.length} circuits`);
  if (key === 'lantern') {
    const differs = ops.filter((op) => !same(readFileSync(keyFile(LANTERN_ZK, op)), readFileSync(keyFile(SHIPPED_ZK, op))));
    check(`${meta.name}: the flavour differs from the shipped build in finalizeRecovery alone`, differs.join() === 'finalizeRecovery',
      `differs: ${differs.join(', ') || 'none'}`);
  }
  if (spec.final) {
    const now = spec.summary(spec.mod.ledger(state.data));
    check(`${meta.name}: the ledger ends where the record says`, JSON.stringify(now) === JSON.stringify(spec.final),
      Object.entries(now).map(([k, v]) => `${k} ${v}`).join(', '));
  }
}

if (record.mode.includes('sponsored')) {
  const sp = record.steps.filter((s) => s.sponsorship);
  check('every sponsored transaction came from a device with no wallet, and only the sponsor spent DUST',
    sp.length > 0 && sp.every((s) => s.sponsorship.deviceWallet === 'none' && s.sponsorship.userIntentDustSpends === 0 && s.sponsorship.sponsorDustSpends >= 1),
    `${sp.length} sponsored`);
}

let found = 0;
const txs = [...Object.values(record.contracts).flatMap((m) => [m, m.maintenanceAuthority.frozenBy]),
  ...record.steps.map((s) => s.tx).filter((t) => t?.txId)];
for (const tx of txs) {
  try {
    const d = await withTimeout(pdp.watchForTxData(tx.txId), 20_000);
    if (d.blockHeight === tx.blockHeight && d.status === 'SucceedEntirely') found++;
  } catch { /* counted as missing */ }
}
check('every recorded transaction is on the chain, at its recorded block', found === txs.length, `${found} of ${txs.length}`);

console.log();
const ok = results.every(Boolean);
console.log(ok ? c('32;1', '  The record matches the chain.') : c('31;1', '  The record does NOT match the chain.'));
process.exit(ok ? 0 : 1);
