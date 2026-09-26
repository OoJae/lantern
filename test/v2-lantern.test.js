// v1's test/lantern.test.js, ported to v2 (docs/v2.md §10). Every v1 property
// still holds; the adaptations are (a) enrolment takes a delay, (b) a guardian
// opens, (c) a second recovery for one identity waits for the first to die and
// for the cooldown, and (d) the timelock is the record's own unlockAt.
import { describe, it, expect } from 'vitest';
import {
  Lantern2Sim, pureCircuits, bytes32, fieldOf,
  world, asGuardian, openAs, openAndApprove, recordOf, toUnlock, vetoAndCool, idCommit, vetoCommit,
  ID_SECRET, ID_SALT, VETO_SECRET, VETO_SALT, EPH_A, EPH_B, DELAY, SLACK, hex,
} from './v2-fixtures.js';
import { assertNoLeak, scanProofData } from '../src/leakscan.js';

const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));
const D = BigInt(DELAY);

describe('v2 enrolment', () => {
  it('enrols an identity, its threshold, its veto commitment and its delay', () => {
    const { sim, id } = world();
    expect(sim.ledger.enrolled.member(id)).toBe(true);
    expect(sim.ledger.thresholds.lookup(id)).toBe(2n);
    expect(hex(sim.ledger.vetoCommits.lookup(id))).toBe(hex(vetoCommit()));
    expect(sim.ledger.recoveryDelays.lookup(id)).toBe(D);
    // v2's seeds: unlocked, no vetoes, no veto time, no recovery in the slot.
    expect(sim.ledger.locked.lookup(id)).toBe(false);
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(0n);
    expect(sim.ledger.lastVetoAt.lookup(id)).toBe(0n);
    expect(sim.ledger.liveRecovery.member(id)).toBe(false);
  });

  it('rejects a duplicate enrolment', () => {
    const { sim, id } = world();
    expect(() => sim.call('enrollIdentity', id, vetoCommit(), 2n, D)).toThrow(/already enrolled/);
  });

  it('rejects a threshold below 2', () => {
    const sim = new Lantern2Sim();
    expect(() => sim.call('enrollIdentity', idCommit(), vetoCommit(), 1n, D))
      .toThrow(/threshold must be at least 2/);
  });

  it('rejects an enroller who does not hold the identity secret', () => {
    const sim = new Lantern2Sim({ identitySecret: fieldOf(999) });
    expect(() => sim.call('enrollIdentity', idCommit(), vetoCommit(), 2n, D))
      .toThrow(/does not hold the identity secret/);
  });

  it('rejects a guardian added by someone who is not the owner', () => {
    const { sim, id } = world();
    sim.ps.identitySecret = fieldOf(999);
    expect(() => sim.call('addGuardian', id)).toThrow(/not the identity owner/);
  });
});

describe('v2 opening a recovery', () => {
  it('returns the identity-bound rid, seeds a zero counter and freezes the timeline', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    expect(hex(rid)).toBe(hex(pureCircuits.recoveryIdOf(id, EPH_A)));
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(0n);
    const rec = recordOf(sim, rid);
    expect(rec.openedAtLo).toBeLessThanOrEqual(BigInt(sim.now));
    expect(rec.openedAtHi).toBe(rec.openedAtLo + BigInt(SLACK));
    expect(rec.unlockAt).toBe(rec.openedAtHi + D);
    expect(hex(sim.ledger.liveRecovery.lookup(id))).toBe(hex(rid));
  });

  // The rid check comes first, so this is v1's refusal, not the one-live rule.
  it('rejects a second open on the same recovery', () => {
    const { sim, id, guardians } = world();
    openAs(sim, guardians[0], id, EPH_A);
    expect(() => openAs(sim, guardians[1], id, EPH_A)).toThrow(/recovery already open/);
  });

  it('rejects a claimed time in the future', () => {
    const { sim, id, guardians } = world();
    sim.ps.claimedNow = sim.now + 100_000;
    expect(() => openAs(sim, guardians[0], id, EPH_A)).toThrow(/in the future/);
  });

  it('rejects a claimed time that is too stale', () => {
    const { sim, id, guardians } = world();
    sim.ps.claimedNow = sim.now - 100_000;
    expect(() => openAs(sim, guardians[0], id, EPH_A)).toThrow(/too far in the past/);
  });
});

