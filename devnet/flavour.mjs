#!/usr/bin/env node
// The devnet FLAVOUR of Lantern: the shipped source with exactly one line changed.
//
// A 72-hour timelock cannot be waited out on a local chain, so the devnet build sets
// recoveryDelaySeconds to 60. Nothing else changes -- this module refuses to produce a
// flavour that differs from the shipped source in any other line, and the root test suite
// (test/devnet.test.js) checks it. The flavour is written to devnet/build/src/, which is
// gitignored; contracts/ is never touched.
//
// No dependencies: the root tests import it directly.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHIPPED_LINE = 'export pure circuit recoveryDelaySeconds(): Uint<64> { return 259200; } // 72h';
export const FLAVOUR_LINE = 'export pure circuit recoveryDelaySeconds(): Uint<64> { return 60; } // devnet flavour: 60 s';
export const FLAVOUR_DELAY_SECONDS = 60;

/** The flavoured source, and proof that exactly one line changed. */
export function flavour(source) {
  const before = source.split('\n');
  const hits = before.filter((l) => l === SHIPPED_LINE).length;
  if (hits !== 1) throw new Error(`expected the shipped timelock line exactly once, found it ${hits} times`);
  const after = before.map((l) => (l === SHIPPED_LINE ? FLAVOUR_LINE : l));
  const changed = after.flatMap((l, i) => (l === before[i] ? [] : [i + 1]));
  if (changed.length !== 1 || after.length !== before.length) throw new Error('the flavour must change exactly one line');
  return { text: after.join('\n'), changedLine: changed[0] };
}

// CLI: write the flavoured lantern.compact, beside copies of the modules it imports.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const src = join(root, 'contracts', 'src');
  const out = join(root, 'devnet', 'build', 'src');
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(src)) if (f.endsWith('.compact') && f !== 'lantern.compact') copyFileSync(join(src, f), join(out, f));
  const { text, changedLine } = flavour(readFileSync(join(src, 'lantern.compact'), 'utf8'));
  writeFileSync(join(out, 'lantern.compact'), text);
  console.log(`flavour: devnet/build/src/lantern.compact, line ${changedLine} only: recoveryDelaySeconds 259200 -> ${FLAVOUR_DELAY_SECONDS}`);
}
