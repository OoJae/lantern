#!/usr/bin/env node
// LANTERN_NETWORK=preprod node devnet/src/shipped.mjs open | finalize [--operator-pays] | status | verify
//
// The SHIPPED Lantern contract -- the real 72-hour timelock, not the devnet flavour's 60 s -- on
// Midnight's public test network. A recovery cannot be 72 hours old inside one laptop session,
// so this runs in two sittings:
//
//   open      deploy the shipped build and freeze its maintenance authority; Hana enrols with
//             three guardians; Seo-yeon opens a recovery for Hana's new phone; Seo-yeon and Mum
//             approve; and a finalize attempted at once is refused: "timelock has not elapsed"
//   finalize  no earlier than 72 hours after the later bound recorded at the open: a tampered
//             share is refused, then the phone, which holds no wallet, rebuilds the secret from
//             the two shares and finalizes, and a sponsor pays its fee. If the chain already
//             shows the recovery finalized, it runs nothing and rebuilds the record instead
//   status    anyone: where the recovery stands, from the committed record and the public chain
//   verify    anyone, with no wallet: re-check the committed record against the public chain
//
// What the second sitting needs from the first -- the phone's key and the two shares the
// guardians sent it -- is kept in devnet/.state (gitignored, owner-only), written before the
// first transaction and extended as the open goes: test data of a fictional person, on a test
// network. Only finalize reads it. The public evidence is deployments/preprod-shipped.json.
import './ws.mjs'; // before anything that loads the wallet SDK: see ws.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { network, isPublic, repoRoot, stateDir } from './config.mjs';
import { SHIPPED_ZK } from './bindings.mjs';
import { providersFor, compiledContract, inMemoryPrivateStateProvider } from './providers.mjs';
import { startWallet, readyToPay, saveSnapshot } from './wallet.mjs';
import { loadSeeds, snapshotOf } from './wallets.mjs';
import { freezeMaintenanceAuthority, txOf } from './freeze.mjs';
import { tipTime, waitForChainTime } from './chain.mjs';
import { createSponsor } from './sponsor.mjs';
import { walletlessDevice } from './device.mjs';
import { lanternWitnesses } from '../../src/witnesses.js';
import { newIdentity, commitmentsOf, dealShares, recoverFromShares, idSaltOf, vetoSaltOf } from '../../src/identity.js';
import { duration } from '../../src/demo/story.mjs';

if (!isPublic) throw new Error('shipped.mjs runs on a public network: set LANTERN_NETWORK=preprod');
const mode = process.argv[2];
if (!['open', 'finalize', 'status', 'verify'].includes(mode)) throw new Error('usage: shipped.mjs open | finalize [--operator-pays] | status | verify');

const STATE = path.join(stateDir, `${network.networkId}-shipped.json`);
const RECORD = path.join(repoRoot, 'deployments', `${network.networkId}-shipped.json`);
const ACTOR = 'actor';
const CALL_TIMEOUT_MS = 600_000;
const PHONE = 'Hana\'s new phone';
const TAMPERED_REFUSAL = 'reconstructed secret does not open idCommit';
const WHAT_OPEN = 'The SHIPPED Lantern contract, with its real 72-hour timelock, on Midnight\'s public test network: a recovery opened, approved, and refused while locked. finalize stays null until the lock ends and the recovery finalizes.';
const WHAT_FINALIZED = 'The SHIPPED Lantern contract, with its real 72-hour timelock, on Midnight\'s public test network: a recovery opened, approved, refused while locked, and finalized once 72 hours had passed.';
const LEDGER_AFTER = 'the old commitment is in retiredIdentities and the successor is enrolled under the same identity root';

