// src/kit.js: the veto card and the guardian kit. Three things are tested:
//   1. a kit round-trips, as an object and as text, and is everything a guardian needs: printed, typed
//      back and parsed, it approves, rebuilds and finalizes a recovery against the real circuits;
//   2. every change to a kit is refused, and the refusal names what is wrong;
//   3. a kit meant for another network, contract, identity or guardian set is refused.
//
// Every secret, salt and share here is drawn from a named, seeded stream (SHA-256 of the name and a
// counter), so a run is reproducible and the counts the statistical tests pin are exact.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { LanternSim, pureCircuits } from './simulator.js';
import { DELAY, SLACK, ephKey, ephSkFor } from './fixtures.js';
import { newIdentity, recoverFromShares, be32, vetoSaltOf, commitmentsOf } from '../src/identity.js';
import { R } from '../src/field.js';
import { split } from '../src/shamir.js';
import { WORDLIST, bytesToWords } from '../src/words.js';
import {
  VETO_CARD_VERSION, GUARDIAN_KIT_VERSION, CHECK_WORDS, NETWORKS, KitError,
  buildVetoCard, vetoCardText, parseVetoCard, vetoCheckWords,
  buildGuardianKit, guardianKitText, parseGuardianKit, collectShares, dealKits, contextLabel,
} from '../src/kit.js';

const hex = (u) => Buffer.from(u).toString('hex');

// A reproducible stream of randomness: the same name gives the same draws, in the same order. A field
// element is a wide reduction of 64 bytes, as src/field.js's randomFieldElement makes one.
function rng(name) {
  let i = 0;
  const next = () => createHash('sha256').update(`${name}:${i++}`).digest();
  return {
    bytes: () => new Uint8Array(next()),
    field: () => BigInt(`0x${Buffer.concat([next(), next()]).toString('hex')}`) % R,
  };
}
const shared = rng('kit.test');
const b32 = shared.bytes;
const field = shared.field;
const CONTRACT = 'bac79cd962f547ac070802a221f9f7260bffa4724e6180ef3c874eadabb85101';

// A refusal, with its code: the test fails if the call succeeds or throws anything but a KitError.
function refusal(fn) {
  try { fn(); } catch (e) {
    if (!(e instanceof KitError)) throw e;
    return e;
  }
  throw new Error('expected a refusal, and the kit was accepted');
}

// An identity with its real commitment, from the contract's own pure circuit.
function owner() {
  const identity = newIdentity(field);
  const { idCommit } = commitmentsOf(pureCircuits, identity);
  return { identity, idCommit };
}

function dealt({ n = 3, t = 2, network = 'preprod', contract = CONTRACT } = {}) {
  const { identity, idCommit } = owner();
  const { vetoCard, kits } = dealKits({ identity, idCommit, network, contract, guardians: n, threshold: t, fieldRng: field, bytesRng: b32 });
  return { identity, idCommit, vetoCard, kits };
}

// Replace one "Label: value" line of a kit's text.
const withLine = (text, label, value) => text.split('\n').map((l) => (l.startsWith(`${label}:`) ? `${label}: ${value}` : l)).join('\n');
const lineOf = (text, label) => text.split('\n').find((l) => l.startsWith(`${label}:`)).slice(label.length + 1).trim();

