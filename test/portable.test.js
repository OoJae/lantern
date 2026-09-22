// src/ is shared with the browser demo, so it must not touch Node-only APIs.
// And the swap from node:crypto to noble must be byte-exact: a CONSISTENT
// change in guardianIdOf would slip past the adversarial tests (the attacker
// and the victim would drift together), so parity is pinned here directly.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ADDRESS_BOOK, guardianIdOf, sha, hex } from '../src/attack/candidates.mjs';
import { R, randomFieldElement } from '../src/field.js';

const SRC = new URL('../src/', import.meta.url).pathname;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(m?js)$/.test(name) ? [p] : [];
  });
}

// Code lines only, so a comment may still say what an API is.
const codeLines = (text) => text.split('\n')
  .map((line, i) => ({ line, n: i + 1 }))
  .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line));

const FORBIDDEN = [
  [/['"]node:/, 'a node: import'],
  [/\brequire\s*\(/, 'require()'],
  [/\bBuffer\b/, 'Buffer'],
  [/\bprocess\s*[.[]/, 'process'],
  [/from\s+['"](crypto|fs|path|os|util|stream|child_process)['"]/, 'a Node builtin import'],
];

function violations(text) {
  const hits = [];
  for (const { line, n } of codeLines(text)) {
    for (const [re, what] of FORBIDDEN) if (re.test(line)) hits.push(`${n}: ${what}`);
  }
  return hits;
}

const nodeSha = (...parts) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return hex(new Uint8Array(h.digest()));
};

describe('portability of src/', () => {
  it('the scanner catches each forbidden API (positive control)', () => {
    const planted = [
      "import { createHash } from 'node:crypto';",
      "const fs = require('fs');",
      'const b = Buffer.from(x);',
      'if (process.env.X) {}',
      "import { webcrypto } from 'crypto';",
      '// Buffer in a comment is fine',
    ].join('\n');
    expect(violations(planted)).toEqual(['1: a node: import', '2: require()', '3: Buffer', '4: process', '5: a Node builtin import']);
  });

  it('uses no Node-only API, so the browser demo can import it unchanged', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(5);
    const hits = files.flatMap((f) => violations(readFileSync(f, 'utf8')).map((h) => `${f.slice(SRC.length)}:${h}`));
    expect(hits).toEqual([]);
  });

  it('only the bindings and the attack harness import the runtime or a compiled contract', () => {
    // Everything else in src/ receives them by injection, so the local-chain
    // runner can hand it a different runtime copy and the browser its own.
    const ALLOWED = ['attack/sim.mjs', 'attack/targets.mjs', 'bindings/root.mjs'];
    const importers = sourceFiles(SRC)
      .filter((f) => codeLines(readFileSync(f, 'utf8'))
        .some(({ line }) => /from\s+['"](@midnight-ntwrk\/|[^'"]*contracts\/managed)/.test(line)))
      .map((f) => f.slice(SRC.length))
      .sort();
    expect(importers).toEqual(ALLOWED);
  });

  it('guardianIdOf is byte-identical to node:crypto for every address-book name', () => {
    expect(ADDRESS_BOOK).toHaveLength(64);
    for (const name of ADDRESS_BOOK) {
      expect(hex(guardianIdOf(name)), name).toBe(nodeSha(name));
    }
  });

  it("the attacker's multi-part sha matches node:crypto for strings and bytes", () => {
    const ctx = new Uint8Array(32).map((_, i) => (i * 37 + 11) & 0xff);
    for (const name of ADDRESS_BOOK) {
      expect(hex(sha('guardian:', name))).toBe(nodeSha('guardian:', name));
      expect(hex(sha(ctx, guardianIdOf(name)))).toBe(nodeSha(ctx, guardianIdOf(name)));
    }
    // UTF-8, not Latin-1: a Korean name must hash as its UTF-8 bytes.
    expect(hex(sha('서연'))).toBe(nodeSha(Buffer.from('서연', 'utf8')));
  });

  it('randomFieldElement draws from Web Crypto and stays below r', () => {
    const seen = new Set();
    for (let i = 0; i < 64; i++) {
      const x = randomFieldElement();
      expect(x >= 0n && x < R).toBe(true);
      seen.add(x);
    }
    expect(seen.size).toBe(64);
  });
});
