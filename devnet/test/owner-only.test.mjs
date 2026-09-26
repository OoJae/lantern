// devnet/.state is owner-only: its directory 0700, even when an older run made it 0755, and the
// files written into it 0600. Checked on a scratch directory, never on devnet/.state itself.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ownerOnlyDir, writeOwnerOnly } from '../src/owner-only.mjs';

const posix = process.platform !== 'win32';
const mode = (p) => statSync(p).mode & 0o777;
const scratch = mkdtempSync(path.join(os.tmpdir(), 'lantern-state-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe('the owner-only state directory', { skip: !posix && 'POSIX file modes' }, () => {
  it('tightens a directory that already exists world-readable', () => {
    const dir = path.join(scratch, 'old');
    mkdirSync(dir);
    chmodSync(dir, 0o755); // as an older run left it, whatever this machine's umask
    assert.equal(mode(dir), 0o755);
    ownerOnlyDir(dir);
    assert.equal(mode(dir), 0o700);
  });

  it('creates a missing directory 0700, and writes its files 0600, atomically', () => {
    const file = path.join(scratch, 'new', 'deeper', 'preprod-shipped.json');
    writeOwnerOnly(file, '{"x":1}\n');
    assert.equal(mode(path.dirname(file)), 0o700);
    assert.equal(mode(file), 0o600);
    assert.equal(readFileSync(file, 'utf8'), '{"x":1}\n');
    writeOwnerOnly(file, '{"x":2}\n');
    assert.equal(readFileSync(file, 'utf8'), '{"x":2}\n');
  });

  it('is applied by every writer into devnet/.state, before the seeds are read', () => {
    const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    // loadSeeds: before its early return for an existing seeds file, so an old 0755 directory is tightened.
    const load = src('wallets.mjs').match(/export function loadSeeds\(\) \{([\s\S]*?)\n\}/)[1];
    assert.ok(load.indexOf('ownerOnlyDir(stateDir)') >= 0, 'loadSeeds calls ownerOnlyDir(stateDir)');
    assert.ok(load.indexOf('ownerOnlyDir(stateDir)') < load.indexOf('existsSync(file)'), 'before the early return');
    assert.doesNotMatch(src('wallets.mjs'), /mkdirSync/);
    assert.match(src('wallet.mjs').match(/export async function saveSnapshot[\s\S]*?\n\}/)[0], /ownerOnlyDir\(path\.dirname\(file\)\)/);
    assert.match(src('shipped.mjs'), /import \{ writeOwnerOnly \} from '\.\/owner-only\.mjs'/);
    assert.doesNotMatch(src('shipped.mjs'), /mkdirSync/);
  });
});
