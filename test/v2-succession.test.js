// v1's test/succession.test.js, ported to v2 (docs/v2.md §10): succession,
// rotation, proveSuccession, proveHeadOwnership, the reference host gate, and
// the two D5 regressions. Opens are made by a guardian; each generation is a
// new head, so the same guardian may open every generation.
import { describe, it, expect } from 'vitest';
import {
  pureCircuits, bytes32, fieldOf,
  world, asGuardian, openAs, openAndApprove, succeed, ephSkFor, toUnlock, loadLineage, periodOf,
  ID_SECRET, ID_SALT, VETO_SECRET as VETO_SECRET_OLD, VETO_SALT as VETO_SALT_OLD,
  EPH_A, EPH_B, EPH_C, EPH_D, DELAY, hex,
} from './v2-fixtures.js';
import { assertNoLeak, encodingsOf, flatten } from '../src/leakscan.js';

const D = BigInt(DELAY);

describe('v2 succession: a SECOND recovery', () => {
  it('carries the genesis root forward to the successor', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    expect(hex(sim.ledger.idRoots.lookup(g1.newId))).toBe(hex(idRoot));
  });

  it('lets the ORIGINAL guardians recover the SUCCESSOR identity', () => {
    const { sim, id, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1, EPH_A);

    // The same guardian that opened generation 0 opens generation 1: a new head, a fresh quota.
    const rid2 = openAs(sim, guardians[0], g1.newId, EPH_B);
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

describe('v2 the retired-owner backdoor', () => {
  it('a RETIRED owner cannot mint guardian leaves for the successor', () => {
    const { sim, id, guardians } = world();
    succeed(sim, id, guardians, 1);
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
    expect(() => sim.call('rotateGuardianSet', id, bytes32(444))).toThrow(/identity retired/);
  });
});

describe('v2 guardian-set rotation', () => {
  // v2: the evicted guardian is refused at the OPEN already, and at approval
  // of a recovery someone else opened.
  it('evicts the entire guardian set without disclosing a leaf', () => {
    const { sim, id, guardians } = world();
    sim.call('rotateGuardianSet', id, bytes32(444));
    expect(() => openAs(sim, guardians[0], id, EPH_A)).toThrow(/does not bind/);

    sim.ps.guardianSecret = bytes32(300); sim.ps.leafSalt = bytes32(301);
    const fresh = { secret: bytes32(300), salt: bytes32(301), leaf: sim.call('addGuardian', id) };
    const rid = openAs(sim, fresh, id, EPH_A);
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

    const rid = openAs(sim, { secret: bytes32(300), salt: bytes32(301), leaf: leafA }, id, EPH_A);
    for (const [sec, salt, leaf] of [[300, 301, leafA], [302, 303, leafB]]) {
      sim.ps.guardianSecret = bytes32(sec);
      sim.ps.leafSalt = bytes32(salt);
      sim.ps.guardianPath = sim.findPath(leaf);
      sim.call('approveRecovery', id, rid);
    }
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(2n);
  });

  it('rejects a context already claimed by another identity', () => {
    const { sim, id } = world();
    const bobSecret = fieldOf(900), bobSalt = bytes32(901);
    const bobId = pureCircuits.idCommitOf(bobSecret, bobSalt);
    sim.ps.identitySecret = bobSecret; sim.ps.idSalt = bobSalt;
    sim.call('enrollIdentity', bobId, pureCircuits.vetoCommitOf(fieldOf(902), bytes32(903)), 2n, D);
    expect(() => sim.call('rotateGuardianSet', bobId, id)).toThrow(/context already used/);
  });

  // v2 addition: the rotation also resets the veto count (docs/v2.md §3.1 rule 4).
  it('the rotated context survives a recovery, and the rotation resets the veto count', () => {
    const { sim, id, guardians: old } = world();
    const vetoed = openAs(sim, old[0], id, EPH_C);
    sim.call('vetoRecovery', vetoed);
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(1n);

    sim.call('rotateGuardianSet', id, bytes32(555));
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(0n);
    const guardians = [];
    for (let i = 0; i < 2; i++) {
      sim.ps.guardianSecret = bytes32(400 + i);
      sim.ps.leafSalt = bytes32(420 + i);
      guardians.push({ secret: bytes32(400 + i), salt: bytes32(420 + i), leaf: sim.call('addGuardian', id) });
    }
    // No cooldown to wait out: the count is back at zero.
    const g1 = succeed(sim, id, guardians, 1);
    const rid = openAs(sim, guardians[0], g1.newId, EPH_B);
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('approveRecovery', g1.newId, rid)).not.toThrow();
  });
});

describe('v2 proveSuccession', () => {
  it('accepts the genesis identity as its own head', () => {
    const { sim, id, idRoot } = world();
    loadLineage(sim, idRoot, id);
    expect(() => sim.call('proveSuccession', idRoot, id)).not.toThrow();
  });

  it('accepts a successor, proving descent at constant cost', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    loadLineage(sim, idRoot, g1.newId);
    expect(() => sim.call('proveSuccession', idRoot, g1.newId)).not.toThrow();
  });

  it('accepts the third generation with the SAME constant-cost proof', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1, EPH_A);
    const g2 = succeed(sim, g1.newId, guardians, 2, EPH_B);
    const g3 = succeed(sim, g2.newId, guardians, 3, EPH_C);
    loadLineage(sim, idRoot, g3.newId);
    expect(() => sim.call('proveSuccession', idRoot, g3.newId)).not.toThrow();
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);
  });

  it('REJECTS a retired ancestor even with a genuinely valid path', () => {
    const { sim, id, idRoot, guardians } = world();
    succeed(sim, id, guardians, 1);
    loadLineage(sim, idRoot, id);
    expect(() => sim.call('proveSuccession', idRoot, id)).toThrow(/superseded/);
  });

  it('rejects a commitment that was never enrolled', () => {
    const { sim, idRoot } = world();
    const stranger = pureCircuits.idCommitOf(fieldOf(31337), bytes32(31));
    loadLineage(sim, idRoot, idRoot);
    expect(() => sim.call('proveSuccession', idRoot, stranger)).toThrow();
  });

  it('rejects a head claimed under the wrong root', () => {
    const { sim, id, idRoot } = world();
    loadLineage(sim, idRoot, id);
    expect(() => sim.call('proveSuccession', bytes32(4242), id)).toThrow(/does not bind/);
  });
});

