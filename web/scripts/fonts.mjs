#!/usr/bin/env node
// Builds the site's five font files from the pinned @fontsource devDependencies:
//   node scripts/fonts.mjs              writes web/public/fonts/*.v1.woff2, the OFL-*.txt licences
//                                       beside them, and web/scripts/fonts.json (sha256 + provenance);
//                                       refuses to change the bytes of a file already committed under
//                                       its name (see "Released names" below)
//   node scripts/fonts.mjs --check      rebuilds into a temporary folder and fails unless every byte
//                                       equals the committed files
//   node scripts/fonts.mjs --fallbacks  prints the metric-matched fallback faces tokens.css hardcodes,
//                                       measured against this machine's Georgia, Arial and Courier New
// A dev tool, never run by the build: its outputs are committed, and check-bundle.mjs holds the
// built site to the sha256s in fonts.json. Needs python3 with fonttools 4.60.2 and brotli 1.2.0.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const web = new URL('..', import.meta.url).pathname;
const pkgJson = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8'));
const fail = (m) => { console.error(`fonts: ${m}`); process.exit(1); };
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// Every source comes from a devDependency pinned to an exact version.
function source(pkg, file) {
  const pinned = pkgJson.devDependencies[pkg];
  if (!/^\d+\.\d+\.\d+$/.test(pinned ?? '')) fail(`${pkg} must be pinned to an exact version in package.json`);
  const dir = join(web, 'node_modules', pkg);
  const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  if (version !== pinned) fail(`${pkg} is ${version} in node_modules, ${pinned} in package.json: run npm ci`);
  const path = join(dir, file);
  if (!existsSync(path)) fail(`missing ${pkg}/${file}`);
  return { package: pkg, version, file, sha256: sha256(path), path };
}

// The Latin set every text face keeps (design-spec "Typography"), plus ↓ (U+2193) for the landing's
// "Skip the story ↓". The layout features are the ones the site sets, plus rvrn, which applies
// Fraunces's own feature variations: without it the roman keeps its default "wonky" forms whatever
// WONK was pinned to.
const LATIN = [[0x20, 0x7e], [0xa0, 0xff], [0x2013, 0x2014], [0x2018, 0x201d], [0x2026], [0xb7], [0x2192], [0x2193], [0x2212], [0xd7]];
const FEATURES = ['kern', 'liga', 'calt', 'tnum', 'lnum', 'rvrn'];
// A source may lack some of that set: Fraunces has no arrows, and Instrument Sans has no ± or
// fractions. Each face's unicode-range is its real coverage, so those characters fall through to the
// next family, and fonts.json lists them. The characters the site's copy is written in must all be
// there. → (U+2192) is in none of the @fontsource Latin files (Google's Latin subset keeps ↑ and ↓
// only), so Instrument Sans and Fragment Mono each get their own ↓ turned a quarter (the mono one
// centred in its cell): see derive_turned() in fonts.py. Fraunces has no arrows at all; display
// type takes → from Lantern Sans (tokens.css).
const CORE = [[0x20, 0x7e], [0xa0], [0xb7], [0xd7], [0x2013, 0x2014], [0x2018, 0x2019], [0x201c, 0x201d], [0x2026], [0x2212]]
  .flatMap(([a, b = a]) => Array.from({ length: b - a + 1 }, (_, i) => `U+${(a + i).toString(16).toUpperCase().padStart(4, '0')}`));

const FRAUNCES = '@fontsource-variable/fraunces';
const INSTRUMENT = '@fontsource-variable/instrument-sans';
const FRAGMENT = '@fontsource/fragment-mono';
const GOWUN = '@fontsource/gowun-batang';

