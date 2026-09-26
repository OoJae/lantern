// Words for what a person reads aloud or writes down: a device's fingerprint, a guardian's share and
// the veto card. The BIP-39 English list (2,048 words, @scure/bip39, MIT): chosen so that the first four
// letters of every word are unique, and misreadings are easy to catch.
//
// fingerprintWords names a device key in six words, 66 bits: what a guardian compares, aloud, with what
// the owner reads out. The 8-hex fingerprint the story shows is 32 bits, few enough that someone opening
// a competing recovery could grind a key to match it (about 4×10^9 tries, one laptop); 66 bits would take
// about 7×10^19.
//
// bytesToWords and wordsToBytes carry 32 bytes as 24 words with BIP-39's checksum, so a mistyped or
// swapped word is refused rather than silently giving another value.
//
// readWords tidies what a person typed (numbering in any common style, bullets, dashes, commas, capitals)
// and expands a word from its first four letters, the way a paper backup is usually checked. hashWords names any digest in a few words: the
// fingerprint and the kits' check words (src/kit.js) are both made with it.
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const WORDLIST = wordlist;
export const FINGERPRINT_WORDS = 6;

const INDEX = new Map(wordlist.map((w, i) => [w, i]));
// Every word by its first four letters (unique in this list); a word of three letters is its own prefix.
const BY_PREFIX = new Map(wordlist.map((w) => [w.slice(0, 4), w]));

/** A refusal a person can act on: `code` says what went wrong, `at` which word (1-based), if one did. */
export class WordsError extends Error {
  constructor(code, message, at) {
    super(message);
    this.name = 'WordsError';
    this.code = code;
    if (at !== undefined) this.at = at;
  }
}

const toBytes = (v) => {
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'string' && /^(0x)?[0-9a-fA-F]*$/.test(v) && v.replace(/^0x/, '').length % 2 === 0) {
    const h = v.replace(/^0x/, '');
    return Uint8Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
  }
  throw new TypeError('expected bytes or an even-length hex string');
};

/**
 * The first `count` × 11 bits of SHA-256(domain ‖ bytes), as words. Different domains give unrelated
 * words for the same bytes, so a fingerprint can never be mistaken for a check phrase.
 */
export function hashWords(domain, bytes, count) {
  if (!Number.isInteger(count) || count < 1 || count > 23) throw new RangeError('count must be 1 to 23 words');
  const digest = sha256(concatBytes(utf8ToBytes(domain), toBytes(bytes)));
  const words = [];
  for (let i = 0; i < count; i++) {
    let index = 0;
    for (let b = 0; b < 11; b++) {
      const bit = i * 11 + b;
      index = (index << 1) | ((digest[bit >> 3] >> (7 - (bit & 7))) & 1);
    }
    words.push(wordlist[index]);
  }
  return words;
}

/** Six words naming a device key: 66 bits of SHA-256 over a domain tag and the key. */
export function fingerprintWords(publicKey) {
  return hashWords('lantern:fingerprint:v1', publicKey, FINGERPRINT_WORDS);
}

// Punctuation, quotes, brackets, bullets and dashes around a token: "(1)", "#1", "–", "abandon.".
const EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
// Numbering stuck to the word it numbers: "1.abandon", "2)ability", "(3)able" once its "(" is gone.
const NUMBERED = /^\d+[^\p{L}\p{N}]*(?=\p{L})/u;

/**
 * What a person typed, as list words. Numbering ("1." "2)" "(3)" "#4" "5 -"), bullets, dashes, commas
 * and case are dropped: a token that is only a number or only punctuation is never a word. A word typed
 * as its first four letters or more is expanded when the list has exactly the one word it begins.
 * Returns the words and, for each token that names no word, its 1-based position and what was typed.
 */
export function readWords(input) {
  const tokens = (Array.isArray(input) ? input.join(' ') : String(input ?? ''))
    .toLowerCase()
    .split(/[\s,;·•]+/)
    .map((t) => t.replace(EDGES, '').replace(NUMBERED, ''))
    .filter((t) => t !== '' && !/^\d+$/.test(t));
  const words = [];
  const unknown = [];
  tokens.forEach((t, i) => {
    if (INDEX.has(t)) { words.push(t); return; }
    const full = t.length >= 4 ? BY_PREFIX.get(t.slice(0, 4)) : undefined;
    if (full && full.startsWith(t)) { words.push(full); return; }
    words.push(t);
    unknown.push({ at: i + 1, word: t });
  });
  return { words, unknown };
}

/** 32 bytes as 24 words, the last carrying an 8-bit checksum. */
export function bytesToWords(bytes) {
  const b = toBytes(bytes);
  if (b.length !== 32) throw new RangeError(`expected 32 bytes, got ${b.length}`);
  return entropyToMnemonic(b, wordlist).split(' ');
}

/**
 * 24 words back to 32 bytes; throws on an unknown word or a failed checksum. Accepts what readWords
 * accepts, so "1. tobac 2. abandon …" reads as well as the words themselves.
 */
export function wordsToBytes(words) {
  const { words: list, unknown } = readWords(words);
  if (unknown.length) {
    const { at, word } = unknown[0];
    throw new WordsError('unknown-word', `word ${at}, “${word}”, is not on the word list`, at);
  }
  if (list.length !== 24) {
    const e = new RangeError(`expected 24 words, got ${list.length}`);
    e.code = 'count';
    throw e;
  }
  try {
    return mnemonicToEntropy(list.join(' '), wordlist);
  } catch {
    throw new WordsError('checksum', 'the words do not check out: one is wrong, or two are swapped');
  }
}
