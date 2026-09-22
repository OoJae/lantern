import { describe, it, expect } from 'vitest';
import { pureCircuits, bytes32, fieldOf } from './simulator.js';
import {
  world, asGuardian, openAndApprove, succeed, ephSkFor,
  ID_SECRET, ID_SALT, VETO_SECRET as VETO_SECRET_OLD, VETO_SALT as VETO_SALT_OLD,
  EPH_A, EPH_B, EPH_C, DELAY, SLACK,
} from './fixtures.js';
import { assertNoLeak, encodingsOf, flatten } from '../src/leakscan.js';

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
    const g3 = succeed(sim, g2.newId, guardians, 3, EPH_C);
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
    const g3 = succeed(sim, g2.newId, guardians, 3, EPH_C);
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

  it('discloses the root it checks against, and no path sibling or identity secret', () => {
    const { sim, id, idRoot, guardians } = world();
    // Two recoveries, so the lineage tree holds real (non-empty) sibling hashes.
    const g1 = succeed(sim, id, guardians, 1, EPH_A);
    const g2 = succeed(sim, g1.newId, guardians, 2, EPH_B);
    const path = sim.ledger.lineage.findPathForLeaf(pureCircuits.lineageLeafOf(idRoot, g2.newId));
    sim.ps.lineagePath = path;
    sim.call('proveHeadOwnership', idRoot, g2.newId);

    // Siblings that are real node hashes reveal tree structure. Each must be
    // seen privately (the positive control) and never publicly.
    const secrets = { identitySecret: g2.secret, idSalt: g2.salt };
    path.path.forEach((e, i) => {
      if (e.sibling.field > 0xffffffffffffffffn) secrets[`sibling${i}`] = e.sibling.field;
    });
    expect(Object.keys(secrets).length).toBeGreaterThan(2);
    assertNoLeak(sim.lastProofData, secrets);

    // The one thing the path DOES disclose: the root it is checked against.
    const pd = sim.lastProofData;
    const pub = flatten([pd.input, pd.output, pd.publicTranscript]);
    expect(encodingsOf(sim.ledger.lineage.root().field).some((f) => pub.includes(f))).toBe(true);
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

// Regression. Previously finalizeRecovery never re-read guardianCtx, so
// rotating the guardian set was forward-looking only: it invalidated PENDING
// approvals, but a recovery that had already reached quorum still finalised.
// An owner who discovered a guardian compromise and rotated would lose the
// identity anyway. Reproduced before the fix.
describe('regression: a guardian-set rotation kills a recovery that already reached quorum', () => {
  it('a quorum reached before the rotation can no longer finalise', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);   // quorum reached
    sim.call('rotateGuardianSet', id, bytes32(777));     // owner evicts them
    sim.advance(DELAY + SLACK + 1);
    expect(() => sim.call('finalizeRecovery', rid,
      pureCircuits.idCommitOf(fieldOf(70), bytes32(71)),
      pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81))))
      .toThrow(/guardian set was rotated/);
  });

  it('an unrotated quorum still finalises normally', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.advance(DELAY + SLACK + 1);
    expect(() => sim.call('finalizeRecovery', rid,
      pureCircuits.idCommitOf(fieldOf(70), bytes32(71)),
      pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81)))).not.toThrow();
  });
});