// wght and wdth are limited as [min, default, max]; SOFT and WONK are pinned. opsz stays whole, so
// `font-optical-sizing: auto` keeps working from 9 to 144.
const FACES = [
  { name: 'fraunces-roman.v1.woff2', family: 'Lantern Display', style: 'normal', licence: 'OFL-Fraunces.txt',
    from: [source(FRAUNCES, 'files/fraunces-latin-full-normal.woff2')],
    limits: { wght: [300, 400, 600], SOFT: 30, WONK: 0 } },
  { name: 'fraunces-italic.v1.woff2', family: 'Lantern Display', style: 'italic', licence: 'OFL-Fraunces.txt',
    from: [source(FRAUNCES, 'files/fraunces-latin-full-italic.woff2')],
    limits: { wght: [300, 400, 500], SOFT: 30, WONK: 1 } },
  { name: 'instrument-sans.v1.woff2', family: 'Lantern Sans', style: 'normal', licence: 'OFL-InstrumentSans.txt',
    from: [source(INSTRUMENT, 'files/instrument-sans-latin-standard-normal.woff2')],
    limits: { wght: [400, 400, 600], wdth: [80, 100, 100] },
    turn: [{ from: 0x2193, to: 0x2192, axis: 0x2212, name: 'arrowright' }] },
  { name: 'fragment-mono.v1.woff2', family: 'Lantern Mono', style: 'normal', licence: 'OFL-FragmentMono.txt',
    from: [source(FRAGMENT, 'files/fragment-mono-latin-400-normal.woff2')],
    turn: [{ from: 0x2193, to: 0x2192, axis: 0x2212, name: 'arrowright', mono: true }],
    // ‖ (U+2016), for commit(secret‖ctx, salt): the source has none, so it is its own | twice (fonts.py).
    double: [{ from: 0x7c, to: 0x2016, name: 'uni2016', gap: 120 }] },
  // 등 (U+B4F1) and 불 (U+BD88) sit in two different numbered subsets of Gowun Batang.
  { name: 'gowun-batang-deungbul.v1.woff2', family: 'Lantern KR', style: 'normal', licence: 'OFL-GowunBatang.txt',
    from: [source(GOWUN, 'files/gowun-batang-117-400-normal.woff2'), source(GOWUN, 'files/gowun-batang-116-400-normal.woff2')],
    merge: [[0xb4f1], [0xbd88]] },
];
const LICENCES = {
  'OFL-Fraunces.txt': source(FRAUNCES, 'LICENSE'),
  'OFL-InstrumentSans.txt': source(INSTRUMENT, 'LICENSE'),
  'OFL-FragmentMono.txt': source(FRAGMENT, 'LICENSE'),
  'OFL-GowunBatang.txt': source(GOWUN, 'LICENSE'),
};