describe('v2 proveHeadOwnership', () => {
  it('succeeds for the current owner', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    loadLineage(sim, idRoot, g1.newId);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);
    expect(() => sim.call('proveHeadOwnership', idRoot, g1.newId)).not.toThrow();
  });

  it('rejects someone who descends but does not hold the secret', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    loadLineage(sim, idRoot, g1.newId);
    sim.ps.identitySecret = fieldOf(6666);
    expect(() => sim.call('proveHeadOwnership', idRoot, g1.newId)).toThrow(/not the head owner/);
  });

  it('discloses the root it checks against, and no path sibling or identity secret', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1, EPH_A);
    const g2 = succeed(sim, g1.newId, guardians, 2, EPH_B);
    const path = sim.ledger.lineage.findPathForLeaf(pureCircuits.lineageLeafOf(idRoot, g2.newId));
    sim.ps.lineagePath = path;
    sim.call('proveHeadOwnership', idRoot, g2.newId);

    const secrets = { identitySecret: g2.secret, idSalt: g2.salt };
    path.path.forEach((e, i) => {
      if (e.sibling.field > 0xffffffffffffffffn) secrets[`sibling${i}`] = e.sibling.field;
    });
    expect(Object.keys(secrets).length).toBeGreaterThan(2);
    assertNoLeak(sim.lastProofData, secrets);

    const pd = sim.lastProofData;
    const pub = flatten([pd.input, pd.output, pd.publicTranscript]);
    expect(encodingsOf(sim.ledger.lineage.root().field).some((f) => pub.includes(f))).toBe(true);
  });
});