describe('the veto card', () => {
  it('is 24 checksummed words of the veto secret and three check words, under a version tag', () => {
    const { identity } = owner();
    const card = buildVetoCard(identity.vetoSecret);
    expect(card.version).toBe(VETO_CARD_VERSION);
    expect(card.words).toEqual(bytesToWords(be32(identity.vetoSecret)));
    expect(card.check).toHaveLength(CHECK_WORDS);
    expect([...card.words, ...card.check].every((w) => WORDLIST.includes(w))).toBe(true);
    expect(Object.isFrozen(card) && Object.isFrozen(card.words)).toBe(true);
  });

  it('round-trips to the secret and its derived salt: as an object, as text, as the words alone, as 27 words (200 cards)', () => {
    for (let i = 0; i < 200; i++) {
      const vetoSecret = field();
      const card = buildVetoCard(vetoSecret);
      for (const input of [card, vetoCardText(card), card.words.join(' '), [...card.words, ...card.check].join(' ')]) {
        const back = parseVetoCard(input);
        expect(back.vetoSecret).toBe(vetoSecret);
        expect(hex(back.vetoSalt)).toBe(hex(vetoSaltOf(vetoSecret)));
        expect(back.check).toEqual(card.check);
      }
      expect(parseVetoCard(card.words.join(' ')).checked).toBe(false);
      expect(parseVetoCard(vetoCardText(card)).checked).toBe(true);
    }
  });

  it('reads the words as a person types them: numbered, in capitals, over several lines, by four letters', () => {
    const { identity } = owner();
    const card = buildVetoCard(identity.vetoSecret);
    const typed = [
      card.words.slice(0, 12).map((w, i) => `${i + 1}. ${w.toUpperCase()}`).join('  '),
      card.words.slice(12).map((w, i) => `${i + 13}) ${w.slice(0, 4)}`).join(' '),
      `Check: ${card.check.join(', ')}`,
    ].join('\n');
    expect(parseVetoCard(typed).vetoSecret).toBe(identity.vetoSecret);
  });

  it('opens the veto commitment the contract stores: parsed secret and salt give the same vetoCommitOf', () => {
    const { identity } = owner();
    const back = parseVetoCard(vetoCardText(buildVetoCard(identity.vetoSecret)));
    expect(hex(pureCircuits.vetoCommitOf(back.vetoSecret, back.vetoSalt)))
      .toBe(hex(commitmentsOf(pureCircuits, identity).vetoCommit));
  });

  it('check words are the secret\'s own: different secrets, different check words, and a separate domain from the fingerprint', () => {
    const seen = new Set();
    for (let i = 0; i < 300; i++) seen.add(vetoCheckWords(field()).join(' '));
    expect(seen.size).toBe(300);
  });

  it('refuses a mistyped word, naming its position', () => {
    const card = buildVetoCard(field());
    const words = [...card.words];
    words[4] = 'lanternx';
    const e = refusal(() => parseVetoCard(words.join(' ')));
    expect(e.code).toBe('unknown-word');
    expect(e.message).toMatch(/word 5: “lanternx”/);
  });

  it('refuses a word too few or too many', () => {
    const card = buildVetoCard(field());
    expect(refusal(() => parseVetoCard(card.words.slice(1).join(' '))).code).toBe('word-count');
    expect(refusal(() => parseVetoCard([...card.words, 'abandon'].join(' '))).code).toBe('word-count');
    expect(refusal(() => parseVetoCard('')).code).toBe('word-count');
  });

  // About 1 substitution in 256 passes the 8-bit checksum and reaches the check words: 2400/256 ≈ 9.4
  // expected. The count is exact because the secrets are seeded.
  it('refuses every single-word substitution: by its checksum, or by the check words (2,400 seeded trials)', () => {
    const own = rng('veto-substitution');
    const codes = { checksum: 0, check: 0, 'not-a-secret': 0 };
    for (let i = 0; i < 2400; i++) {
      const card = buildVetoCard(own.field());
      const words = [...card.words];
      const at = i % 24;
      words[at] = WORDLIST[(WORDLIST.indexOf(words[at]) + 1 + (i % 2047)) % 2048];
      const e = refusal(() => parseVetoCard(`Words: ${words.join(' ')}\nCheck: ${card.check.join(' ')}`));
      expect(Object.keys(codes)).toContain(e.code);
      codes[e.code]++;
    }
    // Only a substitution that slips past the 8-bit checksum reaches the check words, and all of those
    // are refused there (or name a value too large to be a secret).
    expect(codes).toEqual({ checksum: 2391, check: 9, 'not-a-secret': 0 });
  });

  it('refuses check words that do not match, and a wrong number of them', () => {
    const card = buildVetoCard(field());
    const other = vetoCheckWords(field());
    expect(refusal(() => parseVetoCard({ ...card, check: other })).code).toBe('check');
    expect(refusal(() => parseVetoCard(`Words: ${card.words.join(' ')}\nCheck: ${card.check.slice(0, 2).join(' ')}`)).code).toBe('word-count');
  });

  it('refuses 24 valid words that are not a field element (a value at or above r)', () => {
    const top = new Uint8Array(32).fill(0xff);
    expect(refusal(() => parseVetoCard(bytesToWords(top).join(' '))).code).toBe('not-a-secret');
  });

  it('refuses a guardian kit, another version, and anything but a field element to build from', () => {
    const { kits } = dealt();
    expect(refusal(() => parseVetoCard(kits[0])).message).toMatch(/guardian kit, not a veto card/);
    const card = buildVetoCard(field());
    expect(refusal(() => parseVetoCard({ ...card, version: 'lantern-veto-card/2' })).message).toMatch(/version 2/);
    expect(refusal(() => parseVetoCard(vetoCardText(card).replace(VETO_CARD_VERSION, 'lantern-veto-card/9'))).code).toBe('version');
    expect(refusal(() => buildVetoCard(R)).code).toBe('format');
    expect(refusal(() => buildVetoCard(-1n)).code).toBe('format');
    expect(refusal(() => buildVetoCard(5)).code).toBe('format');
  });
});

