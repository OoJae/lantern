// D4: the salts are derived from the secrets, so a guardian share set is the
// COMPLETE recovery kit. These vectors are pinned: any change to the salt
// derivation, or to the idCommitOf / vetoCommitOf circuits themselves, fails
// here before it can orphan a single enrolled identity.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { pureCircuits } from './simulator.js';
import { R } from '../src/field.js';
import {
  be32, idSaltOf, vetoSaltOf, newIdentity, commitmentsOf, dealShares, recoverFromShares,
} from '../src/identity.js';

const hex = (u) => Buffer.from(u).toString('hex');

const VECTORS = [
  {
    s: 1n,
    idSalt: '4abd432a3d5f82f5cb0963060113794b31c44e51ded675325b7d3257791054d3',
    vetoSalt: '46e2ee139d81de671212472ec8039e24ab0c2ca10709bc34b6612c10cded01d2',
    idCommit: 'b43dbee11f949113a436a90568eb38b5c67f7853ef6a429cc27144099138c2a6',
    vetoCommit: '30109c1d7cd5d8465355041d2143bcbc4cf723d45086f14685d3b7662a4b928f',
  },
  {
    s: 0x1ee6d5c63adc8c6c53n,
    idSalt: '1745c2981ce766a1098f8ec5f763380c745132855fc49fee5fcbe50f6ff493a5',
    vetoSalt: 'c24a6ba3451b2028bfe8ea59023570d63ace613eebb1c2a3396c063a0d461faf',
    idCommit: '6506db3c5af10f74be1db01b99f6ccdaad2f22f5346434c16a241c75f74f59e0',
    vetoCommit: 'ca132ebcc04937dd2e5ece96de136262387ada7b7fa2b02591b17defdac57715',
  },
  {
    s: R - 1n,
    idSalt: '0685c69ccc8506ae9e0b37c4cce0f11b8ef895f5f014e21b15a60750614fa731',
    vetoSalt: 'cb96f8be19075275e944e54c1c2e245839c40583d5949e5a0b813cd2f09464c1',
    idCommit: '4544135deac2d59cb72145d11a243b84f39e9aea13af91ddfd81e7fa1a40858b',
    vetoCommit: '6bbfde8846be84a0f005df6fcd60998de72e7af7ff3ad0d06a09572645cb21b1',
  },
];

// The circuits alone, on a fixed salt, independent of the salt derivation.
const FIXED_SALT = new Uint8Array(32).map((_, i) => i);
const CIRCUIT_VECTORS = {
  idCommit: '62336fcb821a4088558a95845fa8ae8c28a72a863dd486a670ab9f221841242c',
  vetoCommit: 'c2ad2e022a5cea485a680c693bbaaf7cd8ff1679f056e4181e2f848a34a46b86',
};

describe('identity: pinned vectors', () => {
  it('idCommitOf and vetoCommitOf are unchanged on a fixed input', () => {
    expect(hex(pureCircuits.idCommitOf(0x1ee6d5c63adc8c6c53n, FIXED_SALT))).toBe(CIRCUIT_VECTORS.idCommit);
    expect(hex(pureCircuits.vetoCommitOf(0x1ee6d5c63adc8c6c53n, FIXED_SALT))).toBe(CIRCUIT_VECTORS.vetoCommit);
  });

  for (const v of VECTORS) {
    it(`derives the salts and commitments for secret 0x${v.s.toString(16).slice(0, 12)}…`, () => {
      expect(hex(idSaltOf(v.s))).toBe(v.idSalt);
      expect(hex(vetoSaltOf(v.s))).toBe(v.vetoSalt);
      expect(hex(pureCircuits.idCommitOf(v.s, idSaltOf(v.s)))).toBe(v.idCommit);
      expect(hex(pureCircuits.vetoCommitOf(v.s, vetoSaltOf(v.s)))).toBe(v.vetoCommit);
    });
  }

  it('matches an independent implementation of the documented formula', () => {
    for (const { s } of VECTORS) {
      const be = Buffer.from(s.toString(16).padStart(64, '0'), 'hex');
      const ref = (domain) => createHash('sha256').update(domain).update(be).digest('hex');
      expect(hex(idSaltOf(s))).toBe(ref('lantern:idsalt:v1'));
      expect(hex(vetoSaltOf(s))).toBe(ref('lantern:vetosalt:v1'));
    }
  });
});

describe('identity: derivation', () => {
  it('separates the two salt domains', () => {
    for (const { s } of VECTORS) expect(hex(idSaltOf(s))).not.toBe(hex(vetoSaltOf(s)));
  });

  it('be32 refuses anything that is not a field element', () => {
    expect(() => be32(-1n)).toThrow(/not a field element/);
    expect(() => be32(R)).toThrow(/not a field element/);
    expect(() => be32(5)).toThrow(/not a field element/);
    expect(hex(be32(1n))).toBe(`${'0'.repeat(62)}01`);
  });

  it('newIdentity draws independent secrets and derives both salts', () => {
    const a = newIdentity();
    expect(a.identitySecret).not.toBe(a.vetoSecret);
    expect(hex(a.idSalt)).toBe(hex(idSaltOf(a.identitySecret)));
    expect(hex(a.vetoSalt)).toBe(hex(vetoSaltOf(a.vetoSecret)));
    expect(() => newIdentity(() => 7n)).toThrow(/independent/);
  });
});

describe('identity: the share set is the complete recovery kit', () => {
  it('any 2 of 3 shares rebuild the secret AND the salt, and so the exact idCommit', () => {
    const ident = newIdentity();
    const { idCommit } = commitmentsOf(pureCircuits, ident);
    const shares = dealShares(ident.identitySecret, 3, 2);
    for (const pair of [[0, 1], [0, 2], [1, 2]]) {
      const rebuilt = recoverFromShares(pair.map((i) => shares[i]));
      expect(rebuilt.identitySecret).toBe(ident.identitySecret);
      expect(hex(pureCircuits.idCommitOf(rebuilt.identitySecret, rebuilt.idSalt))).toBe(hex(idCommit));
    }
  });

  it('shares never carry the veto secret', () => {
    const ident = newIdentity();
    const shares = dealShares(ident.identitySecret, 3, 2);
    expect(recoverFromShares(shares.slice(0, 2)).identitySecret).not.toBe(ident.vetoSecret);
  });
});
