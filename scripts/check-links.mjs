#!/usr/bin/env node
// Every relative link in the repository's Markdown must reach a file that git tracks, and every
// #anchor a heading that exists, or the link 404s on GitHub and in a fresh clone although it works
// in the working tree. Part of `npm run readme:check`, so CI runs it on every push.
//
//   node scripts/check-links.mjs     exit 1 on any broken link
//
// Where git cannot be asked (no .git, or a repository owned by another user), the files are
// checked on disk instead, and the output says so.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

let tracked = null;
try {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).toString();
  tracked = new Set(out.split('\0').filter(Boolean));
} catch { /* not a usable git checkout: check on disk */ }

const DOCS = tracked
  ? [...tracked].filter((f) => f.endsWith('.md') && !f.startsWith('web/') && !f.includes('node_modules/'))
  : ['README.md', 'README.ko.md', 'SECURITY.md', 'brand/README.md', 'contracts/adversarial/README.md', 'docs/spikes.md', 'docs/v2.md', 'docs/upstream/passport-c14-prior-art.md'];

const isTracked = (p) => (tracked ? tracked.has(p) || [...tracked].some((f) => f.startsWith(`${p}/`)) : existsSync(join(root, p)));

/** GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens, repeats numbered. */
function anchors(md) {
  const seen = new Map();
  const out = new Set();
  for (const line of strip(md).split('\n')) {
    const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[1].replace(/<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}\p{M} _-]/gu, '').replace(/ /g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

/** Markdown without fenced code and HTML comments, where a link is not a link. */
function strip(md) {
  return md.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' ')).replace(/^(```|~~~)[\s\S]*?^\1/gm, (c) => c.replace(/[^\n]/g, ' '));
}

const cache = new Map();
const anchorsOf = (p) => { if (!cache.has(p)) cache.set(p, anchors(readFileSync(join(root, p), 'utf8'))); return cache.get(p); };

const broken = [];
let checked = 0;
for (const doc of DOCS) {
  if (!existsSync(join(root, doc))) continue;
  const lines = strip(readFileSync(join(root, doc), 'utf8')).split('\n');
  lines.forEach((line, i) => {
    // [text](target) and ![alt](target); the target ends at whitespace or the closing parenthesis.
    for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const target = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // https:, mailto: and the like
      checked++;
      const [rawPath, hash] = target.split('#');
      const path = rawPath ? normalize(join(dirname(doc), decodeURIComponent(rawPath))).replace(/\\/g, '/').replace(/\/$/, '') : doc;
      const at = `${doc}:${i + 1}`;
      if (!existsSync(join(root, path))) { broken.push(`${at}: ${target}: no such file`); continue; }
      if (!isTracked(path)) { broken.push(`${at}: ${target}: ${path} exists here but git does not track it, so the link 404s on GitHub; git add it, or remove the link`); continue; }
      if (hash && path.endsWith('.md') && statSync(join(root, path)).isFile() && !anchorsOf(path).has(decodeURIComponent(hash).toLowerCase())) {
        broken.push(`${at}: ${target}: ${path} has no heading with the anchor #${hash}`);
      }
    }
  });
}
if (broken.length) {
  for (const b of broken) console.error(`check-links: ${b}`);
  process.exit(1);
}
console.log(`check-links: all ${checked} relative links in ${DOCS.length} Markdown files reach ${tracked ? 'a tracked file' : 'a file (on disk: git was not usable here)'} and an existing heading`);
