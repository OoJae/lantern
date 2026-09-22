import { describe, it, expect } from 'vitest';
import { split, reconstruct } from '../src/shamir.js';
import { idSaltOf, recoverFromShares } from '../src/identity.js';
import { R, randomFieldElement, inv, mul, add, mod } from '../src/field.js';
import { LanternSim, pureCircuits, bytes32, fieldOf } from './simulator.js';
import { asGuardian, EPH_A, ephSkFor, DELAY, SLACK } from './fixtures.js';

describe('field', () => {
  it('is the BLS12-381 scalar field', () => {
    expect(R).toBe(52435875175126190479447740508185965837690552500527637822603658699938581184513n);
    expect(R.toString(2).length).toBe(255);
  });

  it('inverts correctly and refuses zero', () => {
    for (let i = 0; i < 50; i++) {
      const a = randomFieldElement();
      if (a === 0n) continue;
      expect(mul(a, inv(a))).toBe(1n);
    }
    // pow(0, R-2) silently returns 0, so the guard is load-bearing.
    expect(() => inv(0n)).toThrow(/inverse of zero/);
  });

  it('draws elements strictly below r', () => {
    for (let i = 0; i < 200; i++) expect(randomFieldElement()).toBeLessThan(R);
  });
});

describe('shamir', () => {
  it('reconstructs from every t-subset (2-of-3 and 3-of-5)', () => {
    for (const [n, t] of [[3, 2], [5, 3]]) {
      const s = randomFieldElement();
      const sh = split(s, n, t);
      const subsets = [];
      const pick = (start, acc) => {
        if (acc.length === t) { subsets.push([...acc]); return; }
        for (let i = start; i < n; i++) { acc.push(sh[i]); pick(i + 1, acc); acc.pop(); }
      };
      pick(0, []);
      for (const sub of subsets) expect(reconstruct(sub)).toBe(s);
    }
  });

  it('reveals nothing from t-1 shares', () => {
    const s = randomFieldElement();
    const sh = split(s, 3, 2);
    expect(reconstruct([sh[0]])).not.toBe(s);
  });

  it('rejects duplicate and zero x-coordinates', () => {
    const sh = split(randomFieldElement(), 3, 2);
    expect(() => reconstruct([sh[0], sh[0]])).toThrow(/duplicate/);
    expect(() => reconstruct([{ x: 0n, y: 1n }, sh[1]])).toThrow(/x = 0/);
  });

  it('rejects impossible parameters', () => {
    expect(() => split(1n, 2, 3)).toThrow(/at least t/);
    expect(() => split(1n, 3, 1)).toThrow(/at least 2/);
  });
});

// The claim "provably correct, not merely authorised" is only real if a wrong
// reconstruction is rejected by the chain. These two tests are that proof.
describe('shamir x circuit (end to end)', () => {
  const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
  const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));

  /**
   * Enrol a real, randomly generated identity and collect 2 approvals. The
   * salt is DERIVED from the secret (src/identity.js), which is what lets the
   * recovering device rebuild both from shares alone.
   */
  function setup(secret) {
    const salt = idSaltOf(secret);
    const sim = new LanternSim({ identitySecret: secret, idSalt: salt });
    const id = pureCircuits.idCommitOf(secret, salt);
    sim.call('enrollIdentity', id, pureCircuits.vetoCommitOf(fieldOf(60), bytes32(61)), 2n);

    const guardians = [];
    for (let i = 0; i < 2; i++) {
      sim.ps.guardianSecret = bytes32(100 + i);
      sim.ps.leafSalt = bytes32(200 + i);
      guardians.push({ secret: bytes32(100 + i), salt: bytes32(200 + i), leaf: sim.call('addGuardian', id) });
    }
    // The recovering device holds the ephemeral secret the guardians approved.
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    const rid = sim.call('openRecovery', id, EPH_A);
    for (const g of guardians) { asGuardian(sim, g); sim.call('approveRecovery', id, rid); }
    sim.advance(DELAY + SLACK + 1);
    return { sim, id, rid };
  }

  it('a correctly reconstructed secret finalizes', () => {
    const secret = randomFieldElement();
    const shares = split(secret, 3, 2);
    const { sim, rid } = setup(secret);

    // The recovering device holds no secret and no salt -- only two shares.
    // Wipe both, then rebuild both from the shares.
    sim.ps.identitySecret = undefined; sim.ps.idSalt = undefined;
    Object.assign(sim.ps, recoverFromShares([shares[0], shares[2]]));
    expect(sim.ps.identitySecret).toBe(secret);
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
      expect(() => sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO()))
        .toThrow(/does not open idCommit/);
    }
  });
});
