import { describe, it, expect } from 'vitest';
import { LanternSim, pureCircuits, bytes32, fieldOf } from './simulator.js';
import {
  world, asGuardian, openAndApprove, idCommit, vetoCommit,
  ID_SECRET, ID_SALT, VETO_SECRET, VETO_SALT, EPH_A, EPH_B, DELAY, SLACK,
} from './fixtures.js';

const hex = (u) => Buffer.from(u).toString('hex');
const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));

describe('enrolment', () => {
  it('enrols an identity, its threshold and its veto commitment', () => {
    const { sim, id } = world();
    expect(sim.ledger.enrolled.member(id)).toBe(true);
    expect(sim.ledger.thresholds.lookup(id)).toBe(2n);
    expect(hex(sim.ledger.vetoCommits.lookup(id))).toBe(hex(vetoCommit()));
  });

  it('rejects a duplicate enrolment', () => {
    const { sim, id } = world();
    expect(() => sim.call('enrollIdentity', id, vetoCommit(), 2n)).toThrow(/already enrolled/);
  });

  it('rejects a threshold below 2', () => {
    const sim = new LanternSim();
    expect(() => sim.call('enrollIdentity', idCommit(), vetoCommit(), 1n))
      .toThrow(/threshold must be at least 2/);
  });

  // Closes the front-running hole: without the authentication assert, anyone
  // could bind THEIR veto commitment to a victim's idCommit.
  it('rejects an enroller who does not hold the identity secret', () => {
    const sim = new LanternSim({ identitySecret: fieldOf(999) });
    expect(() => sim.call('enrollIdentity', idCommit(), vetoCommit(), 2n))
      .toThrow(/does not hold the identity secret/);
  });

  it('rejects a guardian added by someone who is not the owner', () => {
    const { sim, id } = world();
    sim.ps.identitySecret = fieldOf(999);
    expect(() => sim.call('addGuardian', id)).toThrow(/not the identity owner/);
  });
});

describe('opening a recovery', () => {
  it('returns the identity-bound rid and seeds a zero counter', () => {
    const { sim, id } = world();
    const rid = sim.call('openRecovery', id, EPH_A);
    expect(hex(rid)).toBe(hex(pureCircuits.recoveryIdOf(id, EPH_A)));
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(0n);
    const rec = sim.ledger.recoveries.lookup(rid);
    expect(rec.openedAtLo).toBeLessThanOrEqual(BigInt(sim.now));
    expect(rec.openedAtHi).toBe(rec.openedAtLo + BigInt(SLACK));
  });

  it('rejects a second open on the same recovery', () => {
    const { sim, id } = world();
    sim.call('openRecovery', id, EPH_A);
    expect(() => sim.call('openRecovery', id, EPH_A)).toThrow(/already open/);
  });

  // The bracketed-timestamp workaround is load-bearing, so prove both sides.
  it('rejects a claimed time in the future', () => {
    const { sim, id } = world();
    sim.ps.claimedNow = sim.now + 100_000;
    expect(() => sim.call('openRecovery', id, EPH_A)).toThrow(/in the future/);
  });

  it('rejects a claimed time that is too stale', () => {
    const { sim, id } = world();
    sim.ps.claimedNow = sim.now - 100_000;
    expect(() => sim.call('openRecovery', id, EPH_A)).toThrow(/too far in the past/);
  });
});

describe('approval', () => {
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

  it('lets the same guardian approve a different recovery', () => {
    const { sim, id, guardians } = world();
    openAndApprove(sim, id, guardians, 1, EPH_A);
    const ridB = sim.call('openRecovery', id, EPH_B);
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('approveRecovery', id, ridB)).not.toThrow();
  });

  it('rejects a forged guardian secret', () => {
    const { sim, id, guardians } = world();
    const rid = sim.call('openRecovery', id, EPH_A);
    asGuardian(sim, guardians[0]);
    sim.ps.guardianSecret = bytes32(777);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow();
  });

  // A genuinely valid path, belonging to a different leaf.
  it('rejects a valid path that does not bind to the caller (leaf-binding assert)', () => {
    const { sim, id, guardians } = world();
    const rid = sim.call('openRecovery', id, EPH_A);
    sim.ps.guardianSecret = guardians[0].secret;
    sim.ps.leafSalt = guardians[0].salt;
    sim.ps.guardianPath = sim.findPath(guardians[1].leaf);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/does not bind/);
  });
});

