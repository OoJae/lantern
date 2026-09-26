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
import { commitmentsOf, assertV2Card } from './identity.js';
import { DEFAULT_DELAY, checkDelay, periodOf, rootOf, slotOf, recoveryStatus, timelineOf, vetoAdvice } from './timeline.js';

const NO_RESERVATION = new Uint8Array(32);
const randomSeed = () => globalThis.crypto.getRandomValues(new Uint8Array(32));

// finalizeRecovery never opens its successor argument (a known gap, noted in
// the contract), so anyone holding a finalizable recovery can take a pending
// enrolment's idCommit, or a device's pending successor, first. The refusal
// keeps the contract's own words; this says what the owner does next.
const TAKEN = {
  'identity already enrolled': 'if you never enrolled this identity, a recovery may have been finalized to its '
    + 'commitment first: generate a fresh identity with newIdentity(), deal new shares, and enrol that',
  'successor already enrolled': 'someone may have finalized to this successor first: generate a fresh successor '
    + 'with newIdentity() and finalize again before the recovery expires (its expiresAt)',
};
function explainTaken(e) {
  const hit = Object.keys(TAKEN).find((k) => e?.message?.includes(k));
  return hit ? new Error(`${e.message}. ${TAKEN[hit]}`, { cause: e }) : e;
}

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
      try {
        call(owner, 'enrollIdentity', idCommit, vetoCommit, BigInt(threshold), checkDelay(delay));
      } catch (e) { throw explainTaken(e); }
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
    /**
     * The owner's veto. `nextDevice` is the public key of the owner's next
     * device, when they have lost this one: the veto reserves that device's
     * recovery, which a guardian may then open during the cooldown (review F0).
     * Refuses, before any transaction, to veto a recovery that is already dead:
     * that would only restart the cooldown (review F2).
     */
    veto(owner, rid, { nextDevice = null } = {}) {
      const advice = vetoAdvice(sim.ledger, rid, sim.now);
      if (!advice.ok) throw new Error(`not vetoing: ${advice.reason}`);
      const head = sim.ledger.recoveries.lookup(rid).idCommit;
      const nextRid = nextDevice ? pure.recoveryIdOf(head, nextDevice) : NO_RESERVATION;
      return call(owner, 'vetoRecovery', rid, nextRid);
    },
    /** Evict every guardian. The new context is derived from the root and a fresh seed; it is returned. */
    rotate: (owner, idCommit, seed = randomSeed()) => call(owner, 'rotateGuardianSet', idCommit, seed),
    lock: (owner, idCommit) => call(owner, 'lockIdentity', idCommit),
    /**
     * Unlock, with both secrets. Pass `newCard` ({ vetoSecret, vetoSalt }) to
     * replace a card someone may have copied in the same transaction (review
     * F3); without it the current card stays. A new card must be a v2 card
     * (src/v2/identity.js), as enrol's is.
     */
    unlock(owner, idCommit, { newCard = null } = {}) {
      const card = newCard ? assertV2Card(newCard) : owner;
      return call(owner, 'unlockIdentity', idCommit, pure.vetoCommitOf(card.vetoSecret, card.vetoSalt));
    },
    /** A check-in always names the identity ROOT, whatever the guardian passes (review F8). */
    checkIn: (guardian, idCommit) => call(guardian, 'checkIn', rootOf(sim.ledger, idCommit), period()),
    /** The device finalizes to a successor it generated. */
    finalize(device, rid, successor) {
      try {
        return call(device, 'finalizeRecovery', rid, successor.idCommit, successor.vetoCommit);
      } catch (e) { throw explainTaken(e); }
    },
    /** The reference host gate, as the owner of `idCommit` under `idRoot`. */
    gate: (owner, idRoot, idCommit, nonce) =>
      call({ ...owner, lineage: { root: idRoot, member: idCommit } }, 'hostGatedAction', idRoot, idCommit, nonce),

    /** This period's check-in count for the CURRENT guardian set. Takes the root or any commitment of its lineage. */
    checkInCount(idCommit, p = period()) {
      const L = sim.ledger;
      const idRoot = rootOf(L, idCommit);
      const key = pure.checkInKeyOf(idRoot, L.guardianCtx.lookup(idRoot), p);
      return L.checkIns.member(key) ? L.checkIns.lookup(key).read() : 0n;
    },
    /**
     * Everything a watcher shows for one identity, from the public ledger alone.
     * Takes the root or any commitment of its lineage (after a recovery, the
     * owner holds the head); an unknown commitment is refused with a clear error.
     */
    status(idCommit) {
      const L = sim.ledger;
      const idRoot = rootOf(L, idCommit);
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
