// The adversarial review of Lantern v2, finding by finding (docs/v2.md §3.10).
// Each describe block names the finding, and each test is the attack the
// review ran against the first build, now refused -- or the property that
// finding said was missing, now checked. The review's own scripts assumed the
// attacker wins every race; so do these tests.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as rt from '@midnight-ntwrk/compact-runtime';
import * as Lantern2 from '../contracts/managed-lantern2/contract/index.js';
import {
  pureCircuits as P, bytes32, fieldOf, hex,
  world, asGuardian, openAs, openAndApprove, recordOf, toUnlock, ephKey, ephSkFor, periodOf,
  snapshot, proveAgainst, replay, land,
  EPH_A, EPH_B, EPH_C, EPH_D, DAY, VETO_SLACK, NO_RESERVATION,
} from './v2-fixtures.js';
import { slotOf, periodBounds, checkInAt, vetoAdvice, cooldownOf, PERIOD } from '../src/v2/timeline.js';
import { newIdentity, commitmentsOf } from '../src/v2/identity.js';
import { createLantern2Sim } from '../src/v2/sim.js';

const NEW_ID = () => P.idCommitOf(fieldOf(70), bytes32(71));
const NEW_VETO = () => P.vetoCommitOf(fieldOf(80), bytes32(81));
const ANY_READ_MISMATCH = /mismatch between expected .* and actual .* read/;
const cooldownUntil = (sim, root) => {
  const v = sim.ledger.vetoCounts.lookup(root).read();
  return v === 0n ? 0 : Number(sim.ledger.lastVetoAt.lookup(root)) + cooldownOf(v);
};
/** The owner's key material as it sits in the sim after world(). */
const ownerOf = (sim) => ({
  identitySecret: sim.ps.identitySecret, idSalt: sim.ps.idSalt, vetoSecret: sim.ps.vetoSecret, vetoSalt: sim.ps.vetoSalt,
});
/** Enrol another identity in the same contract; returns its id and key material. */
function enrolOther(sim, seed) {
  const ps = { identitySecret: fieldOf(seed), idSalt: bytes32(seed + 1), vetoSecret: fieldOf(seed + 2), vetoSalt: bytes32(seed + 3) };
  const id = P.idCommitOf(ps.identitySecret, ps.idSalt);
  const saved = ownerOf(sim);
  Object.assign(sim.ps, ps);
  sim.call('enrollIdentity', id, P.vetoCommitOf(ps.vetoSecret, ps.vetoSalt), 2n, 86_400n);
  Object.assign(sim.ps, saved);
  return { id, ps };
}
/**
 * The colluders' script: at the cooldown's public end, the first colluder whose
 * quota for this period is unspent opens. If every colluder has spent theirs,
 * they wait for the next period. They always win the race.
 */
function colludersOpen(sim, id, colluders, eph) {
  const until = cooldownUntil(sim, id);
  if (sim.now < until) sim.setTime(until);
  for (let tries = 0; tries < 2; tries++) {
    for (const c of colluders) {
      try { return openAs(sim, c, id, eph); } catch (e) {
        if (!/already opened a recovery this period/.test(e.message)) throw e;
      }
    }
    sim.setTime(periodBounds(periodOf(sim.now) + 1n).start);
  }
  throw new Error('no colluder could open');
}
const approveAll = (sim, id, rid, gs) => { for (const g of gs) { asGuardian(sim, g); sim.call('approveRecovery', id, rid); } };

