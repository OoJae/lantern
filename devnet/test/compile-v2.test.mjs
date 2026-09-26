// `devnet/compile.sh --v2` with a stand-in `compact` (as compile.test.mjs does for v1's builds): it
// builds Lantern v2 alone, into devnet/build/lantern2, with its own stamp; a failed build fails the
// script and leaves no stamp; and it never touches v1's three builds or their stamp, nor they it.
// No Compact toolchain needed.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Takes `compile +<version> <source> <out>`; logs each source it compiles. The output named in
// FAIL_FOR fails part-way, leaving a keys/ directory behind.
const FAKE_COMPACT = `#!/bin/sh
out="$4"
echo "$3" >> "$COMPILED_LOG"
mkdir -p "$out/keys"
if [ -n "$FAIL_FOR" ] && [ "$out" = "$FAIL_FOR" ]; then echo "compact: simulated failure for $out" >&2; exit 1; fi
mkdir -p "$out/contract" && : > "$out/contract/index.js" && : > "$out/keys/openRecovery.verifier"
`;

describe('devnet/compile.sh --v2', () => {
  let tree, bin, compiledLog;
  before(() => {
    tree = mkdtempSync(path.join(os.tmpdir(), 'lantern-compile-v2-'));
    mkdirSync(path.join(tree, 'devnet'));
    for (const f of ['compile.sh', 'flavour.mjs']) cpSync(path.join(repo, 'devnet', f), path.join(tree, 'devnet', f));
    cpSync(path.join(repo, 'contracts', 'src'), path.join(tree, 'contracts', 'src'), { recursive: true });
    cpSync(path.join(repo, 'contracts', 'v2'), path.join(tree, 'contracts', 'v2'), { recursive: true });
    bin = path.join(tree, 'bin');
    mkdirSync(bin);
    writeFileSync(path.join(bin, 'compact'), FAKE_COMPACT);
    chmodSync(path.join(bin, 'compact'), 0o755);
    compiledLog = path.join(tree, 'compiled.log');
  });
  after(() => rmSync(tree, { recursive: true, force: true }));

  const run = (args = [], failFor = '') => {
    writeFileSync(compiledLog, '');
    const r = spawnSync('bash', ['devnet/compile.sh', ...args], {
      cwd: tree, encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_TOKEN: 'unused', FAIL_FOR: failFor, COMPILED_LOG: compiledLog },
    });
    return { ...r, compiled: readFileSync(compiledLog, 'utf8').split('\n').filter(Boolean) };
  };
  const at = (...p) => path.join(tree, 'devnet', 'build', ...p);

  it('builds Lantern v2 alone, and writes only its own stamp', () => {
    const r = run(['--v2']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.compiled, ['contracts/v2/lantern2.compact']);
    assert.match(r.stdout, /compiling contracts\/v2\/lantern2\.compact -> devnet\/build\/lantern2/);
    assert.equal(existsSync(at('.stamp-v2')), true);
    assert.equal(existsSync(at('.stamp')), false);
    for (const v1 of ['lantern', 'host', 'shipped']) assert.equal(existsSync(at(v1)), false, v1);
    const again = run(['--v2']);
    assert.match(again.stdout, /v2 build is current/);
    assert.deepEqual(again.compiled, []);
  });

  it('leaves v2 alone when v1 builds, and v1 alone when v2 rebuilds', () => {
    const v1 = run();
    assert.equal(v1.status, 0, v1.stderr);
    assert.equal(v1.compiled.includes('contracts/v2/lantern2.compact'), false);
    assert.match(run(['--v2']).stdout, /v2 build is current/);
    appendFileSync(path.join(tree, 'contracts', 'v2', 'lantern2.compact'), '\n// changed\n');
    const v2 = run(['--v2']);
    assert.deepEqual(v2.compiled, ['contracts/v2/lantern2.compact']);
    assert.match(run().stdout, /build is current/);
  });

  it('rebuilds when a v1 module v2 imports changes', () => {
    appendFileSync(path.join(tree, 'contracts', 'src', 'ownergate.compact'), '\n// changed\n');
    assert.deepEqual(run(['--v2']).compiled, ['contracts/v2/lantern2.compact']);
  });

  it('fails, and writes no stamp, when the build fails; then rebuilds rather than trust partial keys', () => {
    rmSync(at('lantern2'), { recursive: true, force: true });
    const r = run(['--v2'], 'devnet/build/lantern2');
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /the v2 compile failed/);
    assert.equal(existsSync(at('.stamp-v2')), false);
    assert.equal(existsSync(at('lantern2', 'keys')), true, 'the failed build left keys behind');
    const ok = run(['--v2']);
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(ok.compiled, ['contracts/v2/lantern2.compact']);
    assert.equal(existsSync(at('.stamp-v2')), true);
  });
});