describe('v2 reference host gate: a DApp survives its user losing their key', () => {
  it('1-4: the old key dies at the DApp, the new key inherits the relationship', () => {
    const { sim, id, idRoot, guardians } = world();

    loadLineage(sim, idRoot, id);
    sim.call('hostGatedAction', idRoot, id, bytes32(1));
    expect(sim.ledger.gateActions).toBe(1n);

    const g1 = succeed(sim, id, guardians, 1);

    loadLineage(sim, idRoot, id);
    sim.ps.identitySecret = ID_SECRET; sim.ps.idSalt = ID_SALT;
    expect(() => sim.call('hostGatedAction', idRoot, id, bytes32(2))).toThrow(/not the current owner/);

    sim.ps.identitySecret = g1.secret; sim.ps.idSalt = g1.salt;
    loadLineage(sim, idRoot, g1.newId);
    sim.call('hostGatedAction', idRoot, g1.newId, bytes32(3));
    expect(sim.ledger.gateActions).toBe(2n);
  });

  it('is one-shot per (owner, nonce)', () => {
    const { sim, id, idRoot } = world();
    loadLineage(sim, idRoot, id);
    sim.call('hostGatedAction', idRoot, id, bytes32(9));
    loadLineage(sim, idRoot, id);
    expect(() => sim.call('hostGatedAction', idRoot, id, bytes32(9))).toThrow(/already performed/);
  });

  it('rejects a descendant of a DIFFERENT root', () => {
    const { sim, id, idRoot } = world();
    loadLineage(sim, idRoot, id);
    expect(() => sim.call('hostGatedAction', bytes32(4242), id, bytes32(4))).toThrow(/does not bind/);
  });

  it('rejects someone who descends but does not hold the secret', () => {
    const { sim, id, idRoot } = world();
    loadLineage(sim, idRoot, id);
    sim.ps.identitySecret = fieldOf(5555);
    expect(() => sim.call('hostGatedAction', idRoot, id, bytes32(5)))
      .toThrow(/does not hold the current identity secret/);
  });
});

describe('v2 regression: a guardian-set rotation kills a recovery that already reached quorum', () => {
  // v2 addition: the rotation also frees the slot at once.
  it('a quorum reached before the rotation can no longer finalise, and the slot is free', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.call('rotateGuardianSet', id, bytes32(777));
    toUnlock(sim, rid);
    expect(() => sim.call('finalizeRecovery', rid,
      pureCircuits.idCommitOf(fieldOf(70), bytes32(71)),
      pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81))))
      .toThrow(/guardian set was rotated/);

    sim.ps.guardianSecret = bytes32(310); sim.ps.leafSalt = bytes32(311);
    const fresh = { secret: bytes32(310), salt: bytes32(311), leaf: sim.call('addGuardian', id) };
    expect(() => openAs(sim, fresh, id, EPH_B)).not.toThrow();
  });

  it('an unrotated quorum still finalises normally', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    expect(() => sim.call('finalizeRecovery', rid,
      pureCircuits.idCommitOf(fieldOf(70), bytes32(71)),
      pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81)))).not.toThrow();
  });
});

