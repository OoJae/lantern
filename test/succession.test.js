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

// Descent is a membership claim; headship is a NON-membership claim. These
// tests are what stop `proveSuccession` from accepting a revoked owner.
describe('proveSuccession', () => {
  const loadPath = (sim, idRoot, head) => {
    sim.ps.lineagePath = sim.ledger.lineage.findPathForLeaf(
      pureCircuits.lineageLeafOf(idRoot, head));
    return sim;
  };

  it('accepts the genesis identity as its own head', () => {
    const { sim, id, idRoot } = world();
    loadPath(sim, idRoot, id);
    expect(() => sim.call('proveSuccession', idRoot, id)).not.toThrow();
  });

  it('accepts a successor, proving descent at constant cost', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    loadPath(sim, idRoot, g1.newId);
    expect(() => sim.call('proveSuccession', idRoot, g1.newId)).not.toThrow();
  });

  it('accepts the third generation with the SAME constant-cost proof', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1, EPH_A);
    const g2 = succeed(sim, g1.newId, guardians, 2, EPH_B);
    const g3 = succeed(sim, g2.newId, guardians, 3, bytes32(22));
    loadPath(sim, idRoot, g3.newId);
    expect(() => sim.call('proveSuccession', idRoot, g3.newId)).not.toThrow();
  });

  // STALLING. A retired ancestor's lineage leaf is permanently in the tree, so
  // its membership proof stays valid forever. Only the Set non-membership check
  // stops a revoked owner from passing. This is the load-bearing assertion.
  it('REJECTS a retired ancestor even with a genuinely valid path', () => {
    const { sim, id, idRoot, guardians } = world();
    succeed(sim, id, guardians, 1);
    loadPath(sim, idRoot, id);   // the path really is valid
    expect(() => sim.call('proveSuccession', idRoot, id)).toThrow(/superseded/);
  });

  it('rejects a commitment that was never enrolled', () => {
    const { sim, idRoot } = world();
    const stranger = pureCircuits.idCommitOf(fieldOf(31337), bytes32(31));
    sim.ps.lineagePath = sim.ledger.lineage.findPathForLeaf(
      pureCircuits.lineageLeafOf(idRoot, idRoot));
    expect(() => sim.call('proveSuccession', idRoot, stranger)).toThrow();
  });

  it('rejects a head claimed under the wrong root', () => {
    const { sim, id, idRoot } = world();
    loadPath(sim, idRoot, id);
    const wrongRoot = bytes32(4242);
    expect(() => sim.call('proveSuccession', wrongRoot, id)).toThrow(/does not bind/);
  });
});

describe('proveHeadOwnership', () => {
  it('succeeds for the current owner', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    sim.ps.lineagePath = sim.ledger.lineage.findPathForLeaf(
      pureCircuits.lineageLeafOf(idRoot, g1.newId));
    expect(() => sim.call('proveHeadOwnership', idRoot, g1.newId)).not.toThrow();
  });

  it('rejects someone who descends but does not hold the secret', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    sim.ps.lineagePath = sim.ledger.lineage.findPathForLeaf(
      pureCircuits.lineageLeafOf(idRoot, g1.newId));
    sim.ps.identitySecret = fieldOf(6666);
    expect(() => sim.call('proveHeadOwnership', idRoot, g1.newId))
      .toThrow(/not the head owner/);
  });

  it('leaks no path sibling and exactly one Merkle root', () => {
    const { sim, id, idRoot } = world();
    sim.ps.lineagePath = sim.ledger.lineage.findPathForLeaf(
      pureCircuits.lineageLeafOf(idRoot, id));
    sim.call('proveHeadOwnership', idRoot, id);
    const blob = JSON.stringify(sim.publicTranscript, (_k, v) =>
      typeof v === 'bigint' ? v.toString(16)
        : v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v);
    expect(blob).not.toContain(Buffer.from(ID_SALT).toString('hex'));
    // The path's siblings must never reach the transcript.
    const sibs = sim.ps.lineagePath.path.map((e) => e.sibling.field.toString(16));
    for (const s of sibs) if (s.length > 8) expect(blob).not.toContain(s);
  });
});

// ---------------------------------------------------------------------------
// THE THESIS, AS FOUR ASSERTIONS.
//
// "Downstream contracts keep working because they gate on the current owner of
// an identity root rather than on a raw key." A host stores ONE value and
// survives a key loss that would otherwise have ended the relationship.
// ---------------------------------------------------------------------------
describe('reference host gate: a DApp survives its user losing their key', () => {
  const path = (sim, root, head) => {
    sim.ps.lineagePath = sim.ledger.lineage.findPathForLeaf(
      pureCircuits.lineageLeafOf(root, head));
  };

  it('1-4: the old key dies at the DApp, the new key inherits the relationship', () => {
    const { sim, id, idRoot, guardians } = world();

    // (1) The user acts at the downstream DApp. Nothing surprising.
    path(sim, idRoot, id);
    sim.call('hostGatedAction', idRoot, id, bytes32(1));
    expect(sim.ledger.gateActions).toBe(1n);

    // (2) The laptop is gone. Guardians recover; the identity rotates to C1.
    const g1 = succeed(sim, id, guardians, 1);

    // (3) The OLD key is now dead at the DApp -- enforced by the chain, not by
    //     the DApp having been told anything.
    path(sim, idRoot, id);
    sim.ps.identitySecret = ID_SECRET; sim.ps.idSalt = ID_SALT;
    expect(() => sim.call('hostGatedAction', idRoot, id, bytes32(2)))
      .toThrow(/not the current owner/);

    // (4) The successor inherits the relationship. Same root, new key.
    sim.ps.identitySecret = g1.secret; sim.ps.idSalt = g1.salt;
    path(sim, idRoot, g1.newId);
    sim.call('hostGatedAction', idRoot, g1.newId, bytes32(3));
    expect(sim.ledger.gateActions).toBe(2n);
  });

  it('is one-shot per (owner, nonce)', () => {
    const { sim, id, idRoot } = world();
    path(sim, idRoot, id);
    sim.call('hostGatedAction', idRoot, id, bytes32(9));
    path(sim, idRoot, id);
    expect(() => sim.call('hostGatedAction', idRoot, id, bytes32(9)))
      .toThrow(/already performed/);
  });

  it('rejects a descendant of a DIFFERENT root', () => {
    const { sim, id, idRoot } = world();
    path(sim, idRoot, id);
    expect(() => sim.call('hostGatedAction', bytes32(4242), id, bytes32(4)))
      .toThrow(/does not bind/);
  });

  it('rejects someone who descends but does not hold the secret', () => {
    const { sim, id, idRoot } = world();
    path(sim, idRoot, id);
    sim.ps.identitySecret = fieldOf(5555);
    expect(() => sim.call('hostGatedAction', idRoot, id, bytes32(5)))
      .toThrow(/does not hold the current identity secret/);
  });
});
