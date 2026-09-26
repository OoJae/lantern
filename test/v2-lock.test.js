// The emergency lock (docs/v2.md §4). The cases of §4.6, in its order. Case 9,
// the three lock races, is in test/v2-concurrency.test.js with the other replays.
import { describe, it, expect } from 'vitest';
import {
  pureCircuits, bytes32, fieldOf,
  world, asGuardian, openAs, openAndApprove, toUnlock, succeed, loadLineage, periodOf,
  ID_SECRET, ID_SALT, VETO_SECRET, VETO_SALT, EPH_A, DAY, NO_RESERVATION, vetoCommit,
} from './v2-fixtures.js';
import { assertNoLeak } from '../src/leakscan.js';

const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));
const gate = (sim, root, head, nonce) => { loadLineage(sim, root, head); return sim.call('hostGatedAction', root, head, bytes32(nonce)); };
/** Whoever took the device: the identity secret, not the veto card. */
const asThief = (sim) => { sim.ps.identitySecret = ID_SECRET; sim.ps.idSalt = ID_SALT; sim.ps.vetoSecret = fieldOf(6060); sim.ps.vetoSalt = bytes32(6061); };
/** Whoever copied the veto card, and nothing else. */
const asCardOnly = (sim) => { sim.ps.identitySecret = fieldOf(7070); sim.ps.idSalt = bytes32(7071); sim.ps.vetoSecret = VETO_SECRET; sim.ps.vetoSalt = VETO_SALT; };
const asOwner = (sim) => { sim.ps.identitySecret = ID_SECRET; sim.ps.idSalt = ID_SALT; sim.ps.vetoSecret = VETO_SECRET; sim.ps.vetoSalt = VETO_SALT; };

describe('§4.6.1 the card holder locks', () => {
  it('then the gate and proveHeadOwnership refuse, and proveSuccession still passes', () => {
    const { sim, id, idRoot } = world();
    asCardOnly(sim);
    sim.call('lockIdentity', id);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(true);
    asOwner(sim);
    expect(() => gate(sim, idRoot, id, 1)).toThrow(/identity is locked/);
    loadLineage(sim, idRoot, id);
    expect(() => sim.call('proveHeadOwnership', idRoot, id)).toThrow(/identity is locked/);
    expect(() => sim.call('proveSuccession', idRoot, id)).not.toThrow();
  });
});

describe('§4.6.2 locking needs the veto card', () => {
  it('the identity secret alone cannot lock', () => {
    const { sim, id, idRoot } = world();
    asThief(sim);
    expect(() => sim.call('lockIdentity', id)).toThrow(/locking requires the veto secret/);
    // Presenting the identity secret AS the card does not work either.
    sim.ps.vetoSecret = ID_SECRET; sim.ps.vetoSalt = ID_SALT;
    expect(() => sim.call('lockIdentity', id)).toThrow(/locking requires the veto secret/);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);
  });
});

describe('§4.6.3 unlocking needs both secrets', () => {
  it('a thief with only the identity secret cannot unlock; the card alone cannot; both can', () => {
    const { sim, id, idRoot } = world();
    sim.call('lockIdentity', id);
    asThief(sim);
    expect(() => sim.call('unlockIdentity', id, vetoCommit())).toThrow(/unlocking requires the veto secret/);
    asCardOnly(sim);
    expect(() => sim.call('unlockIdentity', id, vetoCommit())).toThrow(/not the identity owner/);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(true);
    asOwner(sim);
    sim.call('unlockIdentity', id, vetoCommit());
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);
    expect(() => gate(sim, idRoot, id, 2)).not.toThrow();
    expect(sim.ledger.gateActions).toBe(1n);
  });
});

describe('§4.6.4 nothing else is blocked while locked', () => {
  it('addGuardian, checkIn, rotation and a veto all succeed', () => {
    const { sim, id, guardians } = world();
    sim.call('lockIdentity', id);
    sim.ps.guardianSecret = bytes32(160); sim.ps.leafSalt = bytes32(161);
    expect(() => sim.call('addGuardian', id)).not.toThrow();
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('checkIn', id, periodOf(sim.now))).not.toThrow();
    const rid = openAs(sim, guardians[1], id, EPH_A);
    expect(() => sim.call('vetoRecovery', rid, NO_RESERVATION)).not.toThrow();
    expect(() => sim.call('rotateGuardianSet', id, bytes32(446))).not.toThrow();
    expect(sim.ledger.locked.lookup(id)).toBe(true);
  });

  it("a guardian's open, the approvals and the finalize all succeed: recovery is the way out", () => {
    const { sim, id, guardians } = world();
    sim.call('lockIdentity', id);
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).not.toThrow();
  });
});

describe('§4.6.5 a finalize clears the lock', () => {
  it('the successor passes the gate with its new secret, and the old secret is refused as retired', () => {
    const { sim, id, idRoot, guardians } = world();
    sim.call('lockIdentity', id);
    const g1 = succeed(sim, id, guardians, 1);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);
    expect(() => gate(sim, idRoot, g1.newId, 3)).not.toThrow();
    loadLineage(sim, idRoot, g1.newId);
    expect(() => sim.call('proveHeadOwnership', idRoot, g1.newId)).not.toThrow();
    asOwner(sim);
    expect(() => gate(sim, idRoot, id, 4)).toThrow(/not the current owner/);
  });
});

