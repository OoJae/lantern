#!/usr/bin/env node
// npm run devnet:verify:v2   (LANTERN_NETWORK=preprod for deployments/preprod-v2.json)
//
// Re-checks a Lantern v2 record against the chain, with no wallet, independently of the run that
// wrote it (v2-run.mjs):
//   - the record is internally consistent (v2-record.mjs problemsOf), and was compiled from the
//     sources committed here (their sha256);
//   - the contract exists, and its maintenance authority is frozen, so its rules can never change;
//   - every on-chain verifier key is byte-identical to a fresh compile of contracts/v2/lantern2.compact
//     (devnet/build/lantern2: npm run devnet:verify:v2 builds it first, with compile.sh's stamp);
//   - every recorded transaction is on the chain, at its recorded block, and carries the recorded
//     action on this contract (the deploy, each key insert and the freeze, and each step's circuit,
//     by the indexer's entry point), so a record cannot name someone else's transactions;
//   - the ledger ends where the record says: its public counts and the story's identity (lock,
//     veto count, card, slot, reservation, recoveries, check-ins), read in the block of the
//     record's last transaction (anyone can call a deployed contract, so its state today may have
//     moved on: that is reported, and is not the record's).
//
// A local record can only be checked while the chain that produced it runs.
import './ws.mjs'; // before anything that loads the wallet SDK: see ws.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { network, isPublic, repoRoot, buildDir } from './config.mjs';
import { loadLantern2, LANTERN2_ZK } from './bindings.mjs';
import { lastBlock, unidentifiedSteps, unrecordedLastStep } from './verify-plan.mjs';
import { v2RecordName, problemsOf, recordedTxs, checkInPeriodOf, V2_CIRCUITS, V2_SOURCES } from './v2-record.mjs';
import { v2Summary, identityState } from './v2-story.mjs';