describe('v2 approval', () => {
  it('counts approvals (regression: the counter used to reset to zero)', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(2n);
  });

  it('enforces one-shot per guardian per recovery', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 1);
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/already approved/);
  });

  // (c): the first recovery is vetoed and the 1-day cooldown waited out; the
  // other guardian opens the second, since the first already opened this period.
  it('lets the same guardian approve a different recovery', () => {
    const { sim, id, guardians } = world();
    const ridA = openAndApprove(sim, id, guardians, 1, EPH_A);
    vetoAndCool(sim, ridA);
    const ridB = openAs(sim, guardians[1], id, EPH_B);
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('approveRecovery', id, ridB)).not.toThrow();
  });

  it('rejects a forged guardian secret', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    asGuardian(sim, guardians[0]);
    sim.ps.guardianSecret = bytes32(777);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow();
  });

  it('rejects a valid path that does not bind to the caller (leaf-binding assert)', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    sim.ps.guardianSecret = guardians[0].secret;
    sim.ps.leafSalt = guardians[0].salt;
    sim.ps.guardianPath = sim.findPath(guardians[1].leaf);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/does not bind/);
  });
});

describe('v2 cross-identity approval inflation (regression)', () => {
  it("cannot inflate another identity's approval count", () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);

    const mSecret = fieldOf(500), mSalt = bytes32(501);
    const mId = pureCircuits.idCommitOf(mSecret, mSalt);
    sim.ps.identitySecret = mSecret; sim.ps.idSalt = mSalt;
    sim.ps.vetoSecret = fieldOf(502); sim.ps.vetoSalt = bytes32(503);
    sim.call('enrollIdentity', mId, pureCircuits.vetoCommitOf(fieldOf(502), bytes32(503)), 2n, D);
    sim.ps.guardianSecret = bytes32(600); sim.ps.leafSalt = bytes32(601);
    const mLeaf = sim.call('addGuardian', mId);
    sim.ps.guardianPath = sim.findPath(mLeaf);

    expect(() => sim.call('approveRecovery', mId, rid)).toThrow(/not for this identity/);
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(0n);
  });
});

describe('v2 veto', () => {
  it('kills an in-flight recovery for the veto-secret holder', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.call('vetoRecovery', rid);
    expect(sim.ledger.killed.member(rid)).toBe(true);
  });

  it('cannot be performed with the identity secret (the judged flaw)', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.ps.vetoSecret = ID_SECRET;
    sim.ps.vetoSalt = ID_SALT;
    expect(() => sim.call('vetoRecovery', rid)).toThrow(/veto secret does not open/);
  });

  it('cannot be performed by a colluding guardian', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.ps.vetoSecret = fieldOf(666);
    expect(() => sim.call('vetoRecovery', rid)).toThrow(/veto secret does not open/);
  });

  it('cannot be replayed onto the same recovery', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.call('vetoRecovery', rid);
    expect(() => sim.call('vetoRecovery', rid)).toThrow(/veto already used/);
  });

  // (c): the second attempt can only open once the first is dead and the
  // cooldown has passed, and only from a guardian with an open left.
  it('is per-recovery, so the owner can veto a second attempt', () => {
    const { sim, id, guardians } = world();
    const ridA = openAndApprove(sim, id, guardians, 1, EPH_A);
    vetoAndCool(sim, ridA);
    const ridB = openAs(sim, guardians[1], id, EPH_B);
    expect(() => sim.call('vetoRecovery', ridB)).not.toThrow();
  });
});

