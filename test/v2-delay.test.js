// The delay chosen at enrolment (docs/v2.md §5). The cases of §5.5, in its order.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  Lantern2Sim, pureCircuits, bytes32, fieldOf,
  world, asGuardian, openAs, openAndApprove, recordOf, toUnlock, idCommit, vetoCommit, ephSkFor,
  EPH_A, EPH_B, EPH_C, DAY, SLACK, APPROVAL_WINDOW, FINALIZE_WINDOW, NO_RESERVATION,
} from './v2-fixtures.js';

const MIN = Number(pureCircuits.minRecoveryDelaySeconds());
const MAX = Number(pureCircuits.maxRecoveryDelaySeconds());
const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));
const enrol = (sim, delay) => sim.call('enrollIdentity', idCommit(), vetoCommit(), 2n, BigInt(delay));

describe('§5.5.1 enrolment bounds', () => {
  it('the bounds are 24 hours and 90 days', () => {
    expect(MIN).toBe(DAY);
    expect(MAX).toBe(90 * DAY);
  });

  it('86,399 is refused; 86,400 is accepted', () => {
    expect(() => enrol(new Lantern2Sim(), MIN - 1)).toThrow(/delay below the minimum/);
    const sim = new Lantern2Sim();
    expect(() => enrol(sim, MIN)).not.toThrow();
    expect(sim.ledger.recoveryDelays.lookup(idCommit())).toBe(BigInt(MIN));
  });

  it('7,776,000 is accepted; 7,776,001 is refused', () => {
    const sim = new Lantern2Sim();
    expect(() => enrol(sim, MAX)).not.toThrow();
    expect(sim.ledger.recoveryDelays.lookup(idCommit())).toBe(BigInt(MAX));
    expect(() => enrol(new Lantern2Sim(), MAX + 1)).toThrow(/delay above the maximum/);
    expect(() => enrol(new Lantern2Sim(), 0)).toThrow(/below the minimum/);
  });
});

describe('§5.5.2 the record freezes the timeline', () => {
  it('unlockAt = openedAtHi + delay; approveBy = openedAtHi + 7 d; expiresAt = unlockAt + 7 d', () => {
    for (const delay of [MIN, 3 * DAY, 30 * DAY, MAX]) {
      const { sim, id, guardians } = world({ delay });
      const rec = recordOf(sim, openAs(sim, guardians[0], id, EPH_A));
      expect(rec.openedAtHi).toBe(BigInt(sim.now + SLACK));
      expect(rec.unlockAt).toBe(rec.openedAtHi + BigInt(delay));
      expect(rec.approveBy).toBe(rec.openedAtHi + BigInt(APPROVAL_WINDOW));
      expect(rec.expiresAt).toBe(rec.unlockAt + BigInt(FINALIZE_WINDOW));
    }
  });
});

describe('§5.5.3 the finalize waits for exactly the chosen delay', () => {
  for (const [label, delay] of [['24 h', MIN], ['90 days', MAX]]) {
    it(`${label}: refused at unlockAt - 1, accepted at unlockAt`, () => {
      const { sim, id, guardians } = world({ delay });
      const rid = openAndApprove(sim, id, guardians, 2);
      toUnlock(sim, rid, -1);
      expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).toThrow(/timelock has not elapsed/);
      toUnlock(sim, rid);
      expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).not.toThrow();
    });
  }
});

describe('§5.5.4 successors inherit the delay', () => {
  it("the successor's next recovery uses the root's delay", () => {
    const delay = 10 * DAY;
    const { sim, id, guardians } = world({ delay });
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    // No delay was copied: the successor has no entry of its own, and its recovery reads the root's.
    expect(sim.ledger.recoveryDelays.member(NEW_ID())).toBe(false);
    const rec2 = recordOf(sim, openAs(sim, guardians[1], NEW_ID(), EPH_B));
    expect(rec2.unlockAt - rec2.openedAtHi).toBe(BigInt(delay));
  });

  it('no circuit takes a delay after enrolment', () => {
    const src = readFileSync(new URL('../contracts/v2/lantern2.compact', import.meta.url), 'utf8');
    const withDelay = [...src.matchAll(/export circuit (\w+)\(([^)]*)\)/g)]
      .filter(([, , params]) => /\bdelay\b/.test(params)).map(([, name]) => name);
    expect(withDelay).toEqual(['enrollIdentity']);
    // And the only write to recoveryDelays is enrolment's.
    expect([...src.matchAll(/recoveryDelays\.insert/g)]).toHaveLength(1);
  });
});