const hex = (u) => Buffer.from(u).toString('hex');
const bytes = (h) => new Uint8Array(Buffer.from(h, 'hex'));
const iso = (s) => new Date(Number(s) * 1000).toISOString();
const secs = (ms) => Math.round(ms / 100) / 10;
const rel = (f) => path.relative(repoRoot, f);
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
/** The circuit's own assert, as midnight-js rethrows it ("failed assert: <message>"); null for any other error. */
const assertMessageOf = (e) => { const m = String(e?.message ?? ''); const i = m.indexOf('failed assert: '); return i >= 0 ? m.slice(i + 15) : null; };
/** Owner-only, and atomic: a temporary file, then a rename, so an interrupted write never leaves half a file. */
const writeOwnerOnly = (file, data) => {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.tmp`, data, { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
};
const readRecord = () => JSON.parse(readFileSync(RECORD, 'utf8'));
const writeRecord = (r) => writeFileSync(RECORD, `${JSON.stringify(r, null, 2)}\n`);

const Shipped = await import(pathToFileURL(path.join(SHIPPED_ZK, 'contract', 'index.js')).href);
const pure = Shipped.pureCircuits;
const DELAY = Number(pure.recoveryDelaySeconds());
if (DELAY !== 259200) throw new Error(`expected the shipped 72 h timelock, found ${DELAY} s (run bash devnet/compile.sh)`);

// An honest claimed time: no later than either clock, with margin for skew (as the story runner).
let claimed = 0n;
const claimNow = async () => { claimed = BigInt(Math.min(Math.floor(Date.now() / 1000), await tipTime()) - 30); };
const cc = compiledContract('Lantern (shipped)', Shipped.Contract, lanternWitnesses({ pure, clock: () => claimed }), SHIPPED_ZK);
const psp = inMemoryPrivateStateProvider();

// ---- the public chain, read without a wallet ---------------------------------------------------

const publicData = () => indexerPublicDataProvider(network.indexer, network.indexerWS);
const ledgerOf = async (pdp, address) => { const s = await pdp.queryContractState(address); return s ? Shipped.ledger(s.data) : null; };

/** One query to the public indexer's GraphQL API, for what midnight-js does not surface. */
async function indexer(query, variables) {
  const res = await fetch(network.indexer, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(`indexer: ${body.errors.map((e) => e.message).join('; ')}`);
  return body.data;
}
const TX_FIELDS = 'hash block { height timestamp } contractActions { __typename address ... on ContractCall { entryPoint } } ... on RegularTransaction { identifiers transactionResult { status } }';
/** A transaction, found by one of its identifiers: its hash, its block and that block's time, its result, and its contract actions. */
const txOnChain = async (txId) => (await indexer(`query ($o: TransactionOffset!) { transactions(offset: $o) { ${TX_FIELDS} } }`, { o: { identifier: txId } })).transactions?.[0] ?? null;
/** The latest action on a contract, with its transaction. */
const latestAction = async (address) => (await indexer(`query ($a: HexEncoded!) { contractAction(address: $a) { __typename address ... on ContractCall { entryPoint } transaction { ${TX_FIELDS} } } }`, { a: address })).contractAction;
const blockSeconds = (t) => Math.floor(Number(t.block.timestamp) / 1000);

/** The commitments that descend from `idRoot` and are current -- enrolled, not retired -- other than `except`. */
const currentUnder = (L, idRoot, except) => [...L.idRoots]
  .filter(([c, root]) => hex(root) === idRoot && hex(c) !== except && L.enrolled.member(c) && !L.retiredIdentities.member(c))
  .map(([c]) => hex(c));

/** Hours from the later bound recorded at the open to the finalize: from the finalize block's own time, or else the tip's. */
async function hoursAfterOpen(record, tx) {
  const hi = Date.parse(record.recovery.openedAtHi) / 1000;
  const hours = (s) => Math.round((s - hi) / 360) / 10;
  try {
    const t = await txOnChain(tx.txId);
    if (t?.block?.timestamp) return { afterOpenHours: hours(blockSeconds(t)), afterOpenHoursMeasuredAt: 'the finalize block\'s timestamp' };
  } catch { /* fall back to the tip */ }
  return { afterOpenHours: hours(await tipTime()), afterOpenHoursMeasuredAt: 'the chain tip just after the finalize: the indexer did not give the block\'s timestamp' };
}

/** One circuit call. Accepted: a finalized transaction. Refused: the circuit's own assert, caught locally. */
async function call(handle, { id, actor, circuit, args, ps, payer, refuse }, address, record) {
  await psp.setContractAddress(address);
  await psp.set(ACTOR, ps);
  await claimNow();
  const t0 = Date.now();
  let timer;
  let r;
  try {
    r = await Promise.race([handle.callTx[circuit](...args),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`no finalization after ${CALL_TIMEOUT_MS / 1000} s`)), CALL_TIMEOUT_MS); })]);
  } catch (e) {
    // A refusal is only the circuit's own assert, with exactly the expected message.
    if (!refuse || assertMessageOf(e) !== refuse) throw e;
    record.steps.push({ id, actor, circuit, outcome: 'refused', message: refuse, note: 'refused by the circuit\'s own assert, locally, before any proof or transaction' });
    log(`✓ ${id} ${actor} → ${circuit}  refused: "${refuse}"`);
    return null;
  } finally { clearTimeout(timer); }
  // Outside the catch above, so an acceptance that should have been a refusal can never be recorded as one.
  if (refuse) throw new Error(`step ${id}: expected a refusal ("${refuse}"), but the call was accepted: tx ${r.public.txId}`);
  if (r.public.status !== 'SucceedEntirely') throw new Error(`step ${id}: transaction ${r.public.txId} ended ${r.public.status}`);
  const rec = { id, actor, circuit, outcome: 'accepted', tx: txOf(r.public), payer, seconds: secs(Date.now() - t0) };
  record.steps.push(rec);
  log(`✓ ${id} ${actor} → ${circuit}  accepted · block ${rec.tx.blockHeight} · tx ${rec.tx.txId.slice(0, 16)}… · ${rec.seconds} s`);
  return r;
}

if (mode === 'open') {
  if (existsSync(STATE)) {
    throw new Error(`${rel(STATE)} exists: a recovery was opened with it, or an open stopped part-way. Use status or finalize; to start over, move it aside first`);
  }
  const seeds = loadSeeds();
  log('syncing the operator wallet…');
  const operator = await startWallet(seeds.operator, { snapshotFile: snapshotOf('operator') });
  await readyToPay(operator, log);
  const providers = await providersFor(operator, SHIPPED_ZK, psp);
  const pdp = providers.publicDataProvider;
  const payer = 'the operator wallet';

  // ---- every secret first, on disk before the first transaction ----------------------------
  // An open that stops part-way must not lose the phone's key or its shares: a recovery it
  // opened could then never finalize. The file grows as the open goes.
  const owner = newIdentity();
  const { idCommit, vetoCommit } = commitmentsOf(pure, owner);
  const hana = { name: 'Hana', ...owner };
  const shares = dealShares(owner.identitySecret, 3, 2);
  const names = ['Seo-yeon', 'Mum', 'Jihoon'];
  const g = names.map((name) => ({ name, guardianSecret: crypto.getRandomValues(new Uint8Array(32)), leafSalt: crypto.getRandomValues(new Uint8Array(32)) }));
  const phoneSk = crypto.getRandomValues(new Uint8Array(32));
  const successor = newIdentity();
  let state = {};
  const saveState = (more) => { state = { ...state, ...more }; writeOwnerOnly(STATE, `${JSON.stringify(state, null, 2)}\n`); };
  saveState({
    address: null, rid: null, idCommit: hex(idCommit), earliest: null,
    phoneSk: hex(phoneSk),
    sharesSentToThePhone: shares.slice(0, 2).map((x) => ({ x: String(x.x), y: String(x.y) })),
    vetoCard: { vetoSecret: String(owner.vetoSecret), vetoSalt: hex(owner.vetoSalt) },
    successor: { identitySecret: String(successor.identitySecret), vetoSecret: String(successor.vetoSecret) },
    guardians: g.map((x) => ({ name: x.name, guardianSecret: hex(x.guardianSecret), leafSalt: hex(x.leafSalt) })),
  });
  log(`private state: ${rel(STATE)} (gitignored, owner-only)`);

  // ---- the shipped contract, deployed and frozen ------------------------------------------
  await claimNow();
  const t0 = Date.now();
  const deployed = await deployContract(providers, {
    compiledContract: cc, privateStateId: ACTOR, initialPrivateState: { name: 'deployer' }, args: [],
  });
  const address = deployed.deployTxData.public.contractAddress;
  saveState({ address });
  log(`deployed the shipped Lantern at ${address} (block ${deployed.deployTxData.public.blockHeight}, ${secs(Date.now() - t0)} s)`);
  const authority = await freezeMaintenanceAuthority(providers, address, 'Lantern');
  log(`maintenance authority frozen: committee ${authority.committee}, threshold ${authority.threshold} (block ${authority.frozenBy.blockHeight})`);
  const onChain = await pdp.queryContractState(address);
  const ops = onChain.operations().map(String).sort();
  const keyOf = (op) => readFileSync(path.join(SHIPPED_ZK, 'keys', `${op}.verifier`));
  const matching = ops.filter((op) => Buffer.from(onChain.operation(op).verifierKey).equals(keyOf(op)));
  if (matching.length !== ops.length || ops.length !== 10) throw new Error(`verifier keys: ${matching.length} of ${ops.length} match the shipped build`);

  const record = {
    what: WHAT_OPEN,
    network: `${network.networkId} (Midnight's public test network)`,
    explorer: network.explorer,
    endpoints: { node: network.node, indexer: network.indexer },
    toolchain: { compact: '0.31.1', 'compact-runtime': '0.16.0', 'midnight-js': '4.1.1', 'wallet-sdk': '1.2.0', 'proof-server': '8.1.0 (local)' },
    openedAt: new Date().toISOString(),
    contract: {
      name: 'Lantern (shipped: contracts/src/lantern.compact, unchanged)', address,
      ...txOf(deployed.deployTxData.public), maintenanceAuthority: authority,
      verifierKeys: `${matching.length} of ${ops.length} identical to a fresh compile of contracts/src/lantern.compact`,
      finalizeRecoveryVerifierKeySha256: createHash('sha256').update(keyOf('finalizeRecovery')).digest('hex'),
    },
    timelockSeconds: DELAY,
    steps: [],
  };

  // ---- Hana, her three guardians, and a recovery for her new phone -------------------------
  const step = (id, actor, circuit, args, ps, extra = {}) => call(deployed, { id, actor, circuit, args, ps, payer, ...extra }, address, record);
  await step('1', 'Hana', 'enrollIdentity', [idCommit, vetoCommit, 2n], hana);
  for (const [i, x] of g.entries()) {
    const r = await step(`${2 + i}`, 'Hana', 'addGuardian', [idCommit], { ...hana, guardianSecret: x.guardianSecret, leafSalt: x.leafSalt });
    x.leaf = r.private.result;
  }
  const opened = await step('5', 'Seo-yeon', 'openRecovery', [idCommit, pure.ephemeralPkOf(phoneSk)], { name: 'Seo-yeon' });
  const rid = opened.private.result;
  saveState({ rid: hex(rid) });
  for (const [i, x] of g.slice(0, 2).entries()) {
    await step(`${6 + i}`, x.name, 'approveRecovery', [idCommit, rid], { name: x.name, guardianSecret: x.guardianSecret, leafSalt: x.leafSalt, leaf: x.leaf });
  }

  // The phone rebuilds the secret from the two shares at once, and tries: the lock holds.
  const phone = { name: PHONE, ...recoverFromShares(shares.slice(0, 2)), ephemeralSk: phoneSk };
  const s = commitmentsOf(pure, successor);
  await step('8', PHONE, 'finalizeRecovery', [rid, s.idCommit, s.vetoCommit], phone, { refuse: 'timelock has not elapsed' });

  const L = await ledgerOf(pdp, address);
  const rec = L.recoveries.lookup(rid);
  const earliest = Number(rec.openedAtHi) + DELAY;
  saveState({ earliest });
  record.recovery = {
    rid: hex(rid), idCommit: hex(idCommit),
    openedAtLo: iso(rec.openedAtLo), openedAtHi: iso(rec.openedAtHi),
    finalizeNoEarlierThan: iso(earliest),
    approvals: `${L.approvals.lookup(rid).read()} of ${L.thresholds.lookup(idCommit)}`,
  };
  record.finalize = null;
  writeRecord(record);
  await saveSnapshot(operator, snapshotOf('operator'));
  await operator.wallet.stop();
  log(`recovery open. It can finalize no earlier than ${iso(earliest)} (${duration(earliest - await tipTime())} from now).`);
  log(`record: ${rel(RECORD)} · private state: ${rel(STATE)} (gitignored)`);
  process.exit(0);
}

