#!/usr/bin/env node
// Records Preprod's public indexer, once, for web/e2e/live.spec.js: the answers /live gets, so its
// tests run the page's real code against real data, with no network. Run from web/:
//
//   node e2e/fixtures/record.mjs          # writes e2e/fixtures/indexer.json
//   OUT=<file> node e2e/fixtures/record.mjs   # writes it elsewhere (to compare with the committed one)
//
// The fixture is the chain AS THE RECORDS END, not as it is when this runs. All four contracts take
// calls from anyone (enrollIdentity and openRecovery need no owner secret), so a call someone else
// makes after the records must not become the fixture's "latest": live.spec would then find the
// story's counts missing from the block of its last call and its own transactions no longer the last.
// So each contract's state is the one in the block of the record's last transaction on it, and its
// action stream stops at that transaction; any later call is left out and reported. The tests that
// need a later call make one up (live.spec's over.states and over.actions).
//
// It asks exactly what the page asks (the documents come from src/lib/indexer.js):
//  - each recorded contract's action and state in the block of the record's last transaction on it
//    (LanternStateAt), served as its latest (LanternState; LanternLatest is the same answer without
//    the state, so the fixture server derives it; so is LanternStateAt, the state in one block, from
//    the states recorded here with their blocks);
//  - every transaction the three records name, by identifier (LanternTx): Lantern v2's key insert too;
//  - each contract's actions from its deploy, over the WebSocket (LanternActions);
//  - and two earlier states of the whole story's Lantern (after one approval, then two), so a test
//    can show the watch noticing an approval land.
// Re-record after the shipped recovery finalizes to test the finalized page against real data.
// live.spec.js counts every recorded transaction from the records themselves and branches on
// preprod-shipped.json's `finalize`, so a finalized record needs no edit there, only this fixture.
// Once `node devnet/src/shipped.mjs finalize` has written the finalize into the record, in this order,
// before any push (a record newer than this fixture fails live.spec's first "pure parts" check):
//   1. node e2e/fixtures/record.mjs               (from web/: this fixture, with the finalize)
//   2. node scripts/readme-facts.mjs --write      (from the root: the README's Preprod facts)
//   3. npm run web:build && npm run web:e2e       (from the root)
//   4. only then commit the record, this fixture and the README together.
import { readFileSync, writeFileSync } from 'node:fs';
import { DOCUMENTS, INDEXER, INDEXER_WS } from '../../src/lib/indexer.js';

const root = new URL('../../../', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(`deployments/${f}`, root), 'utf8'));
const shipped = read('preprod-shipped.json');
const story = read('preprod.json');
const v2 = read('preprod-v2.json');
const v2c = v2.contracts.lantern2;

