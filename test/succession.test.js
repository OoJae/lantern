import { describe, it, expect } from 'vitest';
import { pureCircuits, bytes32, fieldOf } from './simulator.js';
import {
  world, asGuardian, openAndApprove, succeed,
  ID_SECRET, ID_SALT, EPH_A, EPH_B, DELAY, SLACK,
} from './fixtures.js';

const hex = (u) => Buffer.from(u).toString('hex');

// The Phase 2 defect: guardian leaves bound the ROTATING commitment, so after a
// successful recovery the successor had zero guardians and Lantern worked
// exactly once per identity. These are the tests that prove the fix.
describe('succession: a SECOND recovery', () => {
  it('carries the genesis root forward to the successor', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    expect(hex(sim.ledger.idRoots.lookup(g1.newId))).toBe(hex(idRoot));
  });

  it('lets the ORIGINAL guardians recover the SUCCESSOR identity', () => {
    const { sim, id, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1, EPH_A);

    const rid2 = sim.call('openRecovery', g1.newId, EPH_B);
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('approveRecovery', g1.newId, rid2)).not.toThrow();
    asGuardian(sim, guardians[1]);
    sim.call('approveRecovery', g1.newId, rid2);
    expect(sim.ledger.approvals.lookup(rid2).read()).toBe(2n);
  });

  it('survives three generations, so it is not a one-off', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1, EPH_A);
    const g2 = succeed(sim, g1.newId, guardians, 2, EPH_B);
    const g3 = succeed(sim, g2.newId, guardians, 3, bytes32(22));
    for (const c of [g1.newId, g2.newId, g3.newId]) {
      expect(hex(sim.ledger.idRoots.lookup(c))).toBe(hex(idRoot));
    }
  });

  it('the successor inherits the threshold', () => {
    const { sim, id, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    expect(sim.ledger.thresholds.lookup(g1.newId)).toBe(2n);
  });
});

// Binding leaves to a permanent root would, without the retirement check, let a
// thief holding the OLD secret mint guardian leaves that are valid for the
// victim's NEW identity -- turning social recovery into a one-way ratchet.
describe('the retired-owner backdoor', () => {
  it('a RETIRED owner cannot mint guardian leaves for the successor', () => {
    const { sim, id, guardians } = world();
    succeed(sim, id, guardians, 1);

    // The thief still holds the original secret and its salt.
    sim.ps.identitySecret = ID_SECRET;
    sim.ps.idSalt = ID_SALT;
    sim.ps.guardianSecret = bytes32(999);
    sim.ps.leafSalt = bytes32(998);
    expect(() => sim.call('addGuardian', id)).toThrow(/identity retired/);
  });

  it('a retired owner cannot rotate the guardian set either', () => {
    const { sim, id, guardians } = world();
    succeed(sim, id, guardians, 1);
    sim.ps.identitySecret = ID_SECRET;
    sim.ps.idSalt = ID_SALT;
    expect(() => sim.call('rotateGuardianSet', id, bytes32(444)))
      .toThrow(/identity retired/);
  });
});

describe('guardian-set rotation', () => {
  it('evicts the entire guardian set without disclosing a leaf', () => {
    const { sim, id, guardians } = world();
    sim.call('rotateGuardianSet', id, bytes32(444));
    const rid = sim.call('openRecovery', id, EPH_A);
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/does not bind/);
  });

  it('guardians re-added under the new context work again', () => {
    const { sim, id } = world();
    sim.call('rotateGuardianSet', id, bytes32(444));
    sim.ps.guardianSecret = bytes32(300);
    sim.ps.leafSalt = bytes32(301);
    const leafA = sim.call('addGuardian', id);
    sim.ps.guardianSecret = bytes32(302);
    sim.ps.leafSalt = bytes32(303);
    const leafB = sim.call('addGuardian', id);

    const rid = sim.call('openRecovery', id, EPH_A);
    for (const [sec, salt, leaf] of [[300, 301, leafA], [302, 303, leafB]]) {
      sim.ps.guardianSecret = bytes32(sec);
      sim.ps.leafSalt = bytes32(salt);
      sim.ps.guardianPath = sim.findPath(leaf);
      sim.call('approveRecovery', id, rid);
    }
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(2n);
  });

  // Without global ctx uniqueness, Bob sets his ctx equal to Alice's and mints
  // leaves that are valid for HER recoveries.
  it('rejects a context already claimed by another identity', () => {
    const { sim, id } = world();
    const bobSecret = fieldOf(900), bobSalt = bytes32(901);
    const bobId = pureCircuits.idCommitOf(bobSecret, bobSalt);
    sim.ps.identitySecret = bobSecret; sim.ps.idSalt = bobSalt;
    sim.call('enrollIdentity', bobId, pureCircuits.vetoCommitOf(fieldOf(902), bytes32(903)), 2n);

    // Bob tries to adopt Alice's context.
    expect(() => sim.call('rotateGuardianSet', bobId, id)).toThrow(/context already used/);
  });

  it('the rotated context survives a recovery', () => {
    const { sim, id } = world();
    sim.call('rotateGuardianSet', id, bytes32(555));
    const guardians = [];
    for (let i = 0; i < 2; i++) {
      sim.ps.guardianSecret = bytes32(400 + i);
      sim.ps.leafSalt = bytes32(420 + i);
      guardians.push({ secret: bytes32(400 + i), salt: bytes32(420 + i), leaf: sim.call('addGuardian', id) });
    }
    const g1 = succeed(sim, id, guardians, 1);
    // Same guardians, same rotated ctx, now against the successor.
    const rid = sim.call('openRecovery', g1.newId, EPH_B);
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('approveRecovery', g1.newId, rid)).not.toThrow();
  });
});