if (mode === 'verify') {
  // Needs no wallet and no private state: only the committed record, a fresh compile of the
  // unchanged contracts/src/lantern.compact (bash devnet/compile.sh) and Midnight's public
  // indexer. It holds before and after the finalize: a recovery that finalized after this
  // record was written is reported as such, and its successor is checked.
  const record = readRecord();
  const pdp = publicData();
  const results = [];
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`); };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms).unref())]);
  const c = record.contract;
  const r = record.recovery;
  console.log(`\n  verifying ${rel(RECORD)} against ${network.networkId} (${network.indexer})\n`);

  // Each recorded transaction, as the indexer shows it.
  const recorded = [
    { tx: c, action: 'ContractDeploy' },
    { tx: c.maintenanceAuthority.frozenBy, action: 'ContractUpdate' },
    ...record.steps.filter((x) => x.tx?.txId).map((x) => ({ tx: x.tx, action: 'ContractCall', circuit: x.circuit })),
  ];
  for (const x of recorded) x.onChain = await txOnChain(x.tx.txId).catch(() => null);

  const onChain = await pdp.queryContractState(c.address);
  check('the shipped Lantern exists on this network', Boolean(onChain), c.address);
  if (onChain) {
    const ma = onChain.maintenanceAuthority;
    check('its maintenance authority is frozen, so its rules can never change', ma.committee.length === 0 && ma.threshold >= 1,
      `committee ${ma.committee.length}, threshold ${ma.threshold}`);
    const ops = onChain.operations().map(String).sort();
    const matching = ops.filter((op) => Buffer.from(onChain.operation(op).verifierKey)
      .equals(readFileSync(path.join(SHIPPED_ZK, 'keys', `${op}.verifier`))));
    check('every on-chain verifier key is byte-identical to a fresh compile of contracts/src/lantern.compact',
      matching.length === ops.length && ops.length === 10, `${matching.length} of ${ops.length} circuits`);

    const L = Shipped.ledger(onChain.data);
    const rid = bytes(r.rid);
    const idCommit = bytes(r.idCommit);
    const rec = L.recoveries.member(rid) ? L.recoveries.lookup(rid) : null;
    check('the recovery is on chain, for the recorded identity commitment', Boolean(rec) && hex(rec.idCommit) === r.idCommit, `rid ${r.rid.slice(0, 16)}…`);
    if (rec) {
      const openTx = recorded.find((x) => x.circuit === 'openRecovery')?.onChain;
      const t = openTx?.block?.timestamp ? blockSeconds(openTx) : null;
      const lo = Number(rec.openedAtLo);
      const hi = Number(rec.openedAtHi);
      check('its open-time bounds are the recorded ones, and the block that opened it has a time between them',
        iso(lo) === r.openedAtLo && iso(hi) === r.openedAtHi && t !== null && t >= lo && t < hi,
        `block time ${t === null ? 'unknown' : iso(t)}, bounds ${iso(lo)} to ${iso(hi)}`);
      check('it cannot finalize before the recorded time: 72 hours after the later bound', iso(hi + DELAY) === r.finalizeNoEarlierThan, r.finalizeNoEarlierThan);
      const approvals = `${L.approvals.member(rid) ? L.approvals.lookup(rid).read() : 0} of ${L.thresholds.member(idCommit) ? L.thresholds.lookup(idCommit) : '?'}`;
      check('it has the recorded approvals', approvals === r.approvals, approvals);

      const retired = L.retiredIdentities.member(idCommit);
      if (retired) {
        // Finalized: the old commitment is retired and exactly one successor is current under
        // the same identity root -- the one the record names, if it names one.
        const successors = currentUnder(L, hex(rec.idRoot), r.idCommit);
        const named = record.finalize?.successorIdCommit;
        check(record.finalize ? 'the recovery finalized: the old commitment is retired, and its successor is enrolled under the same identity root'
          : 'the recovery finalized after this record was written: the old commitment is retired, and its successor is enrolled under the same identity root',
        successors.length === 1 && (!named || successors[0] === named), successors.length ? `successor ${successors[0].slice(0, 16)}…` : 'no current successor');
      } else {
        check(record.finalize ? 'the record says the recovery finalized, so the old commitment should be retired'
          : 'the recovery has not finalized yet: the old commitment is enrolled and not retired',
        !record.finalize && L.enrolled.member(idCommit));
      }
    }
  }

  let found = 0;
  for (const { tx } of recorded) {
    try {
      const d = await withTimeout(pdp.watchForTxData(tx.txId), 30_000);
      if (d.blockHeight === tx.blockHeight && d.status === 'SucceedEntirely') found++;
    } catch { /* counted as missing */ }
  }
  check('every recorded transaction is on the chain, at its recorded block', found === recorded.length, `${found} of ${recorded.length}`);
  const carries = recorded.filter(({ tx, onChain: t, action, circuit }) => t?.hash === tx.txHash && t.contractActions
    .some((a) => a.address === c.address && a.__typename === action && (!circuit || a.entryPoint === circuit)));
  check('each carries the recorded action on this contract: the deploy, the freeze, and each step\'s circuit, by the indexer\'s entry point',
    carries.length === recorded.length, `${carries.length} of ${recorded.length}`);
  const ok = results.every(Boolean);
  console.log(ok ? '\n  The record matches the chain.\n' : '\n  The record does NOT match the chain.\n');
  process.exit(ok ? 0 : 1);
}

if (mode === 'status') {
  // Public facts only, so anyone can run it: the committed record and the public chain. No
  // wallet, no private state.
  const record = readRecord();
  const r = record.recovery;
  const earliest = Date.parse(r.finalizeNoEarlierThan) / 1000;
  console.log(`shipped Lantern ${record.contract.address} on ${network.networkId}`);
  console.log(`opened no later than ${r.openedAtHi} · finalize no earlier than ${r.finalizeNoEarlierThan}`);
  if (record.finalize) {
    console.log(`finalized: block ${record.finalize.tx.blockHeight}`);
  } else if ((await ledgerOf(publicData(), record.contract.address))?.retiredIdentities.member(bytes(r.idCommit))) {
    console.log('finalized on chain after this record was written: the old commitment is retired');
  } else {
    const tip = await tipTime();
    console.log(tip >= earliest ? 'the timelock has passed: ready to finalize' : `${duration(earliest - tip)} of chain time to go`);
  }
  process.exit(0);
}

// ---- finalize ----------------------------------------------------------------------------------
const record = readRecord();
if (record.finalize) throw new Error('already finalized: the record says so (verify re-checks it)');
const address = record.contract.address;
const earliest = Date.parse(record.recovery.finalizeNoEarlierThan) / 1000;

// Already finalized on chain -- a finalize whose transaction landed but whose run stopped before
// it wrote the record? Then run nothing again: rebuild the record from the chain, or say how.
{
  const L = await ledgerOf(publicData(), address);
  if (L.retiredIdentities.member(bytes(record.recovery.idCommit))) {
    log('the recovery has already finalized on chain: the old commitment is retired. Steps 9 and 10 are not run again.');
    const idRoot = hex(L.recoveries.lookup(bytes(record.recovery.rid)).idRoot);
    const successors = currentUnder(L, idRoot, record.recovery.idCommit);
    const a = await latestAction(address).catch(() => null);
    const t = a?.transaction;
    // Only the phone holds the key the guardians approved, so this recovery's finalize is ours.
    // It is identifiable from the indexer alone while it is still the contract's latest action.
    if (a?.entryPoint === 'finalizeRecovery' && t?.transactionResult?.status === 'SUCCESS' && blockSeconds(t) >= earliest && successors.length === 1) {
      const tx = { txId: t.identifiers.at(-1), txHash: t.hash, blockHeight: t.block.height, status: 'SucceedEntirely' };
      const note = 'rebuilt from the chain: the finalize run stopped after this transaction landed, before it wrote the record';
      record.steps = record.steps.filter((x) => x.id !== '10');
      record.steps.push({ id: '10', actor: PHONE, circuit: 'finalizeRecovery', outcome: 'accepted', tx, payer: 'not recorded', note });
      record.what = WHAT_FINALIZED;
      record.finalize = {
        at: iso(blockSeconds(t)), tx, sponsorship: null, successorIdCommit: successors[0],
        ...(await hoursAfterOpen(record, tx)), ledger: LEDGER_AFTER, note,
      };
      writeRecord(record);
      log(`record rebuilt from the chain: finalized in block ${tx.blockHeight}. Check it: LANTERN_NETWORK=${network.networkId} node devnet/src/shipped.mjs verify`);
      process.exit(0);
    }
    log('the old commitment is retired, but the finalize could not be rebuilt from the indexer alone: it may no longer be the contract\'s latest action, or the indexer could not be read.');
    log(`find the finalizeRecovery transaction on ${network.explorer}/contracts/${address}; add it to ${rel(RECORD)} as step 10 and as finalize.tx, set finalize.successorIdCommit and the finished "what", then run verify.`);
    process.exit(1);
  }
}

const state = JSON.parse(readFileSync(STATE, 'utf8'));
if (state.address !== address || state.rid !== record.recovery.rid || state.idCommit !== record.recovery.idCommit) {
  throw new Error(`${rel(STATE)} and ${rel(RECORD)} describe different recoveries`);
}
// A previous attempt that stopped part-way may have recorded step 9: the second sitting starts afresh.
record.steps = record.steps.filter((x) => Number(x.id) <= 8);

// By default the phone holds no wallet and a sponsor pays its fee. --operator-pays is the
// fallback if the sponsor's wallet is not synced in time: the operator pays, and the record says so.
const operatorPays = process.argv.includes('--operator-pays');
const payerRole = operatorPays ? 'operator' : 'sponsor';
const seeds = loadSeeds();
log(`syncing the ${payerRole}'s wallet…`);
const payerCtx = await startWallet(seeds[payerRole], { snapshotFile: snapshotOf(payerRole) });
await readyToPay(payerCtx, log);
let evidence = null;
const device = operatorPays ? {}
  : walletlessDevice(createSponsor({ wallet: payerCtx, addresses: [address], log }), (e) => { evidence = e; });
const base = await providersFor(payerCtx, SHIPPED_ZK, psp);
const shares = state.sharesSentToThePhone.map((x) => ({ x: BigInt(x.x), y: BigInt(x.y) }));
const phone = { name: PHONE, ...recoverFromShares(shares), ephemeralSk: bytes(state.phoneSk) };
await psp.setContractAddress(address);
await psp.set(ACTOR, phone);
const handle = await findDeployedContract({ ...base, ...device }, { contractAddress: address, compiledContract: cc, privateStateId: ACTOR });
const successor = { identitySecret: BigInt(state.successor.identitySecret), vetoSecret: BigInt(state.successor.vetoSecret) };
const s = commitmentsOf(pure, { ...successor, idSalt: idSaltOf(successor.identitySecret), vetoSalt: vetoSaltOf(successor.vetoSecret) });
const rid = bytes(record.recovery.rid);

const tip = await tipTime();
if (tip < earliest + 60) {
  log(`waiting for the chain's block time to pass the timelock: ${duration(earliest + 60 - tip)} to go…`);
  await waitForChainTime(earliest + 60);
}
const payer = operatorPays ? 'the operator wallet (--operator-pays)' : 'the sponsor (the device holds no wallet)';
const step = (id, actor, circuit, args, ps, extra = {}) => call(handle, { id, actor, circuit, args, ps, payer, ...extra }, address, record);

// One share tampered with in transit: the rebuilt secret is wrong, and the chain can tell.
const tampered = { ...phone, ...recoverFromShares([shares[0], { x: shares[1].x, y: shares[1].y === 0n ? 1n : shares[1].y - 1n }]) };
await step('9', PHONE, 'finalizeRecovery', [rid, s.idCommit, s.vetoCommit], tampered, { refuse: TAMPERED_REFUSAL });
writeRecord(record); // step 9 is on disk before step 10 is submitted
await step('10', PHONE, 'finalizeRecovery', [rid, s.idCommit, s.vetoCommit], phone);
const last = record.steps.at(-1);
if (evidence) last.sponsorship = evidence;
// Step 10 landed: write it down before anything else can fail.
record.what = WHAT_FINALIZED;
record.finalize = { at: new Date().toISOString(), tx: last.tx, sponsorship: last.sponsorship ?? null, successorIdCommit: hex(s.idCommit) };
writeRecord(record);

// Each later fact is written as soon as it is known, so the record is never left half-filled.
Object.assign(record.finalize, await hoursAfterOpen(record, last.tx)
  .catch((e) => ({ afterOpenHours: null, afterOpenHoursMeasuredAt: `not measured: ${e.message}` })));
writeRecord(record);
const L = await ledgerOf(base.publicDataProvider, address);
const idRoot = hex(L.recoveries.lookup(rid).idRoot);
if (!L.retiredIdentities.member(bytes(record.recovery.idCommit)) || !L.enrolled.member(s.idCommit)
  || L.retiredIdentities.member(s.idCommit) || hex(L.idRoots.lookup(s.idCommit)) !== idRoot) {
  record.finalize.ledger = 'NOT CONFIRMED: the ledger did not show the old commitment retired and the successor enrolled under the same identity root; run verify';
  writeRecord(record);
  throw new Error(record.finalize.ledger);
}
record.finalize.ledger = LEDGER_AFTER;
writeRecord(record);
await saveSnapshot(payerCtx, snapshotOf(payerRole));
await payerCtx.wallet.stop();
log(`finalized in block ${last.tx.blockHeight}, ${record.finalize.afterOpenHours} h after the later bound recorded at the open (measured at ${record.finalize.afterOpenHoursMeasuredAt}). Record: ${rel(RECORD)}`);
process.exit(0);