async function q(query, variables) {
  const res = await fetch(INDEXER, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data;
}

// Each contract's deploy, the update that froze its rules, and every call the records hold on it:
// `last` is the block of the latest of them, whatever order the record lists them in.
const txsOf = (deploy, calls) => [deploy, deploy.maintenanceAuthority?.frozenBy, ...calls].filter((t) => t?.blockHeight);
const shippedTxs = txsOf(shipped.contract, [...shipped.steps.map((s) => s.tx), shipped.finalize?.tx]);
const storyTxs = txsOf(story.contracts.lantern, story.steps.filter((s) => s.contract !== 'host').map((s) => s.tx));
const hostTxs = txsOf(story.contracts.host, story.steps.filter((s) => s.contract === 'host').map((s) => s.tx));
// Lantern v2: its deploy, the updates that inserted the keys its deploy could not carry, the freeze, each call.
const v2Txs = txsOf(v2c, [...(v2c.verifierKeysInsertedBy ?? []), ...v2.steps.map((s) => s.tx)]);
const lastOf = (txs) => Math.max(...txs.map((t) => t.blockHeight));
const contracts = [
  { address: shipped.contract.address, from: shipped.contract.blockHeight, last: lastOf(shippedTxs), hashes: new Set(shippedTxs.map((t) => t.txHash)) },
  { address: story.contracts.lantern.address, from: story.contracts.lantern.blockHeight, last: lastOf(storyTxs), hashes: new Set(storyTxs.map((t) => t.txHash)) },
  { address: story.contracts.host.address, from: story.contracts.host.blockHeight, last: lastOf(hostTxs), hashes: new Set(hostTxs.map((t) => t.txHash)) },
  { address: v2c.address, from: v2c.blockHeight, last: lastOf(v2Txs), hashes: new Set(v2Txs.map((t) => t.txHash)) },
];
const txIds = [
  shipped.contract.txId, shipped.contract.maintenanceAuthority.frozenBy.txId,
  ...shipped.steps.filter((s) => s.tx?.txId).map((s) => s.tx.txId),
  story.contracts.lantern.txId, story.contracts.lantern.maintenanceAuthority.frozenBy.txId,
  story.contracts.host.txId, story.contracts.host.maintenanceAuthority.frozenBy.txId,
  ...story.steps.filter((s) => s.tx?.txId).map((s) => s.tx.txId),
  v2c.txId, ...(v2c.verifierKeysInsertedBy ?? []).map((u) => u.txId), v2c.maintenanceAuthority.frozenBy.txId,
  ...v2.steps.filter((s) => s.tx?.txId).map((s) => s.tx.txId),
];

const out = { recordedAt: new Date().toISOString(), note: 'Recorded from https://indexer.preprod.midnight.network by e2e/fixtures/record.mjs', state: {}, tx: {}, actions: {}, earlier: {} };

for (const c of contracts) {
  const at = await q(DOCUMENTS.STATE_AT, { address: c.address, offset: { blockOffset: { height: c.last } } });
  const hash = at.contractAction?.transaction?.hash;
  if (!hash) throw new Error(`the indexer holds no action of ${c.address} in block ${c.last}, the block of the record's last transaction on it`);
  if (!c.hashes.has(hash)) throw new Error(`the action of ${c.address} in block ${c.last} is ${hash}, which the records do not hold`);
  out.state[c.address] = at;
}
for (const id of txIds) out.tx[id] = await q(DOCUMENTS.TX_BY_ID, { offset: { identifier: id } });

// Earlier states of the whole story's Lantern: the block of each approval of Hana's recovery.
const AT = DOCUMENTS.STATE_AT;
const approvals = story.steps.filter((s) => s.circuit === 'approveRecovery' && s.tx && ['4.1', '4.2'].includes(s.id));
for (const s of approvals) {
  out.earlier[s.id] = await q(AT, { address: story.contracts.lantern.address, offset: { blockOffset: { height: s.tx.blockHeight } } });
}

// Each contract's actions from its deploy, as the subscription sends them, up to the records' end.
const later = {};
await new Promise((resolve, reject) => {
  const ws = new WebSocket(INDEXER_WS, 'graphql-transport-ws');
  // Each stream ends at the record's last transaction on its contract, not at the chain's latest.
  const until = Object.fromEntries(contracts.map((c) => [c.address, out.state[c.address].contractAction.transaction.hash]));
  const done = new Set();
  const timer = setTimeout(() => { ws.close(); reject(new Error('the stream did not catch up')); }, 60_000);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init', payload: {} }));
  ws.onerror = () => reject(new Error('the stream failed'));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'connection_ack') {
      contracts.forEach((c, i) => ws.send(JSON.stringify({ id: String(i + 1), type: 'subscribe', payload: { query: DOCUMENTS.ACTIONS_FROM, variables: { address: c.address, offset: { height: c.from } } } })));
    } else if (m.type === 'next') {
      const c = contracts[Number(m.id) - 1];
      const a = m.payload.data.contractActions;
      // after the record's last transaction: a call the records do not hold, left out
      if (done.has(c.address)) { later[c.address] = (later[c.address] ?? 0) + 1; return; }
      (out.actions[c.address] ??= []).push(a);
      if (a.transaction.hash === until[c.address]) done.add(c.address);
      if (done.size === contracts.length) { clearTimeout(timer); ws.close(); resolve(); }
    }
  };
});

writeFileSync(process.env.OUT ?? new URL('indexer.json', import.meta.url), `${JSON.stringify(out)}\n`);
for (const [address, n] of Object.entries(later)) console.log(`not recorded: ${n} call${n === 1 ? '' : 's'} on ${address} made since the records`);
console.log(`recorded ${Object.keys(out.state).length} states, ${Object.keys(out.tx).length} transactions, ${Object.values(out.actions).flat().length} actions, ${Object.keys(out.earlier).length} earlier states`);