describe('v2 finalize', () => {
  const finalize = (sim, rid) => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());

  it('succeeds and enrols the successor atomically', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    finalize(sim, rid);

    expect(sim.ledger.retiredIdentities.member(id)).toBe(true);
    expect(sim.ledger.enrolled.member(NEW_ID())).toBe(true);
    expect(sim.ledger.thresholds.lookup(NEW_ID())).toBe(2n);
    expect(hex(sim.ledger.vetoCommits.lookup(NEW_ID()))).toBe(hex(NEW_VETO()));
    expect(sim.ledger.lineage.findPathForLeaf(pureCircuits.lineageLeafOf(id, NEW_ID()))).toBeDefined();
    expect(hex(sim.ledger.idRoots.lookup(NEW_ID()))).toBe(hex(id));
  });

  it('rejects a finaliser who is not the device the guardians approved', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    sim.ps.ephemeralSk = bytes32(4040);
    expect(() => finalize(sim, rid)).toThrow(/not the device the guardians approved/);
  });

  it('rejects a secret that does not open the commitment', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    sim.ps.identitySecret = fieldOf(777);
    expect(() => finalize(sim, rid)).toThrow(/does not open idCommit/);
  });

  it('rejects the right secret with the wrong salt', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    sim.ps.idSalt = bytes32(888);
    expect(() => finalize(sim, rid)).toThrow(/does not open idCommit/);
  });

  it('rejects below threshold', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 1);
    toUnlock(sim, rid);
    expect(() => finalize(sim, rid)).toThrow(/not enough approvals/);
  });

  // (d): against the record's own unlockAt, to the second.
  it('rejects before the timelock elapses', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid, -1);
    expect(() => finalize(sim, rid)).toThrow(/timelock has not elapsed/);
  });

  it('rejects a vetoed recovery', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.call('vetoRecovery', rid);
    toUnlock(sim, rid);
    expect(() => finalize(sim, rid)).toThrow(/recovery vetoed/);
  });

  it('refuses to open a new recovery on a retired identity', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    finalize(sim, rid);
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(/identity retired/);
  });

  it('cannot replay a finalize on an already-retired identity', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    finalize(sim, rid);
    expect(() => finalize(sim, rid)).toThrow(/already retired|successor already enrolled/);
  });
});

// Every privacy assertion goes through assertNoLeak, which first requires the
// secret to be FOUND in the private transcript.
describe('v2 privacy', () => {
  it('never leaks the guardian secret or salt on approval', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    asGuardian(sim, guardians[1]);
    sim.call('approveRecovery', id, rid);
    assertNoLeak(sim.lastProofData, { guardianSecret: guardians[1].secret, leafSalt: guardians[1].salt });
  });

  // NEW in v2: the open now carries a membership proof, so it now reads a
  // guardian secret and salt, and must leak neither.
  it('never leaks the opening guardian\'s secret or salt on open', () => {
    const { sim, id, guardians } = world();
    openAs(sim, guardians[0], id, EPH_A);
    assertNoLeak(sim.lastProofData, { guardianSecret: guardians[0].secret, leafSalt: guardians[0].salt });
  });

  it('never leaks the identity secret, its salt or the device key on finalize', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    assertNoLeak(sim.lastProofData, {
      identitySecret: ID_SECRET, idSalt: ID_SALT, ephemeralSk: sim.ps.ephemeralSk,
    });
  });

  it('never leaks the veto secret or salt on veto', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.call('vetoRecovery', rid);
    assertNoLeak(sim.lastProofData, { vetoSecret: VETO_SECRET, vetoSalt: VETO_SALT });
  });

  it('never leaks the identity secret or salt on enrolment or when adding a guardian', () => {
    const { sim, id } = world();
    sim.ps.guardianSecret = bytes32(150); sim.ps.leafSalt = bytes32(151);
    sim.call('addGuardian', id);
    assertNoLeak(sim.lastProofData, {
      identitySecret: ID_SECRET, idSalt: ID_SALT, guardianSecret: bytes32(150), leafSalt: bytes32(151),
    });
  });

  // Ported from test/leakscan.test.js: the scanner's positive control, on v2's enrolment.
  it('finds every enrolment secret on the private side (the positive control)', () => {
    const sim = new Lantern2Sim();
    sim.call('enrollIdentity', idCommit(), vetoCommit(), 2n, D);
    const r = scanProofData(sim.lastProofData, { identitySecret: ID_SECRET, idSalt: ID_SALT });
    expect(r.identitySecret.private).toBe(true);
    expect(r.idSalt.private).toBe(true);
    expect(r.identitySecret.public).toBe(false);
    expect(r.idSalt.public).toBe(false);
  });
});
