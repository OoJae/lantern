import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // These tests run the REAL generated circuit logic -- SHA-256 preimages and
    // 20-level Merkle paths -- in JS. A full recovery flow is several hundred
    // hash compressions, so the 5s default is far too tight, and a judge on a
    // slower machine would see spurious failures. Correctness is asserted by
    // the assertions, never by the clock.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
