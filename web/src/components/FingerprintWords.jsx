// A device key's six fingerprint words: what the owner reads aloud and a guardian compares, word by
// word, before approving a recovery. 66 bits (src/words.js), where the 8-hex fingerprint is 32: too
// many to grind a look-alike key for.
//
// Numbered, in the monospace face, in reading order, so "three: tobacco" can be said and checked. The
// list is named with the whole phrase, so a screen reader announces all six words on reaching it; its
// items still read one by one after that, for checking word by word, and each item's numeral is hidden
// from it (the list already counts). Each word is marked translate="no" and lang="en", since the
// wordlist is BIP-39 English and a translated word would no longer match.
import { useMemo } from 'react';
import { fingerprintWords } from '../../../src/words.js';
import '../kit/fingerprint-words.css';

const SIZES = new Set(['sm', 'md', 'lg']);

/**
 * @param {{ publicKey: Uint8Array | string, size?: 'sm' | 'md' | 'lg', label?: string, className?: string }} props
 * publicKey: the device's public key, as bytes or hex. size: sm sits beside a hex fingerprint, md (the
 * default) stands on its own, lg is for a printed kit. label: the accessible name's lead-in.
 */
export default function FingerprintWords({ publicKey, size = 'md', label = 'Device fingerprint', className }) {
  const words = useMemo(() => {
    try {
      return publicKey == null || publicKey.length === 0 ? null : fingerprintWords(publicKey);
    } catch {
      return null;
    }
  }, [publicKey]);
  if (!words) return null;

  const classes = ['fp-words', `fp-${SIZES.has(size) ? size : 'md'}`, className].filter(Boolean).join(' ');
  return (
    <ol className={classes} aria-label={`${label}: ${words.join(' ')}`} data-fingerprint-words={words.join(' ')} translate="no">
      {words.map((w, i) => (
        <li key={i} className="fp-word">
          <span className="fp-n" aria-hidden="true">{i + 1}</span>
          <span className="fp-w" lang="en">{w}</span>
        </li>
      ))}
    </ol>
  );
}
