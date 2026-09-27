// A step run out of order says what to run first, in one line, with no stack trace and no tool's
// error on a path that does not exist: the cost checks before `npm run compile` (or compile:v2),
// and the devnet verifies before `bash devnet/compile.sh` (or --v2). Each runs from a copy of the
// scripts in a temporary tree with nothing built; the committed records and the devnet's
// node_modules are linked in, read only. No Compact toolchain, no chain, no network.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** One line on stderr, nothing on stdout, exit 1, and no stack trace or zkir error. */
function saysOneLine(r, advice) {
  const lines = r.stderr.trim().split('\n');
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.equal(lines.length, 1, r.stderr);
  assert.match(lines[0], advice);
  assert.equal(r.stdout, '');
  assert.doesNotMatch(r.stderr, /^\s+at /m);
  assert.doesNotMatch(r.stderr, /zkir failed|No such file or directory|ERR_MODULE_NOT_FOUND/);
}

describe('the cost checks, before a compile', () => {
  let tree;
  before(() => {
    tree = mkdtempSync(path.join(os.tmpdir(), 'lantern-cost-order-'));
    mkdirSync(path.join(tree, 'scripts'));
    for (const f of ['check-cost.mjs', 'cost.sh', 'check-cost-v2.mjs', 'cost-v2.sh']) {
      cpSync(path.join(repo, 'scripts', f), path.join(tree, 'scripts', f));
    }
  });
  after(() => tree && rmSync(tree, { recursive: true, force: true }));
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: tree, encoding: 'utf8' });

  it("npm run cost:check says to run 'npm run compile' first", () => {
    const r = run('node', ['scripts/check-cost.mjs']);
    saysOneLine(r, /^check-cost: .*run 'npm run compile' first$/);
    assert.match(r.stderr, /contracts\/managed\/zkir\/ and contracts\/managed-host\/zkir\/ hold no \.zkir files/);
  });

  it('names the one directory still empty when only one contract is compiled', () => {
    mkdirSync(path.join(tree, 'contracts', 'managed', 'zkir'), { recursive: true });
    writeFileSync(path.join(tree, 'contracts', 'managed', 'zkir', 'addGuardian.zkir'), '{}');
    try {
      const r = run('node', ['scripts/check-cost.mjs']);
      saysOneLine(r, /^check-cost: nothing to measure: contracts\/managed-host\/zkir\/ holds no \.zkir files; run 'npm run compile' first$/);
    } finally {
      rmSync(path.join(tree, 'contracts'), { recursive: true, force: true });
    }
  });

  it('says the same from any working directory', () => {
    const r = spawnSync('node', [path.join(tree, 'scripts', 'check-cost.mjs')], { cwd: os.tmpdir(), encoding: 'utf8' });
    saysOneLine(r, /run 'npm run compile' first$/);
  });

  it("npm run cost (scripts/cost.sh) says to run 'npm run compile' first", () => {
    saysOneLine(run('bash', ['scripts/cost.sh']), /^error: .*run 'npm run compile' first$/);
  });

  it("npm run cost:check:v2 says to run 'npm run compile:v2' first", () => {
    saysOneLine(run('node', ['scripts/check-cost-v2.mjs']), /^check-cost-v2: .*run 'npm run compile:v2' first$/);
  });
});

// The verifies load the wallet SDK's modules, from the devnet's own install.
const devnetDeps = existsSync(path.join(repo, 'devnet', 'node_modules', '@midnight-ntwrk'));

// Skipped test by test, not as a suite, so a checkout without devnet/node_modules lists the same
// tests (as skipped) and every tree counts the same number of them (scripts/readme-facts.mjs).
const skip = !devnetDeps && 'devnet/node_modules is not installed';

describe('the devnet verifies, before bash devnet/compile.sh', () => {
  let tree;
  before(() => {
    if (skip) return;
    tree = mkdtempSync(path.join(os.tmpdir(), 'lantern-verify-order-'));
    mkdirSync(path.join(tree, 'devnet'));
    cpSync(path.join(repo, 'devnet', 'src'), path.join(tree, 'devnet', 'src'), { recursive: true });
    cpSync(path.join(repo, 'devnet', 'flavour.mjs'), path.join(tree, 'devnet', 'flavour.mjs'));
    symlinkSync(path.join(repo, 'devnet', 'node_modules'), path.join(tree, 'devnet', 'node_modules'));
    symlinkSync(path.join(repo, 'src'), path.join(tree, 'src'));
    symlinkSync(path.join(repo, 'deployments'), path.join(tree, 'deployments'));
  });
  after(() => tree && rmSync(tree, { recursive: true, force: true }));
  const verify = (script, net) => spawnSync('node', [path.join('devnet', 'src', script)], {
    cwd: tree, encoding: 'utf8', timeout: 60_000, env: { ...process.env, LANTERN_NETWORK: net },
  });
  const build = () => path.join(tree, 'devnet', 'build');

  for (const net of ['', 'preprod']) {
    const where = net || 'the local chain';
    it(`devnet:verify on ${where} says to run bash devnet/compile.sh first`, { skip }, () => {
      saysOneLine(verify('verify.mjs', net), /^devnet:verify: devnet\/build is missing or incomplete; run 'bash devnet\/compile\.sh' first$/);
    });
    it(`devnet/src/verify-v2.mjs on ${where} says to run bash devnet/compile.sh --v2 first`, { skip }, () => {
      saysOneLine(verify('verify-v2.mjs', net), /^devnet:verify:v2: devnet\/build\/lantern2 is missing or incomplete; run 'bash devnet\/compile\.sh --v2' first/);
    });
  }

  it('a build with no stamp (compile.sh stopped part-way) gets the same advice', { skip }, () => {
    for (const d of ['lantern', 'host', 'shipped', 'lantern2']) {
      mkdirSync(path.join(build(), d, 'contract'), { recursive: true });
      mkdirSync(path.join(build(), d, 'keys'), { recursive: true });
      writeFileSync(path.join(build(), d, 'contract', 'index.js'), '');
    }
    try {
      saysOneLine(verify('verify.mjs', 'preprod'), /run 'bash devnet\/compile\.sh' first$/);
      saysOneLine(verify('verify-v2.mjs', 'preprod'), /run 'bash devnet\/compile\.sh --v2' first/);
    } finally {
      rmSync(build(), { recursive: true, force: true });
    }
  });
});
