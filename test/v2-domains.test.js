// Names and domain separation for v2 (docs/v2.md §2).
//
// - The identity and veto commitments are SHARED with v1 on purpose: an
//   identity commitment means the same thing in both contracts. Ported from
//   test/identity.test.js, on its pinned vectors.
// - Every other derivation carries a `lantern2:…:v1` domain, so no v2 value can
//   equal a v1 value on the same inputs, and the three new ones differ pairwise.
// - Within each hash family, every preimage domain has a DIFFERENT length.
// - The v2 client derives its salts under `lantern2` domains, so one secret's
//   commitments are unlinkable to observers; reuse still merges the guardian sets.
// - Every v2 derivation is pinned, so any change fails here first.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pureCircuits as V1 } from './simulator.js';
import { pureCircuits as V2 } from './v2-simulator.js';
import * as rt from '@midnight-ntwrk/compact-runtime';
import * as Lantern2 from '../contracts/managed-lantern2/contract/index.js';
import { idSaltOf as v1IdSaltOf, vetoSaltOf as v1VetoSaltOf, newIdentity as v1NewIdentity, dealShares as v1DealShares } from '../src/identity.js';
import { idSaltOf, vetoSaltOf, newIdentity, commitmentsOf, recoverFromShares, ID_SALT_DOMAIN, VETO_SALT_DOMAIN } from '../src/v2/identity.js';
import { createLantern2Sim } from '../src/v2/sim.js';

const hex = (u) => Buffer.from(u).toString('hex');
const A = new Uint8Array(32).map((_, i) => i);
const B = new Uint8Array(32).map((_, i) => 255 - i);
const C = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 255);
const F = 0x1ee6d5c63adc8c6c53n;
const P = 227n;

// test/identity.test.js's circuit vectors, unchanged.
const FIXED_SALT = new Uint8Array(32).map((_, i) => i);
const CIRCUIT_VECTORS = {
  idCommit: '62336fcb821a4088558a95845fa8ae8c28a72a863dd486a670ab9f221841242c',
  vetoCommit: 'c2ad2e022a5cea485a680c693bbaaf7cd8ff1679f056e4181e2f848a34a46b86',
};

// Each v2 derivation on fixed inputs, and its v1 counterpart where one exists.
const DERIVATIONS = {
  guardianLeafOf: [(X) => X.guardianLeafOf(A, B, C), '7ad502505421073bbf246c2cf87a74ba7026a622c1b6ad5e2fc6cc985c07ffbb'],
  recoveryIdOf: [(X) => X.recoveryIdOf(A, B), '9713b6d78ac088f583f03a8bd9d67391a977ef1352871d48170648e544a202a6'],
  approvalNullifierOf: [(X) => X.approvalNullifierOf(A, B, C), 'd47454eb65cb8b8e984ef14ae343fb3adc2557fbd27ed4deabbd6ed71ae440ce'],
  vetoNullifierOf: [(X) => X.vetoNullifierOf(F, A), '7e333afd8b8c2e5007b8f5495f39678d6e293b49c891def5b894f803738137f3'],
  lineageLeafOf: [(X) => X.lineageLeafOf(A, B), '9c188e55d4730ed2ae037707b3c831de69070471d8f21ca004a8b4f79fce3e00'],
  ephemeralPkOf: [(X) => X.ephemeralPkOf(A), '3ae1dd2309143d133498caee0ea4459f9f4120ce0ecbfbd835b3ada78ab32b00'],
  gateNullifierOf: [(X) => X.gateNullifierOf(F, A), '9bb78c76bd8acfff425f9f0f2fa2dab8afb4466d36b59469cb263e3585a61000'],
};
const NEW_DERIVATIONS = {
  openNullifierOf: [(X) => X.openNullifierOf(A, B, P), 'e4072759e4afa1f5c6c4d44a16904c4e2beeae73b48eb8f923841f85afa0b400'],
  checkInNullifierOf: [(X) => X.checkInNullifierOf(A, B, P), '53bc94434ab4bd870ee95464caa4083db8f459527aecb1bb689e397b69c0b8cd'],
  checkInKeyOf: [(X) => X.checkInKeyOf(A, B, P), '9c5429cb0da599c8b7faef09e33d7792b526f768a26afbc5837544d8ff133100'],
};
// Review F1: the rotation's context, derived from (root, seed) instead of chosen.
const CTX_PINNED = '72331ec4dde764b406662c027b8bd5b31ee4799163243098f6edc437d3807800';

