// The two Preprod runs as the repository records them (deployments/*.json, committed with each run),
// in the one shape /live reads. The page shows what the record says at once, then asks the chain
// whether it agrees: every transaction here is one the browser check looks up.
//
//  - preprod-shipped.json: the SHIPPED contract, contracts/src/lantern.compact unchanged, with its
//    real 72-hour timelock. A recovery was opened and approved 2 of 2; it can finalize from the time
//    the record names. `finalize` stays null in the record until that finalize is written into it.
//  - preprod.json: the whole story, 74 steps, on a Lantern built with one line changed (a 60-second
//    timelock, so it could be waited out) and the independent host, unchanged.
import shippedRecord from '../../../deployments/preprod-shipped.json';
// Only the keys this page reads, by name, so the build leaves the rest of the record (its notes on the
// machine, the toolchain and the timings) out of the page's chunk.
import { contracts, finalHostRecord, finalPublicRecord, flavour, recordedAt, steps, summary } from '../../../deployments/preprod.json';

const storyRecord = { contracts, flavour, steps };

const txOf = (t) => (t?.txId && t?.txHash ? { txId: t.txId, txHash: t.txHash, blockHeight: t.blockHeight } : null);

// What each circuit does, in the story's words: a line for a timeline row the record gives no
// sentence for (the shipped run records who and which circuit, not a sentence).
export const DOES = {
  enrollIdentity: 'enrols an identity',
  addGuardian: 'adds a guardian',
  rotateGuardianSet: 'replaces the guardian set',
  openRecovery: 'opens a recovery for a new device',
  approveRecovery: 'approves the recovery',
  vetoRecovery: 'vetoes a recovery with the veto card',
  finalizeRecovery: 'finalizes the recovery',
  proveSuccession: 'proves which commitment is current',
  proveHeadOwnership: 'proves it owns the current commitment',
  hostGatedAction: 'acts in the DApp as the identity’s owner',
  openEpoch: 'opens a snapshot epoch',
  attestVote: 'votes for a snapshot',
  sealEpoch: 'seals the snapshot',
  requireCurrentOwnerAttested: 'acts in the host DApp as the identity’s owner',
  openRotation: 'opens a committee rotation',
  rotateVote: 'votes for the new committee',
  sealRotation: 'seals the new committee',
};

// Each contract's last recorded transaction. The whole story's counts are compared at its block, not
// with the state now: enrolling and opening a recovery need no permission, so anyone may call the
// story's contracts after the run, and that is not a disagreement with the record.
const lastOf = (c) => [c.deploy, c.freeze, ...c.calls.map((x) => x.tx)].filter(Boolean)
  .reduce((a, b) => (b.blockHeight >= a.blockHeight ? b : a));

const callsOf = (steps, keep) => steps
  .filter((s) => s.tx?.txId && keep(s))
  .map((s) => ({ stepId: s.id, actor: s.actor, circuit: s.circuit, say: s.say ?? null, payer: s.payer ?? null, tx: txOf(s.tx) }));

