// The rules the local-chain runner must never break, checked without Docker or a chain.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { flavour, SHIPPED_LINE, FLAVOUR_LINE, FLAVOUR_DELAY_SECONDS } from '../devnet/flavour.mjs';
import { retryOutOfDustWindow } from '../devnet/src/dust-window.mjs';

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

  // Code without its line comments. A `//` right after a colon is a URL, not a comment.
  const code = (t) => t.split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
  const hostsIn = (t) => [...t.matchAll(/\b(?:https?|wss?):\/\/([^/:'"`\s]+)/g)].map((m) => m[1]);
  const config = read('devnet/src/config.mjs');

  it('targets the local network unless Preprod is chosen explicitly, and never mainnet', () => {
    expect(config).toMatch(/process\.env\.LANTERN_NETWORK \|\| 'undeployed'/);
    // Exactly two networks: the local chain, all on 127.0.0.1, and Preprod.
    const networks = config.match(/^const NETWORKS = \{\n([\s\S]*?)\n\};$/m)[1];
    expect([...networks.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1])).toEqual(['undeployed', 'preprod']);
    const local = networks.match(/^ {2}undeployed: \{\n([\s\S]*?)\n {2}\},$/m)[1];
    expect(local).toMatch(/^ {4}networkId: 'undeployed',$/m);
    expect(hostsIn(local)).toEqual(['127.0.0.1', '127.0.0.1', '127.0.0.1']);
    expect(hostsIn(config.match(/^const proofServer = .*$/m)[0])).toEqual(['127.0.0.1']);
    for (const f of devnetSrc) expect(code(readFileSync(f, 'utf8')), f).not.toMatch(/mainnet|preview|testnet/i);
  });

  it('connects only to the local chain and Preprod\'s published hosts, named in config.mjs alone', () => {
    const ALLOWED = ['127.0.0.1', 'localhost', 'indexer.preprod.midnight.network', 'rpc.preprod.midnight.network', 'preprod.midnightexplorer.com'];
    const PREPROD_HOST = /indexer\.preprod|rpc\.preprod|preprod\.midnightexplorer/i;
    expect(hostsIn(code(config))).toEqual(expect.arrayContaining(ALLOWED.filter((h) => h !== 'localhost')));
    for (const f of devnetSrc) {
      const text = readFileSync(f, 'utf8');
      expect(hostsIn(code(text)).filter((h) => !ALLOWED.includes(h)), f).toEqual([]);
      if (!f.endsWith('/config.mjs')) expect(text, f).not.toMatch(PREPROD_HOST);
    }
  });
});

describe('a DUST spend refused as outside its time window (node error 171)', () => {
  const refused = () => new Error('1010: Invalid Transaction: Custom error: 171');
  const noWait = { sleep: async () => {} };

  it('is resubmitted until the node accepts it', async () => {
    let calls = 0;
    const r = await retryOutOfDustWindow(async () => { if (++calls < 3) throw refused(); return 'in block'; }, noWait);
    expect([r, calls]).toEqual(['in block', 3]);
  });

  it('is the only refusal resubmitted: any other error is thrown at once', async () => {
    let calls = 0;
    const other = new Error('1010: Invalid Transaction: Custom error: 170');
    await expect(retryOutOfDustWindow(async () => { calls++; throw other; }, noWait)).rejects.toBe(other);
    expect(calls).toBe(1);
  });

  it('gives up after its attempts and throws the last refusal', async () => {
    let calls = 0;
    await expect(retryOutOfDustWindow(async () => { calls++; throw refused(); }, { ...noWait, attempts: 4 }))
      .rejects.toThrow(/Custom error: 171/);
    expect(calls).toBe(4);
  });
});
