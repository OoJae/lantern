// Rate-limited opens (docs/v2-spec.md §3). The cases of §3.9, in its order. Case 14,
// two opens raced from one state, is in test/v2-concurrency.test.js with the
// other replays. Every refusal is the circuit's own message.
import { describe, it, expect } from 'vitest';
import {
  pureCircuits, bytes32, fieldOf,
  world, asGuardian, openAs, openAndApprove, recordOf, toUnlock, succeed, periodOf, ephSkFor,
  EPH_A, EPH_B, EPH_C, EPH_D, DAY, PERIOD, VETO_SLACK, hex, NO_RESERVATION,
} from './v2-fixtures.js';
import { recoveryStatus, slotOf, periodBounds } from '../src/v2/timeline.js';
import { assertNoLeak } from '../src/leakscan.js';

const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));
const lastVeto = (sim, root) => Number(sim.ledger.lastVetoAt.lookup(root));
const openRaw = (sim, id, eph, period = periodOf(sim.now)) => {
  sim.ps.ephemeralSk = ephSkFor(eph);
  return sim.call('openRecovery', id, eph, period);
};

describe('§3.9.1 one live recovery per identity', () => {
  it('a second open while one is live is refused, from a different guardian and a different device', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAs(sim, guardians[0], id, EPH_A);
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(/a recovery is already live for this identity/);
    expect(() => openAs(sim, guardians[2], id, EPH_C)).toThrow(/already live/);
    expect(hex(sim.ledger.liveRecovery.lookup(id))).toBe(hex(rid));
    expect(sim.ledger.recoveries.member(pureCircuits.recoveryIdOf(id, EPH_B))).toBe(false);
  });
});

describe('§3.9.2 only a guardian can open', () => {
  it('a stranger with no leaf cannot open: a forged secret against a real path does not bind', () => {
    const { sim, id, guardians } = world();
    asGuardian(sim, guardians[0]);
    sim.ps.guardianSecret = bytes32(5555);
    expect(() => openRaw(sim, id, EPH_A)).toThrow(/does not bind/);
    expect(sim.ledger.liveRecovery.member(id)).toBe(false);
  });

  it('a stranger with a leaf of her own cannot open: a path the tree never held is not in tree', () => {
    // The path is a witness the stranger fills in. Hers has a real path's shape
    // and her OWN leaf, bound to the public context, so it binds; only the
    // tree's root history refuses it (adv-v2 round 2: no test reached it before).
    const { sim, id, guardians } = world();
    const secret = bytes32(9001), salt = bytes32(9101);
    const leaf = pureCircuits.guardianLeafOf(secret, sim.ledger.guardianCtx.lookup(id), salt);
    sim.ps.guardianSecret = secret; sim.ps.leafSalt = salt;
    sim.ps.guardianPath = { ...sim.findPath(guardians[0].leaf), leaf };
    expect(() => openRaw(sim, id, EPH_C)).toThrow(/guardian not in tree/);
    expect(sim.ledger.liveRecovery.member(id)).toBe(false);
    expect(sim.ledger.recoveries.member(pureCircuits.recoveryIdOf(id, EPH_C))).toBe(false);
  });

  it("a guardian of another identity cannot open for this one: its leaf binds a different context", () => {
    const { sim, id } = world();
    const bSecret = fieldOf(510), bSalt = bytes32(511);
    const bId = pureCircuits.idCommitOf(bSecret, bSalt);
    sim.ps.identitySecret = bSecret; sim.ps.idSalt = bSalt;
    sim.ps.vetoSecret = fieldOf(512); sim.ps.vetoSalt = bytes32(513);
    sim.call('enrollIdentity', bId, pureCircuits.vetoCommitOf(fieldOf(512), bytes32(513)), 2n, 86_400n);
    sim.ps.guardianSecret = bytes32(620); sim.ps.leafSalt = bytes32(621);
    const bGuardian = { secret: bytes32(620), salt: bytes32(621), leaf: sim.call('addGuardian', bId) };
    // B's guardian has a genuine leaf in the global tree -- for B's context.
    expect(() => openAs(sim, bGuardian, id, EPH_A)).toThrow(/does not bind/);
    expect(() => openAs(sim, bGuardian, bId, EPH_A)).not.toThrow();
  });
});