describe('v2 domains: what is shared with v1', () => {
  it('idCommitOf and vetoCommitOf are unchanged on a fixed input, and equal v1 byte for byte', () => {
    expect(hex(V2.idCommitOf(F, FIXED_SALT))).toBe(CIRCUIT_VECTORS.idCommit);
    expect(hex(V2.vetoCommitOf(F, FIXED_SALT))).toBe(CIRCUIT_VECTORS.vetoCommit);
    expect(hex(V2.idCommitOf(F, FIXED_SALT))).toBe(hex(V1.idCommitOf(F, FIXED_SALT)));
    expect(hex(V2.vetoCommitOf(F, FIXED_SALT))).toBe(hex(V1.vetoCommitOf(F, FIXED_SALT)));
  });
});

describe('v2 domains: what is separated from v1', () => {
  for (const [name, [derive, pinned]] of Object.entries(DERIVATIONS)) {
    it(`${name} differs from v1's on the same inputs, and is pinned`, () => {
      expect(hex(derive(V2))).not.toBe(hex(derive(V1)));
      expect(hex(derive(V2))).toBe(pinned);
    });
  }

  it('the three new derivations are pinned and differ pairwise on the same (secret, bytes, period)', () => {
    const vals = Object.entries(NEW_DERIVATIONS).map(([name, [derive, pinned]]) => {
      expect(hex(derive(V2)), name).toBe(pinned);
      return hex(derive(V2));
    });
    expect(new Set(vals).size).toBe(3);
    // And none equals any older derivation on overlapping inputs.
    const older = Object.values(DERIVATIONS).map(([d]) => hex(d(V2)));
    for (const v of vals) expect(older).not.toContain(v);
  });

  it('guardianCtxOf is pinned, binds the root, and never equals another derivation on the same inputs', () => {
    expect(hex(V2.guardianCtxOf(A, B))).toBe(CTX_PINNED);
    // The root is bound: the same seed under another root is another context.
    expect(hex(V2.guardianCtxOf(A, B))).not.toBe(hex(V2.guardianCtxOf(C, B)));
    expect(hex(V2.guardianCtxOf(A, B))).not.toBe(hex(V2.guardianCtxOf(A, C)));
    // Nor is it the seed, or the root: a derived context can never be anyone's idCommit (their genesis context).
    expect(hex(V2.guardianCtxOf(A, B))).not.toBe(hex(A));
    expect(hex(V2.guardianCtxOf(A, B))).not.toBe(hex(B));
    const others = [V2.lineageLeafOf(A, B), V2.recoveryIdOf(A, B), V2.idCommitOf(F, B)].map(hex);
    expect(others).not.toContain(hex(V2.guardianCtxOf(A, B)));
    // v1 had no such derivation.
    expect(V1.guardianCtxOf).toBeUndefined();
  });

  it('the period is bound: one guardian, one context, two periods, two unlinkable nullifiers and keys', () => {
    for (const f of ['openNullifierOf', 'checkInNullifierOf', 'checkInKeyOf']) {
      expect(hex(V2[f](A, B, P)), f).not.toBe(hex(V2[f](A, B, P + 1n)));
    }
  });
});

