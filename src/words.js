// Words for what a person reads aloud or writes down: a device's fingerprint, a guardian's share and
// the veto card. The BIP-39 English list (2,048 words, @scure/bip39, MIT): chosen so that the first four
// letters of every word are unique, and misreadings are easy to catch.
//
// fingerprintWords names a device key in six words, 66 bits: what a guardian compares, aloud, with what
// the owner reads out. The 8-hex fingerprint the story shows is 32 bits, few enough that someone opening
// a competing recovery could grind a key to match it; 66 bits are not.
//
// bytesToWords and wordsToBytes carry 32 bytes as 24 words with BIP-39's checksum, so a mistyped or
// swapped word is refused rather than silently giving another value.
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const WORDLIST = wordlist;
export const FINGERPRINT_WORDS = 6;

const toBytes = (v) => {
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'string' && /^(0x)?[0-9a-fA-F]*$/.test(v) && v.replace(/^0x/, '').length % 2 === 0) {
    const h = v.replace(/^0x/, '');
    return Uint8Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
  }
  throw new TypeError('expected bytes or an even-length hex string');
};

/** Six words naming a device key: 66 bits of SHA-256 over a domain tag and the key. */
export function fingerprintWords(publicKey) {
  const digest = sha256(concatBytes(utf8ToBytes('lantern:fingerprint:v1'), toBytes(publicKey)));
  const words = [];
  for (let i = 0; i < FINGERPRINT_WORDS; i++) {
    let index = 0;
    for (let b = 0; b < 11; b++) {
      const bit = i * 11 + b;
      index = (index << 1) | ((digest[bit >> 3] >> (7 - (bit & 7))) & 1);
    }
    words.push(wordlist[index]);
  }
  return words;
}

/** 32 bytes as 24 words, the last carrying an 8-bit checksum. */
export function bytesToWords(bytes) {
  const b = toBytes(bytes);
  if (b.length !== 32) throw new RangeError(`expected 32 bytes, got ${b.length}`);
  return entropyToMnemonic(b, wordlist).split(' ');
}

/** 24 words back to 32 bytes; throws on an unknown word or a failed checksum. */
export function wordsToBytes(words) {
  const list = (Array.isArray(words) ? words : String(words).trim().split(/\s+/)).map((w) => w.toLowerCase());
  if (list.length !== 24) throw new RangeError(`expected 24 words, got ${list.length}`);
  return mnemonicToEntropy(list.join(' '), wordlist);
}