/** The three contracts, each with the transactions the record says it took. */
export const CONTRACTS = [
  {
    key: 'shipped',
    kind: 'lantern',
    name: 'The shipped contract',
    inline: 'the shipped contract',
    detail: 'contracts/src/lantern.compact, unchanged: a 72-hour timelock',
    address: shippedRecord.contract.address,
    delaySeconds: shippedRecord.timelockSeconds,
    deploy: txOf(shippedRecord.contract),
    freeze: txOf(shippedRecord.contract.maintenanceAuthority?.frozenBy),
    calls: callsOf(shippedRecord.steps, () => true),
  },
  {
    key: 'story',
    kind: 'lantern',
    name: 'The whole story’s Lantern',
    inline: 'the whole story’s Lantern',
    detail: 'the same source with line 120 changed: a 60-second timelock, so the story could wait it out',
    address: storyRecord.contracts.lantern.address,
    delaySeconds: storyRecord.flavour.recoveryDelaySeconds,
    deploy: txOf(storyRecord.contracts.lantern),
    freeze: txOf(storyRecord.contracts.lantern.maintenanceAuthority?.frozenBy),
    calls: callsOf(storyRecord.steps, (s) => s.kind === 'call' && s.contract !== 'host'),
  },
  {
    key: 'host',
    kind: 'host',
    name: 'The independent host',
    inline: 'the independent host',
    detail: 'contracts/src/host.compact, unchanged: a DApp with its own committee',
    address: storyRecord.contracts.host.address,
    delaySeconds: null,
    deploy: txOf(storyRecord.contracts.host),
    freeze: txOf(storyRecord.contracts.host.maintenanceAuthority?.frozenBy),
    calls: callsOf(storyRecord.steps, (s) => s.kind === 'call' && s.contract === 'host'),
  },
].map((c) => ({ ...c, last: lastOf(c) }));
export const contractByKey = Object.fromEntries(CONTRACTS.map((c) => [c.key, c]));

/** Which file records each contract, for the check's labels. */
export const FILE_OF = { shipped: 'deployments/preprod-shipped.json', story: 'deployments/preprod.json', host: 'deployments/preprod.json' };

/** Every transaction either file records, with what it should carry on chain. */
export const RECORDED_TXS = CONTRACTS.flatMap((c) => [
  c.deploy && { contract: c.key, address: c.address, action: 'deploy', circuit: null, label: 'deploy', tx: c.deploy },
  c.freeze && { contract: c.key, address: c.address, action: 'update', circuit: null, label: 'freeze the rules', tx: c.freeze },
  ...c.calls.map((x) => ({ contract: c.key, address: c.address, action: 'call', circuit: x.circuit, label: x.circuit, actor: x.actor, tx: x.tx })),
].filter(Boolean));

/** The shipped run's recovery, as the record states it. */
export const SHIPPED_RECOVERY = {
  rid: shippedRecord.recovery.rid,
  idCommit: shippedRecord.recovery.idCommit,
  openedAtLo: Date.parse(shippedRecord.recovery.openedAtLo),
  openedAtHi: Date.parse(shippedRecord.recovery.openedAtHi),
  finalizeFrom: Date.parse(shippedRecord.recovery.finalizeNoEarlierThan),
  approvals: shippedRecord.recovery.approvals, // "2 of 2"
  openedBy: shippedRecord.steps.find((s) => s.circuit === 'openRecovery')?.actor ?? null,
  approvedBy: shippedRecord.steps.filter((s) => s.circuit === 'approveRecovery' && s.tx).map((s) => s.actor),
  refusedEarly: shippedRecord.steps.find((s) => s.circuit === 'finalizeRecovery' && s.outcome === 'refused') ?? null,
  finalize: shippedRecord.finalize,
  openedAt: shippedRecord.openedAt,
};

/** What each public count is, in words (the Lantern ones as /demo's ledger panel names them). */
export const COUNT_LABEL = {
  enrolled: 'identity commitments', guardianLeaves: 'guardian leaves', recoveries: 'recoveries opened',
  approvals: 'approval nullifiers', vetoes: 'veto nullifiers', killed: 'vetoed recoveries',
  retired: 'retired commitments', lineage: 'lineage leaves', guardianSets: 'guardian sets', gateActions: 'DApp actions',
  sealedEpochs: 'sealed snapshots', committeeGen: 'committee generation', committeeVotes: 'committee votes', hostActions: 'DApp actions',
};

/** The whole story's last public counts, as the record wrote them. */
export const STORY_FINAL = { lantern: finalPublicRecord, host: finalHostRecord, summary, recordedAt };

/** Where the README sets up the terminal's tools (the full check and the watcher). */
export const SETUP = 'https://github.com/OoJae/lantern#on-midnights-public-test-network';

/** The demo identity the watch offers: the shipped recovery's. */
export const DEMO_IDENTITY = shippedRecord.recovery.idCommit;
