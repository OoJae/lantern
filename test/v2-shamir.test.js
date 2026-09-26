// v1's "shamir x circuit (end to end)", ported to v2 (docs/v2.md §10). The claim
// "provably correct, not merely authorised" holds unchanged: a wrong
// reconstruction is rejected by the chain. The shares now rebuild the secret
// AND its salt under v2's own derivation (lantern2:idsalt:v1).
import { describe, it, expect } from 'vitest';
import { split } from '../src/shamir.js';
import { randomFieldElement } from '../src/field.js';
import { idSaltOf, recoverFromShares } from '../src/v2/identity.js';
import { idSaltOf as v1IdSaltOf } from '../src/identity.js';
import {
  Lantern2Sim, pureCircuits, bytes32, fieldOf, asGuardian, openAs, toUnlock, EPH_A, DELAY,
} from './v2-fixtures.js';

describe('v2 shamir x circuit (end to end)', () => {
  const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
  const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));

  function setup(secret) {
    const salt = idSaltOf(secret);
    const sim = new Lantern2Sim({ identitySecret: secret, idSalt: salt });
    const id = pureCircuits.idCommitOf(secret, salt);
    sim.call('enrollIdentity', id, pureCircuits.vetoCommitOf(fieldOf(60), bytes32(61)), 2n, BigInt(DELAY));
    const guardians = [];
    for (let i = 0; i < 2; i++) {
      sim.ps.guardianSecret = bytes32(100 + i);
      sim.ps.leafSalt = bytes32(200 + i);
      guardians.push({ secret: bytes32(100 + i), salt: bytes32(200 + i), leaf: sim.call('addGuardian', id) });
    }
    const rid = openAs(sim, guardians[0], id, EPH_A);
    for (const g of guardians) { asGuardian(sim, g); sim.call('approveRecovery', id, rid); }
    toUnlock(sim, rid);
    return { sim, id, rid };
  }

  it('a correctly reconstructed secret finalizes', () => {
    const secret = randomFieldElement();
    const shares = split(secret, 3, 2);
    const { sim, rid } = setup(secret);

    sim.ps.identitySecret = undefined; sim.ps.idSalt = undefined;
    const rebuilt = recoverFromShares([shares[0], shares[2]]);
    Object.assign(sim.ps, rebuilt);
    expect(sim.ps.identitySecret).toBe(secret);
    // The v2 salt, not v1's: the same secret opens a different commitment in each contract.
    expect(Buffer.from(rebuilt.idSalt).equals(Buffer.from(v1IdSaltOf(secret)))).toBe(false);
    expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).not.toThrow();
  });

  it('t-1 real shares plus a fabricated one is REJECTED by the chain', () => {
    const secret = randomFieldElement();
    const shares = split(secret, 3, 2);
    for (let trial = 0; trial < 10; trial++) {
      const { sim, rid } = setup(secret);
      const forged = { x: shares[1].x, y: randomFieldElement() };
      const wrong = recoverFromShares([shares[0], forged]);
      expect(wrong.identitySecret).not.toBe(secret);
      Object.assign(sim.ps, wrong);
      expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO())).toThrow(/does not open idCommit/);
    }
  });
});