describe('v2 regression: holding the identity secret is not enough to rotate or mint guardians', () => {
  const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
  const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));
  const asSecretHolder = (sim) => { sim.ps.vetoSecret = fieldOf(6060); sim.ps.vetoSalt = bytes32(6061); };

  it('a secret-holder without the veto card cannot evict the guardians', () => {
    const { sim, id, idRoot } = world({ n: 3 });
    const ctxBefore = hex(sim.ledger.guardianCtx.lookup(idRoot));
    asSecretHolder(sim);
    expect(() => sim.call('rotateGuardianSet', id, bytes32(901)))
      .toThrow(/rotating the guardian set requires the veto secret/);
    sim.ps.vetoSecret = ID_SECRET; sim.ps.vetoSalt = ID_SALT;
    expect(() => sim.call('rotateGuardianSet', id, bytes32(901))).toThrow(/requires the veto secret/);
    expect(hex(sim.ledger.guardianCtx.lookup(idRoot))).toBe(ctxBefore);
  });

  it('the stolen-device lockout: the thief cannot kill a recovery that reached quorum', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAndApprove(sim, id, guardians, 2, EPH_A);
    const card = { vetoSecret: sim.ps.vetoSecret, vetoSalt: sim.ps.vetoSalt };

    asSecretHolder(sim);
    expect(() => sim.call('rotateGuardianSet', id, bytes32(902))).toThrow(/requires the veto secret/);
    sim.ps.vetoSecret = ID_SECRET; sim.ps.vetoSalt = ID_SALT;
    expect(() => sim.call('vetoRecovery', rid)).toThrow(/veto secret does not open/);

    Object.assign(sim.ps, card);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    toUnlock(sim, rid);
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).not.toThrow();
    expect(sim.ledger.retiredIdentities.member(id)).toBe(true);
  });

  // v1 let the colluders open a SECOND recovery beside the owner's. v2 allows
  // one live recovery per identity, so the port runs the race the other way
  // round: the colluders open first and reach quorum; the owner vetoes theirs;
  // after the 1-day cooldown an honest guardian opens the owner's. Every v1
  // refusal is kept, and the colluders' second open is refused outright.
  it('colluders who pooled shares cannot stop the owner recovery finalizing', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const card = { vetoSecret: sim.ps.vetoSecret, vetoSalt: sim.ps.vetoSalt };
    // Guardians 1 and 2 collude: their pooled shares rebuild the identity secret.
    const theirRid = openAs(sim, guardians[1], id, EPH_C);
    for (const g of guardians.slice(1)) { asGuardian(sim, g); sim.call('approveRecovery', id, theirRid); }

    // The owner's card kills theirs; after the cooldown, guardian 0 opens the owner's new phone.
    sim.call('vetoRecovery', theirRid);
    expect(() => openAs(sim, guardians[0], id, EPH_A)).toThrow(/cooling down after a veto/);
    sim.advance(86_400 + 600);
    const ownerRid = openAndApprove(sim, id, guardians, 2, EPH_A);

    // The colluders cannot open a competing recovery while the owner's is in flight.
    expect(() => openAs(sim, guardians[2], id, EPH_D)).toThrow(/already live/);
    asSecretHolder(sim);
    expect(() => sim.call('rotateGuardianSet', id, bytes32(903))).toThrow(/requires the veto secret/);
    sim.ps.ephemeralSk = ephSkFor(EPH_C);
    toUnlock(sim, ownerRid);
    expect(() => sim.call('finalizeRecovery', ownerRid, NEW_ID(), NEW_VETO()))
      .toThrow(/not the device the guardians approved/);
    expect(() => sim.call('finalizeRecovery', theirRid, NEW_ID(), NEW_VETO())).toThrow(/recovery vetoed/);

    Object.assign(sim.ps, card);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    expect(() => sim.call('finalizeRecovery', ownerRid, NEW_ID(), NEW_VETO())).not.toThrow();
  });

  // v2 addition: the thief holds no leaf, so cannot even open.
  it('a thief holding only the identity secret cannot mint a quorum, and cannot open at all', () => {
    const { sim, id, guardians } = world({ n: 3 });
    asSecretHolder(sim);
    sim.ps.guardianSecret = bytes32(3000); sim.ps.leafSalt = bytes32(3100);
    expect(() => sim.call('addGuardian', id)).toThrow(/adding a guardian requires the veto secret/);
    expect(sim.ledger.guardians.firstFree()).toBe(3n);

    // No leaf of their own: a real guardian's genuine path does not bind to the thief's secret.
    sim.ps.ephemeralSk = ephSkFor(EPH_C);
    sim.ps.guardianPath = sim.findPath(guardians[0].leaf);
    expect(() => sim.call('openRecovery', id, EPH_C, periodOf(sim.now))).toThrow(/does not bind/);
    expect(sim.ledger.liveRecovery.member(id)).toBe(false);
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
