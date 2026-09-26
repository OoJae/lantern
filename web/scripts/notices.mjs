#!/usr/bin/env node
// Writes web/public/THIRD-PARTY-NOTICES.txt: the licence notices of every third-party package the
// site's JavaScript bundles. The bundler strips each package's @license comment from the minified
// chunks (and web/vite.config.js stays as it is), so the notices ship as this file instead; Vite
// copies public/ into dist, and the footer links it.
//
//   node scripts/notices.mjs           # from web/: write the file
//   node scripts/notices.mjs --check   # exit 1 if the file is not what the installed packages give
//
// Each package is read where the bundle resolves it: web/node_modules first, then the repository's.
// BUNDLED is checked against the bundle itself: scripts/check-bundle.mjs builds the site once more in
// memory and fails unless the packages its modules come from are exactly these (packageOf, below), and
// unless the shipped file names each at the version installed. Nothing is invented: a package that
// ships no licence file gets what its package.json states, and one that states no licence is said to
// state none; where its upstream source's licence is known (UPSTREAM, keyed by the exact version, so
// a bump drops it and asks for a new look), that is given too, as the source's, not the package's.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
export const NOTICES_FILE = join(web, 'public', 'THIRD-PARTY-NOTICES.txt');

/** Every third-party package in the built site's JavaScript, by name. */
export const BUNDLED = [
  'three',
  'react', 'react-dom', 'scheduler',
  'buffer', 'base64-js', 'ieee754',
  '@noble/hashes', '@scure/bip39',
  '@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/onchain-runtime-v3', 'object-inspect',
  '@midnight-ntwrk/midnight-did-jubjub-schnorr',
];

/** The npm package a bundled module comes from: the innermost node_modules/<name> (or @scope/name) in
 *  its id, so a nested dependency counts as its own package; null for the site's own modules and the
 *  bundler's helpers. */
export function packageOf(id) {
  const all = [...String(id).matchAll(/node_modules\/((?:@[^/]+\/)?[^/?\0]+)/g)];
  return all.length ? all.at(-1)[1] : null;
}

/** The packages a list of module ids comes from, against BUNDLED: `extra` ships with no notice here,
 *  `missing` is named here but no longer bundled. */
export function compareBundled(ids, list = BUNDLED) {
  const found = [...new Set([...ids].map(packageOf).filter(Boolean))].sort();
  return { found, extra: found.filter((n) => !list.includes(n)), missing: list.filter((n) => !found.includes(n)) };
}

/** What is known of a package's upstream source when the package itself states no licence, by the
 *  exact name@version checked. */
export const UPSTREAM = {
  '@midnight-ntwrk/onchain-runtime-v3@3.0.0': {
    licence: 'Apache-2.0',
    repository: 'midnightntwrk/midnight-ledger',
    source: 'https://github.com/midnightntwrk/midnight-ledger/tree/main/onchain-runtime-wasm',
    why: 'built from midnightntwrk/midnight-ledger, whose Cargo workspace and onchain-runtime-wasm/package.json declare Apache-2.0; npm names that repository from version 3.1.0',
  },
};

/** The fonts, each with its licence shipped beside it (scripts/fonts.mjs). */
const FONTS = [
  ['Fraunces', 'OFL-Fraunces.txt'],
  ['Instrument Sans', 'OFL-InstrumentSans.txt'],
  ['Fragment Mono', 'OFL-FragmentMono.txt'],
  ['Gowun Batang', 'OFL-GowunBatang.txt'],
];

const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

