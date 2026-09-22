import { describe, it, expect, beforeEach } from 'vitest';
import { LanternSim, bytes32 } from './simulator.js';

const ID = bytes32(10);
const VETO = bytes32(11);
const EPH_A = bytes32(20);
const EPH_B = bytes32(21);

/** Enrol an identity and add one guardian; return sim + that guardian's leaf. */
function withGuardian(secretSeed = 1, saltSeed = 2) {
  const sim = new LanternSim({
    guardianSecret: bytes32(secretSeed),
    leafSalt: bytes32(saltSeed),
    guardianPath: undefined,
  });
  sim.call('enrollIdentity', ID, VETO);
  const leaf = sim.call('addGuardian', ID);
  sim.ps.guardianPath = sim.findPath(leaf);
  return { sim, leaf };
}

describe('enrolment', () => {
  it('enrols an identity and binds its veto commitment', () => {
    const sim = new LanternSim({ guardianSecret: bytes32(1), leafSalt: bytes32(2) });
    sim.call('enrollIdentity', ID, VETO);
    expect(sim.ledger.enrolled.member(ID)).toBe(true);
    expect(sim.ledger.vetoCommits.member(ID)).toBe(true);
  });

  it('rejects a duplicate enrolment', () => {
    const sim = new LanternSim({ guardianSecret: bytes32(1), leafSalt: bytes32(2) });
    sim.call('enrollIdentity', ID, VETO);
    expect(() => sim.call('enrollIdentity', ID, VETO)).toThrow(/already enrolled/);
  });
});

describe('guardian enrolment', () => {
  it('inserts a salted leaf that is locatable in the tree', () => {
    const { sim, leaf } = withGuardian();
    expect(leaf).toBeInstanceOf(Uint8Array);
    expect(sim.findPath(leaf)).toBeDefined();
  });

  it('derives a DIFFERENT leaf for the same guardian under a different salt', () => {
    const a = withGuardian(1, 2).leaf;
    const b = withGuardian(1, 99).leaf;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe('approval', () => {
  it('accepts a guardian holding a valid path and secret', () => {
    const { sim } = withGuardian();
    expect(() => sim.call('approveRecovery', ID, EPH_A)).not.toThrow();
  });

  it('enforces one-shot semantics per (guardian, recovery)', () => {
    const { sim } = withGuardian();
    sim.call('approveRecovery', ID, EPH_A);
    expect(() => sim.call('approveRecovery', ID, EPH_A)).toThrow(/already approved/);
  });

  it('lets the SAME guardian approve a DIFFERENT recovery', () => {
    const { sim } = withGuardian();
    sim.call('approveRecovery', ID, EPH_A);
    // Nullifier binds to ephemeralPk, so a distinct recovery is independent.
    expect(() => sim.call('approveRecovery', ID, EPH_B)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ADVERSARIAL — an attacker who lies to their own prover.
// These are the security story, not just coverage.
// ---------------------------------------------------------------------------
describe('adversarial', () => {
  it('rejects a forged guardian secret (not in the tree)', () => {
    const { sim } = withGuardian();
    sim.ps.guardianSecret = bytes32(777); // never enrolled
    expect(() => sim.call('approveRecovery', ID, EPH_A)).toThrow();
  });

  it('rejects a forged salt (leaf no longer binds)', () => {
    const { sim } = withGuardian();
    sim.ps.leafSalt = bytes32(888);
    expect(() => sim.call('approveRecovery', ID, EPH_A)).toThrow();
  });

  it('rejects a VALID path belonging to a different leaf (leaf-binding assert)', () => {
    // Two guardians on one identity; guardian A presents guardian B's path.
    const sim = new LanternSim({ guardianSecret: bytes32(1), leafSalt: bytes32(2) });
    sim.call('enrollIdentity', ID, VETO);
    sim.call('addGuardian', ID);

    sim.ps.guardianSecret = bytes32(3);
    sim.ps.leafSalt = bytes32(4);
    const leafB = sim.call('addGuardian', ID);

    // Guardian A's material, guardian B's (genuinely valid) path.
    sim.ps.guardianSecret = bytes32(1);
    sim.ps.leafSalt = bytes32(2);
    sim.ps.guardianPath = sim.findPath(leafB);

    expect(() => sim.call('approveRecovery', ID, EPH_A))
      .toThrow(/does not bind/);
  });
});

// ---------------------------------------------------------------------------
// PRIVACY — assert on what actually reached the chain.
// ---------------------------------------------------------------------------
describe('privacy', () => {
  it('never puts the guardian secret or salt in the public transcript', () => {
    const { sim } = withGuardian();
    sim.call('approveRecovery', ID, EPH_A);
    const blob = JSON.stringify(sim.publicTranscript, (_k, v) =>
      v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v,
    );
    expect(blob).not.toContain(Buffer.from(bytes32(1)).toString('hex'));
    expect(blob).not.toContain(Buffer.from(bytes32(2)).toString('hex'));
  });
});