describe('§3.9.3 rotation evicts openers', () => {
  it('a guardian evicted by a rotation cannot open', () => {
    const { sim, id, guardians } = world();
    sim.call('rotateGuardianSet', id, bytes32(444));
    expect(() => openAs(sim, guardians[0], id, EPH_A)).toThrow(/does not bind/);
    expect(() => openAs(sim, guardians[1], id, EPH_A)).toThrow(/does not bind/);
  });
});

describe('§3.9.4 one open per guardian, per head, per period', () => {
  it('a guardian opens at most once per head per period, even with a new device key', () => {
    const { sim, id, guardians } = world();
    const ridA = openAs(sim, guardians[0], id, EPH_A);
    sim.call('vetoRecovery', ridA, NO_RESERVATION);
    sim.setTime(lastVeto(sim, id) + DAY);
    expect(() => openAs(sim, guardians[0], id, EPH_B)).toThrow(/guardian already opened a recovery this period/);
    // Another guardian still can: the quota is per guardian.
    expect(() => openAs(sim, guardians[1], id, EPH_B)).not.toThrow();
  });

  it('in the next period the same guardian can open again', () => {
    const { sim, id, guardians } = world();
    const ridA = openAs(sim, guardians[0], id, EPH_A);
    sim.call('vetoRecovery', ridA, NO_RESERVATION);
    const p = periodOf(sim.now);
    sim.setTime(periodBounds(p + 1n).start);
    expect(() => openAs(sim, guardians[0], id, EPH_B)).not.toThrow();
  });

  it('after a successful finalize, the same guardian opens for the successor in the same period', () => {
    const { sim, id, guardians } = world();
    const p = periodOf(sim.now);
    const g1 = succeed(sim, id, guardians, 1, EPH_A);   // guardians[0] opened generation 0
    expect(periodOf(sim.now)).toBe(p);
    expect(() => openAs(sim, guardians[0], g1.newId, EPH_B)).not.toThrow();
  });
});

describe('§3.9.5 the period is checked against block time', () => {
  it('a future period and a past period are refused', () => {
    const { sim, id, guardians } = world();
    asGuardian(sim, guardians[0]);
    const p = periodOf(sim.now);
    expect(() => openRaw(sim, id, EPH_A, p + 1n)).toThrow(/period has not started/);
    expect(() => openRaw(sim, id, EPH_A, p - 1n)).toThrow(/period has ended/);
    expect(() => openRaw(sim, id, EPH_A, p)).not.toThrow();
  });

  it('the period boundary is exact: the last second of p and the first of p + 1', () => {
    const { sim, id, guardians } = world();
    const p = periodOf(sim.now);
    sim.setTime(periodBounds(p).end - 1);
    asGuardian(sim, guardians[0]);
    expect(() => openRaw(sim, id, EPH_A, p + 1n)).toThrow(/has not started/);
    sim.setTime(periodBounds(p).end);
    expect(() => openRaw(sim, id, EPH_A, p)).toThrow(/has ended/);
    expect(() => openRaw(sim, id, EPH_A, p + 1n)).not.toThrow();
  });
});

describe('§3.9.6 the cooldown after one veto', () => {
  it("runs from the veto's later bound, to the second", () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    const vetoBlock = sim.now;
    sim.call('vetoRecovery', rid, NO_RESERVATION);
    expect(lastVeto(sim, id)).toBe(vetoBlock + VETO_SLACK);   // hi = claimed lo + the veto's slack
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(1n);

    sim.setTime(lastVeto(sim, id) + DAY - 1);
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(/cooling down after a veto/);
    sim.setTime(lastVeto(sim, id) + DAY);
    expect(() => openAs(sim, guardians[1], id, EPH_B)).not.toThrow();
  });
});

