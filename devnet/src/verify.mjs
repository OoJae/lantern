#!/usr/bin/env node
// npm run devnet:verify
//
// Re-checks the local chain against deployments/local-devnet.json, independently of the run
// that wrote it: the contract exists, its maintenance authority is frozen, its verifier keys
// are exactly a fresh compile's, every circuit but finalizeRecovery is identical to the
// shipped build, every recorded transaction is on the chain at its recorded block, and the
// ledger ends where the record says.
//
// The chain is local and one-shot: this checks the chain that produced the record, so run it
// before `npm run devnet:down`.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { network } from './config.mjs';
import { recordPath } from './record.mjs';
import { loadBindings, LANTERN_ZK, SHIPPED_ZK } from './bindings.mjs';
import { publicRecord } from '../../src/demo/story.mjs';

const color = process.stdout.isTTY;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? c('32;1', '✓') : c('31;1', '✗')} ${name}${detail ? c('2', `  ${detail}`) : ''}`);
};
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const RECORD_PATH = recordPath({ quick: process.argv.includes('--quick'), selfPay: process.argv.includes('--self-pay') });
if (!existsSync(RECORD_PATH)) { console.error(`devnet:verify: no record at ${RECORD_PATH}; run npm run devnet first`); process.exit(1); }
const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'));
const { Lantern } = await loadBindings();
const pdp = indexerPublicDataProvider(network.indexer, network.indexerWS);
const address = record.contract.address;

console.log();
console.log(`  verifying ${path.relative(process.cwd(), RECORD_PATH)} (${record.mode}, recorded ${record.recordedAt})`);
console.log(`  against the local chain, contract ${address}`);
console.log();

check('every recorded step went as the story expected', record.steps.every((s) => s.ok), `${record.steps.length} steps`);

const state = await pdp.queryContractState(address);
check('the contract exists on this chain', Boolean(state));
if (!state) process.exit(1);

const ma = state.maintenanceAuthority;
check('its maintenance authority is frozen: no signature can change it', ma.committee.length === 0 && ma.threshold >= 1,
  `committee ${ma.committee.length}, threshold ${ma.threshold}`);

const ops = state.operations().map(String).sort();
const keyFile = (dir, op) => path.join(dir, 'keys', `${op}.verifier`);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
let onChainMatches = 0, flavourDiffers = [];
for (const op of ops) {
  const onChain = state.operation(op).verifierKey;
  if (existsSync(keyFile(LANTERN_ZK, op)) && same(onChain, readFileSync(keyFile(LANTERN_ZK, op)))) onChainMatches++;
  if (!same(readFileSync(keyFile(LANTERN_ZK, op)), readFileSync(keyFile(SHIPPED_ZK, op)))) flavourDiffers.push(op);
}
check('every on-chain verifier key is byte-identical to a fresh compile of the flavour', onChainMatches === ops.length && ops.length === 10,
  `${onChainMatches} of ${ops.length} circuits`);
check('the flavour differs from the shipped build in finalizeRecovery alone', flavourDiffers.join() === 'finalizeRecovery',
  `differs: ${flavourDiffers.join(', ') || 'none'}`);

if (record.mode.includes('sponsored')) {
  const sp = record.steps.filter((s) => s.sponsorship);
  check('every sponsored transaction came from a device with no wallet, and only the sponsor spent DUST',
    sp.length > 0 && sp.every((s) => s.sponsorship.deviceWallet === 'none' && s.sponsorship.userIntentDustSpends === 0 && s.sponsorship.sponsorDustSpends >= 1),
    `${sp.length} sponsored`);
}

let found = 0;
const txs = [record.contract, record.contract.maintenanceAuthority.frozenBy, ...record.steps.map((s) => s.tx).filter((t) => t?.txId)];
for (const tx of txs) {
  try {
    const d = await withTimeout(pdp.watchForTxData(tx.txId), 20_000);
    if (d.blockHeight === tx.blockHeight && d.status === 'SucceedEntirely') found++;
  } catch { /* counted as missing */ }
}
check('every recorded transaction is on the chain, at its recorded block', found === txs.length, `${found} of ${txs.length}`);

const now = publicRecord(Lantern.ledger(state.data));
check('the ledger ends where the record says', JSON.stringify(now) === JSON.stringify(record.finalPublicRecord),
  Object.entries(now).map(([k, v]) => `${k} ${v}`).join(', '));

console.log();
const ok = results.every(Boolean);
console.log(ok ? c('32;1', '  The record matches the chain.') : c('31;1', '  The record does NOT match the chain.'));
process.exit(ok ? 0 : 1);