const color = process.stdout.isTTY;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? c('32;1', '✓') : c('31;1', '✗')} ${name}${detail ? c('2', `  ${detail}`) : ''}`);
};
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const keyFile = (op) => path.join(LANTERN2_ZK, 'keys', `${op}.verifier`);
const sha256 = (file) => createHash('sha256').update(readFileSync(path.join(repoRoot, file))).digest('hex');
const counts = (s) => Object.entries(s).map(([k, v]) => `${k} ${v}`).join(', ');

/** A transaction, found by one of its identifiers, as the indexer's GraphQL API shows it: its hash, block and contract actions. */
const TX_FIELDS = 'hash block { height } contractActions { __typename address ... on ContractCall { entryPoint } }';
const txOnChain = async (txId) => {
  const res = await fetch(network.indexer, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ query: `query ($o: TransactionOffset!) { transactions(offset: $o) { ${TX_FIELDS} } }`, variables: { o: { identifier: txId } } }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(`indexer: ${body.errors.map((e) => e.message).join('; ')}`);
  return body.data.transactions?.[0] ?? null;
};

const RECORD_PATH = path.join(repoRoot, 'deployments', v2RecordName({ networkId: network.networkId, isPublic }));
if (!existsSync(RECORD_PATH)) { console.error(`devnet:verify:v2: no record at ${RECORD_PATH}; run npm run devnet:v2 first`); process.exit(1); }
// Run on its own before `bash devnet/compile.sh --v2`, there is no fresh compile to compare the
// chain with: say so in one line, not as a stack trace. The stamp is written only once the build succeeds.
const built = existsSync(path.join(buildDir, '.stamp-v2'))
  && existsSync(path.join(LANTERN2_ZK, 'contract', 'index.js')) && existsSync(path.join(LANTERN2_ZK, 'keys'));
if (!built) { console.error("devnet:verify:v2: devnet/build/lantern2 is missing or incomplete; run 'bash devnet/compile.sh --v2' first (npm run devnet:verify:v2 does)"); process.exit(1); }
const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'));
const Lantern2 = await loadLantern2();
const pdp = indexerPublicDataProvider(network.indexer, network.indexerWS);
const meta = record.contracts.lantern2;

console.log();
console.log(`  verifying ${path.relative(process.cwd(), RECORD_PATH)} (Lantern v2, recorded ${record.recordedAt}, ${record.network})`);
console.log();
const problems = problemsOf(record);
check('the record is consistent: every step went as the story expected, and its summary recomputes', problems.length === 0,
  problems.length ? problems.join('; ') : `${record.steps.length} steps, ${record.summary.accepted} accepted, ${record.summary.refused} refused`);
const changed = V2_SOURCES.filter((f) => record.source.sha256[f] !== sha256(f));
check('it was compiled from the sources committed here', changed.length === 0,
  changed.length ? `changed since: ${changed.join(', ')}` : V2_SOURCES.join(', '));

const state = await pdp.queryContractState(meta.address);
check(`${meta.name}: exists on this chain`, Boolean(state), meta.address);
if (state) {
  const ma = state.maintenanceAuthority;
  check(`${meta.name}: maintenance authority frozen, so its rules can never change`, ma.committee.length === 0 && ma.threshold >= 1,
    `committee ${ma.committee.length}, threshold ${ma.threshold}`);
  const ops = state.operations().map(String).sort();
  const matching = ops.filter((op) => existsSync(keyFile(op)) && same(state.operation(op).verifierKey, readFileSync(keyFile(op))));
  check(`${meta.name}: every on-chain verifier key is byte-identical to a fresh compile of contracts/v2/lantern2.compact`,
    matching.length === ops.length && same(ops, [...V2_CIRCUITS].sort()), `${matching.length} of ${ops.length} circuits (v2 has ${V2_CIRCUITS.length})`);

  // The indexer answers a block only when this contract has an action in exactly that block (null
  // otherwise), with the state after it: so the read is at the record's last transaction on it.
  const at = lastBlock(record, 'lantern2', meta);
  const blind = unrecordedLastStep(record, 'lantern2');
  const then = blind ? state : await pdp.queryContractState(meta.address, { type: 'blockHeight', blockHeight: at });
  const L = then ? Lantern2.ledger(then.data) : null;
  const was = L ? v2Summary(L) : null;
  const where = blind ? `step ${blind.id}'s block was not recorded, so compared with today's state` : `in block ${at}`;
  check(`${meta.name}: the ledger ends where the record says`, JSON.stringify(was) === JSON.stringify(record.finalPublicRecord),
    was ? `${counts(was)}; ${where}` : `no state in block ${at}`);
  const id = record.finalIdentity;
  const idNow = L && id ? identityState(L, Lantern2.pureCircuits, Buffer.from(id.idCommit, 'hex'), checkInPeriodOf(record.steps)) : null;
  check('the story\'s identity ends where the record says: its lock, veto count, card, slot, reservation, recoveries and check-ins',
    Boolean(idNow) && JSON.stringify(idNow) === JSON.stringify(id),
    idNow ? `locked ${idNow.locked}, ${idNow.vetoCount} veto, ${idNow.recoveries.length} recoveries, current recovery ${idNow.liveRecovery?.slice(0, 12)}…, ${idNow.checkIns.count} check-in in period ${idNow.checkIns.period}` : 'not readable');
  const now = v2Summary(Lantern2.ledger(state.data));
  if (!blind && was && JSON.stringify(now) !== JSON.stringify(was)) console.log(c('2', `    called since the record: now ${counts(now)}`));
}

const txs = recordedTxs(record);
let found = 0;
for (const tx of txs) {
  try {
    const d = await withTimeout(pdp.watchForTxData(tx.txId), 30_000);
    if (d.blockHeight === tx.blockHeight && d.status === 'SucceedEntirely') found++;
  } catch { /* counted as missing */ }
}
const unidentified = unidentifiedSteps(record);
check('every recorded transaction is on the chain, at its recorded block', found === txs.length,
  `${found} of ${txs.length}${unidentified.length ? `; step ${unidentified.map((s) => s.id).join(', ')} recorded without a transaction id (finalization timed out), so not looked up` : ''}`);
const actions = [
  { tx: meta, action: 'ContractDeploy' },
  ...(meta.verifierKeysInsertedBy ?? []).map((u) => ({ tx: u, action: 'ContractUpdate' })),
  { tx: meta.maintenanceAuthority.frozenBy, action: 'ContractUpdate' },
  ...record.steps.filter((s) => s.tx?.txId).map((s) => ({ tx: s.tx, action: 'ContractCall', circuit: s.circuit })),
];
let carries = 0;
for (const a of actions) {
  const t = await txOnChain(a.tx.txId).catch(() => null);
  if (t?.hash === a.tx.txHash && t.contractActions.some((x) => x.address === meta.address && x.__typename === a.action && (!a.circuit || x.entryPoint === a.circuit))) carries++;
}
check('each carries the recorded action on this contract: the deploy, each key insert, the freeze, and each step\'s circuit, by the indexer\'s entry point',
  carries === actions.length, `${carries} of ${actions.length}`);

console.log();
const ok = results.every(Boolean);
console.log(ok ? c('32;1', '  The record matches the chain.') : c('31;1', '  The record does NOT match the chain.'));
process.exit(ok ? 0 : 1);