describe('§3.9.7 the cooldown doubles, to a bound', () => {
  it('cooldownSecondsOf is 0, 1, 2, 4, 8, 16, 32, 32 days', () => {
    const days = [0, 1, 2, 3, 4, 5, 6, 7].map((v) => Number(pureCircuits.cooldownSecondsOf(BigInt(v))) / DAY);
    expect(days).toEqual([0, 1, 2, 4, 8, 16, 32, 32]);
    expect(Number(pureCircuits.cooldownSecondsOf(255n)) / DAY).toBe(32);
  });

  it('three levels end to end: 1, 2 and 4 days, each boundary to the second', () => {
    const { sim, id, guardians } = world({ n: 4 });
    const ephs = [EPH_A, EPH_B, EPH_C, EPH_D];
    let rid = openAs(sim, guardians[0], id, ephs[0]);
    for (const [level, days] of [[1, 1], [2, 2], [3, 4]]) {
      sim.call('vetoRecovery', rid, NO_RESERVATION);
      expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(BigInt(level));
      sim.setTime(lastVeto(sim, id) + days * DAY - 1);
      expect(() => openAs(sim, guardians[level], id, ephs[level]), `level ${level}`).toThrow(/cooling down/);
      sim.setTime(lastVeto(sim, id) + days * DAY);
      rid = openAs(sim, guardians[level], id, ephs[level]);
    }
  });
});

describe('§3.9.8 the veto brackets its time claim', () => {
  it('a veto claiming a future time is refused, and so is one more than the slack stale', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    sim.ps.claimedNow = sim.now + 1;
    expect(() => sim.call('vetoRecovery', rid, NO_RESERVATION)).toThrow(/claimed time is in the future/);
    sim.ps.claimedNow = sim.now - VETO_SLACK;
    expect(() => sim.call('vetoRecovery', rid, NO_RESERVATION)).toThrow(/claimed time is too far in the past/);
    expect(sim.ledger.killed.member(rid)).toBe(false);
    // A lie inside the bracket can only LENGTHEN the wait: hi is never before the veto's block.
    sim.ps.claimedNow = sim.now - VETO_SLACK + 1;
    sim.call('vetoRecovery', rid, NO_RESERVATION);
    expect(lastVeto(sim, id)).toBe(sim.now + 1);
  });
});

describe('§3.9.9 what resets the count', () => {
  it('a rotation resets it: after rotating and re-adding guardians, an open lands with no wait', () => {
    const { sim, id, guardians } = world();
    sim.call('vetoRecovery', openAs(sim, guardians[0], id, EPH_A), NO_RESERVATION);
    sim.call('rotateGuardianSet', id, bytes32(444));
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(0n);
    sim.ps.guardianSecret = bytes32(300); sim.ps.leafSalt = bytes32(301);
    const fresh = { secret: bytes32(300), salt: bytes32(301), leaf: sim.call('addGuardian', id) };
    // Same block as the veto: lastVetoAt is still up to the slack ahead, and there is no wait.
    expect(sim.now).toBeLessThan(lastVeto(sim, id));
    expect(() => openAs(sim, fresh, id, EPH_B)).not.toThrow();
  });

  it('a finalize does NOT reset it: the successor inherits the count and its doubling', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const ridA = openAs(sim, guardians[0], id, EPH_A);
    sim.call('vetoRecovery', ridA, NO_RESERVATION);
    sim.setTime(lastVeto(sim, id) + DAY);
    // guardians[0] spent its open for this head, so guardians[1] opens the recovery that succeeds.
    const rid = openAndApprove(sim, id, guardians, 2, EPH_B, guardians[1]);
    toUnlock(sim, rid);
    const g1 = { newId: NEW_ID(), vSecret: fieldOf(80), vSalt: bytes32(81) };
    sim.call('finalizeRecovery', rid, g1.newId, NEW_VETO());
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(1n);
    const rid2 = openAs(sim, guardians[2], g1.newId, EPH_C);
    sim.ps.vetoSecret = g1.vSecret; sim.ps.vetoSalt = g1.vSalt;   // the successor's card
    sim.call('vetoRecovery', rid2, NO_RESERVATION);
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(2n);
    sim.setTime(lastVeto(sim, id) + 2 * DAY - 1);
    expect(() => openAs(sim, guardians[1], g1.newId, EPH_D)).toThrow(/cooling down/);
    sim.setTime(lastVeto(sim, id) + 2 * DAY);
    expect(() => openAs(sim, guardians[1], g1.newId, EPH_D)).not.toThrow();
  });
});