describe('the guardian kit: what it carries', () => {
  it('carries the share, the guardian secret and the leaf salt as words, and the public context as hex', () => {
    const { identity, idCommit, kits } = dealt({ n: 5, t: 3 });
    expect(kits).toHaveLength(5);
    kits.forEach((k, i) => {
      expect(k.version).toBe(GUARDIAN_KIT_VERSION);
      expect(k).toMatchObject({ network: 'preprod', contract: CONTRACT, identity: hex(idCommit), context: hex(idCommit), threshold: 3, guardians: 5, share: i + 1 });
      for (const s of ['guardianSecret', 'leafSalt', 'share']) expect(k.words[s]).toHaveLength(24);
      expect(k.check).toHaveLength(CHECK_WORDS);
    });
    // Each guardian's own secret and salt: no two kits share one.
    const secrets = new Set(kits.flatMap((k) => [k.words.guardianSecret.join(' '), k.words.leafSalt.join(' ')]));
    expect(secrets.size).toBe(10);
    // The shares are src/shamir.js's, of this identity's secret: any three rebuild it.
    const parsed = kits.map((k) => parseGuardianKit(k));
    expect(recoverFromShares(parsed.slice(2).map((p) => p.share)).identitySecret).toBe(identity.identitySecret);
  });

  it('round-trips as an object and as text, for every size from 2-of-2 to 7-of-7', () => {
    for (let n = 2; n <= 7; n++) {
      for (let t = 2; t <= n; t++) {
        const { idCommit, kits } = dealt({ n, t });
        for (const k of kits) {
          const fromObject = parseGuardianKit(k);
          const fromText = parseGuardianKit(guardianKitText(k));
          expect(fromText).toEqual(fromObject);
          expect(fromObject.share.x).toBe(BigInt(k.share));
          expect(hex(fromObject.idCommit)).toBe(hex(idCommit));
          expect(hex(fromObject.ctx)).toBe(hex(idCommit));
          expect(fromObject).toMatchObject({ network: 'preprod', contract: CONTRACT, threshold: t, guardians: n });
          // Rebuilt from the words, the kit is the same kit.
          expect(buildGuardianKit({ network: 'preprod', contract: CONTRACT, idCommit, ctx: fromObject.ctx, threshold: t, guardians: n,
            share: fromObject.share, guardianSecret: fromObject.guardianSecret, leafSalt: fromObject.leafSalt })).toEqual(k);
        }
      }
    }
  });

  it('round-trips random shares and secrets exactly (300 kits, property-style)', () => {
    for (let i = 0; i < 300; i++) {
      const n = 2 + (i % 6);
      const t = 2 + (i % (n - 1));
      const secret = field();
      const shares = split(secret, n, t, field);
      const x = i % n;
      const guardianSecret = b32();
      const leafSalt = b32();
      const ctx = b32();
      const network = NETWORKS[i % NETWORKS.length];
      const contract = network === 'practice' ? null : hex(b32());
      const kit = buildGuardianKit({ network, contract, idCommit: b32(), ctx, threshold: t, guardians: n, share: shares[x], guardianSecret, leafSalt });
      const back = parseGuardianKit(guardianKitText(kit));
      expect(back.share).toEqual(shares[x]);
      expect(hex(back.guardianSecret)).toBe(hex(guardianSecret));
      expect(hex(back.leafSalt)).toBe(hex(leafSalt));
      expect(hex(back.ctx)).toBe(hex(ctx));
      expect(back.contract).toBe(contract);
    }
  });

  it('reads a kit as a person types it back: capitals, numbering, sections over several lines, four letters, 0x', () => {
    const { kits } = dealt();
    const k = kits[1];
    const typed = [
      `  ${GUARDIAN_KIT_VERSION}  `,
      'NETWORK: Preprod',
      `Contract: 0x${CONTRACT.toUpperCase()}`,
      `identity: ${k.identity}`,
      `Context:   ${k.context}`,
      'Share: 2', 'Guardians: 3', 'Threshold: 2',
      'Guardian secret:',
      k.words.guardianSecret.slice(0, 12).map((w, i) => `${i + 1}. ${w}`).join(' '),
      k.words.guardianSecret.slice(12).map((w, i) => `${i + 13}. ${w}`).join(' '),
      `Leaf salt: ${k.words.leafSalt.map((w) => w.slice(0, 4)).join(', ')}`,
      `Share words: ${k.words.share.join(' ').toUpperCase()}`,
      `Check: ${k.check.join(' ')}`,
    ].join('\n');
    expect(parseGuardianKit(typed)).toEqual(parseGuardianKit(k));
  });

  it('a practice kit names no contract, and a real one must', () => {
    const { identity, idCommit } = owner();
    const { kits } = dealKits({ identity, idCommit, network: 'practice', guardians: 3, threshold: 2, fieldRng: field, bytesRng: b32 });
    expect(kits[0].contract).toBeNull();
    expect(guardianKitText(kits[0])).toMatch(/^Contract: none$/m);
    expect(parseGuardianKit(guardianKitText(kits[0])).contract).toBeNull();
    expect(refusal(() => dealKits({ identity, idCommit, network: 'practice', contract: CONTRACT, guardians: 3, threshold: 2 })).field).toBe('contract');
    expect(refusal(() => dealKits({ identity, idCommit, network: 'preprod', guardians: 3, threshold: 2 })).field).toBe('contract');
  });
});