// Regression (D5). Rotation was authenticated by the identity secret alone.
// Because a rotation kills every in-flight recovery, anyone holding that
// secret -- a thief with the lost laptop, malware, or guardians who pooled
// their shares -- could kill the owner's recovery even after it reached
// quorum, and evict the guardians so they could never approve for her again:
// a permanent lockout. Reproduced before the fix. Rotation now also requires
// the veto secret, which a lost device does not hold.
describe('regression: holding the identity secret is not enough to rotate or mint guardians', () => {
  const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
  const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));
  /** Whoever holds the lost device's identity secret but not the veto card. */
  const asSecretHolder = (sim) => { sim.ps.vetoSecret = fieldOf(6060); sim.ps.vetoSalt = bytes32(6061); };

  it('a secret-holder without the veto card cannot evict the guardians', () => {
    const { sim, id, idRoot } = world({ n: 3 });
    const ctxBefore = hex(sim.ledger.guardianCtx.lookup(idRoot));
    asSecretHolder(sim);
    expect(() => sim.call('rotateGuardianSet', id, bytes32(901)))
      .toThrow(/rotating the guardian set requires the veto secret/);
    // Presenting the identity secret AS the veto secret does not work either.
    sim.ps.vetoSecret = ID_SECRET; sim.ps.vetoSalt = ID_SALT;
    expect(() => sim.call('rotateGuardianSet', id, bytes32(901)))
      .toThrow(/requires the veto secret/);
    expect(hex(sim.ledger.guardianCtx.lookup(idRoot))).toBe(ctxBefore);
  });

  it('the stolen-device lockout: the thief cannot kill a recovery that reached quorum', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAndApprove(sim, id, guardians, 2, EPH_A);   // the owner's new phone
    const card = { vetoSecret: sim.ps.vetoSecret, vetoSalt: sim.ps.vetoSalt };

    asSecretHolder(sim);
    expect(() => sim.call('rotateGuardianSet', id, bytes32(902))).toThrow(/requires the veto secret/);
    sim.ps.vetoSecret = ID_SECRET; sim.ps.vetoSalt = ID_SALT;
    expect(() => sim.call('vetoRecovery', rid)).toThrow(/veto secret does not open/);

    Object.assign(sim.ps, card);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    sim.advance(DELAY + SLACK + 1);
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).not.toThrow();
    expect(sim.ledger.retiredIdentities.member(id)).toBe(true);
  });

  it('colluders who pooled shares cannot stop the owner recovery finalizing', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const card = { vetoSecret: sim.ps.vetoSecret, vetoSalt: sim.ps.vetoSalt };
    // The owner's new phone: guardian 0 and guardian 1 approve.
    const ownerRid = openAndApprove(sim, id, guardians, 2, EPH_A);
    // Guardians 1 and 2 collude. Their pooled shares rebuild the identity
    // secret; they open a recovery for THEIR device and approve it.
    sim.ps.ephemeralSk = ephSkFor(EPH_C);
    const theirRid = sim.call('openRecovery', id, EPH_C);
    for (const g of guardians.slice(1)) { asGuardian(sim, g); sim.call('approveRecovery', id, theirRid); }

    asSecretHolder(sim);
    expect(() => sim.call('rotateGuardianSet', id, bytes32(903))).toThrow(/requires the veto secret/);
    sim.ps.ephemeralSk = ephSkFor(EPH_C);
    sim.advance(DELAY + SLACK + 1);
    expect(() => sim.call('finalizeRecovery', ownerRid, NEW_ID(), NEW_VETO()))
      .toThrow(/not the device the guardians approved/);

    // The owner, holding the veto card, kills their recovery and finalizes her own.
    Object.assign(sim.ps, card);
    sim.call('vetoRecovery', theirRid);
    sim.ps.ephemeralSk = ephSkFor(EPH_C);
    expect(() => sim.call('finalizeRecovery', theirRid, NEW_ID(), NEW_VETO())).toThrow(/recovery vetoed/);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    expect(() => sim.call('finalizeRecovery', ownerRid, NEW_ID(), NEW_VETO())).not.toThrow();
  });

  it('a thief holding only the identity secret cannot mint a quorum and take the identity', () => {
    // Reproduced before the fix: with no guardian involved, the thief minted
    // two guardian tokens, opened a recovery for their own device, approved it
    // twice and finalized 72h later. Only a veto in time could have stopped it.
    const { sim, id } = world({ n: 3 });
    asSecretHolder(sim);
    sim.ps.guardianSecret = bytes32(3000); sim.ps.leafSalt = bytes32(3100);
    expect(() => sim.call('addGuardian', id)).toThrow(/adding a guardian requires the veto secret/);
    expect(sim.ledger.guardians.firstFree()).toBe(3n);
  });

  it('the owner, holding both the secret and the veto card, still rotates', () => {
    const { sim, id, idRoot } = world({ n: 3 });
    sim.call('rotateGuardianSet', id, bytes32(904));
    expect(hex(sim.ledger.guardianCtx.lookup(idRoot))).toBe(hex(bytes32(904)));
  });

  it('after a recovery, the successor rotates with its NEW veto card, not the old one', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const g1 = succeed(sim, id, guardians, 1, EPH_A);
    sim.ps.vetoSecret = VETO_SECRET_OLD; sim.ps.vetoSalt = VETO_SALT_OLD;
    expect(() => sim.call('rotateGuardianSet', g1.newId, bytes32(905))).toThrow(/requires the veto secret/);
    sim.ps.vetoSecret = g1.vSecret; sim.ps.vetoSalt = g1.vSalt;
    expect(() => sim.call('rotateGuardianSet', g1.newId, bytes32(905))).not.toThrow();
  });
});
