// devnet/compose.yml: every image pinned by digest, not by a tag alone. The proof server sees
// every prover's witnesses, so a re-pushed tag must never be pulled and run silently.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compose = readFileSync(new URL('../compose.yml', import.meta.url), 'utf8');
const images = [...compose.matchAll(/^\s*image:\s*'?([^'\s]+)'?\s*$/gm)].map((m) => m[1]);

describe('devnet/compose.yml', () => {
  it('pins each of its three images as tag@sha256 digest', () => {
    assert.deepEqual(images.map((i) => i.split(':')[0]).sort(),
      ['midnightntwrk/indexer-standalone', 'midnightntwrk/midnight-node', 'midnightntwrk/proof-server']);
    for (const i of images) assert.match(i, /^midnightntwrk\/[a-z-]+:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/, i);
  });

  it('keeps the versions the records name', () => {
    const tags = images.map((i) => i.split('@')[0]);
    for (const t of ['midnightntwrk/proof-server:8.1.0', 'midnightntwrk/indexer-standalone:4.3.3', 'midnightntwrk/midnight-node:1.0.0']) {
      assert.ok(tags.includes(t), t);
      assert.ok(readFileSync(new URL('../src/record.mjs', import.meta.url), 'utf8').includes(t), `record.mjs names ${t}`);
    }
  });
});