/** A bundled package as installed: where, its version, what its package.json says, its licence text. */
export function installed(name) {
  for (const base of [join(web, 'node_modules'), join(web, '..', 'node_modules')]) {
    const dir = join(base, name);
    if (!existsSync(join(dir, 'package.json'))) continue;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const file = readdirSync(dir).find((f) => LICENCE_FILE.test(f));
    const person = (a) => (typeof a === 'string' ? a : a?.name ? `${a.name}${a.email ? ` <${a.email}>` : ''}` : null);
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? null;
    return {
      name,
      version: pkg.version,
      licence: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? null,
      author: person(pkg.author),
      source: repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '') : pkg.homepage ?? null,
      text: file ? readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').trimEnd() : null,
    };
  }
  throw new Error(`${name} is not installed: run npm ci (root) and npm run web:install`);
}

const RULE = '-'.repeat(78);

/** The file's whole text: the same for the same installed packages, so builds stay reproducible. */
export function notices() {
  const pkgs = BUNDLED.map(installed).map((p) => ({ ...p, upstream: p.licence ? null : UPSTREAM[`${p.name}@${p.version}`] ?? null }));
  const out = [
    'Third-party notices',
    '===================',
    '',
    'Lantern is Apache-2.0 (https://github.com/OoJae/lantern). This site\'s JavaScript bundles the',
    'packages below, minified. The bundler drops their licence comments from the minified files, so',
    'their notices are here, each with the licence text the package ships.',
    '',
    'Generated by web/scripts/notices.mjs from the installed packages; the build fails unless this file',
    'names each one at the version installed, and unless they are exactly the packages the build bundles.',
    'Where a package states no licence, this says so, and gives its upstream source\'s licence where known.',
    '',
    'Packages:',
    ...pkgs.map((p) => `  ${p.name}@${p.version}  ${p.licence ?? (p.upstream ? `${p.upstream.licence} (upstream source; package states none)` : 'no licence stated')}`),
    '',
    'Fonts (SIL Open Font License 1.1), each with its licence beside it:',
    ...FONTS.map(([family, file]) => `  ${family}  /fonts/${file}`),
  ];
  for (const p of pkgs) {
    out.push('', RULE, `${p.name}@${p.version}`);
    out.push(`Licence: ${p.licence ?? 'none stated in its package.json'}`);
    if (p.upstream) out.push(`Upstream source licence: ${p.upstream.licence} (${p.upstream.why})`);
    if (p.author) out.push(`Author: ${p.author}`);
    // The upstream source replaces a repository link the package names but that does not resolve.
    if (p.upstream) out.push(`Source: ${p.upstream.source}`);
    else if (p.source) out.push(`Source: ${p.source}`);
    out.push(RULE, '');
    if (p.text) {
      out.push(p.text);
    } else if (p.licence) {
      // The same licence's full text, where another package here ships it.
      const same = pkgs.find((q) => q !== p && q.text && q.licence === p.licence);
      out.push(`The package ships no licence file. Its package.json states ${p.licence}${same ? `, whose full text is given under ${same.name} in this file` : ''}.`);
    } else if (p.upstream) {
      const same = pkgs.find((q) => q !== p && q.text && q.licence === p.upstream.licence);
      out.push(`The package ships no licence file, and its package.json states no licence. Its upstream source, ${p.upstream.repository}, is ${p.upstream.licence}${same ? `, whose full text is given under ${same.name} in this file` : ''}; that repository has no NOTICE file.`);
    } else {
      out.push('The package ships no licence file, and its package.json states no licence.');
    }
  }
  return `${out.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = notices();
  if (process.argv.includes('--check')) {
    const now = existsSync(NOTICES_FILE) ? readFileSync(NOTICES_FILE, 'utf8') : null;
    if (now !== text) {
      console.error('notices: web/public/THIRD-PARTY-NOTICES.txt is not what the installed packages give: run node scripts/notices.mjs (from web/)');
      process.exit(1);
    }
    console.log(`notices: ${BUNDLED.length} packages, as installed`);
  } else {
    writeFileSync(NOTICES_FILE, text);
    console.log(`notices: wrote public/THIRD-PARTY-NOTICES.txt (${BUNDLED.length} packages, ${text.length} bytes)`);
  }
}