describe('v2 domains: the source follows the rule', () => {
  const src = readFileSync(new URL('../contracts/v2/lantern2.compact', import.meta.url), 'utf8');
  const domains = [...src.matchAll(/pad\((\d+), "([^"]+)"\)/g)].map((m) => ({ n: Number(m[1]), s: m[2] }));

  it('every v2 domain is lantern2:<name>:v1, padded to exactly its own length', () => {
    expect(domains).toHaveLength(11);
    for (const { n, s } of domains) {
      expect(s, s).toMatch(/^lantern2:[a-z-]+:v1$/);
      expect(n, s).toBe(s.length);
    }
    expect(new Set(domains.map((d) => d.s)).size).toBe(11);
  });

  it('within each hash family, every preimage domain has a different length (v1 had one collision)', () => {
    const family = (fn) => {
      const re = new RegExp(`${fn}<\\w+>\\(\\s*\\w+ \\{ domain: pad\\((\\d+),`, 'g');
      return [...src.matchAll(re)].map((m) => Number(m[1]));
    };
    const persistent = family('persistentHash');
    const transient = family('transientHash');
    const commit = family('persistentCommit');
    expect(persistent.sort((a, b) => a - b)).toEqual([15, 19, 20, 23]);
    expect(transient.sort((a, b) => a - b)).toEqual([15, 16, 18, 19, 20, 23]);
    expect(commit).toEqual([20]);
    for (const fam of [persistent, transient, commit]) expect(new Set(fam).size).toBe(fam.length);
  });
});

describe('v2 domains: the client salts', () => {
  it('derive under lantern2 domains, matching an independent implementation', () => {
    expect(ID_SALT_DOMAIN).toBe('lantern2:idsalt:v1');
    expect(VETO_SALT_DOMAIN).toBe('lantern2:vetosalt:v1');
    for (const s of [1n, F]) {
      const be = Buffer.from(s.toString(16).padStart(64, '0'), 'hex');
      const ref = (domain) => createHash('sha256').update(domain).update(be).digest('hex');
      expect(hex(idSaltOf(s))).toBe(ref('lantern2:idsalt:v1'));
      expect(hex(vetoSaltOf(s))).toBe(ref('lantern2:vetosalt:v1'));
    }
  });

  it('one secret in v1 and v2 gives commitments unlinkable to observers; reuse still merges the guardian sets', () => {
    const ident = newIdentity();
    const v2 = commitmentsOf(V2, ident);
    const v1Id = V1.idCommitOf(ident.identitySecret, v1IdSaltOf(ident.identitySecret));
    const v1Veto = V1.vetoCommitOf(ident.vetoSecret, v1VetoSaltOf(ident.vetoSecret));
    expect(hex(v2.idCommit)).not.toBe(hex(v1Id));
    expect(hex(v2.vetoCommit)).not.toBe(hex(v1Veto));
    expect(hex(idSaltOf(ident.identitySecret))).not.toBe(hex(vetoSaltOf(ident.identitySecret)));
  });

  it('commitmentsOf refuses v1 pure circuits', () => {
    expect(() => commitmentsOf(V1, newIdentity())).toThrow(/not Lantern v2/);
  });
});

describe('v2 domains: one identity secret in v1 and v2 merges the guardian sets (second review, spec §2)', () => {
  // The salts differ, so observers cannot link the two commitments, and the v2
  // client accepts the identity (its salts are v2's). But the SECRET is the same:
  // t of v1's guardians rebuild it from v1 shares alone, and so act as the v2 owner.
  const nonce = (n) => new Uint8Array(32).fill(n);

  it('two of v1\'s guardians, with v1 shares only, pass the v2 gate as the owner, until the owner locks', () => {
    const v1 = v1NewIdentity();
    const v1Shares = v1DealShares(v1.identitySecret, 3, 2);         // what v1's guardians hold
    const card = newIdentity();
    const owner = { identitySecret: v1.identitySecret, idSalt: idSaltOf(v1.identitySecret), vetoSecret: card.vetoSecret, vetoSalt: card.vetoSalt };
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    const root = L.enrol(owner);                                      // accepted: nothing can see the secret is v1's
    const rebuilt = recoverFromShares([v1Shares[0], v1Shares[2]]);    // v2's recovery code, v1's shares
    expect(rebuilt.identitySecret).toBe(v1.identitySecret);
    expect(() => L.gate(rebuilt, root, root, nonce(1))).not.toThrow();  // no v2 open, delay or veto
    L.lock(owner, root);
    expect(() => L.gate(rebuilt, root, root, nonce(2))).toThrow(/identity is locked/);
  });

  it('with a fresh secret from newIdentity(), v1\'s shares open nothing in v2', () => {
    const v1 = v1NewIdentity();
    const v1Shares = v1DealShares(v1.identitySecret, 3, 2);
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    const root = L.enrol(newIdentity());
    const rebuilt = recoverFromShares([v1Shares[0], v1Shares[2]]);
    expect(() => L.gate(rebuilt, root, root, nonce(1))).toThrow(/caller does not hold the current identity secret/);
  });
});