function python(input) {
  const r = spawnSync('python3', [join(web, 'scripts', 'fonts.py')], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, SOURCE_DATE_EPOCH: '0', PYTHONHASHSEED: '0' },
    maxBuffer: 16 << 20,
  });
  if (r.status !== 0) fail(`fonts.py failed\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

function fallbacks() {
  const sys = '/System/Library/Fonts/Supplemental';
  // Running copy from the site itself: the average advance over it sets size-adjust.
  const sample = 'Lantern lets hidden guardians restore a lost Midnight identity secret, and proves it is the right one. '
    + 'Runs in your browser. Every accept and every refusal is the contract\'s own logic. Two of three guardians approve; '
    + 'after 72 hours the new phone finalizes the recovery.';
  const faces = {
    'Lantern Display Fallback': { web: FACES[0].from[0].path, at: { wght: 340, opsz: 72, SOFT: 30, WONK: 0 }, local: `${sys}/Georgia.ttf` },
    'Lantern Display Fallback italic': { web: FACES[1].from[0].path, at: { wght: 300, opsz: 72, SOFT: 30, WONK: 1 }, local: `${sys}/Georgia Italic.ttf` },
    'Lantern Sans Fallback': { web: FACES[2].from[0].path, at: { wght: 400, wdth: 100 }, local: `${sys}/Arial.ttf` },
    'Lantern Mono Fallback': { web: FACES[3].from[0].path, local: `${sys}/Courier New.ttf` },
  };
  for (const f of Object.values(faces)) if (!existsSync(f.local)) fail(`--fallbacks measures against ${f.local}, which this machine lacks`);
  console.log(JSON.stringify(python({ mode: 'fallbacks', sample, faces }), null, 2));
}

// ---- Released names ------------------------------------------------------------------------------
// vercel.json serves /fonts/* as immutable for a year, so a browser that has fetched a name never asks
// for it again. Once a file is committed (and so can have been deployed), new bytes need a new name:
// bump the version in FACES (v1 -> v2) and in tokens.css and index.html, which check-bundle.mjs holds
// to each other. A file not yet in HEAD can still change under its name.
function committed(rel) {
  const r = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: web, maxBuffer: 16 << 20 });
  return r.status === 0 ? r.stdout : null;
}
function refuseRenamedBytes(dir, names) {
  const inGit = spawnSync('git', ['rev-parse', '--show-prefix'], { cwd: web, encoding: 'utf8' });
  if (inGit.status !== 0) fail('not in a git checkout: cannot tell which font files were released');
  for (const name of names) {
    const before = committed(`./public/fonts/${name}`);
    if (before && !before.equals(readFileSync(join(dir, name)))) {
      fail(`public/fonts/${name} is committed with other bytes, and /fonts/* is cached immutable for a year: give the new file a new version (v1 -> v2) in fonts.mjs, tokens.css and index.html`);
    }
  }
}

function build(outDir) {
  mkdirSync(outDir, { recursive: true });
  const jobs = FACES.map((f) => (f.merge
    ? { name: f.name, out: join(outDir, f.name), features: [], drop: ['GSUB', 'GPOS', 'GDEF', 'vhea', 'vmtx'],
      merge: f.from.map((s, i) => ({ src: s.path, unicodes: f.merge[i] })) }
    : { name: f.name, out: join(outDir, f.name), src: f.from[0].path, features: FEATURES, limits: f.limits, turn: f.turn ?? [], double: f.double ?? [] }));
  const { tools, outputs } = python({ latin: LATIN, jobs });
  for (const [name, o] of Object.entries(outputs)) {
    const core = o.missing.filter((u) => CORE.includes(u));
    if (!name.startsWith('gowun') && core.length) fail(`${name} lacks ${core.join(', ')}`);
    if (o.emptyOutlines.length) fail(`${name} maps ${o.emptyOutlines.join(', ')} to empty glyphs`);
  }
  for (const [name, s] of Object.entries(LICENCES)) copyFileSync(s.path, join(outDir, name));

  const strip = ({ path, ...s }) => s;
  return {
    about: 'Written by web/scripts/fonts.mjs from the pinned @fontsource packages. check-bundle.mjs fails the build unless dist/fonts matches these sha256s.',
    tools,
    latin: LATIN.map((r) => r.map((c) => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`).join('-')),
    features: FEATURES,
    fonts: Object.fromEntries(FACES.map((f) => {
      const p = join(outDir, f.name);
      const o = outputs[f.name];
      return [f.name, {
        family: f.family, style: f.style, bytes: readFileSync(p).length, sha256: sha256(p),
        axes: o.axes, pinned: Object.fromEntries(Object.entries(f.limits ?? {}).filter(([, v]) => !Array.isArray(v))),
        unicodeRange: o.unicodeRange, absent: o.missing, ...(o.derived ? { derived: o.derived } : {}),
        features: o.features, glyphs: o.glyphs, licence: f.licence,
        sources: f.from.map(strip),
      }];
    })),
    licences: Object.fromEntries(Object.entries(LICENCES).map(([name, s]) => [name, { sha256: sha256(join(outDir, name)), source: strip(s) }])),
  };
}

const arg = process.argv[2];
if (arg === '--fallbacks') {
  fallbacks();
} else if (arg === '--check') {
  const tmp = mkdtempSync(join(tmpdir(), 'lantern-fonts-'));
  try {
    const manifest = build(tmp);
    const committed = readFileSync(join(web, 'scripts', 'fonts.json'), 'utf8');
    if (`${JSON.stringify(manifest, null, 2)}\n` !== committed) fail('a rebuild differs from web/scripts/fonts.json');
    for (const name of [...Object.keys(manifest.fonts), ...Object.keys(manifest.licences)]) {
      if (sha256(join(tmp, name)) !== sha256(join(web, 'public', 'fonts', name))) fail(`public/fonts/${name} differs from a rebuild`);
    }
    console.log('fonts: a rebuild matches the committed files byte for byte');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
} else if (arg === undefined) {
  // Build aside, check the released names, then copy: a refused run leaves public/fonts untouched.
  const tmp = mkdtempSync(join(tmpdir(), 'lantern-fonts-'));
  let manifest;
  try {
    manifest = build(tmp);
    refuseRenamedBytes(tmp, Object.keys(manifest.fonts));
    const dest = join(web, 'public', 'fonts');
    mkdirSync(dest, { recursive: true });
    for (const name of [...Object.keys(manifest.fonts), ...Object.keys(manifest.licences)]) copyFileSync(join(tmp, name), join(dest, name));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  writeFileSync(join(web, 'scripts', 'fonts.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, f] of Object.entries(manifest.fonts)) {
    console.log(`fonts: ${name.padEnd(32)} ${(f.bytes / 1024).toFixed(1).padStart(6)} KB  ${f.glyphs} glyphs  ${Object.keys(f.axes).join(' ') || 'static'}`);
  }
} else {
  fail(`unknown argument ${arg}`);
}
