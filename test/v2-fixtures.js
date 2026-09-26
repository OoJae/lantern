// v1's test/fixtures.js, adapted to v2 (docs/v2-spec.md §10):
//   (a) world() enrols with a delay, 72 h by default;
//   (b) opens are made AS A GUARDIAN, for the current period;
//   (c) a second recovery for one identity needs the first dead, the cooldown
//       waited out, and usually ANOTHER guardian to open it;
//   (d) succeed() advances to the record's own unlockAt.
import * as rt from '@midnight-ntwrk/compact-runtime';
import { Lantern2Sim, pureCircuits, bytes32, fieldOf, DEFAULT_NOW } from './v2-simulator.js';
import { DEFAULT_DELAY, periodOf } from '../src/v2/timeline.js';

export { periodOf };
export const ID_SECRET = fieldOf(50);
export const ID_SALT = bytes32(51);
export const VETO_SECRET = fieldOf(60);
export const VETO_SALT = bytes32(61);

const EPH_REGISTRY = new Map();
const hexOf = (u) => Buffer.from(u).toString('hex');
export const hex = hexOf;
export function ephKey(i) {
  const sk = bytes32(900 + i);
  const pk = pureCircuits.ephemeralPkOf(sk);
  EPH_REGISTRY.set(hexOf(pk), sk);
  return pk;
}
export const ephSkFor = (pk) => EPH_REGISTRY.get(hexOf(pk));
export const EPH_A = ephKey(0);
export const EPH_B = ephKey(1);
export const EPH_C = ephKey(2);
export const EPH_D = ephKey(3);

export const idCommit = () => pureCircuits.idCommitOf(ID_SECRET, ID_SALT);
export const vetoCommit = () => pureCircuits.vetoCommitOf(VETO_SECRET, VETO_SALT);
export const DELAY = DEFAULT_DELAY;
export const SLACK = Number(pureCircuits.openSlackSeconds());
export const VETO_SLACK = Number(pureCircuits.vetoSlackSeconds());
/** A veto's second argument when it reserves no next device (docs/v2-spec.md §3.10). */
export const NO_RESERVATION = new Uint8Array(32);
export const DAY = 86_400;
export const PERIOD = Number(pureCircuits.periodSeconds());
export const APPROVAL_WINDOW = Number(pureCircuits.approvalWindowSeconds());
export const FINALIZE_WINDOW = Number(pureCircuits.finalizeWindowSeconds());

/** Enrol an identity with `n` guardians at the given threshold and delay. */
export function world({ n = 2, threshold = 2, now = DEFAULT_NOW, delay = DELAY } = {}) {
  const sim = new Lantern2Sim({}, now);
  const id = idCommit();
  sim.call('enrollIdentity', id, vetoCommit(), BigInt(threshold), BigInt(delay));
  const guardians = [];
  for (let i = 0; i < n; i++) {
    sim.ps.guardianSecret = bytes32(100 + i);
    sim.ps.leafSalt = bytes32(200 + i);
    const leaf = sim.call('addGuardian', id);
    guardians.push({ secret: bytes32(100 + i), salt: bytes32(200 + i), leaf });
  }
  return { sim, id, idRoot: id, guardians };
}

/** Act as guardian `g`: load their witness material and their Merkle path. */
export function asGuardian(sim, g) {
  sim.ps.guardianSecret = g.secret;
  sim.ps.leafSalt = g.salt;
  sim.ps.guardianPath = sim.findPath(g.leaf);
  return sim;
}

/** Guardian `g` opens a recovery for device `eph`, in the current period. The device key is loaded. */
export function openAs(sim, g, id, eph = EPH_A) {
  asGuardian(sim, g);
  sim.ps.ephemeralSk = ephSkFor(eph);
  return sim.call('openRecovery', id, eph, periodOf(sim.now));
}

/** A guardian (guardians[0] unless told) opens, then the first `k` guardians approve. */
export function openAndApprove(sim, id, guardians, k, eph = EPH_A, opener = guardians[0]) {
  const rid = openAs(sim, opener, id, eph);
  for (let i = 0; i < k; i++) {
    asGuardian(sim, guardians[i]);
    sim.call('approveRecovery', id, rid);
  }
  sim.ps.ephemeralSk = ephSkFor(eph);
  return rid;
}