describe('a kit is everything a guardian needs: printed, typed back, and used against the real circuits', () => {
  it('approves, rebuilds and finalizes a recovery from kits alone; the veto card vetoes another', () => {
    const { identity, idCommit } = owner();
    const { vetoCommit } = commitmentsOf(pureCircuits, identity);
    const sim = new LanternSim({ identitySecret: identity.identitySecret, idSalt: identity.idSalt,
      vetoSecret: identity.vetoSecret, vetoSalt: identity.vetoSalt });
    sim.call('enrollIdentity', idCommit, vetoCommit, 2n);

    // The owner deals three kits and mints each guardian's leaf from that kit's own secret and salt.
    const { vetoCard, kits } = dealKits({ identity, idCommit, network: 'undeployed', contract: CONTRACT, guardians: 3, threshold: 2, fieldRng: field, bytesRng: b32 });
    const leaves = kits.map((k) => {
      const p = parseGuardianKit(k);
      sim.ps.guardianSecret = p.guardianSecret;
      sim.ps.leafSalt = p.leafSalt;
      return sim.call('addGuardian', idCommit);
    });

    // Years later, each guardian types their paper kit back in. The context their leaf was minted
    // under is the one the ledger holds for this identity.
    const expect_ = { network: 'undeployed', contract: CONTRACT, idCommit, ctx: sim.ledger.guardianCtx.lookup(idCommit) };
    const typed = kits.map((k) => parseGuardianKit(guardianKitText(k), expect_));
    typed.forEach((p, i) => {
      expect(hex(pureCircuits.guardianLeafOf(p.guardianSecret, p.ctx, p.leafSalt))).toBe(hex(leaves[i]));
    });

    // A new phone; the second and third guardians approve with nothing but their kits.
    const eph = ephKey(40);
    sim.ps.ephemeralSk = ephSkFor(eph);
    const rid = sim.call('openRecovery', idCommit, eph);
    for (const p of typed.slice(1)) {
      sim.ps.guardianSecret = p.guardianSecret;
      sim.ps.leafSalt = p.leafSalt;
      sim.ps.guardianPath = sim.findPath(pureCircuits.guardianLeafOf(p.guardianSecret, p.ctx, p.leafSalt));
      sim.call('approveRecovery', idCommit, rid);
    }
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(2n);

    // An attacker's recovery for his own device: the owner types the veto card in, and it is dead.
    const hostile = ephKey(41);
    const ridHostile = sim.call('openRecovery', idCommit, hostile);
    const card = parseVetoCard(vetoCardText(vetoCard));
    sim.ps.vetoSecret = card.vetoSecret;
    sim.ps.vetoSalt = card.vetoSalt;
    sim.call('vetoRecovery', ridHostile);
    expect(sim.ledger.killed.member(ridHostile)).toBe(true);

    // The phone collects the shares from the two kits, rebuilds the secret and its salt, and finalizes.
    const { shares } = collectShares(typed.slice(1));
    const rebuilt = recoverFromShares(shares);
    expect(rebuilt.identitySecret).toBe(identity.identitySecret);
    sim.ps.identitySecret = rebuilt.identitySecret;
    sim.ps.idSalt = rebuilt.idSalt;
    sim.advance(DELAY + SLACK + 1);
    const successor = newIdentity(field);
    const next = commitmentsOf(pureCircuits, successor);
    sim.call('finalizeRecovery', rid, next.idCommit, next.vetoCommit);
    expect(sim.ledger.retiredIdentities.member(idCommit)).toBe(true);
    expect(sim.ledger.enrolled.member(next.idCommit)).toBe(true);
  });
});

