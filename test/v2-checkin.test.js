// Private guardian check-ins (docs/v2.md §6). The cases of §6.4, in its order.
// Case 9, the first-check-in race, is in test/v2-concurrency.test.js.
import { describe, it, expect } from 'vitest';
import {
  pureCircuits, bytes32, fieldOf,
  world, asGuardian, openAs, succeed, periodOf, EPH_A, hex,
} from './v2-fixtures.js';
import { periodBounds } from '../src/v2/timeline.js';
import { assertNoLeak, flatten } from '../src/leakscan.js';

const count = (sim, root, period, ctx = sim.ledger.guardianCtx.lookup(root)) => {
  const key = pureCircuits.checkInKeyOf(root, ctx, period);
  return sim.ledger.checkIns.member(key) ? sim.ledger.checkIns.lookup(key).read() : 0n;
};
const checkIn = (sim, g, id, p = periodOf(sim.now)) => { asGuardian(sim, g); return sim.call('checkIn', id, p); };

describe('§6.4.1 the count', () => {
  it('two guardians check in, and the counter reads 2', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const p = periodOf(sim.now);
    expect(count(sim, id, p)).toBe(0n);
    checkIn(sim, guardians[0], id);
    checkIn(sim, guardians[2], id);
    expect(count(sim, id, p)).toBe(2n);
    expect(sim.ledger.checkInNullifiers.size()).toBe(2n);
  });

  it("the transaction's arguments are only (idRoot, period)", () => {
    const { sim, id, guardians } = world();
    const p = periodOf(sim.now);
    checkIn(sim, guardians[0], id, p);
    const input = sim.lastProofData.input;
    // Two arguments: a Bytes<32> and a Uint<32>. Nothing about the guardian.
    expect(input.alignment).toHaveLength(2);
    expect(hex(input.value[0])).toBe(hex(id));
    expect(flatten(input.value[1])).toContain(p.toString(16));
  });
});

describe('§6.4.2 once per guardian per period', () => {
  it('the same guardian twice is refused, even from a second leaf with the same secret and another salt', () => {
    const { sim, id, guardians } = world();
    checkIn(sim, guardians[0], id);
    expect(() => checkIn(sim, guardians[0], id)).toThrow(/guardian already checked in this period/);
    // The owner adds a second leaf for the same guardian secret, with a new salt.
    sim.ps.guardianSecret = guardians[0].secret; sim.ps.leafSalt = bytes32(299);
    const second = { secret: guardians[0].secret, salt: bytes32(299), leaf: sim.call('addGuardian', id) };
    expect(() => checkIn(sim, second, id)).toThrow(/already checked in this period/);
    expect(count(sim, id, periodOf(sim.now))).toBe(1n);
  });
});

describe('§6.4.3 the next period', () => {
  it('the same guardian checks in again, and the old period is unchanged', () => {
    const { sim, id, guardians } = world();
    const p = periodOf(sim.now);
    checkIn(sim, guardians[0], id);
    checkIn(sim, guardians[1], id);
    sim.setTime(periodBounds(p + 1n).start);
    checkIn(sim, guardians[0], id);
    expect(count(sim, id, p + 1n)).toBe(1n);
    expect(count(sim, id, p)).toBe(2n);
  });
});

describe('§6.4.4 the period is checked against block time', () => {
  it('a future period and a past period are refused', () => {
    const { sim, id, guardians } = world();
    const p = periodOf(sim.now);
    expect(() => checkIn(sim, guardians[0], id, p + 1n)).toThrow(/period has not started/);
    expect(() => checkIn(sim, guardians[0], id, p - 1n)).toThrow(/period has ended/);
    expect(count(sim, id, p + 1n) + count(sim, id, p - 1n)).toBe(0n);
  });
});

describe('§6.4.5 only a current guardian of THIS identity', () => {
  it('a non-guardian is refused', () => {
    const { sim, id, guardians } = world();
    asGuardian(sim, guardians[0]);
    sim.ps.guardianSecret = bytes32(8888);
    expect(() => sim.call('checkIn', id, periodOf(sim.now))).toThrow(/does not bind/);
    expect(count(sim, id, periodOf(sim.now))).toBe(0n);
  });

  it("a guardian of identity B cannot check in for A, and cannot move A's count", () => {
    const { sim, id } = world();
    const bSecret = fieldOf(540), bSalt = bytes32(541);
    const bId = pureCircuits.idCommitOf(bSecret, bSalt);
    sim.ps.identitySecret = bSecret; sim.ps.idSalt = bSalt;
    sim.ps.vetoSecret = fieldOf(542); sim.ps.vetoSalt = bytes32(543);
    sim.call('enrollIdentity', bId, pureCircuits.vetoCommitOf(fieldOf(542), bytes32(543)), 2n, 86_400n);
    sim.ps.guardianSecret = bytes32(640); sim.ps.leafSalt = bytes32(641);
    const bGuardian = { secret: bytes32(640), salt: bytes32(641), leaf: sim.call('addGuardian', bId) };
    expect(() => checkIn(sim, bGuardian, id)).toThrow(/does not bind/);
    expect(count(sim, id, periodOf(sim.now))).toBe(0n);
    expect(() => checkIn(sim, bGuardian, bId)).not.toThrow();
    expect(count(sim, bId, periodOf(sim.now))).toBe(1n);
  });
});