export const recordOf = (sim, rid) => sim.ledger.recoveries.lookup(rid);

/** Move the clock to exactly the recovery's unlockAt (plus `plus` seconds). */
export const toUnlock = (sim, rid, plus = 0) => sim.setTime(Number(recordOf(sim, rid).unlockAt) + plus);

/** The owner vetoes `rid`, then the clock moves past the cooldown that veto starts. */
export function vetoAndCool(sim, rid) {
  sim.call('vetoRecovery', rid, NO_RESERVATION);
  const root = recordOf(sim, rid).idRoot;
  const vetoes = sim.ledger.vetoCounts.lookup(root).read();
  const until = Number(sim.ledger.lastVetoAt.lookup(root)) + Number(pureCircuits.cooldownSecondsOf(vetoes));
  if (sim.now < until) sim.setTime(until);
}

/** Run one full recovery and rebind the sim to the SUCCESSOR's identity. */
export function succeed(sim, id, guardians, gen = 1, eph = EPH_A) {
  const secret = fieldOf(700 + gen), salt = bytes32(110 + gen);
  const vSecret = fieldOf(800 + gen), vSalt = bytes32(140 + gen);
  const newId = pureCircuits.idCommitOf(secret, salt);
  const rid = openAndApprove(sim, id, guardians, 2, eph);
  toUnlock(sim, rid);
  // The device proves it opens its successor; then the default successor is back.
  const { successorSecret, successorSalt } = sim.ps;
  sim.ps.successorSecret = secret; sim.ps.successorSalt = salt;
  try {
    sim.call('finalizeRecovery', rid, newId, pureCircuits.vetoCommitOf(vSecret, vSalt));
  } finally {
    sim.ps.successorSecret = successorSecret; sim.ps.successorSalt = successorSalt;
  }
  sim.ps.identitySecret = secret; sim.ps.idSalt = salt;
  sim.ps.vetoSecret = vSecret;    sim.ps.vetoSalt = vSalt;
  return { newId, secret, salt, vSecret, vSalt, rid };
}

/** Load a lineage path for (root, head), for proveSuccession, proveHeadOwnership and the gate. */
export function loadLineage(sim, root, head) {
  sim.ps.lineagePath = sim.ledger.lineage.findPathForLeaf(pureCircuits.lineageLeafOf(root, head));
  return sim;
}

// ---------------------------------------------------------------------------
// CONCURRENCY: the pattern of test/concurrency.test.js. A proof is built
// against a snapshot of the state and not applied; later it is REPLAYED, as a
// node would, against whatever state it lands on.
// ---------------------------------------------------------------------------
const GAS = { readTime: 10n ** 12n, computeTime: 10n ** 12n, bytesWritten: 10n ** 9n, bytesDeleted: 10n ** 9n };

/** The current contract state: the snapshot a prover builds against. */
export const snapshot = (sim) => sim.ctx.currentQueryContext.state;

/** Prove `circuit` against `state` with the sim's current witnesses, WITHOUT applying it. */
export function proveAgainst(sim, state, circuit, ...args) {
  const ctx = rt.createCircuitContext(sim.address, sim.zswap, state, sim.privateState, undefined, undefined, sim.now);
  ctx.currentQueryContext.block = { ...ctx.currentQueryContext.block, secondsSinceEpoch: BigInt(sim.now) };
  return sim.contract.impureCircuits[circuit](ctx, ...args);
}

/** Replay a pending proof's public transcript against `state`, exactly as a node would. Returns the new state. */
export function replay(sim, state, pending, program = pending.proofData.publicTranscript) {
  const qc = new rt.QueryContext(state, sim.address);
  qc.block = { ...qc.block, secondsSinceEpoch: BigInt(sim.now) };
  return qc.runTranscript({ gas: GAS, effects: pending.context.currentQueryContext.effects, program },
    rt.CostModel.initialCostModel());
}

/** Land a pending proof on the sim itself: replay it on the current state and adopt the result. */
export function land(sim, pending) {
  const after = replay(sim, snapshot(sim), pending);
  sim.ctx = { ...sim.ctx, currentQueryContext: after.context ?? after };
  return sim;
}

export { pureCircuits, bytes32, fieldOf, DEFAULT_NOW, Lantern2Sim };