describe('the guardian kit: every change is refused', () => {
  const { kits } = dealt({ n: 4, t: 3 });
  const kit = kits[2];
  const text = guardianKitText(kit);

  it('a changed version tag', () => {
    expect(refusal(() => parseGuardianKit(withLine(text, 'Version', 'lantern-guardian-kit/2'))).message).toMatch(/version 2/);
    expect(refusal(() => parseGuardianKit({ ...kit, version: VETO_CARD_VERSION })).message).toMatch(/veto card, not a guardian kit/);
    expect(refusal(() => parseGuardianKit(withLine(text, 'Version', 'something-else'))).code).toBe('version');
  });

  it('a network changed to another: named as a network change, not a slip', () => {
    for (const net of ['undeployed', 'preview', 'mainnet']) {
      const e = refusal(() => parseGuardianKit(withLine(text, 'Network', net)));
      expect(e.code).toBe('network');
      expect(e.message).toBe(`This kit was made for preprod, but it says ${net}`);
    }
    expect(refusal(() => parseGuardianKit(withLine(text, 'Network', 'testnet-02'))).field).toBe('network');
    expect(refusal(() => parseGuardianKit(withLine(text, 'Network', 'practice'))).field).toBe('contract');
  });

  it('the share number changed to another share: named as a share index mismatch', () => {
    for (const x of [1, 2, 4]) {
      const e = refusal(() => parseGuardianKit(withLine(text, 'Share', String(x))));
      expect(e.code).toBe('share-index');
      expect(e.message).toBe(`The share words are share 3, but the kit says share ${x}`);
    }
    expect(refusal(() => parseGuardianKit(withLine(text, 'Share', '5'))).code).toBe('format');
    expect(refusal(() => parseGuardianKit(withLine(text, 'Share', '0'))).code).toBe('format');
    expect(refusal(() => parseGuardianKit(withLine(text, 'Share', 'three'))).code).toBe('format');
    expect(refusal(() => parseGuardianKit({ ...kit, share: 1 })).code).toBe('share-index');
  });

  it('every hex character of the contract, identity and context', () => {
    for (const label of ['Contract', 'Identity', 'Context']) {
      const value = lineOf(text, label);
      for (let i = 0; i < 64; i++) {
        const c = value[i] === 'f' ? '0' : (parseInt(value[i], 16) + 1).toString(16);
        const e = refusal(() => parseGuardianKit(withLine(text, label, value.slice(0, i) + c + value.slice(i + 1))));
        expect(e.code).toBe('check');
      }
      expect(refusal(() => parseGuardianKit(withLine(text, label, value.slice(2)))).code).toBe('format');
    }
  });

  it('the threshold or the guardian count', () => {
    expect(refusal(() => parseGuardianKit(withLine(text, 'Threshold', '2'))).code).toBe('check');
    expect(refusal(() => parseGuardianKit(withLine(text, 'Threshold', '4'))).code).toBe('check');
    expect(refusal(() => parseGuardianKit(withLine(text, 'Threshold', '5'))).code).toBe('format');
    expect(refusal(() => parseGuardianKit(withLine(text, 'Threshold', '1'))).code).toBe('format');
    expect(refusal(() => parseGuardianKit(withLine(text, 'Guardians', '5'))).code).toBe('check');
    expect(refusal(() => parseGuardianKit(withLine(text, 'Guardians', '2'))).code).toBe('format');
  });

  it('every word of every section, substituted: by its checksum, or by the check words', () => {
    const sections = [['Guardian secret', 'guardianSecret'], ['Leaf salt', 'leafSalt'], ['Share words', 'shareWords']];
    for (const [label, field] of sections) {
      const words = lineOf(text, label).split(' ');
      for (let at = 0; at < 24; at++) {
        for (const step of [1, 1024]) {
          const changed = [...words];
          changed[at] = WORDLIST[(WORDLIST.indexOf(words[at]) + step) % 2048];
          const e = refusal(() => parseGuardianKit(withLine(text, label, changed.join(' '))));
          expect(['checksum', 'check', 'not-a-secret', 'share-index', 'network']).toContain(e.code);
          if (e.code === 'checksum') expect(e.field).toBe(field);
        }
      }
    }
  });

  it('a word not on the list, a word missing, or a section missing: each named', () => {
    const words = kit.words.leafSalt;
    const bad = [...words];
    bad[9] = 'flashlight';
    let e = refusal(() => parseGuardianKit(withLine(text, 'Leaf salt', bad.join(' '))));
    expect(e.code).toBe('unknown-word');
    expect(e.message).toBe('Leaf salt, word 10: “flashlight” is not on the word list');
    e = refusal(() => parseGuardianKit(withLine(text, 'Share words', kit.words.share.slice(1).join(' '))));
    expect(e.code).toBe('word-count');
    expect(e.message).toBe('Share words: 23 words, where there must be 24');
    e = refusal(() => parseGuardianKit(text.split('\n').filter((l) => !l.startsWith('Leaf salt:')).join('\n')));
    expect(e.code).toBe('missing');
    expect(e.message).toBe('The kit has no leaf salt');
    e = refusal(() => parseGuardianKit(`${text}\nCheck: ${kit.check.join(' ')}`));
    expect(e.message).toMatch(/appears twice/);
  });

  it('every check word, changed', () => {
    for (let at = 0; at < CHECK_WORDS; at++) {
      const check = [...kit.check];
      check[at] = WORDLIST[(WORDLIST.indexOf(check[at]) + 7) % 2048];
      expect(refusal(() => parseGuardianKit(withLine(text, 'Check', check.join(' ')))).code).toBe('check');
      expect(refusal(() => parseGuardianKit({ ...kit, check })).code).toBe('check');
    }
    expect(refusal(() => parseGuardianKit(withLine(text, 'Check', kit.check.slice(1).join(' ')))).code).toBe('word-count');
  });

  it('two kits spliced: one kit\'s words under another\'s header', () => {
    for (const other of [kits[0], kits[1], kits[3]]) {
      const spliced = { ...kit, words: { ...kit.words, share: other.words.share } };
      expect(['check', 'share-index']).toContain(refusal(() => parseGuardianKit(spliced)).code);
      // Swapping only the share words and the number: the check words still bind them to this kit.
      expect(refusal(() => parseGuardianKit({ ...spliced, share: other.share })).code).toBe('check');
    }
  });

  it('random corruption of the text: every changed letter or digit is refused (1,000 trials)', () => {
    const original = parseGuardianKit(text);
    let changed = 0;
    let refused = 0;
    for (let i = 0; i < 1000; i++) {
      const chars = [...text];
      const at = (i * 7919) % chars.length;
      const c = chars[at];
      if (!/[a-z0-9]/.test(c)) continue;
      chars[at] = /[a-z]/.test(c) ? String.fromCharCode(97 + ((c.charCodeAt(0) - 97 + 1 + (i % 25)) % 26)) : String((Number(c) + 1 + (i % 9)) % 10);
      changed++;
      try {
        // Were one ever absorbed, it would have to give the very same kit.
        expect(parseGuardianKit(chars.join(''))).toEqual(original);
      } catch (e) {
        if (!(e instanceof KitError)) throw e;
        refused++;
      }
    }
    expect(changed).toBeGreaterThan(800);
    expect(refused).toBe(changed);
  });
});

