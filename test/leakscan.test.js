// The scanner every privacy test depends on. If this file is wrong, every
// "never leaks" assertion in the suite is meaningless -- so it is tested
// against real proof data, with a planted leak it must catch.
import { describe, it, expect } from 'vitest';
import { LanternSim, pureCircuits, bytes32, fieldOf } from './simulator.js';
import { ID_SECRET, ID_SALT, VETO_SECRET, VETO_SALT } from './fixtures.js';
import { encodingsOf, flatten, scanProofData, assertNoLeak } from '../src/leakscan.js';

const toHex = (u) => Buffer.from(u).toString('hex');

function enrolled() {
  const sim = new LanternSim();
  sim.call('enrollIdentity', pureCircuits.idCommitOf(ID_SECRET, ID_SALT),
    pureCircuits.vetoCommitOf(VETO_SECRET, VETO_SALT), 2n);
  return sim;
}

// Clone proof data and splice `bytes` into the public transcript, as a leaky
// circuit that disclosed the value would.
function withPlantedLeak(pd, bytes) {
  return { ...pd, publicTranscript: [...pd.publicTranscript, { push: { value: { value: [bytes] } } }] };
}

describe('leakscan', () => {
  it('documents the old bug: a Field sits in proof data little-endian, so a big-endian search never matches', () => {
    const priv = flatten(enrolled().lastProofData.privateTranscriptOutputs);
    const be = ID_SECRET.toString(16).padStart(18, '0');
    const le = Buffer.from(be, 'hex').reverse().toString('hex');
    expect(priv).toContain(le);
    // The raw bytes of the value never appear big-endian; only flatten's
    // separate bigint rendering could, and the witness output is bytes, not a bigint.
    expect(priv.split('|').some((part) => part === be)).toBe(false);
    expect(encodingsOf(ID_SECRET)).toContain(le);
  });

  it('finds every enrolment secret on the private side (the positive control)', () => {
    const r = scanProofData(enrolled().lastProofData, { identitySecret: ID_SECRET, idSalt: ID_SALT });
    expect(r.identitySecret.private).toBe(true);
    expect(r.idSalt.private).toBe(true);
  });

  it('catches a planted leak of a Field secret, in its little-endian form', () => {
    const pd = enrolled().lastProofData;
    const le = Uint8Array.from(Buffer.from(ID_SECRET.toString(16).padStart(18, '0'), 'hex').reverse());
    expect(() => assertNoLeak(pd, { identitySecret: ID_SECRET })).not.toThrow();
    expect(() => assertNoLeak(withPlantedLeak(pd, le), { identitySecret: ID_SECRET }))
      .toThrow(/LEAK: identitySecret/);
  });

  it('catches a planted leak of a byte secret, in either byte order', () => {
    const pd = enrolled().lastProofData;
    expect(() => assertNoLeak(withPlantedLeak(pd, ID_SALT), { idSalt: ID_SALT })).toThrow(/LEAK: idSalt/);
    expect(() => assertNoLeak(withPlantedLeak(pd, ID_SALT.slice().reverse()), { idSalt: ID_SALT }))
      .toThrow(/LEAK: idSalt/);
  });

  it('refuses to pass a secret it never saw: absence proves nothing', () => {
    const pd = enrolled().lastProofData;
    expect(() => assertNoLeak(pd, { neverInTheCircuit: bytes32(4242) }))
      .toThrow(/positive control failed: neverInTheCircuit/);
  });

  it('rejects a needle too short to search reliably', () => {
    expect(() => encodingsOf(0x1234n)).toThrow(/too short/);
    expect(() => encodingsOf(new Uint8Array(4))).toThrow(/too short/);
  });

  it('separates adjacent values, so two halves cannot combine into a false match', () => {
    const a = Uint8Array.from(ID_SALT.slice(0, 16)), b = Uint8Array.from(ID_SALT.slice(16));
    expect(flatten([a, b]).includes(toHex(ID_SALT))).toBe(false);
  });
});
