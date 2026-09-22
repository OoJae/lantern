// Arithmetic in the BLS12-381 scalar field -- the field Compact's `Field` type
// actually uses. test/shamir.test.js checks R against every runtime copy the
// repo ships with (root and devnet), so a toolchain curve change fails CI
// loudly instead of silently producing wrong shares.
//
// Imports nothing: portable to the browser, and free of any one runtime copy,
// so the local-chain runner can use it alongside its own.
export const R = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;

export const mod = (a) => ((a % R) + R) % R;
export const add = (a, b) => mod(a + b);
export const sub = (a, b) => mod(a - b);
export const mul = (a, b) => mod(a * b);

export function pow(base, exp) {
  let b = mod(base), e = exp, acc = 1n;
  while (e > 0n) {
    if (e & 1n) acc = (acc * b) % R;
    b = (b * b) % R;
    e >>= 1n;
  }
  return acc;
}

// Fermat's little theorem. The explicit zero guard is load-bearing:
// pow(0, R-2) returns 0 rather than throwing, so a duplicate x-coordinate
// would otherwise reconstruct a wrong secret in silence.
export function inv(a) {
  const x = mod(a);
  if (x === 0n) throw new Error('field inverse of zero');
  return pow(x, R - 2n);
}

/**
 * Uniform field element by WIDE REDUCTION of 64 random bytes.
 * Statistical distance from uniform is < 2^-257. Naive rejection sampling over
 * 32 bytes would reject ~54.7% of draws, because r/2^256 is about 0.453.
 */
export function randomFieldElement() {
  const b = new Uint8Array(64);
  globalThis.crypto.getRandomValues(b);
  let x = 0n;
  for (let i = 0; i < b.length; i++) x = (x << 8n) | BigInt(b[i]);
  return x % R;
}