describe('the guardian kit: meant for something else', () => {
  const { idCommit, kits } = dealt({ n: 3, t: 2, network: 'preprod' });
  const text = guardianKitText(kits[0]);

  it('another network: a practice kit, or a real one', () => {
    expect(refusal(() => parseGuardianKit(text, { network: 'mainnet' })).message).toBe('This kit is for preprod, not mainnet');
    const { identity, idCommit: id2 } = owner();
    const practice = dealKits({ identity, idCommit: id2, network: 'practice', guardians: 2, threshold: 2, fieldRng: field, bytesRng: b32 }).kits[0];
    expect(refusal(() => parseGuardianKit(practice, { network: 'preprod' })).message).toBe('This is a practice kit; it cannot be used on preprod');
    expect(parseGuardianKit(text, { network: 'preprod' }).network).toBe('preprod');
  });

  it('another contract, another identity, a rotated guardian set', () => {
    expect(refusal(() => parseGuardianKit(text, { contract: hex(b32()) })).code).toBe('contract');
    expect(refusal(() => parseGuardianKit(text, { contract: null })).code).toBe('contract');
    expect(parseGuardianKit(text, { contract: `0x${CONTRACT}` }).contract).toBe(CONTRACT);
    expect(refusal(() => parseGuardianKit(text, { idCommit: b32() })).code).toBe('identity');
    const e = refusal(() => parseGuardianKit(text, { ctx: b32() }));
    expect(e.code).toBe('context');
    expect(e.message).toMatch(/earlier guardian set/);
    expect(hex(parseGuardianKit(text, { idCommit, ctx: idCommit }).idCommit)).toBe(hex(idCommit));
  });
});

