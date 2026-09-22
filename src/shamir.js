// Shamir secret sharing over the BLS12-381 scalar field.
//
// Deliberately dependency-free: the common npm `shamir` packages operate over
// GF(256), which would produce a "secret" that never opens the identity
// commitment -- a silent, total failure. Sharing in the same field Compact's
// `Field` type uses means the reconstructed value IS the witness, with no
// serialization and no endianness boundary anywhere.
import { R, mod, add, mul, sub, inv, randomFieldElement } from './field.js';

/**
 * Split `secret` into `n` shares, any `t` of which reconstruct it.
 * Coefficient uniformity is what gives perfect secrecy to any t-1 shares --
 * the secret's own distribution is almost irrelevant -- so they come from
 * randomFieldElement(), not from a convenience RNG.
 */
export function split(secret, n, t, rng = randomFieldElement) {
  if (!Number.isInteger(n) || !Number.isInteger(t)) throw new Error('n and t must be integers');
  if (t < 2) throw new Error('threshold must be at least 2');
  if (n < t) throw new Error('n must be at least t');
  if (n > 255) throw new Error('n must be at most 255');

  const coeffs = [mod(secret)];
  for (let i = 1; i < t; i++) coeffs.push(mod(rng()));

  const shares = [];
  for (let i = 1; i <= n; i++) {
    const x = BigInt(i);
    let y = 0n;
    for (let j = coeffs.length - 1; j >= 0; j--) y = add(mul(y, x), coeffs[j]); // Horner
    shares.push({ x, y });
  }
  return shares;
}

/** Lagrange interpolation at x = 0. Requires at least `t` distinct shares. */
export function reconstruct(shares) {
  if (!Array.isArray(shares) || shares.length === 0) throw new Error('no shares supplied');
  const xs = shares.map((s) => mod(s.x));
  if (xs.some((x) => x === 0n)) throw new Error('x = 0 is the secret itself, never a share');
  if (new Set(xs.map(String)).size !== xs.length) throw new Error('duplicate share x-coordinates');

  let secret = 0n;
  for (let i = 0; i < shares.length; i++) {
    let num = 1n, den = 1n;
    for (let j = 0; j < shares.length; j++) {
      if (i === j) continue;
      num = mul(num, sub(0n, xs[j]));
      den = mul(den, sub(xs[i], xs[j]));
    }
    secret = add(secret, mul(mod(shares[i].y), mul(num, inv(den))));
  }
  return secret;
}

export { R, randomFieldElement };