// The exploit the design review found: keying approvals on ephemeralPk alone
// let a stranger with a throwaway identity inflate any victim's count.
describe('cross-identity approval inflation (regression)', () => {
  it('cannot inflate another identity\'s approval count', () => {
    const { sim, id, guardians } = world();
    const rid = sim.call('openRecovery', id, EPH_A);

    // Mallory enrols her own identity, with herself as guardian.
    const mSecret = fieldOf(500), mSalt = bytes32(501);
    const mId = pureCircuits.idCommitOf(mSecret, mSalt);
    sim.ps.identitySecret = mSecret; sim.ps.idSalt = mSalt;
    sim.call('enrollIdentity', mId, pureCircuits.vetoCommitOf(fieldOf(502), bytes32(503)), 2n);
    sim.ps.guardianSecret = bytes32(600); sim.ps.leafSalt = bytes32(601);
    const mLeaf = sim.call('addGuardian', mId);
    sim.ps.guardianPath = sim.findPath(mLeaf);

    // Her leaf is genuinely in the global tree and her nullifier is fresh, but
    // rid binds the identity, so she cannot touch the victim's recovery.
    expect(() => sim.call('approveRecovery', mId, rid)).toThrow(/not for this identity/);
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(0n);
  });
});

describe('veto', () => {
  it('kills an in-flight recovery for the veto-secret holder', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.call('vetoRecovery', rid);
    expect(sim.ledger.killed.member(rid)).toBe(true);
  });

  // The judged flaw: veto and finalize used to prove the SAME predicate, so a
  // threshold attacker could veto every legitimate recovery forever.
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

  it('is per-recovery, so the owner can veto a second attempt', () => {
    const { sim, id, guardians } = world();
    const ridA = openAndApprove(sim, id, guardians, 1, EPH_A);
    sim.call('vetoRecovery', ridA);
    const ridB = sim.call('openRecovery', id, EPH_B);
    expect(() => sim.call('vetoRecovery', ridB)).not.toThrow();
  });
});

describe('finalize', () => {
  const finalize = (sim, rid) => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());

  it('succeeds and enrols the successor atomically', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.advance(DELAY + SLACK + 1);
    finalize(sim, rid);

    expect(sim.ledger.retiredIdentities.member(id)).toBe(true);
    expect(sim.ledger.enrolled.member(NEW_ID())).toBe(true);
    expect(sim.ledger.thresholds.lookup(NEW_ID())).toBe(2n);
    expect(hex(sim.ledger.vetoCommits.lookup(NEW_ID()))).toBe(hex(NEW_VETO()));
    expect(sim.ledger.succession.findPathForLeaf(
      pureCircuits.successionEdgeOf(id, NEW_ID()))).toBeDefined();
  });

  it('rejects a secret that does not open the commitment', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.advance(DELAY + SLACK + 1);
    sim.ps.identitySecret = fieldOf(777);
    expect(() => finalize(sim, rid)).toThrow(/does not open idCommit/);
  });

  it('rejects the right secret with the wrong salt', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.advance(DELAY + SLACK + 1);
    sim.ps.idSalt = bytes32(888);
    expect(() => finalize(sim, rid)).toThrow(/does not open idCommit/);
  });

  it('rejects below threshold', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 1);
    sim.advance(DELAY + SLACK + 1);
    expect(() => finalize(sim, rid)).toThrow(/not enough approvals/);
  });

  it('rejects before the timelock elapses', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.advance(DELAY - 10);
    expect(() => finalize(sim, rid)).toThrow(/timelock has not elapsed/);
  });

  it('rejects a vetoed recovery', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.call('vetoRecovery', rid);
    sim.advance(DELAY + SLACK + 1);
    expect(() => finalize(sim, rid)).toThrow(/recovery vetoed/);
  });

  // Defence in depth: a retired identity is refused at OPEN, before a second
  // finalize is even reachable.
  it('refuses to open a new recovery on a retired identity', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.advance(DELAY + SLACK + 1);
    finalize(sim, rid);
    expect(() => sim.call('openRecovery', id, EPH_B)).toThrow(/identity retired/);
  });

  it('cannot replay a finalize on an already-retired identity', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.advance(DELAY + SLACK + 1);
    finalize(sim, rid);
    expect(() => finalize(sim, rid)).toThrow(/already retired|successor already enrolled/);
  });
});

describe('privacy', () => {
  const scan = (sim) => JSON.stringify(sim.publicTranscript, (_k, v) =>
    typeof v === 'bigint' ? v.toString(16)
      : v instanceof Uint8Array ? hex(v) : v);

  it('never leaks the guardian secret or salt on approval', () => {
    const { sim, id, guardians } = world();
    const rid = sim.call('openRecovery', id, EPH_A);
    asGuardian(sim, guardians[0]);
    sim.call('approveRecovery', id, rid);
    const blob = scan(sim);
    expect(blob).not.toContain(hex(guardians[0].secret));
    expect(blob).not.toContain(hex(guardians[0].salt));
  });

  it('never leaks the identity secret or salt on finalize', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.advance(DELAY + SLACK + 1);
    sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    const blob = scan(sim);
    expect(blob).not.toContain(ID_SECRET.toString(16));
    expect(blob).not.toContain(hex(ID_SALT));
  });

  it('never leaks the veto secret on veto', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.call('vetoRecovery', rid);
    const blob = scan(sim);
    expect(blob).not.toContain(VETO_SECRET.toString(16));
    expect(blob).not.toContain(hex(VETO_SALT));
  });
});