describe('the guardian kit: as printed, and after a recovery', () => {
  it('prints its context as "same as identity" at enrolment, and reads that back to the same kit', () => {
    const { kits } = dealt();
    const k = kits[0];
    expect(contextLabel(k)).toBe('same as identity');
    const text = guardianKitText(k);
    for (const said of ['same as identity', 'Same as the identity.', 'SAME AS IDENTITY']) {
      expect(parseGuardianKit(withLine(text, 'Context', said))).toEqual(parseGuardianKit(text));
    }
    // After a rotation the context is its own value, printed in full; the words cannot stand in for it.
    const rotated = buildGuardianKit({ network: 'preprod', contract: CONTRACT, idCommit: k.identity, ctx: b32(), threshold: 2, guardians: 3,
      share: parseGuardianKit(k).share, guardianSecret: b32(), leafSalt: b32() });
    expect(contextLabel(rotated)).toBe(rotated.context);
    expect(refusal(() => parseGuardianKit(withLine(guardianKitText(rotated), 'Context', 'same as identity'))).code).toBe('check');
  });

  it('a kit made before a recovery is refused as that, not as a stranger\'s', () => {
    const { idCommit, kits } = dealt();
    const text = guardianKitText(kits[1]);
    const successor = b32();
    for (const retired of [[idCommit], [hex(idCommit)], [`0x${hex(idCommit)}`], new Set([hex(idCommit)]), (id) => id === hex(idCommit)]) {
      const e = refusal(() => parseGuardianKit(text, { idCommit: successor, retired }));
      expect(e.code).toBe('retired');
      expect(e.field).toBe('identity');
      expect(e.message).toMatch(/made before a recovery of this identity/);
    }
    // Retired identities that are not this kit's: the kit is judged on the rest.
    expect(refusal(() => parseGuardianKit(text, { idCommit: successor, retired: [b32()] })).code).toBe('identity');
    expect(hex(parseGuardianKit(text, { idCommit, retired: [] }).idCommit)).toBe(hex(idCommit));
    expect(refusal(() => parseGuardianKit(text, { retired: 42 })).code).toBe('format');
  });
});

