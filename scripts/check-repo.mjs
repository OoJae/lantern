#!/usr/bin/env node
// What a commit needs to stand on its own, checked against what git tracks rather than against the
// working tree, which is all the other checks see:
//
// 1. Every relative import in tracked JavaScript, and every script a package.json or a workflow
//    runs, reaches a file git tracks (or one .gitignore marks as generated). A new file that a
//    tracked one imports but nobody `git add`ed passes every local check and breaks the pushed
//    commit: `git commit -a` and `git add -u` leave untracked files out.
// 2. Every tracked text file is stored with LF, and .gitattributes gives it `eol=lf`, so a clone
//    with core.autocrlf=true (Git for Windows' default) still checks it out with LF. With CRLF,
//    devnet/flavour.mjs cannot find the timelock line and the compile scripts' `set -o pipefail`
//    fails.
//
//   node scripts/check-repo.mjs     exit 1 on any failure (npm run repo:check)
//
// Where git cannot be asked (no .git, or a repository owned by another user), it says so and
// checks nothing.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).toString();

let tracked;
try {
  tracked = new Set(git('ls-files', '-z').split('\0').filter(Boolean));
} catch {
  console.log('check-repo: git is not usable here, so nothing was checked');
  process.exit(0);
}

const failures = [];
const posix = (p) => normalize(p).replace(/\\/g, '/');
const isFile = (p) => existsSync(join(root, p)) && statSync(join(root, p)).isFile();
function ignored(p) {
  try { git('check-ignore', '-q', '--no-index', p); return true; } catch { return false; }
}

// ---- 1. imports and scripts reach tracked files -------------------------------------------------
const CODE = /\.(?:m?js|cjs|jsx)$/;
const SPECIFIERS = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g, // import x from './a.js'
  /\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g, // import './a.css'
  /\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g, // import('./a.js')
];
const EXTENSIONS = ['', '.js', '.mjs', '.jsx', '.cjs', '.json', '/index.js', '/index.jsx'];

/** A path relative to the repository root: tracked, generated (ignored), or a failure. */
function reach(from, target, what) {
  const candidates = EXTENSIONS.map((ext) => posix(target + ext));
  const found = candidates.find(isFile);
  if (!found) {
    if (!ignored(posix(target))) failures.push(`${from}: ${what} ${target}: no such file`);
    return;
  }
  if (tracked.has(found) || ignored(found)) return;
  failures.push(`${from}: ${what} ${found}, which git does not track; git add it in the same commit`);
}

let imports = 0;
for (const file of tracked) {
  if (!CODE.test(file) || file.includes('node_modules/') || !isFile(file)) continue;
  // Line comments and JSDoc lines out, so an import quoted in a comment is not checked.
  const text = readFileSync(join(root, file), 'utf8').split('\n')
    .map((l) => (/^\s*\*/.test(l) ? '' : l.replace(/(^|\s)\/\/.*$/, '$1'))).join('\n');
  for (const re of SPECIFIERS) {
    for (const m of text.matchAll(re)) {
      const spec = m[1].replace(/[?#].*$/, '');
      imports++;
      reach(file, join(dirname(file), spec), 'imports');
    }
  }
}

// node, bash and sh commands in package.json scripts and in workflows, with a literal path.
const RUNS = /\b(?:node|bash|sh)\s+(?:-{1,2}[\w-]+(?:=\S+)?\s+)*([\w./-]+\.(?:mjs|cjs|js|sh))(?=[\s'"&|;)]|$)/g;
let runs = 0;
for (const pkg of ['package.json', 'web/package.json', 'devnet/package.json']) {
  if (!tracked.has(pkg)) continue;
  const dir = dirname(pkg);
  for (const [name, cmd] of Object.entries(JSON.parse(readFileSync(join(root, pkg), 'utf8')).scripts ?? {})) {
    for (const m of cmd.matchAll(RUNS)) { runs++; reach(`${pkg} (scripts.${name})`, join(dir, m[1]), 'runs'); }
  }
}
for (const wf of [...tracked].filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f))) {
  const lines = readFileSync(join(root, wf), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*#/.test(line)) return;
    for (const m of line.matchAll(RUNS)) {
      runs++;
      // A step may set working-directory; a path that is not in the root is tried under web/ and devnet/.
      const at = ['', 'web', 'devnet'].map((d) => join(d, m[1])).find((p) => isFile(posix(p))) ?? m[1];
      reach(`${wf}:${i + 1}`, at, 'runs');
    }
  });
}

// ---- 2. line endings ----------------------------------------------------------------------------
// `git ls-files --eol`: i/<index> w/<working tree> attr/<attributes> TAB path
let text = 0;
for (const entry of git('ls-files', '--eol', '-z').split('\0').filter(Boolean)) {
  const m = entry.match(/^i\/(\S*)\s+w\/(\S*)\s+attr\/(.*?)\s*\t(.*)$/s);
  if (!m) continue;
  const [, index, work, attr, path] = m;
  if (index === '-text' || index === '') continue; // binary, or not in the working tree
  text++;
  if (index !== 'lf' && index !== 'none') failures.push(`${path}: stored with ${index} line endings; store it with LF`);
  else if (work === 'crlf' || work === 'mixed') failures.push(`${path}: checked out with ${work} line endings`);
  if (!/\beol=lf\b/.test(attr)) failures.push(`${path}: no eol=lf attribute, so a core.autocrlf=true clone checks it out with CRLF; .gitattributes must say \`* text=auto eol=lf\``);
}

if (failures.length) {
  for (const f of failures) console.error(`check-repo: ${f}`);
  console.error(`check-repo: ${failures.length} problem${failures.length === 1 ? '' : 's'}. Before you push, \`git status --porcelain --untracked-files=all\` should list nothing you mean to ship.`);
  process.exit(1);
}
console.log(`check-repo: ${imports} relative imports and ${runs} scripts run reach tracked files; ${text} tracked text files are LF with eol=lf`);