describe('§3.9.10 slot release, each boundary at t - 1 and t', () => {
  it('vetoed: the slot frees at once, the cooldown gates the next open', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    sim.call('vetoRecovery', rid, NO_RESERVATION);
    expect(recoveryStatus(sim.ledger, rid, sim.now)).toBe('vetoed');
    expect(slotOf(sim.ledger, id, sim.now)).toMatchObject({ free: true, canOpen: false, vetoes: 1 });
    sim.setTime(lastVeto(sim, id) + DAY - 1);
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(/cooling down/);
    sim.setTime(lastVeto(sim, id) + DAY);
    expect(slotOf(sim.ledger, id, sim.now).canOpen).toBe(true);
    expect(() => openAs(sim, guardians[1], id, EPH_B)).not.toThrow();
  });

  it('finalized: the successor can be opened for at once', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    expect(recoveryStatus(sim.ledger, rid, sim.now)).toBe('finalizable');
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(/already live/);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    expect(recoveryStatus(sim.ledger, rid, sim.now)).toBe('superseded');
    expect(() => openAs(sim, guardians[1], NEW_ID(), EPH_B)).not.toThrow();
  });

  it('rotated out: frees at once', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.call('rotateGuardianSet', id, bytes32(445));
    expect(recoveryStatus(sim.ledger, rid, sim.now)).toBe('rotated-out');
    sim.ps.guardianSecret = bytes32(300); sim.ps.leafSalt = bytes32(301);
    const fresh = { secret: bytes32(300), salt: bytes32(301), leaf: sim.call('addGuardian', id) };
    expect(() => openAs(sim, fresh, id, EPH_B)).not.toThrow();
  });

  it('expired: frees at expiresAt, not a second before', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAndApprove(sim, id, guardians, 2);
    const { expiresAt } = recordOf(sim, rid);
    sim.setTime(Number(expiresAt) - 1);
    expect(recoveryStatus(sim.ledger, rid, sim.now)).toBe('finalizable');
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(/already live/);
    sim.setTime(Number(expiresAt));
    expect(recoveryStatus(sim.ledger, rid, sim.now)).toBe('expired');
    expect(() => openAs(sim, guardians[1], id, EPH_B)).not.toThrow();
  });

  it('missed quorum: frees at approveBy, not a second before', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAndApprove(sim, id, guardians, 1);
    const { approveBy } = recordOf(sim, rid);
    sim.setTime(Number(approveBy) - 1);
    expect(recoveryStatus(sim.ledger, rid, sim.now)).toBe('collecting-approvals');
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(/already live/);
    sim.setTime(Number(approveBy));
    expect(recoveryStatus(sim.ledger, rid, sim.now)).toBe('missed-quorum');
    expect(() => openAs(sim, guardians[1], id, EPH_B)).not.toThrow();
  });

  it('a recovery AT quorum past approveBy still holds the slot until expiresAt', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAndApprove(sim, id, guardians, 2);
    const { approveBy, expiresAt } = recordOf(sim, rid);
    for (const t of [Number(approveBy), Number(approveBy) + DAY, Number(expiresAt) - 1]) {
      sim.setTime(t);
      expect(() => openAs(sim, guardians[2], id, EPH_B), `t = ${t}`).toThrow(/already live/);
    }
  });
});

describe('§3.9.11 the approval window', () => {
  it('an approval at approveBy - 1 lands; at approveBy it is refused', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAs(sim, guardians[0], id, EPH_A);
    const { approveBy } = recordOf(sim, rid);
    sim.setTime(Number(approveBy) - 1);
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('approveRecovery', id, rid)).not.toThrow();
    sim.setTime(Number(approveBy));
    asGuardian(sim, guardians[1]);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/approval window has closed/);
    sim.advance(DAY);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/approval window has closed/);
  });
});

