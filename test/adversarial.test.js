import { describe, it, expect } from 'vitest';
import { buildTargets } from '../src/attack/targets.mjs';
import { runAttack } from '../src/attack/attack.mjs';
import { ADDRESS_BOOK, TRUE_GUARDIANS, guardianIdOf, hex } from '../src/attack/candidates.mjs';
import { Sim } from '../src/attack/sim.mjs';
import * as V0 from '../contracts/managed-lantern-v0/contract/index.js';
import * as PublicGuardians from '../contracts/managed-public-guardians/contract/index.js';
import * as Lantern from '../contracts/managed/contract/index.js';

const T = buildTargets();
const byId = Object.fromEntries(T.map((t) => [t.view.id, t]));
const sameSet = (a, b) => a.size === b.length && b.every((x) => a.has(x));

// Run the attacks in order, as the demo does: names recovered from the earlier
// targets become KNOWN PLAINTEXT against the shipped one.
const R = {};
{
  const known = new Set();
  for (const t of T) {
    R[t.view.id] = runAttack(t.view, { knownNames: [...known] });
    for (const n of R[t.view.id].named) known.add(n);
  }
}

// ---------------------------------------------------------------------------
// POSITIVE CONTROLS. A passing "the attack fails" test means nothing unless the
// same attack demonstrably SUCCEEDS where it should. These come first.
// ---------------------------------------------------------------------------
describe('positive control 1 · PublicGuardians (the EVM state of the art)', () => {
  it('names all three guardians, exactly, and no one else', () => {
    expect(sameSet(R['1'].named, [...TRUE_GUARDIANS])).toBe(true);
  });
  it('with zero hash evaluations', () => expect(R['1'].probes).toBe(0));
  it('and recovers every individual vote', () => expect(R['1'].votes).toBe(byId['1'].truth.votes));
});

describe('positive control 2a · lantern-v0, unsalted leaf', () => {
  it('names all three guardians, exactly, and no one else', () => {
    expect(sameSet(R['2a'].named, [...TRUE_GUARDIANS])).toBe(true);
  });
  it('costs exactly one probe per name in the address book', () => {
    expect(R['2a'].probes).toBe(ADDRESS_BOOK.length);
  });
  it('and links every vote, once the identities are known', () => {
    expect(R['2a'].votes).toBe(byId['2a'].truth.votes);
  });

  // The thesis in one test. The identifier genuinely never touched the chain.
  // Only a hash of it did -- and the hash was enough.
  it('the guardian identifier appears NOWHERE in the transaction, yet is named anyway', () => {
    const owner = new Uint8Array(32).fill(0xc4);
    const sim = new Sim(V0, ['guardianId', 'guardianPath']);
    sim.call('enroll', owner, 2n);
    const gid = guardianIdOf(TRUE_GUARDIANS[0]);
    sim.ps.guardianId = gid;
    sim.call('addGuardianUnsalted', owner);
    // Only these parts of a proof reach the chain. privateTranscriptOutputs is
    // the prover's own record of witness values and never leaves the device --
    // the identifier is (correctly) there, and nowhere else.
    const { input, output, publicTranscript, privateTranscriptOutputs } = sim.lastProofData;
    const ser = (x) => JSON.stringify(x, (_k, v) =>
      typeof v === 'bigint' ? v.toString(16) : v instanceof Uint8Array ? hex(v) : v);
    expect(ser({ input, output, publicTranscript })).not.toContain(hex(gid));
    expect(ser(privateTranscriptOutputs)).toContain(hex(gid));
    expect(R['2a'].named.has(TRUE_GUARDIANS[0])).toBe(true);
  });

  // Honesty about what IS public. The leaf is published in every design,
  // shipped Lantern included: it is the circuit's disclosed return value, and
  // it sits in a public tree regardless. Hiding the leaf was never the point.
  // Only an unguessable PREIMAGE protects the guardian.
  it('the leaf itself IS public -- in every design, including the shipped one', () => {
    const owner = new Uint8Array(32).fill(0xc4);
    const sim = new Sim(V0, ['guardianId', 'guardianPath']);
    sim.call('enroll', owner, 2n);
    sim.ps.guardianId = guardianIdOf(TRUE_GUARDIANS[0]);
    const leaf = sim.call('addGuardianUnsalted', owner);
    expect(JSON.stringify(sim.lastProofData.output, (_k, v) =>
      v instanceof Uint8Array ? hex(v) : typeof v === 'bigint' ? v.toString(16) : v)).toContain(hex(leaf));
    expect(sim.ledger.guardians.findPathForLeaf(leaf)).toBeDefined();
  });
});