describe('§5.5.5 two identities, two delays', () => {
  it('do not interfere', () => {
    const sim = new Lantern2Sim();
    const mk = (seed, delay) => {
      const s = fieldOf(seed), salt = bytes32(seed + 1), vs = fieldOf(seed + 2), vsalt = bytes32(seed + 3);
      Object.assign(sim.ps, { identitySecret: s, idSalt: salt, vetoSecret: vs, vetoSalt: vsalt });
      const id = pureCircuits.idCommitOf(s, salt);
      sim.call('enrollIdentity', id, pureCircuits.vetoCommitOf(vs, vsalt), 2n, BigInt(delay));
      const guardians = [0, 1].map((i) => {
        sim.ps.guardianSecret = bytes32(seed + 10 + i); sim.ps.leafSalt = bytes32(seed + 20 + i);
        return { secret: bytes32(seed + 10 + i), salt: bytes32(seed + 20 + i), leaf: sim.call('addGuardian', id) };
      });
      return { id, guardians, owner: { identitySecret: s, idSalt: salt } };
    };
    const fast = mk(1000, MIN);
    const slow = mk(2000, MAX);
    const rFast = openAndApprove(sim, fast.id, fast.guardians, 2, EPH_A);
    const rSlow = openAndApprove(sim, slow.id, slow.guardians, 2, EPH_B);
    toUnlock(sim, rFast);
    Object.assign(sim.ps, slow.owner, { ephemeralSk: ephSkFor(EPH_B) });
    expect(() => sim.call('finalizeRecovery', rSlow, NEW_ID(), NEW_VETO())).toThrow(/timelock has not elapsed/);
    Object.assign(sim.ps, fast.owner, { ephemeralSk: ephSkFor(EPH_A) });
    expect(() => sim.call('finalizeRecovery', rFast, NEW_ID(), NEW_VETO())).not.toThrow();
    expect(sim.ledger.recoveryDelays.lookup(fast.id)).toBe(BigInt(MIN));
    expect(sim.ledger.recoveryDelays.lookup(slow.id)).toBe(BigInt(MAX));
  });
});

describe('§5.5.6 a lying prover gains at most the slack, never the delay', () => {
  it('claimedNow = block - 599 cannot finalize earlier than delay after the opening block', () => {
    const delay = MIN;
    const { sim, id, guardians } = world({ delay });
    const openBlock = sim.now;
    sim.ps.claimedNow = openBlock - (SLACK - 1);
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.ps.claimedNow = undefined;
    // The bracket pinned hi to openBlock + 1, so the lock ends one second AFTER open + delay.
    expect(recordOf(sim, rid).unlockAt).toBe(BigInt(openBlock + 1 + delay));
    sim.setTime(openBlock + delay);
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).toThrow(/timelock has not elapsed/);
    sim.setTime(openBlock + delay + 1);
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).not.toThrow();
  });

  it('one second more of lie is refused at the open', () => {
    const { sim, id, guardians } = world();
    sim.ps.claimedNow = sim.now - SLACK;
    expect(() => openAs(sim, guardians[0], id, EPH_A)).toThrow(/too far in the past/);
  });
});

describe('§5.5.7 the inheritance profile, end to end', () => {
  // 90 days, the owner watching, three heirs as guardians. A premature open is
  // vetoed; after the cooldown an heir opens for the executor's device; the
  // approvals come within 7 days; nobody vetoes; the finalize lands at day 90
  // plus the slack. Built twice, so the refused late finalize is shown on the
  // same history rather than by winding the clock back.
  const history = () => {
    const { sim, id, guardians } = world({ n: 3, delay: MAX });
    const premature = openAs(sim, guardians[0], id, EPH_A);
    sim.call('vetoRecovery', premature, NO_RESERVATION);
    const cooldownEnd = Number(sim.ledger.lastVetoAt.lookup(id)) + DAY;
    sim.setTime(cooldownEnd - 1);
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(/cooling down/);
    sim.setTime(cooldownEnd);
    const openBlock = sim.now;
    const rid = openAs(sim, guardians[1], id, EPH_B);
    sim.advance(6 * DAY);
    for (const g of guardians.slice(1)) { asGuardian(sim, g); sim.call('approveRecovery', id, rid); }
    sim.ps.ephemeralSk = ephSkFor(EPH_B);
    return { sim, id, rid, openBlock, rec: recordOf(sim, rid) };
  };

  it('the finalize at day 90 plus the slack succeeds, and the executor holds the identity', () => {
    const { sim, id, rid, openBlock, rec } = history();
    expect(Number(rec.unlockAt)).toBe(openBlock + SLACK + MAX);
    sim.setTime(Number(rec.unlockAt));
    sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    expect(sim.ledger.retiredIdentities.member(id)).toBe(true);
    expect(sim.ledger.idRoots.lookup(NEW_ID())).toEqual(id);
  });

  it('the same finalize at expiresAt would have been refused', () => {
    const { sim, rid, rec } = history();
    sim.setTime(Number(rec.expiresAt));
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).toThrow(/recovery expired/);
  });

  it('an approval after the 7-day window is refused, even under a 90-day delay', () => {
    const { sim, id, guardians } = world({ n: 3, delay: MAX });
    const rid = openAs(sim, guardians[0], id, EPH_C);
    sim.setTime(Number(recordOf(sim, rid).approveBy));
    asGuardian(sim, guardians[1]);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/approval window has closed/);
  });
});
