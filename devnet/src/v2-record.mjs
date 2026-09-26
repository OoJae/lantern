// deployments/local-v2.json, or preprod-v2.json with LANTERN_NETWORK=preprod: committed
// evidence of a real run of Lantern v2's chain story (v2-run.mjs), in the style of preprod.json.
// Written only when every step went as the story expects: never a partial record.
//
// Dependency-free (node builtins only), so devnet/test checks it, and the committed records,
// without a devnet install. verify-v2.mjs checks a record against the chain.
import os from 'node:os';

export const V2_SOURCES = ['contracts/v2/lantern2.compact', 'contracts/src/identity.compact', 'contracts/src/ownergate.compact'];
export const V2_CIRCUITS = [
  'addGuardian', 'approveRecovery', 'checkIn', 'enrollIdentity', 'finalizeRecovery', 'hostGatedAction', 'lockIdentity',
  'openRecovery', 'proveHeadOwnership', 'proveSuccession', 'rotateGuardianSet', 'unlockIdentity', 'vetoRecovery',
];
export const TOOLCHAIN = Object.freeze({ compact: '0.31.1', 'compact-runtime': '0.16.0', 'midnight-js': '4.1.1', 'wallet-sdk': '1.2.0' });

/**
 * The record's file name under deployments/: preprod-v2.json on Preprod, local-v2.json locally (not
 * local-devnet-*, the names of v1's local records).
 */
export const v2RecordName = ({ networkId, isPublic }) => (isPublic ? `${networkId}-v2.json` : 'local-v2.json');

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const span = (xs) => ({ min: Math.min(...xs), median: median(xs), max: Math.max(...xs) });

/** The transactions that set the contract up, in order: the deploy, each key insert (split-deploy.mjs), the freeze. */
export const setupTxs = (c) => [c, ...(c.verifierKeysInsertedBy ?? []), c.maintenanceAuthority.frozenBy];

/** Every transaction the record names, in order: the setup's, then each accepted step's. */
export const recordedTxs = (record) => [...setupTxs(record.contracts.lantern2), ...record.steps.map((s) => s.tx).filter((t) => t?.txId)];

/** The period the story's check-in named: finalIdentity's check-in count is read for it. */
export const checkInPeriodOf = (steps) => {
  const s = steps.find((r) => r.circuit === 'checkIn' && r.outcome === 'accepted');
  return s ? Number(s.args[1]) : null;
};

/**
 * @param network        config.mjs's network ({ name, networkId, explorer, node, indexer })
 * @param contract       the executor's contract: { name, address, txId, txHash, blockHeight, status, timings, maintenanceAuthority }
 * @param records        the story's step records (v2-story.mjs runV2Story)
 * @param finalLedger    v2Summary of the ledger after the last step
 * @param finalIdentity  identityState of the story's identity after the last step
 * @param compiler       devnet/build/lantern2/compiler/contract-info.json's versions
 * @param sources        { path: sha256 } of V2_SOURCES, as compiled
 */
export function buildV2Record({ network, isPublic, contract, records, finalLedger, finalIdentity, startedAt, compiler, sources,
  delaySeconds, walletName, now = Date.now(), machine = machineOf() }) {
  const txs = records.filter((r) => r.tx?.txId);
  const proves = txs.map((r) => r.timings?.prove).filter((v) => v != null);
  const totals = txs.map((r) => r.timings?.total).filter((v) => v != null);
  return {
    what: isPublic
      ? `A real run of Lantern v2's chain story on Midnight's public test network ${network.name}: the v2 contract deployed as compiled and frozen, then each v2 rule exercised once. Every accepted step is a proved, balanced, finalized transaction anyone can look up; every refusal is the circuit's own assert, raised before anything was proved.`
      : 'A real run of Lantern v2\'s chain story on a local Midnight chain: the v2 contract deployed as compiled and frozen, then each v2 rule exercised once. Every accepted step is a proved, balanced, finalized transaction; every refusal is the circuit\'s own assert, raised before anything was proved.',
    network: isPublic ? `${network.networkId} (Midnight's public test network)` : 'undeployed (local, single node)',
    ...(isPublic ? { explorer: network.explorer, endpoints: { node: network.node, indexer: network.indexer } } : {}),
    recordedAt: new Date(now).toISOString(),
    mode: 'v2',
    machine,
    images: isPublic ? ['midnightntwrk/proof-server:8.1.0 (local)']
      : ['midnightntwrk/midnight-node:1.0.0', 'midnightntwrk/indexer-standalone:4.3.3', 'midnightntwrk/proof-server:8.1.0'],
    toolchain: { ...TOOLCHAIN },
    compiler,
    source: {
      what: 'contracts/v2/lantern2.compact exactly as committed, with the two v1 modules it imports: no flavour, no line changed. v2\'s delay is chosen at enrolment, so the story needs none.',
      sha256: sources,
    },
    delay: { chosenSeconds: delaySeconds, what: 'the delay the owner chose at enrolment: v2\'s minimum, 24 h. Nothing in the story waits it out; no recovery is finalized.' },
    payer: `${walletName} paid every transaction`,
    contracts: { lantern2: contract },
    timingNotes: 'seconds. execute: the circuit run locally; prove: the local proof server; balance: adding DUST; '
      + 'submit: until the node included the transaction in a block; finalize: until midnight-js saw it finalized. '
      + 'The first proof of a run is marked cold.',
    steps: records,
    finalPublicRecord: finalLedger,
    finalIdentity,
    summary: {
      steps: records.length,
      accepted: records.filter((r) => r.outcome === 'accepted').length,
      refused: records.filter((r) => r.outcome === 'refused').length,
      transactions: txs.length + setupTxs(contract).length, // + the deploy, the key inserts and the freeze
      circuitsProved: [...new Set(txs.map((r) => r.circuit))].sort(),
      proveSeconds: { ...span(proves), coldFirst: proves[0] ?? null },
      callToFinalizedSeconds: span(totals),
      wallClockMinutes: Math.round((now - startedAt) / 6000) / 10,
    },
  };
}

