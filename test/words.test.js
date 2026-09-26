// src/words.js: the words a person reads aloud or writes down. The vectors are pinned: a change to the
// wordlist, the fingerprint's domain or its bit order would silently change every printed kit and every
// fingerprint a guardian has been told to expect, so it fails here first.
//
// Every input is seeded (SHA-256 of a tag and a counter), so a run is reproducible and the counts the
// statistical tests pin are exact: a failure here is a change, never bad luck.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  WORDLIST, FINGERPRINT_WORDS, fingerprintWords, hashWords, bytesToWords, wordsToBytes, readWords, WordsError,
} from '../src/words.js';

const hex = (b) => Buffer.from(b).toString('hex');
const ZERO32 = new Uint8Array(32);
// 32 (or up to 64) reproducible bytes: SHA-256 of "tag:i", twice over for more than 32.
const seeded = (tag, i, n = 32) => {
  const a = createHash('sha256').update(`${tag}:${i}`).digest();
  const b = createHash('sha256').update(`${tag}:${i}:more`).digest();
  return new Uint8Array(Buffer.concat([a, b]).subarray(0, n));
};
// The error a call throws; fails the test when it throws nothing.
const thrown = (fn) => {
  try { fn(); } catch (e) { return e; }
  throw new Error('expected a refusal, and the words were accepted');
};

describe('the wordlist', () => {
  it('is BIP-39 English: 2,048 words, sorted, the first and last where the standard puts them', () => {
    expect(WORDLIST).toHaveLength(2048);
    expect(WORDLIST[0]).toBe('abandon');
    expect(WORDLIST[2047]).toBe('zoo');
    expect([...WORDLIST].sort()).toEqual([...WORDLIST]);
    // The published list's own SHA-256 (newline-joined, trailing newline), as in BIP-39's repository.
    const digest = createHash('sha256').update(`${WORDLIST.join('\n')}\n`).digest('hex');
    expect(digest).toBe('2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda');
  });

  it('names every word by its first four letters, which readWords relies on', () => {
    expect(new Set(WORDLIST.map((w) => w.slice(0, 4))).size).toBe(2048);
  });
});

describe('fingerprintWords', () => {
  it('is six words: 66 bits of SHA-256("lantern:fingerprint:v1" ‖ key), pinned', () => {
    expect(FINGERPRINT_WORDS).toBe(6);
    expect(fingerprintWords(ZERO32)).toEqual(['annual', 'floor', 'family', 'castle', 'cloth', 'casual']);
    // The same 66 bits, read out of Node's own SHA-256 independently of the implementation.
    const key = seeded('fingerprint', 0);
    const d = createHash('sha256').update('lantern:fingerprint:v1').update(key).digest();
    const bits = [...d].map((b) => b.toString(2).padStart(8, '0')).join('').slice(0, 66);
    const expected = bits.match(/.{11}/g).map((b) => WORDLIST[parseInt(b, 2)]);
    expect(fingerprintWords(key)).toEqual(expected);
  });

  it('takes the key as bytes or hex, with or without 0x, and gives the same words', () => {
    const key = seeded('fingerprint', 1);
    expect(fingerprintWords(hex(key))).toEqual(fingerprintWords(new Uint8Array(key)));
    expect(fingerprintWords(`0x${hex(key)}`)).toEqual(fingerprintWords(new Uint8Array(key)));
    expect(fingerprintWords(hex(key).toUpperCase())).toEqual(fingerprintWords(new Uint8Array(key)));
  });

  it('refuses what is not bytes or even-length hex', () => {
    expect(() => fingerprintWords('abc')).toThrow(TypeError);
    expect(() => fingerprintWords('zz')).toThrow(TypeError);
    expect(() => fingerprintWords(42)).toThrow(TypeError);
  });

  it('differs for keys one bit apart, across many keys (no two alike in 2,000)', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      const key = seeded('bit-apart', i);
      const flipped = Uint8Array.from(key);
      flipped[i % 32] ^= 1 << (i % 8);
      const a = fingerprintWords(key).join(' ');
      const b = fingerprintWords(flipped).join(' ');
      expect(a).not.toBe(b);
      seen.add(a); seen.add(b);
    }
    expect(seen.size).toBe(2000);
  });

  it('is a different six words from any other domain over the same key', () => {
    const key = seeded('domain', 0);
    expect(hashWords('lantern:fingerprint:v1', key, 6)).toEqual(fingerprintWords(key));
    expect(hashWords('lantern:fingerprint:v2', key, 6)).not.toEqual(fingerprintWords(key));
  });
});

describe('hashWords', () => {
  it('gives the requested count, 1 to 23, each word on the list', () => {
    for (const n of [1, 3, 6, 23]) {
      const w = hashWords('d', ZERO32, n);
      expect(w).toHaveLength(n);
      expect(w.every((x) => WORDLIST.includes(x))).toBe(true);
    }
    expect(() => hashWords('d', ZERO32, 0)).toThrow(RangeError);
    expect(() => hashWords('d', ZERO32, 24)).toThrow(RangeError);
    expect(() => hashWords('d', ZERO32, 1.5)).toThrow(RangeError);
  });

  it('is a prefix of itself: three words are the first three of six', () => {
    const b = seeded('prefix', 0, 40);
    expect(hashWords('x', b, 3)).toEqual(hashWords('x', b, 6).slice(0, 3));
  });
});