describe('§4.6.6 the wrong card', () => {
  it('the OLD card cannot lock or unlock the successor', () => {
    const { sim, id, idRoot, guardians } = world();
    const g1 = succeed(sim, id, guardians, 1);
    asOwner(sim);   // the old secret and the old card
    expect(() => sim.call('lockIdentity', id)).toThrow(/identity retired/);
    expect(() => sim.call('unlockIdentity', id, vetoCommit())).toThrow(/identity retired/);
    // Nor through the successor's commitment: the old card does not open its veto commitment.
    expect(() => sim.call('lockIdentity', g1.newId)).toThrow(/locking requires the veto secret/);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);
    // The successor's own card does.
    sim.ps.vetoSecret = g1.vSecret; sim.ps.vetoSalt = g1.vSalt;
    sim.call('lockIdentity', g1.newId);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(true);
  });

  it("another identity's card cannot lock this one", () => {
    const { sim, id, idRoot } = world();
    const bSecret = fieldOf(520), bSalt = bytes32(521);
    sim.ps.identitySecret = bSecret; sim.ps.idSalt = bSalt;
    sim.ps.vetoSecret = fieldOf(522); sim.ps.vetoSalt = bytes32(523);
    sim.call('enrollIdentity', pureCircuits.idCommitOf(bSecret, bSalt),
      pureCircuits.vetoCommitOf(fieldOf(522), bytes32(523)), 2n, 86_400n);
    expect(() => sim.call('lockIdentity', id)).toThrow(/locking requires the veto secret/);
    expect(sim.ledger.locked.lookup(idRoot)).toBe(false);
  });
});

describe('§4.6.7 scope and idempotence', () => {
  it('locking A does not lock B; lock and unlock are idempotent', () => {
    const { sim, id } = world();
    const bSecret = fieldOf(530), bSalt = bytes32(531);
    const bId = pureCircuits.idCommitOf(bSecret, bSalt);
    const bCard = { vetoSecret: fieldOf(532), vetoSalt: bytes32(533) };
    sim.ps.identitySecret = bSecret; sim.ps.idSalt = bSalt; Object.assign(sim.ps, bCard);
    sim.call('enrollIdentity', bId, pureCircuits.vetoCommitOf(bCard.vetoSecret, bCard.vetoSalt), 2n, 86_400n);

    asOwner(sim);
    sim.call('lockIdentity', id);
    expect(() => sim.call('lockIdentity', id)).not.toThrow();
    expect(sim.ledger.locked.lookup(id)).toBe(true);
    expect(sim.ledger.locked.lookup(bId)).toBe(false);
    sim.ps.identitySecret = bSecret; sim.ps.idSalt = bSalt; Object.assign(sim.ps, bCard);
    expect(() => gate(sim, bId, bId, 5)).not.toThrow();

    asOwner(sim);
    sim.call('unlockIdentity', id, vetoCommit());
    expect(() => sim.call('unlockIdentity', id, vetoCommit())).not.toThrow();
    expect(sim.ledger.locked.lookup(id)).toBe(false);
  });
});

describe('§4.6.8 a refused gate call spends nothing', () => {
  it('a gate call refused while locked does not consume its nonce', () => {
    const { sim, id, idRoot } = world();
    sim.call('lockIdentity', id);
    expect(() => gate(sim, idRoot, id, 42)).toThrow(/identity is locked/);
    sim.call('unlockIdentity', id, vetoCommit());
    expect(() => gate(sim, idRoot, id, 42)).not.toThrow();
    expect(() => gate(sim, idRoot, id, 42)).toThrow(/already performed/);
  });
});

describe('§4.6.10 privacy of lock and unlock', () => {
  it("lockIdentity's public transcript holds no veto secret or salt", () => {
    const { sim, id } = world();
    sim.call('lockIdentity', id);
    assertNoLeak(sim.lastProofData, { vetoSecret: VETO_SECRET, vetoSalt: VETO_SALT });
  });

  it("unlockIdentity's public transcript holds neither secret nor either salt", () => {
    const { sim, id } = world();
    sim.call('lockIdentity', id);
    sim.call('unlockIdentity', id, vetoCommit());
    assertNoLeak(sim.lastProofData, {
      identitySecret: ID_SECRET, idSalt: ID_SALT, vetoSecret: VETO_SECRET, vetoSalt: VETO_SALT,
    });
  });
});

describe('§4 the lock and the rest of v2', () => {
  it('a lock survives a rotation, and a veto, and is cleared only by an unlock or a finalize', () => {
    const { sim, id, guardians } = world({ n: 3 });
    sim.call('lockIdentity', id);
    const rid = openAs(sim, guardians[0], id, EPH_A);
    sim.call('vetoRecovery', rid, NO_RESERVATION);
    sim.call('rotateGuardianSet', id, bytes32(447));
    sim.advance(DAY);
    expect(sim.ledger.locked.lookup(id)).toBe(true);
    sim.call('unlockIdentity', id, vetoCommit());
    expect(sim.ledger.locked.lookup(id)).toBe(false);
  });
});
