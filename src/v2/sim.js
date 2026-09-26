// Lantern v2, in memory, spoken to as its users would: an owner, guardians and
// a recovering device, each a persona whose private state is all its circuit
// calls can see. Built on src/contract-sim.js, so it runs the REAL generated
// circuits, refusals included.
//
// Runtime-free: the runtime and the compiled v2 module are passed in, so a test,
// the browser and a terminal script can all use it. (test/portable.test.js
// forbids any src/ file other than the bindings from importing either.)
//
// Personas are plain objects:
//   owner     { name, identitySecret, idSalt, vetoSecret, vetoSalt }
//   guardian  { name, guardianSecret, leafSalt, leaf }       leaf from addGuardian
//   device    { name, ephemeralSk, identitySecret, idSalt }  after rebuilding the secret
import { createContractSim } from '../contract-sim.js';
import { lantern2Witnesses } from './witnesses.js';
import { commitmentsOf } from './identity.js';
import { DEFAULT_DELAY, checkDelay, periodOf, slotOf, recoveryStatus, timelineOf } from './timeline.js';

export function createLantern2Sim({ rt, mod, now }) {
  const pure = mod.pureCircuits;
  let sim = null;
  const witnesses = lantern2Witnesses({ pure, clock: () => sim.now });
  sim = createContractSim({ rt, mod, witnesses, now });
  const call = (ps, circuit, ...args) => sim.callAs(ps, circuit, ...args);
  const period = () => periodOf(sim.now);

  return {
    sim,
    pure,
    get now() { return sim.now; },
    get ledger() { return sim.ledger; },
    get lastProofData() { return sim.lastProofData; },
    advance: (dt) => sim.advance(dt),
    setTime: (t) => sim.setTime(t),
    period,

    /** Enrol `owner` with a threshold and a delay (default 72 h). Returns the idCommit, which is the root. */
    enrol(owner, { threshold = 2, delay = DEFAULT_DELAY } = {}) {
      const { idCommit, vetoCommit } = commitmentsOf(pure, owner);
      call(owner, 'enrollIdentity', idCommit, vetoCommit, BigInt(threshold), checkDelay(delay));
      return idCommit;
    },
    /** The owner adds a guardian (both secrets). Returns the guardian with its leaf. */
    addGuardian(owner, idCommit, guardian) {
      const leaf = call({ ...owner, guardianSecret: guardian.guardianSecret, leafSalt: guardian.leafSalt },
        'addGuardian', idCommit);
      return { ...guardian, leaf };
    },
    /** A current guardian opens a recovery for a device's public key, in the current period. */
    open: (guardian, idCommit, ephemeralPk) => call(guardian, 'openRecovery', idCommit, ephemeralPk, period()),
    approve: (guardian, idCommit, rid) => call(guardian, 'approveRecovery', idCommit, rid),
    veto: (owner, rid) => call(owner, 'vetoRecovery', rid),
    rotate: (owner, idCommit, newCtx) => call(owner, 'rotateGuardianSet', idCommit, newCtx),
    lock: (owner, idCommit) => call(owner, 'lockIdentity', idCommit),
    unlock: (owner, idCommit) => call(owner, 'unlockIdentity', idCommit),
    checkIn: (guardian, idCommit) => call(guardian, 'checkIn', idCommit, period()),
    /** The device finalizes to a successor it generated. */
    finalize: (device, rid, successor) => call(device, 'finalizeRecovery', rid, successor.idCommit, successor.vetoCommit),
    /** The reference host gate, as the owner of `idCommit` under `idRoot`. */
    gate: (owner, idRoot, idCommit, nonce) =>
      call({ ...owner, lineage: { root: idRoot, member: idCommit } }, 'hostGatedAction', idRoot, idCommit, nonce),

    /** This period's check-in count for the root's CURRENT guardian set. */
    checkInCount(idRoot, p = period()) {
      const L = sim.ledger;
      const key = pure.checkInKeyOf(idRoot, L.guardianCtx.lookup(idRoot), p);
      return L.checkIns.member(key) ? L.checkIns.lookup(key).read() : 0n;
    },
    /** Everything a watcher shows for one identity root, from the public ledger alone. */
    status(idRoot) {
      const L = sim.ledger;
      const slot = slotOf(L, idRoot, sim.now);
      return {
        delay: Number(L.recoveryDelays.lookup(idRoot)),
        locked: L.locked.lookup(idRoot),
        slot,
        holder: slot.holder ? { status: slot.status, ...timelineOf(L.recoveries.lookup(slot.holder)) } : null,
        checkIns: { period: period(), count: this.checkInCount(idRoot) },
      };
    },
    recoveryStatus: (rid) => recoveryStatus(sim.ledger, rid, sim.now),
  };
}