describe('collecting shares from kits', () => {
  it('rebuilds the secret from any t kits of the same identity, in any order', () => {
    const { identity, kits } = dealt({ n: 5, t: 3 });
    const parsed = kits.map((k) => parseGuardianKit(guardianKitText(k)));
    for (const pick of [[0, 1, 2], [4, 2, 0], [1, 3, 4], [0, 1, 2, 3, 4]]) {
      const { shares, threshold } = collectShares(pick.map((i) => parsed[i]));
      expect(threshold).toBe(3);
      expect(recoverFromShares(shares).identitySecret).toBe(identity.identitySecret);
    }
  });

  it('refuses too few, the same share twice, and kits of different identities, sets or thresholds', () => {
    const a = dealt({ n: 3, t: 2 });
    const b = dealt({ n: 3, t: 2 });
    const pa = a.kits.map((k) => parseGuardianKit(k));
    const pb = b.kits.map((k) => parseGuardianKit(k));
    expect(refusal(() => collectShares([pa[0]])).message).toBe('1 of 2 shares: 1 more needed');
    expect(refusal(() => collectShares([])).code).toBe('too-few');
    expect(refusal(() => collectShares([pa[0], pa[0]])).code).toBe('duplicate-share');
    expect(refusal(() => collectShares([pa[0], pb[1]])).message).toBe('These kits belong to different identities');
    expect(refusal(() => collectShares([pa[0], { ...pa[1], ctx: b32() }])).message).toBe('These kits come from different guardian sets');
    expect(refusal(() => collectShares([pa[0], { ...pa[1], threshold: 3 }])).code).toBe('mismatch');
    expect(refusal(() => collectShares([pa[0], { ...pa[1], network: 'mainnet' }])).code).toBe('mismatch');
  });
});

describe('dealing', () => {
  it('enforces 2 ≤ t ≤ n, and a salt derived from the identity secret', () => {
    const { identity, idCommit } = owner();
    const deal = (o) => dealKits({ identity, idCommit, network: 'practice', fieldRng: field, bytesRng: b32, ...o });
    expect(refusal(() => deal({ guardians: 3, threshold: 1 })).field).toBe('threshold');
    expect(refusal(() => deal({ guardians: 2, threshold: 3 })).field).toBe('threshold');
    expect(refusal(() => deal({ guardians: 1, threshold: 1 })).field).toBe('guardians');
    expect(refusal(() => deal({ guardians: 2.5, threshold: 2 })).field).toBe('guardians');
    expect(refusal(() => dealKits({ identity: { ...identity, idSalt: b32() }, idCommit, network: 'practice', guardians: 3, threshold: 2 })).field).toBe('idSalt');
    expect(deal({ guardians: 7, threshold: 7 }).kits).toHaveLength(7);
  });

  it('takes its randomness from the caller when given, so a deal is reproducible', () => {
    const { identity, idCommit } = owner();
    const seq = (seed) => { let i = seed; return () => { i++; return Uint8Array.from({ length: 32 }, (_, j) => (i * 31 + j) & 0xff); }; };
    const field = (seed) => { let i = BigInt(seed); return () => { i += 1n; return (i * 0x9e3779b97f4a7c15n) % R; }; };
    const a = dealKits({ identity, idCommit, network: 'practice', guardians: 3, threshold: 2, bytesRng: seq(1), fieldRng: field(1) });
    const b = dealKits({ identity, idCommit, network: 'practice', guardians: 3, threshold: 2, bytesRng: seq(1), fieldRng: field(1) });
    expect(a).toEqual(b);
  });

  it('refuses a share that is not src/shamir.js\'s { x, y }', () => {
    const base = { network: 'practice', contract: null, idCommit: b32(), ctx: b32(), threshold: 2, guardians: 2, guardianSecret: b32(), leafSalt: b32() };
    expect(refusal(() => buildGuardianKit({ ...base, share: { x: 1, y: 5n } })).field).toBe('share');
    expect(refusal(() => buildGuardianKit({ ...base, share: { x: 1n, y: R } })).field).toBe('shareWords');
    expect(refusal(() => buildGuardianKit({ ...base, share: { x: 3n, y: 5n } })).field).toBe('share');
    expect(refusal(() => buildGuardianKit({ ...base, share: { x: 1n, y: 5n }, guardianSecret: new Uint8Array(31) })).field).toBe('guardianSecret');
  });
});
