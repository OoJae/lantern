#!/usr/bin/env node
// Records Preprod's public indexer, once, for web/e2e/live.spec.js: the answers /live gets, so its
// tests run the page's real code against real data, with no network. Run from web/:
//
//   node e2e/fixtures/record.mjs          # writes e2e/fixtures/indexer.json
//
// It asks exactly what the page asks (the documents come from src/lib/indexer.js):
//  - each recorded contract's latest action and state (LanternState; LanternLatest is the same
//    answer without the state, so the fixture server derives it; so is LanternStateAt, the state in
//    one block, from the states recorded here with their blocks);
//  - every transaction both records name, by identifier (LanternTx);
//  - each contract's actions from its deploy, over the WebSocket (LanternActions);
//  - and two earlier states of the whole story's Lantern (after one approval, then two), so a test
//    can show the watch noticing an approval land.
// Re-record after the shipped recovery finalizes to test the finalized page against real data.
import { readFileSync, writeFileSync } from 'node:fs';
import { DOCUMENTS, INDEXER, INDEXER_WS } from '../../src/lib/indexer.js';

const root = new URL('../../../', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(`deployments/${f}`, root), 'utf8'));
const shipped = read('preprod-shipped.json');
const story = read('preprod.json');

async function q(query, variables) {
  const res = await fetch(INDEXER, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data;
}

const contracts = [
  { address: shipped.contract.address, from: shipped.contract.blockHeight },
  { address: story.contracts.lantern.address, from: story.contracts.lantern.blockHeight },
  { address: story.contracts.host.address, from: story.contracts.host.blockHeight },
];
const txIds = [
  shipped.contract.txId, shipped.contract.maintenanceAuthority.frozenBy.txId,
  ...shipped.steps.filter((s) => s.tx?.txId).map((s) => s.tx.txId),
  story.contracts.lantern.txId, story.contracts.lantern.maintenanceAuthority.frozenBy.txId,
  story.contracts.host.txId, story.contracts.host.maintenanceAuthority.frozenBy.txId,
  ...story.steps.filter((s) => s.tx?.txId).map((s) => s.tx.txId),
];

const out = { recordedAt: new Date().toISOString(), note: 'Recorded from https://indexer.preprod.midnight.network by e2e/fixtures/record.mjs', state: {}, tx: {}, actions: {}, earlier: {} };

for (const c of contracts) out.state[c.address] = await q(DOCUMENTS.STATE, { address: c.address });
for (const id of txIds) out.tx[id] = await q(DOCUMENTS.TX_BY_ID, { offset: { identifier: id } });

// Earlier states of the whole story's Lantern: the block of each approval of Hana's recovery.
const AT = DOCUMENTS.STATE_AT;
const approvals = story.steps.filter((s) => s.circuit === 'approveRecovery' && s.tx && ['4.1', '4.2'].includes(s.id));
for (const s of approvals) {
  out.earlier[s.id] = await q(AT, { address: story.contracts.lantern.address, offset: { blockOffset: { height: s.tx.blockHeight } } });
}

// Each contract's actions from its deploy, as the subscription sends them.
await new Promise((resolve, reject) => {
  const ws = new WebSocket(INDEXER_WS, 'graphql-transport-ws');
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
      (out.actions[c.address] ??= []).push(a);
      if (a.transaction.hash === until[c.address]) done.add(c.address);
      if (done.size === contracts.length) { clearTimeout(timer); ws.close(); resolve(); }
    }
  };
});

writeFileSync(new URL('indexer.json', import.meta.url), `${JSON.stringify(out)}\n`);
console.log(`recorded ${Object.keys(out.state).length} states, ${Object.keys(out.tx).length} transactions, ${Object.values(out.actions).flat().length} actions, ${Object.keys(out.earlier).length} earlier states`);
