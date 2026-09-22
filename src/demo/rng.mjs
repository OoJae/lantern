// Randomness for the story. Seeded, so a test run is reproducible byte for
// byte; unseeded, so a demo run uses real Web Crypto entropy.
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { R } from '../field.js';

const be64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); return b; };
const toBig = (u) => u.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);

/**
 * @param seed  a string for a deterministic stream (tests), or undefined for
 *              Web Crypto entropy (demos)
 */
export function storyRng(seed) {
  let counter = 0;
  const block = seed === undefined
    ? () => globalThis.crypto.getRandomValues(new Uint8Array(32))
    : () => sha256(concatBytes(utf8ToBytes(`lantern-story:${seed}`), be64(counter++)));
  return Object.freeze({
    seeded: seed !== undefined,
    bytes32: () => block(),
    // Wide reduction of 64 bytes: statistically uniform below r.
    field: () => toBig(concatBytes(block(), block())) % R,
  });
}