describe('positive control 2b · lantern-v0, salt derived from public data', () => {
  it('names all three guardians, exactly, and no one else', () => {
    expect(sameSet(R['2b'].named, [...TRUE_GUARDIANS])).toBe(true);
  });
  // Salting with PUBLIC randomness costs the attacker a linear factor, not an
  // exponential one. 32 bytes of salt, and it bought a factor of eight.
  it('costs only the slot range more than the unsalted version', () => {
    expect(R['2b'].probes).toBe(ADDRESS_BOOK.length * byId['2b'].view.publicParams.slots);
  });
});

// ---------------------------------------------------------------------------
// THE SHIPPED CONTRACT HOLDS.
// ---------------------------------------------------------------------------
describe('the attack FAILS against shipped Lantern', () => {
  it('names zero guardians across every derivation family', () => {
    expect(R['3'].named.size).toBe(0);
    for (const f of R['3'].families) expect(f.hits).toBe(0);
  });

  // The decisive row. The attacker was handed the correct answer.
  it('even KNOWN PLAINTEXT -- the real names, recovered from targets 1/2a/2b -- scores zero', () => {
    const kp = R['3'].families.find((f) => f.name.startsWith('KNOWN PLAINTEXT'));
    expect(kp.probes).toBeGreaterThan(0);
    expect(kp.hits).toBe(0);
  });

  it('links zero votes', () => expect(R['3'].votes).toBe(0));

  it('the guardian context it hashes with is fully public, and it does not help', () => {
    const { view } = byId['3'];
    expect(view.ledger.guardianCtx.lookup(view.publicParams.idRoot)).toBeInstanceOf(Uint8Array);
  });
});

// ---------------------------------------------------------------------------
// THE NEGATIVE CONTROL ON THE NEGATIVE CONTROL.
// Without this, "zero hits" could mean the engine is simply miswired to the
// shipped contract's API. Hand it the real secret; it must find exactly that.
// ---------------------------------------------------------------------------
describe('negative control on the negative control', () => {
  it('handed ONE real (secret, salt), the same engine names exactly that guardian', () => {
    const t = byId['3'];
    const one = t.secretsForNegativeControl.slice(0, 1);
    const r = runAttack(t.view, { oracleSecrets: one });
    expect(r.named.size).toBe(1);
    expect(r.named.has(one[0].name)).toBe(true);
  });

  it('handed all three, it names all three -- so the engine is not capped', () => {
    const t = byId['3'];
    const r = runAttack(t.view, { oracleSecrets: t.secretsForNegativeControl });
    expect(sameSet(r.named, [...TRUE_GUARDIANS])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE ATTACKER CANNOT SEE PRIVATE STATE.
// ---------------------------------------------------------------------------
describe('the attacker sees only what a chain observer sees', () => {
  it('every view is frozen and exposes exactly six public keys', () => {
    for (const { view } of T) {
      expect(Object.isFrozen(view)).toBe(true);
      expect(Object.keys(view).sort())
        .toEqual(['id', 'label', 'ledger', 'publicParams', 'pureCircuits', 'scheme']);
    }
  });
  it('no view carries a simulator, private state or witness', () => {
    for (const { view } of T) {
      for (const k of ['sim', 'ps', 'privateState', 'witnesses', 'contract']) expect(view[k]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// THE VULNERABLE CONTRACTS STAY LABELLED, AND STAY VULNERABLE.
// A well-meaning contributor who "fixes" them turns CI red, above.
// ---------------------------------------------------------------------------
describe('labelling', () => {
  it('both adversarial modules export the insecurity marker', () => {
    expect(V0.pureCircuits.THIS_CONTRACT_IS_DELIBERATELY_INSECURE).toBeTypeOf('function');
    expect(PublicGuardians.pureCircuits.THIS_CONTRACT_IS_DELIBERATELY_INSECURE).toBeTypeOf('function');
  });
  it('the shipped module does not', () => {
    expect(Lantern.pureCircuits.THIS_CONTRACT_IS_DELIBERATELY_INSECURE).toBeUndefined();
  });
});