describe('bytesToWords and wordsToBytes', () => {
  it('pins the BIP-39 vectors: 32 zero bytes, and 32 bytes of 0x7f', () => {
    expect(bytesToWords(ZERO32).join(' ')).toBe(`${'abandon '.repeat(23)}art`);
    expect(bytesToWords(new Uint8Array(32).fill(0x7f)).join(' ')).toBe(
      'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title');
  });

  it('round-trips random 32-byte values, as arrays, as text, in capitals and numbered (500 values)', () => {
    for (let i = 0; i < 500; i++) {
      const b = seeded('round-trip', i);
      const words = bytesToWords(b);
      expect(words).toHaveLength(24);
      expect(wordsToBytes(words)).toEqual(b);
      expect(wordsToBytes(words.join(' '))).toEqual(b);
      if (i % 50 === 0) {
        expect(wordsToBytes(words.map((w) => w.toUpperCase()).join('\n'))).toEqual(b);
        expect(wordsToBytes(words.map((w, j) => `${j + 1}. ${w}`).join(' '))).toEqual(b);
        expect(wordsToBytes(words.map((w) => w.slice(0, 4)))).toEqual(b);
      }
    }
  });

  it('refuses anything but 32 bytes', () => {
    expect(() => bytesToWords(new Uint8Array(31))).toThrow(RangeError);
    expect(() => bytesToWords(new Uint8Array(33))).toThrow(RangeError);
  });

  it('refuses the wrong number of words, saying how many', () => {
    const words = bytesToWords(seeded('count', 0));
    expect(() => wordsToBytes(words.slice(0, 23))).toThrow(/expected 24 words, got 23/);
    expect(() => wordsToBytes([...words, 'abandon'])).toThrow(/got 25/);
    expect(thrown(() => wordsToBytes(words.slice(1))).code).toBe('count');
  });

  it('refuses a word not on the list, naming its position', () => {
    const words = bytesToWords(seeded('unknown', 0));
    words[6] = 'tobaco';
    let err;
    try { wordsToBytes(words); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(WordsError);
    expect(err.code).toBe('unknown-word');
    expect(err.at).toBe(7);
    expect(err.message).toMatch(/word 7, “tobaco”/);
  });

  // About 1 substitution in 256 keeps an 8-bit checksum: over 2,000 seeded trials, 2000/256 ≈ 7.8
  // expected. The count is exact because the inputs are seeded; every one that passes is another value.
  it('refuses a substituted word unless the 8-bit checksum happens to pass (9 of 2,000 seeded trials)', () => {
    let passed = 0;
    let refused = 0;
    for (let i = 0; i < 2000; i++) {
      const b = seeded('substitute', i);
      const words = bytesToWords(b);
      const at = i % 24;
      words[at] = WORDLIST[(WORDLIST.indexOf(words[at]) + 1 + (i % 2047)) % 2048];
      let back;
      try { back = wordsToBytes(words); } catch (e) {
        expect(e.code).toBe('checksum');
        refused++;
        continue;
      }
      expect(hex(back)).not.toBe(hex(b));
      passed++;
    }
    expect(passed).toBe(9);
    expect(refused).toBe(1991);
  });

  it('refuses two swapped words unless the checksum happens to pass (2 of 500 seeded trials)', () => {
    let passed = 0;
    let tried = 0;
    for (let i = 0; i < 500; i++) {
      const words = bytesToWords(seeded('swap', i));
      const a = i % 23;
      if (words[a] === words[a + 1]) continue;
      [words[a], words[a + 1]] = [words[a + 1], words[a]];
      tried++;
      try { wordsToBytes(words); passed++; } catch (e) { expect(e.code).toBe('checksum'); }
    }
    expect(tried).toBe(500);
    expect(passed).toBe(2);
  });
});

describe('readWords', () => {
  it('drops numbering, commas and capitals, and expands four letters or more to the one word they begin', () => {
    expect(readWords('1. Tobac, 2) abandon 3: zoo  4 act.').words).toEqual(['tobacco', 'abandon', 'zoo', 'act']);
    expect(readWords(['ABAN', 'abil']).words).toEqual(['abandon', 'ability']);
    expect(readWords('').words).toEqual([]);
  });

  it('drops numbering in every common style, and bullets and dashes, without counting them as words', () => {
    for (const typed of ['(1) abandon (2) ability', '1 - abandon 2 - ability', '1 – abandon 2 — ability', '#1 abandon #2 ability',
      '[1] abandon [2] ability', '1.abandon 2)ability', '(1)abandon (2)abil', '• abandon • ability', '1: “abandon”, 2: “ability”.',
      '1\tabandon\n2\tability', '- abandon\n- ability']) {
      expect(readWords(typed), typed).toEqual({ words: ['abandon', 'ability'], unknown: [] });
    }
  });

  it('still names a word that is not on the list, at its place among the words', () => {
    expect(readWords('(1) abandon (2) tobaco (3) zoo').unknown).toEqual([{ at: 2, word: 'tobaco' }]);
    // A 24-word card numbered "(n)" reads back to its bytes.
    const b = seeded('numbered', 0);
    expect(wordsToBytes(bytesToWords(b).map((w, i) => `(${i + 1}) ${w}`).join(' '))).toEqual(b);
    expect(wordsToBytes(bytesToWords(b).map((w, i) => `${i + 1} – ${w}`).join('\n'))).toEqual(b);
  });

  it('expands no word from three letters, or from letters that are not its beginning', () => {
    // "aba" is not a word; "tobaxx" begins like "tobacco" but is not a beginning of it.
    const r = readWords('aba tobaxx act');
    expect(r.words).toEqual(['aba', 'tobaxx', 'act']);
    expect(r.unknown).toEqual([{ at: 1, word: 'aba' }, { at: 2, word: 'tobaxx' }]);
  });

  it('expands every word from its own first four letters', () => {
    for (const w of WORDLIST) expect(readWords(w.slice(0, 4)).words).toEqual([w]);
  });
});