describe('§3.9.12 the finalize window', () => {
  const ready = () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    return { sim, rid, rec: recordOf(sim, rid) };
  };

  it('a finalize at unlockAt succeeds, and so does one at expiresAt - 1', () => {
    for (const at of ['unlockAt', 'last']) {
      const { sim, rid, rec } = ready();
      sim.setTime(at === 'unlockAt' ? Number(rec.unlockAt) : Number(rec.expiresAt) - 1);
      expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO()), at).not.toThrow();
    }
  });

  it('a finalize at or after expiresAt is refused', () => {
    const { sim, rid, rec } = ready();
    sim.setTime(Number(rec.expiresAt));
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).toThrow(/recovery expired/);
    sim.advance(30 * DAY);
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).toThrow(/recovery expired/);
  });
});

describe('§3.9.13 never two finalizable recoveries', () => {
  it('after a missed-quorum R1 lets R2 open, R1 can neither gain approvals nor finalize', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const r1 = openAndApprove(sim, id, guardians, 1, EPH_A);
    sim.setTime(Number(recordOf(sim, r1).approveBy));
    const r2 = openAs(sim, guardians[1], id, EPH_B);
    asGuardian(sim, guardians[2]);
    expect(() => sim.call('approveRecovery', id, r1)).toThrow(/approval window has closed/);
    toUnlock(sim, r1);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    expect(() => sim.call('finalizeRecovery', r1, NEW_ID(), NEW_VETO())).toThrow(/not enough approvals/);
    // R2 is the one that can still finish.
    for (const g of guardians.slice(1)) { asGuardian(sim, g); sim.call('approveRecovery', id, r2); }
    toUnlock(sim, r2);
    sim.ps.ephemeralSk = ephSkFor(EPH_B);
    expect(() => sim.call('finalizeRecovery', r2, NEW_ID(), NEW_VETO())).not.toThrow();
  });

  it('after an expired R1 lets R2 open, R1 cannot finalize', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const r1 = openAndApprove(sim, id, guardians, 2, EPH_A);
    sim.setTime(Number(recordOf(sim, r1).expiresAt));
    openAs(sim, guardians[1], id, EPH_B);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    expect(() => sim.call('finalizeRecovery', r1, NEW_ID(), NEW_VETO())).toThrow(/recovery expired/);
    asGuardian(sim, guardians[2]);
    expect(() => sim.call('approveRecovery', id, r1)).toThrow(/approval window has closed/);
  });
});

describe('§3.9.15 a retired card has no effect on the successor', () => {
  it("the old identity's card cannot veto, and cannot move the successor's cooldown", () => {
    const { sim, id, guardians } = world();
    const oldCard = { vetoSecret: sim.ps.vetoSecret, vetoSalt: sim.ps.vetoSalt };
    const g1 = succeed(sim, id, guardians, 1, EPH_A);
    Object.assign(sim.ps, oldCard);
    expect(() => sim.call('vetoRecovery', g1.rid, NO_RESERVATION)).toThrow(/identity retired/);
    const rid2 = openAs(sim, guardians[1], g1.newId, EPH_B);
    expect(() => sim.call('vetoRecovery', rid2, NO_RESERVATION)).toThrow(/veto secret does not open/);
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(0n);
    expect(sim.ledger.lastVetoAt.lookup(id)).toBe(0n);
  });
});

describe('§3.9.16 opening is not approving', () => {
  it('after an open the count is zero, and the opener can still approve once', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(0n);
    asGuardian(sim, guardians[0]);
    sim.call('approveRecovery', id, rid);
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(1n);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/already approved/);
  });
});

describe('§3.9.17 privacy of the open', () => {
  it("the open's public transcript holds no guardian secret, salt, leaf or real path sibling", () => {
    const { sim, id, guardians } = world({ n: 3 });
    const path = sim.findPath(guardians[0].leaf);
    openAs(sim, guardians[0], id, EPH_A);
    // The leaf would name WHICH guardian opened: it is public in the tree, so it must not be in the proof.
    const secrets = { guardianSecret: guardians[0].secret, leafSalt: guardians[0].salt, leaf: guardians[0].leaf };
    path.path.forEach((e, i) => {
      if (e.sibling.field > 0xffffffffffffffffn) secrets[`sibling${i}`] = e.sibling.field;
    });
    expect(Object.keys(secrets).length).toBeGreaterThan(3);
    assertNoLeak(sim.lastProofData, secrets);
  });
});
