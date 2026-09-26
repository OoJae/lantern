// devnet/compile.sh with a stand-in `compact`: a failed build must fail the script, and leave no
// stamp that would let a later run call a partial devnet/build current. No Compact toolchain needed.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Takes `compile +<version> <source> <out>`. The output named in FAIL_FOR fails part-way, leaving
// a keys/ directory behind, as a compile that dies while writing keys would.
const FAKE_COMPACT = `#!/bin/sh
out="$4"
mkdir -p "$out/keys"
if [ -n "$FAIL_FOR" ] && [ "$out" = "$FAIL_FOR" ]; then echo "compact: simulated failure for $out" >&2; exit 1; fi
mkdir -p "$out/contract" && : > "$out/contract/index.js" && : > "$out/keys/finalizeRecovery.verifier"
`;

describe('devnet/compile.sh', () => {
  let tree;
  let bin;
  before(() => {
    tree = mkdtempSync(path.join(os.tmpdir(), 'lantern-compile-'));
    mkdirSync(path.join(tree, 'devnet'));
    for (const f of ['compile.sh', 'flavour.mjs']) cpSync(path.join(repo, 'devnet', f), path.join(tree, 'devnet', f));
    cpSync(path.join(repo, 'contracts', 'src'), path.join(tree, 'contracts', 'src'), { recursive: true });
    bin = path.join(tree, 'bin');
    mkdirSync(bin);
    writeFileSync(path.join(bin, 'compact'), FAKE_COMPACT);
    chmodSync(path.join(bin, 'compact'), 0o755);
  });
  after(() => rmSync(tree, { recursive: true, force: true }));

  const run = (failFor = '') => spawnSync('bash', ['devnet/compile.sh'], {
    cwd: tree, encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_TOKEN: 'unused', FAIL_FOR: failFor },
  });
  const stamp = () => path.join(tree, 'devnet', 'build', '.stamp');

  it('fails, and writes no stamp, when any one build fails', () => {
    for (const out of ['devnet/build/lantern', 'devnet/build/host', 'devnet/build/shipped']) {
      rmSync(path.join(tree, 'devnet', 'build'), { recursive: true, force: true });
      const r = run(out);
      assert.equal(r.status, 1, `${out}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /a compile failed/);
      assert.doesNotMatch(r.stdout, /built with compact/);
      assert.equal(existsSync(stamp()), false, out);
    }
  });

  it('rebuilds after a failure that left partial keys, then calls the build current', () => {
    // The last case above left devnet/build/shipped/keys behind: the next run must not trust it.
    const ok = run();
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /compiling contracts\/src\/lantern\.compact -> devnet\/build\/shipped/);
    assert.match(ok.stdout, /built with compact/);
    assert.equal(existsSync(stamp()), true);
    const again = run();
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /build is current/);
  });

  it('drops a matching stamp when a rebuild fails part-way', () => {
    rmSync(path.join(tree, 'devnet', 'build', 'host'), { recursive: true, force: true });
    const r = run('devnet/build/host');
    assert.equal(r.status, 1, r.stdout);
    assert.equal(existsSync(stamp()), false);
    assert.doesNotMatch(run().stdout, /build is current/);
  });
});
