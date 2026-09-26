// devnet/.state holds wallet seeds, wallet snapshots (which carry secret keys) and the shipped
// run's phone key and shares: owner-only, directory and files alike. mkdirSync's mode applies only
// when it creates the directory, so an existing one (made 0755 by an older run, or by umask) is
// tightened with chmod every time. Dependency-free, so devnet/test can check it without a chain.
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Create `dir` if needed, and make it owner-only (0700) whether it was just made or not. */
export function ownerOnlyDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

/** Owner-only, and atomic: a 0600 temporary file, then a rename, so an interrupted write never leaves half a file. */
export function writeOwnerOnly(file, data) {
  ownerOnlyDir(path.dirname(file));
  writeFileSync(`${file}.tmp`, data, { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