describe('§6.4.6 after a rotation', () => {
  it('an evicted guardian is refused; a re-added one checks in; the count restarts and the old one stays', () => {
    const { sim, id, guardians } = world();
    const p = periodOf(sim.now);
    checkIn(sim, guardians[0], id);
    checkIn(sim, guardians[1], id);
    const oldCtx = sim.ledger.guardianCtx.lookup(id);
    sim.call('rotateGuardianSet', id, bytes32(448));
    expect(count(sim, id, p)).toBe(0n);   // the NEW set's count
    expect(() => checkIn(sim, guardians[0], id)).toThrow(/does not bind/);
    // Re-added under the new context, with the same secret: a new context, so a new nullifier.
    sim.ps.guardianSecret = guardians[0].secret; sim.ps.leafSalt = bytes32(298);
    const readded = { secret: guardians[0].secret, salt: bytes32(298), leaf: sim.call('addGuardian', id) };
    expect(() => checkIn(sim, readded, id)).not.toThrow();
    expect(count(sim, id, p)).toBe(1n);
    expect(count(sim, id, p, oldCtx)).toBe(2n);
  });
});

describe('§6.4.7 across a recovery', () => {
  it('the root reaches the SAME counter before and after a recovery', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const p = periodOf(sim.now);
    checkIn(sim, guardians[2], id);
    const g1 = succeed(sim, id, guardians, 1);
    expect(periodOf(sim.now)).toBe(p);
    expect(() => checkIn(sim, guardians[2], id)).toThrow(/already checked in this period/);
    checkIn(sim, guardians[0], id);   // through the retired root: still the lineage's count
    expect(count(sim, id, p)).toBe(2n);
    expect(sim.ledger.retiredIdentities.member(id)).toBe(true);
    expect(hex(sim.ledger.idRoots.lookup(g1.newId))).toBe(hex(id));
  });

  // Review F8: if a guardian could pass the root OR a later commitment, the
  // choice would fingerprint that guardian's client. The contract takes the root only.
  it("a check-in naming the successor's commitment is refused: the argument is always the root", () => {
    const { sim, id, guardians } = world({ n: 3 });
    const p = periodOf(sim.now);
    const g1 = succeed(sim, id, guardians, 1);
    expect(() => checkIn(sim, guardians[2], g1.newId)).toThrow(/check in with the identity root/);
    expect(count(sim, id, p)).toBe(0n);
    checkIn(sim, guardians[2], id);
    // Every check-in's transaction names the same public argument, whoever sent it.
    const args = (g) => { checkIn(sim, g, id); return flatten(sim.lastProofData.input); };
    expect(args(guardians[0])).toEqual(args(guardians[1]));
    expect(count(sim, id, p)).toBe(3n);
  });
});

describe('§6.4.8 unlinkability', () => {
  it("one guardian's check-in nullifiers differ across periods, and from its approval and open nullifiers", () => {
    const { sim, id, guardians } = world();
    const g = guardians[0];
    const ctx = sim.ledger.guardianCtx.lookup(id);
    const p = periodOf(sim.now);
    const rid = pureCircuits.recoveryIdOf(id, bytes32(7));
    const values = [
      pureCircuits.checkInNullifierOf(g.secret, ctx, p),
      pureCircuits.checkInNullifierOf(g.secret, ctx, p + 1n),
      pureCircuits.approvalNullifierOf(g.secret, id, rid),
      pureCircuits.openNullifierOf(g.secret, id, p),
    ].map(hex);
    expect(new Set(values).size).toBe(4);
    checkIn(sim, g, id, p);
    expect(sim.ledger.checkInNullifiers.member(pureCircuits.checkInNullifierOf(g.secret, ctx, p))).toBe(true);
  });

  it('the public transcript holds no secret, salt, leaf or real path sibling: the count names nobody', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const g = guardians[1];
    const path = sim.findPath(g.leaf);
    checkIn(sim, g, id);
    const secrets = { guardianSecret: g.secret, leafSalt: g.salt, leaf: g.leaf };
    path.path.forEach((e, i) => {
      if (e.sibling.field > 0xffffffffffffffffn) secrets[`sibling${i}`] = e.sibling.field;
    });
    expect(Object.keys(secrets).length).toBeGreaterThan(3);
    assertNoLeak(sim.lastProofData, secrets);
  });

  it('two different guardians produce check-ins of the same public shape', () => {
    const { sim, id, guardians } = world({ n: 2 });
    const shape = (pd) => JSON.stringify(pd.publicTranscript, (_k, v) =>
      (v instanceof Uint8Array ? `b${v.length}` : typeof v === 'bigint' ? 'n' : v)).replace(/b\d+/g, 'b');
    checkIn(sim, guardians[0], id);
    const a = shape(sim.lastProofData);
    checkIn(sim, guardians[1], id);
    const b = shape(sim.lastProofData);
    // The first check-in of a period also creates the counter; compare two later ones.
    const { sim: sim2, id: id2, guardians: g2 } = world({ n: 3 });
    checkIn(sim2, g2[0], id2);
    checkIn(sim2, g2[1], id2);
    const c = shape(sim2.lastProofData);
    checkIn(sim2, g2[2], id2);
    const d = shape(sim2.lastProofData);
    expect(c).toBe(d);
    expect(b).toBe(c);
    expect(a).not.toBe(b);
  });
});

describe('§6.4.10 the lock does not block a check-in', () => {
  it('a guardian checks in while the identity is locked', () => {
    const { sim, id, guardians } = world();
    sim.call('lockIdentity', id);
    expect(() => checkIn(sim, guardians[0], id)).not.toThrow();
    expect(count(sim, id, periodOf(sim.now))).toBe(1n);
  });
});

describe('§6 check-ins and recovery are separate', () => {
  it('a check-in is neither an open nor an approval', () => {
    const { sim, id, guardians } = world();
    checkIn(sim, guardians[0], id);
    expect(sim.ledger.openNullifiers.size()).toBe(0n);
    expect(sim.ledger.approvedNullifiers.size()).toBe(0n);
    // And it spends no open: the same guardian opens afterwards.
    expect(() => openAs(sim, guardians[0], id, EPH_A)).not.toThrow();
  });
});