export function machineOf() {
  return { platform: `${os.platform()} ${os.arch()}`, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, node: process.version };
}

/**
 * What anyone can check of a v2 record without a chain: that it is internally consistent. Returns
 * a list of problems, empty when there are none. verify-v2.mjs runs it before it asks the chain.
 */
export function problemsOf(record) {
  const out = [];
  const bad = (m) => out.push(m);
  const calls = record.steps.filter((s) => s.kind === 'call');
  const withTx = record.steps.filter((s) => s.tx?.txId);
  if (record.mode !== 'v2') bad(`mode is ${record.mode}, not v2`);
  for (const s of record.steps) if (!s.ok) bad(`step ${s.id} did not go as expected`);
  for (const s of calls) {
    if (s.contract !== 'lantern2') bad(`step ${s.id} is not a Lantern v2 call`);
    if (s.expect !== (s.outcome === 'refused' ? `refused: ${s.message}` : s.outcome)) bad(`step ${s.id}: outcome ${s.outcome} does not match ${s.expect}`);
    if (s.outcome === 'accepted' && !(s.tx?.status === 'SucceedEntirely' && /^[0-9a-f]+$/.test(s.tx.txId ?? '') && s.tx.blockHeight > 0) && !s.tx?.note) {
      bad(`step ${s.id} was accepted without a finalized transaction`);
    }
    if (s.outcome === 'refused' && s.tx !== undefined) bad(`step ${s.id} was refused, yet names a transaction`);
  }
  const c = record.contracts?.lantern2;
  if (!c?.address) bad('no Lantern v2 contract');
  else {
    if (c.maintenanceAuthority?.committee !== 0 || !(c.maintenanceAuthority?.threshold >= 1)) bad('the maintenance authority is not recorded frozen');
    if (c.maintenanceAuthority?.frozenBy?.status !== 'SucceedEntirely') bad('the freeze is not a successful transaction');
    const setup = setupTxs(c).map((t) => t.blockHeight);
    const first = Math.min(...withTx.map((s) => s.tx.blockHeight));
    if (setup.some((h, i) => !(h > 0) || (i > 0 && h < setup[i - 1])) || (withTx.length && setup.at(-1) > first)) {
      bad('the contract was not deployed, given its keys and frozen, in that order, before the first step');
    }
    for (const t of setupTxs(c)) if (t.status !== 'SucceedEntirely' || !/^[0-9a-f]+$/.test(t.txId ?? '')) bad(`setup transaction ${t.txId} did not succeed entirely`);
    const placed = [...(c.operationsAtDeploy ?? []), ...(c.verifierKeysInsertedBy ?? []).flatMap((u) => u.operations)];
    if (JSON.stringify([...placed].sort()) !== JSON.stringify(V2_CIRCUITS)) bad('the deploy and the key inserts do not place each of v2\'s 13 circuits exactly once');
  }
  const heights = withTx.map((s) => s.tx.blockHeight);
  if (heights.some((h, i) => i > 0 && h < heights[i - 1])) bad('the transactions are not in block order');
  const S = record.summary;
  if (S.steps !== record.steps.length) bad('summary.steps does not recompute');
  if (S.accepted !== calls.filter((s) => s.outcome === 'accepted').length) bad('summary.accepted does not recompute');
  if (S.refused !== calls.filter((s) => s.outcome === 'refused').length) bad('summary.refused does not recompute');
  if (c?.address && S.transactions !== withTx.length + setupTxs(c).length) bad('summary.transactions does not recompute');
  const proves = withTx.map((s) => s.timings?.prove).filter((v) => v != null);
  if (S.proveSeconds.min !== Math.min(...proves) || S.proveSeconds.max !== Math.max(...proves) || S.proveSeconds.median !== median(proves)) {
    bad('summary.proveSeconds does not recompute');
  }
  if (JSON.stringify(S.circuitsProved) !== JSON.stringify([...new Set(withTx.map((s) => s.circuit))].sort())) bad('summary.circuitsProved does not recompute');
  if (record.finalIdentity?.checkIns?.period !== checkInPeriodOf(record.steps)) bad('finalIdentity\'s check-in period is not the one the story checked in for');
  if (!V2_SOURCES.every((p) => /^[0-9a-f]{64}$/.test(record.source?.sha256?.[p] ?? ''))) bad('the compiled sources are not all named with their sha256');
  return out;
}
