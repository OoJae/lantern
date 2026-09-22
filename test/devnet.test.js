// The rules the local-chain runner must never break, checked without Docker or a chain.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { flavour, SHIPPED_LINE, FLAVOUR_LINE, FLAVOUR_DELAY_SECONDS } from '../devnet/flavour.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the devnet flavour', () => {
  const shipped = read('contracts/src/lantern.compact');
  const { text, changedLine } = flavour(shipped);

  it('changes exactly one line of lantern.compact: the timelock, 72 h to 60 s', () => {
    const a = shipped.split('\n'), b = text.split('\n');
    expect(b).toHaveLength(a.length);
    const diff = a.flatMap((l, i) => (l === b[i] ? [] : [i + 1]));
    expect(diff).toEqual([changedLine]);
    expect(a[changedLine - 1]).toBe(SHIPPED_LINE);
    expect(b[changedLine - 1]).toBe(FLAVOUR_LINE);
    expect(FLAVOUR_DELAY_SECONDS).toBe(60);
  });

  it('refuses a source where that line is missing or doubled', () => {
    expect(() => flavour(shipped.replace(SHIPPED_LINE, '// gone'))).toThrow(/exactly once/);
    expect(() => flavour(`${shipped}\n${SHIPPED_LINE}`)).toThrow(/exactly once/);
  });
});

describe('the devnet runner', () => {
  const devnetSrc = readdirSync(join(root, 'devnet/src')).filter((f) => f.endsWith('.mjs')).map((f) => join(root, 'devnet/src', f));
  const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => m[1] ?? m[2]);

  it('imports nothing from src/ that reaches a Midnight package or the root runtime', () => {
    // devnet/ has its own runtime copy; anything it takes from src/ must receive the runtime by injection.
    const seen = new Set();
    const queue = devnetSrc.flatMap((f) => importsOf(f).filter((s) => s.includes('/src/')).map((s) => resolve(dirname(f), s)));
    const offenders = [];
    while (queue.length) {
      const f = queue.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      for (const spec of importsOf(f)) {
        if (spec.startsWith('.')) queue.push(resolve(dirname(f), spec));
        else if (spec.startsWith('@midnight-ntwrk/')) offenders.push(`${f.slice(root.length)} -> ${spec}`);
      }
      if (/contracts\/managed/.test(readFileSync(f, 'utf8'))) offenders.push(`${f.slice(root.length)} -> contracts/managed`);
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(offenders).toEqual([]);
  });

  it('never writes under contracts/, and builds only into devnet/build', () => {
    for (const f of ['devnet/compile.sh', 'devnet/run.sh', 'devnet/flavour.mjs']) {
      expect(read(f), f).not.toMatch(/contracts\/managed/);
    }
    expect(read('devnet/compile.sh')).toMatch(/devnet\/build\/lantern/);
  });

  it('targets the local network only', () => {
    expect(read('devnet/src/config.mjs')).toMatch(/networkId: 'undeployed'/);
    const code = (t) => t.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    for (const f of devnetSrc) expect(code(readFileSync(f, 'utf8')), f).not.toMatch(/preprod|preview|mainnet|testnet/i);
  });
});