// ---------------------------------------------------------------------------
// F0 (high): colluders at quorum against an owner who lost the device.
// ---------------------------------------------------------------------------
describe('F0: the veto reserves the owner\'s next device, so colluders cannot win the race at the cooldown\'s end', () => {
  it('a colluder opening at the second the cooldown ends finds the owner\'s recovery already in the slot', () => {
    // 6 guardians, t = 3; guardians 3, 4 and 5 collude and pooled their shares.
    const { sim, id, guardians } = world({ n: 6, threshold: 3 });
    const honest = guardians.slice(0, 3), colluders = guardians.slice(3);
    const theirs = colludersOpen(sim, id, colluders, EPH_C);
    approveAll(sim, id, theirs, colluders);

    // The owner, with only the card, vetoes theirs and names the new phone's recovery.
    const reserved = P.recoveryIdOf(id, EPH_A);
    const vetoBlock = sim.now;
    sim.call('vetoRecovery', theirs, reserved);
    expect(hex(sim.ledger.reservedRecovery.lookup(id))).toBe(hex(reserved));

    // Inside the cooldown: a colluder is refused, and an honest guardian opens the reserved recovery at once.
    expect(() => openAs(sim, colluders[1], id, EPH_D)).toThrow(/cooling down after a veto/);
    const ownerRid = openAs(sim, honest[0], id, EPH_A);
    expect(hex(ownerRid)).toBe(hex(reserved));
    expect(sim.now).toBe(vetoBlock);   // no wait at all

    // The cooldown's public end: the colluders' script fires, and loses.
    sim.setTime(cooldownUntil(sim, id));
    expect(() => openAs(sim, colluders[1], id, EPH_D)).toThrow(/a recovery is already live for this identity/);
    expect(() => openAs(sim, colluders[2], id, EPH_B)).toThrow(/already live/);

    approveAll(sim, id, ownerRid, honest);
    toUnlock(sim, ownerRid);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    expect(() => sim.call('finalizeRecovery', ownerRid, NEW_ID(), NEW_VETO())).not.toThrow();
    expect(sim.ledger.retiredIdentities.member(id)).toBe(true);
  });

  it('with the veto count already at six (a 32-day cooldown), colluders who win every race still cannot keep the owner out', () => {
    const { sim, id, guardians } = world({ n: 6, threshold: 3 });
    const honest = guardians.slice(0, 3), colluders = guardians.slice(3);
    // Six rounds: the colluders open at every cooldown's end, reach quorum, and the owner vetoes without reserving.
    for (let v = 1; v <= 6; v++) {
      const rid = colludersOpen(sim, id, colluders, ephKey(40 + v));
      approveAll(sim, id, rid, colluders);
      sim.call('vetoRecovery', rid, NO_RESERVATION);
    }
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(6n);
    expect(cooldownUntil(sim, id) - Number(sim.ledger.lastVetoAt.lookup(id))).toBe(32 * DAY);

    // Round seven: they win the race again -- but this time the owner's veto reserves the new phone.
    const theirs = colludersOpen(sim, id, colluders, ephKey(47));
    approveAll(sim, id, theirs, colluders);
    sim.call('vetoRecovery', theirs, P.recoveryIdOf(id, EPH_A));
    const ownerRid = openAs(sim, honest[0], id, EPH_A);
    approveAll(sim, id, ownerRid, honest);
    for (const c of colluders) expect(() => openAs(sim, c, id, EPH_D)).toThrow(/cooling down|already opened/);
    toUnlock(sim, ownerRid);
    for (const c of colluders) expect(() => openAs(sim, c, id, EPH_D)).toThrow(/cooling down|already opened/);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    expect(() => sim.call('finalizeRecovery', ownerRid, NEW_ID(), NEW_VETO())).not.toThrow();
    // The owner holds the identity again long before the cooldown's public end, when the head they raced for is gone.
    expect(sim.now).toBeLessThan(cooldownUntil(sim, id));
    sim.setTime(cooldownUntil(sim, id));
    for (const c of colluders) expect(() => openAs(sim, c, id, EPH_D)).toThrow(/identity retired/);
  });

  it('if a colluder opens the reserved recovery, it is still the owner\'s: only the owner\'s device can finalize it', () => {
    const { sim, id, guardians } = world({ n: 5, threshold: 2 });
    const theirs = openAndApprove(sim, id, guardians.slice(3), 2, EPH_C);
    sim.call('vetoRecovery', theirs, P.recoveryIdOf(id, EPH_A));
    const rid = openAs(sim, guardians[4], id, EPH_A);   // a colluder takes the reserved slot
    approveAll(sim, id, rid, guardians.slice(0, 2));
    toUnlock(sim, rid);
    sim.ps.ephemeralSk = ephSkFor(EPH_C);   // the colluders' device key
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).toThrow(/not the device the guardians approved/);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).not.toThrow();
  });

  it('a reservation lifts only the cooldown: it needs a current guardian, and it cannot displace a recovery in the slot', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const r1 = openAs(sim, guardians[0], id, EPH_C);
    sim.call('vetoRecovery', r1, P.recoveryIdOf(id, EPH_A));
    // A stranger holding a real path but not its secret.
    asGuardian(sim, guardians[1]);
    sim.ps.guardianSecret = bytes32(5555);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    expect(() => sim.call('openRecovery', id, EPH_A, periodOf(sim.now))).toThrow(/does not bind/);
    // After the cooldown someone else's recovery takes the slot; the reservation does not displace it.
    sim.setTime(cooldownUntil(sim, id));
    openAs(sim, guardians[1], id, EPH_B);
    expect(() => openAs(sim, guardians[2], id, EPH_A)).toThrow(/already live/);
  });

  it('a reservation opens one recovery, once, and a later veto replaces it', () => {
    const { sim, id, guardians } = world({ n: 4 });
    const r1 = openAs(sim, guardians[0], id, EPH_C);
    sim.call('vetoRecovery', r1, P.recoveryIdOf(id, EPH_A));
    const r2 = openAs(sim, guardians[1], id, EPH_A);
    // The owner vetoes the reserved one too (say it was a mistake) and reserves nothing.
    sim.call('vetoRecovery', r2, NO_RESERVATION);
    expect(() => openAs(sim, guardians[2], id, EPH_A)).toThrow(/recovery already open/);
    expect(() => openAs(sim, guardians[2], id, EPH_B)).toThrow(/cooling down after a veto/);
    expect(hex(sim.ledger.reservedRecovery.lookup(id))).toBe(hex(NO_RESERVATION));
  });

  it('a reservation names the head, so it dies with a finalize and gives the successor no way round the cooldown', () => {
    // A 24 h delay, so the successor exists while a 2-day cooldown is still running.
    const { sim, id, guardians } = world({ n: 4, delay: DAY });
    sim.call('vetoRecovery', openAs(sim, guardians[3], id, EPH_C), NO_RESERVATION);
    sim.setTime(cooldownUntil(sim, id));
    sim.call('vetoRecovery', openAs(sim, guardians[2], id, EPH_D), P.recoveryIdOf(id, EPH_A));
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(2n);
    const rid = openAndApprove(sim, id, guardians, 2, EPH_A);
    toUnlock(sim, rid);
    sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    expect(sim.now).toBeLessThan(cooldownUntil(sim, id));
    // The same device key for the successor is a different rid: the cooldown applies.
    expect(() => openAs(sim, guardians[1], NEW_ID(), EPH_A)).toThrow(/cooling down after a veto/);
    sim.setTime(cooldownUntil(sim, id));
    expect(() => openAs(sim, guardians[1], NEW_ID(), EPH_A)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// F1 (medium): front-running a rotation or an enrolment with a chosen context.
// ---------------------------------------------------------------------------
describe('F1: the rotation\'s context is derived from the root, so nobody watching pending transactions can take it', () => {
  it('a watcher who copies a pending rotation\'s context, or its seed, gets a context of their own', () => {
    const { sim, id } = world();
    const alice = ownerOf(sim);
    const bob = enrolOther(sim, 950);
    const seed = bytes32(4242);
    const pending = proveAgainst(sim, snapshot(sim), 'rotateGuardianSet', id, seed);
    const aliceCtx = pending.result;   // public in the pending transaction
    expect(hex(aliceCtx)).toBe(hex(P.guardianCtxOf(id, seed)));

    // Bob rotates his throwaway identity first, with everything the pending transaction shows:
    // its context, and its seed (an argument, and so public).
    Object.assign(sim.ps, bob.ps);
    const tried = [sim.call('rotateGuardianSet', bob.id, aliceCtx), sim.call('rotateGuardianSet', bob.id, seed)];
    for (const c of tried) expect(hex(c)).not.toBe(hex(aliceCtx));

    Object.assign(sim.ps, alice);
    expect(() => land(sim, pending)).not.toThrow();
    expect(hex(sim.ledger.guardianCtx.lookup(id))).toBe(hex(aliceCtx));
  });

  it('a watcher cannot block an enrolment by claiming its pending idCommit as a context', () => {
    const { sim } = world();
    const bob = enrolOther(sim, 950);
    const carol = { identitySecret: fieldOf(960), idSalt: bytes32(961), vetoSecret: fieldOf(962), vetoSalt: bytes32(963) };
    const carolId = P.idCommitOf(carol.identitySecret, carol.idSalt);
    Object.assign(sim.ps, carol);
    const pending = proveAgainst(sim, snapshot(sim), 'enrollIdentity',
      carolId, P.vetoCommitOf(carol.vetoSecret, carol.vetoSalt), 2n, 86_400n);

    Object.assign(sim.ps, bob.ps);
    const ctx = sim.call('rotateGuardianSet', bob.id, carolId);
    expect(hex(ctx)).not.toBe(hex(carolId));
    expect(sim.ledger.usedGuardianCtx.member(carolId)).toBe(false);
    expect(() => land(sim, pending)).not.toThrow();
    expect(sim.ledger.enrolled.member(carolId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F2 (medium-low): a veto bringing back the cooldown a rotation reset.
// ---------------------------------------------------------------------------
describe('F2: a veto of a recovery from a rotated-out set changes no rate-limit state', () => {
  it('rotate, then veto the harasser\'s recovery: it is killed, and the count stays at zero', () => {
    const { sim, id, guardians } = world();
    const harasser = openAs(sim, guardians[0], id, EPH_A);
    sim.call('rotateGuardianSet', id, bytes32(501));
    sim.call('vetoRecovery', harasser, P.recoveryIdOf(id, EPH_B));
    expect(sim.ledger.killed.member(harasser)).toBe(true);
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(0n);
    expect(sim.ledger.lastVetoAt.lookup(id)).toBe(0n);
    expect(sim.ledger.reservedRecovery.member(id)).toBe(false);
    sim.ps.guardianSecret = bytes32(300); sim.ps.leafSalt = bytes32(301);
    const fresh = { secret: bytes32(300), salt: bytes32(301), leaf: sim.call('addGuardian', id) };
    expect(() => openAs(sim, fresh, id, EPH_C)).not.toThrow();
  });

  it('a veto proved before a rotation and landing after it is refused on replay; re-proved, it counts nothing', () => {
    const { sim, id, guardians } = world();
    const harasser = openAs(sim, guardians[0], id, EPH_A);
    const pending = proveAgainst(sim, snapshot(sim), 'vetoRecovery', harasser, NO_RESERVATION);
    sim.call('rotateGuardianSet', id, bytes32(502));
    expect(() => replay(sim, snapshot(sim), pending)).toThrow(ANY_READ_MISMATCH);
    sim.call('vetoRecovery', harasser, NO_RESERVATION);
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(0n);
  });

  it('a veto of a live recovery at quorum, proved just before approveBy, still lands after it', () => {
    // Why the contract checks only the context: a full dead-check would bind approveBy and fail this replay.
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.setTime(Number(recordOf(sim, rid).approveBy) - 1);
    const pending = proveAgainst(sim, snapshot(sim), 'vetoRecovery', rid, NO_RESERVATION);
    sim.advance(60);
    expect(() => land(sim, pending)).not.toThrow();
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(1n);
  });

  it('the client refuses to veto a recovery that already missed quorum or expired; the contract alone would count it', () => {
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    const owner = newIdentity();
    const root = L.enrol(owner);
    const rand32 = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
    const gs = [0, 1].map(() => L.addGuardian(owner, root, { guardianSecret: rand32(), leafSalt: rand32() }));
    const rid = L.open(gs[0], root, rand32());
    L.setTime(Number(L.ledger.recoveries.lookup(rid).approveBy));
    expect(vetoAdvice(L.ledger, rid, L.now)).toMatchObject({ ok: false, status: 'missed-quorum' });
    expect(() => L.veto(owner, rid)).toThrow(/already dead \(missed-quorum\)/);
    expect(L.ledger.vetoCounts.lookup(root).read()).toBe(0n);
    // The residual the client closes: sent anyway, the contract counts it.
    L.sim.callAs(owner, 'vetoRecovery', rid, NO_RESERVATION);
    expect(L.ledger.vetoCounts.lookup(root).read()).toBe(1n);
  });

  it('vetoAdvice: yes while a recovery can still finalize, no once it expired or was rotated out', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAndApprove(sim, id, guardians, 2);
    expect(vetoAdvice(sim.ledger, rid, sim.now)).toMatchObject({ ok: true, status: 'in-delay' });
    toUnlock(sim, rid);
    expect(vetoAdvice(sim.ledger, rid, sim.now)).toMatchObject({ ok: true, status: 'finalizable' });
    expect(vetoAdvice(sim.ledger, rid, Number(recordOf(sim, rid).expiresAt))).toMatchObject({ ok: false, status: 'expired' });
    sim.call('rotateGuardianSet', id, bytes32(504));
    expect(vetoAdvice(sim.ledger, rid, sim.now)).toMatchObject({ ok: false, status: 'rotated-out' });
    expect(vetoAdvice(sim.ledger, bytes32(1), sim.now)).toMatchObject({ ok: false, reason: 'no such recovery' });
  });
});

// ---------------------------------------------------------------------------
// F3 (medium): a card copier's lock ping-pong.
// ---------------------------------------------------------------------------
describe('F3: unlocking replaces the card, so whoever copied it cannot lock again', () => {
  const asCopier = (sim, card) => { sim.ps.identitySecret = fieldOf(7070); sim.ps.idSalt = bytes32(7071); Object.assign(sim.ps, card); };

  it('the copier locks, the owner unlocks with a new card, and the copier can lock and veto no more', () => {
    const { sim, id, idRoot, guardians } = world({ n: 3 });
    const owner = ownerOf(sim);
    const copied = { vetoSecret: owner.vetoSecret, vetoSalt: owner.vetoSalt };
    const newCard = { vetoSecret: fieldOf(6161), vetoSalt: bytes32(6162) };
    asCopier(sim, copied);
    sim.call('lockIdentity', id);

    Object.assign(sim.ps, owner);
    sim.call('unlockIdentity', id, P.vetoCommitOf(newCard.vetoSecret, newCard.vetoSalt));
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);

    asCopier(sim, copied);
    for (let i = 0; i < 10; i++) expect(() => sim.call('lockIdentity', id)).toThrow(/locking requires the veto secret/);
    const rid = openAs(sim, guardians[0], id, EPH_A);
    expect(() => sim.call('vetoRecovery', rid, NO_RESERVATION)).toThrow(/veto secret does not open/);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);

    // The owner's gate works, and the NEW card does everything the old one did.
    Object.assign(sim.ps, owner, newCard);
    sim.ps.lineagePath = sim.ledger.lineage.findPathForLeaf(P.lineageLeafOf(idRoot, id));
    expect(() => sim.call('hostGatedAction', idRoot, id, bytes32(1))).not.toThrow();
    expect(() => sim.call('vetoRecovery', rid, NO_RESERVATION)).not.toThrow();
    sim.call('lockIdentity', id);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(true);
  });

  it('unlocking with the current commitment keeps the card; a thief with only the identity secret cannot replace it', () => {
    const { sim, id } = world();
    const owner = ownerOf(sim);
    const before = hex(sim.ledger.vetoCommits.lookup(id));
    sim.call('unlockIdentity', id, sim.ledger.vetoCommits.lookup(id));
    expect(hex(sim.ledger.vetoCommits.lookup(id))).toBe(before);
    sim.ps.vetoSecret = fieldOf(6060); sim.ps.vetoSalt = bytes32(6061);   // the thief's own "card"
    expect(() => sim.call('unlockIdentity', id, P.vetoCommitOf(fieldOf(6060), bytes32(6061))))
      .toThrow(/unlocking requires the veto secret/);
    expect(hex(sim.ledger.vetoCommits.lookup(id))).toBe(before);
    Object.assign(sim.ps, owner);
    expect(() => sim.call('lockIdentity', id)).not.toThrow();
  });

  it("the copier's lock and veto, proved before the card was replaced, fail on replay after it", () => {
    const { sim, id, idRoot, guardians } = world({ n: 3 });
    const owner = ownerOf(sim);
    const rid = openAs(sim, guardians[0], id, EPH_A);
    asCopier(sim, { vetoSecret: owner.vetoSecret, vetoSalt: owner.vetoSalt });
    const lock = proveAgainst(sim, snapshot(sim), 'lockIdentity', id);
    const veto = proveAgainst(sim, snapshot(sim), 'vetoRecovery', rid, NO_RESERVATION);
    Object.assign(sim.ps, owner);
    sim.call('unlockIdentity', id, P.vetoCommitOf(fieldOf(6161), bytes32(6162)));
    expect(() => replay(sim, snapshot(sim), lock)).toThrow(ANY_READ_MISMATCH);
    expect(() => replay(sim, snapshot(sim), veto)).toThrow(ANY_READ_MISMATCH);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);
    expect(sim.ledger.killed.member(rid)).toBe(false);
  });

  it('src/v2/sim.js unlocks with a new card when given one, and keeps the card otherwise', () => {
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    const owner = newIdentity();
    const root = L.enrol(owner);
    L.lock(owner, root);
    L.unlock(owner, root);
    expect(hex(L.ledger.vetoCommits.lookup(root))).toBe(hex(commitmentsOf(P, owner).vetoCommit));
    const next = newIdentity();
    L.unlock(owner, root, { newCard: next });
    expect(hex(L.ledger.vetoCommits.lookup(root))).toBe(hex(commitmentsOf(P, next).vetoCommit));
    expect(() => L.lock(owner, root)).toThrow(/locking requires the veto secret/);
    expect(() => L.lock({ ...owner, vetoSecret: next.vetoSecret, vetoSalt: next.vetoSalt }, root)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// F4 (low): a veto proof going stale 600 s after its claimed time.
// ---------------------------------------------------------------------------
describe('F4: the veto has its own one-hour bracket', () => {
  it('a veto proved now still lands 3,599 s later', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    const proved = sim.now;
    const pending = proveAgainst(sim, snapshot(sim), 'vetoRecovery', rid, NO_RESERVATION);
    sim.advance(VETO_SLACK - 1);
    expect(() => land(sim, pending)).not.toThrow();
    expect(sim.ledger.killed.member(rid)).toBe(true);
    expect(Number(sim.ledger.lastVetoAt.lookup(id))).toBe(proved + VETO_SLACK);
    expect(VETO_SLACK).toBe(3_600);
  });

  it('and is stale at 3,600 s, as a replay the node refuses', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    const pending = proveAgainst(sim, snapshot(sim), 'vetoRecovery', rid, NO_RESERVATION);
    sim.advance(VETO_SLACK);
    expect(() => replay(sim, snapshot(sim), pending)).toThrow();
    expect(sim.ledger.killed.member(rid)).toBe(false);
  });

  it('the open keeps its 600 s bracket', () => {
    expect(Number(P.openSlackSeconds())).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// F6 (low): the client disagreeing with the contract after a rotation.
// ---------------------------------------------------------------------------
describe('F6: slotOf agrees with the contract', () => {
  it('right after veto then rotate, canOpen is true, and the contract accepts the open in that same second', () => {
    const { sim, id, guardians } = world();
    sim.call('vetoRecovery', openAs(sim, guardians[0], id, EPH_A), NO_RESERVATION);
    sim.call('rotateGuardianSet', id, bytes32(503));
    expect(sim.now).toBeLessThan(Number(sim.ledger.lastVetoAt.lookup(id)));   // the case the review found
    expect(slotOf(sim.ledger, id, sim.now)).toMatchObject({ vetoes: 0, cooldownUntil: 0, canOpen: true });
    sim.ps.guardianSecret = bytes32(300); sim.ps.leafSalt = bytes32(301);
    const fresh = { secret: bytes32(300), salt: bytes32(301), leaf: sim.call('addGuardian', id) };
    expect(() => openAs(sim, fresh, id, EPH_B)).not.toThrow();
  });

  it('reports the reserved recovery, which can open while canOpen is still false', () => {
    const { sim, id, guardians } = world();
    const reserved = P.recoveryIdOf(id, EPH_A);
    sim.call('vetoRecovery', openAs(sim, guardians[0], id, EPH_C), reserved);
    const slot = slotOf(sim.ledger, id, sim.now);
    expect(slot).toMatchObject({ canOpen: false, canOpenReserved: true });
    expect(hex(slot.reserved)).toBe(hex(reserved));
    openAs(sim, guardians[1], id, EPH_A);
    expect(slotOf(sim.ledger, id, sim.now)).toMatchObject({ free: false, canOpenReserved: false });
  });
});

// ---------------------------------------------------------------------------
// F7 / F8 (low, privacy): check-in timing, and the check-in's argument.
// ---------------------------------------------------------------------------
describe('F7: a guardian\'s client sends the check-in at a random moment, never at once', () => {
  const now = 1_700_000_000;
  it('stays inside [now + 1, now + window) and inside the period', () => {
    const { end } = periodBounds(periodOf(now));
    for (const r of [0, 0.25, 0.5, 0.999999]) {
      const t = checkInAt(now, { rng: () => r });
      expect(t).toBeGreaterThan(now);
      expect(t).toBeLessThan(now + 7 * DAY);
      expect(t).toBeLessThan(end);
      expect(periodOf(t)).toBe(periodOf(now));
    }
    expect(checkInAt(now, { rng: () => 0 })).toBe(now + 1);
  });

  it('near the end of a period it waits only until the margin, and at the margin it sends at once', () => {
    const { end } = periodBounds(periodOf(now));
    const late = end - 2 * 3_600;
    expect(checkInAt(late, { rng: () => 0.999999 })).toBeLessThan(end - 3_600);
    expect(checkInAt(end - 60, { rng: () => 0.5 })).toBe(end - 60);
    expect(PERIOD).toBe(7_862_400);
  });
});

describe('F8: every check-in names the root, whoever sends it', () => {
  // The circuit's first argument, decoded as the node decodes it. The proof's
  // `input.value` is the runtime's ALIGNED encoding, which drops a Bytes<32>'s
  // trailing zero bytes: a root ending in 0x00 is carried as 31 bytes. Comparing
  // that raw atom with the 32-byte root failed about one run in 256, whenever a
  // random root happened to end in 0x00 -- this suite's one unexplained flake.
  const firstArg = (pd) => new rt.CompactTypeBytes(32).fromValue([pd.input.value[0]]);
  function checkInFromSuccessor(owner) {
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    const root = L.enrol(owner);
    const rand32 = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
    const gs = [0, 1].map(() => L.addGuardian(owner, root, { guardianSecret: rand32(), leafSalt: rand32() }));
    const deviceSk = rand32();
    const rid = L.open(gs[0], root, P.ephemeralPkOf(deviceSk));
    for (const g of gs) L.approve(g, root, rid);
    L.setTime(L.status(root).holder.unlockAt);
    const next = newIdentity();
    L.finalize({ ephemeralSk: deviceSk, identitySecret: owner.identitySecret, idSalt: owner.idSalt }, rid, commitmentsOf(P, next));
    const successor = commitmentsOf(P, next).idCommit;
    expect(() => L.checkIn(gs[1], successor)).not.toThrow();
    expect(hex(firstArg(L.lastProofData))).toBe(hex(root));
    expect(hex(firstArg(L.lastProofData))).not.toBe(hex(successor));
    expect(L.checkInCount(root)).toBe(1n);
    return { root, pd: L.lastProofData };
  }

  it('src/v2/sim.js normalises a successor\'s commitment to the root, and the count goes up', () => {
    checkInFromSuccessor(newIdentity());
  });

  it('regression: a root that ends in 0x00 is still named, though its aligned atom is 31 bytes', () => {
    // A fixed owner whose v2 root ends in 0x00, so the case the random test hit
    // one run in 256 is exercised on every run.
    const seq = (...xs) => { let i = 0; return () => xs[i++]; };
    const { root, pd } = checkInFromSuccessor(newIdentity(seq(1072n, 101072n)));
    expect(root[31]).toBe(0);
    expect(pd.input.value[0]).toHaveLength(31);
  });
});

// ---------------------------------------------------------------------------
// F5 (info): the shared trees.
// ---------------------------------------------------------------------------
describe('F5: both shared trees hold 2^32 leaves', () => {
  it('every guardian and lineage path is 32 levels deep', () => {
    const { sim, id, guardians } = world();
    expect(sim.findPath(guardians[0].leaf).path).toHaveLength(32);
    expect(sim.ledger.lineage.findPathForLeaf(P.lineageLeafOf(id, id)).path).toHaveLength(32);
  });

  it('the source declares depth 32 for both trees and both witnesses, and no depth-20 path remains', () => {
    const src = readFileSync(new URL('../contracts/v2/lantern2.compact', import.meta.url), 'utf8');
    expect(src.match(/HistoricMerkleTree<32, Bytes<32>>/g)).toHaveLength(2);
    expect(src.match(/MerkleTreePath<32, Bytes<32>>/g)).toHaveLength(2);
    expect(src).not.toMatch(/<20, Bytes<32>>/);
  });
});

// ---------------------------------------------------------------------------
// Regression: a claimed time near 2^64 is a checked cast failure, never a wrap.
// ---------------------------------------------------------------------------
describe('regression: claimedNow near 2^64', () => {
  // The compiler's checked-cast refusal, without its source position. A wrapping
  // cast would still be refused, by blockTimeGte ("claimed time is in the
  // future"), so a bare toThrow() could not tell a checked cast from a wrap.
  const CAST_OVERFLOW = /cast from Field or Uint value to smaller Uint value failed/;
  const MAX64 = 2n ** 64n - 1n;

  it('an open and a veto claiming 2^64 - 1 are refused by the checked cast, and change nothing', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    sim.ps.claimedNow = MAX64;
    expect(() => sim.call('vetoRecovery', rid, NO_RESERVATION)).toThrow(CAST_OVERFLOW);
    expect(sim.ledger.killed.member(rid)).toBe(false);
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(0n);
    sim.ps.claimedNow = undefined;
    sim.call('vetoRecovery', rid, NO_RESERVATION);
    sim.setTime(cooldownUntil(sim, id));
    sim.ps.claimedNow = MAX64;
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(CAST_OVERFLOW);
    expect(sim.ledger.recoveries.member(P.recoveryIdOf(id, EPH_B))).toBe(false);
  });

  it('the veto\'s overflow edge is exact: lo + slack = 2^64 is the cast, one second less is the clock', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    const slack = BigInt(VETO_SLACK);
    sim.ps.claimedNow = MAX64 + 1n - slack;          // hi = 2^64: does not fit
    expect(() => sim.call('vetoRecovery', rid, NO_RESERVATION)).toThrow(CAST_OVERFLOW);
    sim.ps.claimedNow = MAX64 - slack;               // hi = 2^64 - 1: fits, and is refused as the future
    expect(() => sim.call('vetoRecovery', rid, NO_RESERVATION)).toThrow(/claimed time is in the future/);
    expect(sim.ledger.killed.member(rid)).toBe(false);
  });
});
