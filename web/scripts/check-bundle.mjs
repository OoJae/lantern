#!/usr/bin/env node
// Runs after `vite build`. Fails the build unless:
//   - exactly one .wasm ships (two runtime copies would mean two WASM instances whose objects
//     are not interchangeable);
//   - web/node_modules holds no Midnight package (the runtime must resolve from the repo root,
//     so the browser runs exactly the modules the tests run);
//   - the landing page's entry script, and every chunk it imports statically, pulls in no .wasm (the
//     runtime loads only on /demo) and no three.js renderer (the 3D scene is its own chunk, loaded
//     after the first paint);
//   - every font the CSS names is preloaded by index.html with crossorigin, and every preload is a
//     font the CSS names; each file ships, byte for byte the one fonts.json records (sha256), with
//     the unicode-range fonts.json records, beside its OFL licence; each metric-matched fallback face
//     covers exactly its web face's unicode-range;
//   - neither index.html nor any SVG carries a <style> element or a style attribute (the CSP,
//     style-src 'self', applies to both);
//   - the first load (the entry script and every chunk it imports statically) is at most 85 KB
//     gzipped; the 3D scene, once it exists (its chunk and every chunk that one imports statically),
//     at most 160 KB, and it shares no chunk with the first load but the bundler's own runtime.
// Then prints the gzip sizes and a hash over every built file: rebuild from the same commit and compare.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const web = new URL('..', import.meta.url).pathname;
// DIST=<dir> checks a build written elsewhere (vite build --outDir <dir>).
const dist = process.env.DIST ? resolve(process.env.DIST) : join(web, 'dist');
const fail = (m) => { console.error(`check-bundle: ${m}`); process.exit(1); };
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const files = [];
const walk = (d) => readdirSync(d).forEach((n) => {
  const p = join(d, n);
  statSync(p).isDirectory() ? walk(p) : files.push(p);
});
walk(dist);
const rel = (p) => relative(dist, p);

const wasm = files.filter((f) => f.endsWith('.wasm'));
if (wasm.length !== 1) fail(`expected exactly one .wasm, found ${wasm.length}`);
if (existsSync(join(web, 'node_modules', '@midnight-ntwrk'))) fail('web/node_modules must not contain @midnight-ntwrk');

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = html.match(/<script type="module"[^>]*src="\/([^"]+)"/)?.[1];
if (!entry) fail('no entry script in index.html');
// A chunk and every chunk it imports statically, in dist-relative paths. A dynamic import() is not
// followed; that is the point of one.
const closure = (start) => {
  const seen = [];
  const follow = (file, from) => {
    if (seen.includes(file)) return;
    if (!existsSync(join(dist, file))) fail(`${from} imports ${file}, which is not in dist`);
    seen.push(file);
    const source = readFileSync(join(dist, file), 'utf8');
    for (const m of source.matchAll(/\b(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["'](\.{1,2}\/[^"']+)["']/g)) {
      follow(relative(dist, join(dist, dirname(file), m[1])), file);
    }
  };
  follow(start, 'index.html');
  return seen;
};
// The first load: the code every page, the landing included, runs before its first paint.
const eager = closure(entry);
for (const file of eager) {
  const source = readFileSync(join(dist, file), 'utf8');
  const what = file === entry ? 'the landing entry' : `${file}, which the landing entry imports statically,`;
  if (/\.wasm/.test(source)) fail(`${what} references .wasm`);
  if (source.includes('isWebGLRenderer')) fail(`${what} contains three.js's WebGLRenderer: the scene must stay a lazy chunk`);
}

// ---- fonts -----------------------------------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(web, 'scripts', 'fonts.json'), 'utf8'));
const css = files.filter((f) => f.endsWith('.css'));
const cssText = css.map((f) => readFileSync(f, 'utf8')).join('\n');

// Every url(/fonts/…) in the built CSS, and each @font-face's unicode-range by file.
const cssFonts = new Set();
const ranges = new Map();
for (const block of cssText.match(/@font-face\s*{[^}]*}/g) ?? []) {
  const urls = [...block.matchAll(/url\(\s*["']?(\/fonts\/[^"')]+)["']?\s*\)/g)].map((m) => m[1]);
  const range = block.match(/unicode-range\s*:\s*([^;}]+)/)?.[1];
  for (const u of urls) { cssFonts.add(u); if (range) ranges.set(u, range); }
}
for (const m of cssText.matchAll(/url\(\s*["']?(\/fonts\/[^"')]+)["']?\s*\)/g)) cssFonts.add(m[1]);

// Every <link rel="preload"> for a font, which must carry as="font", type="font/woff2" and crossorigin.
const preloads = new Set();
for (const tag of html.match(/<link\b[^>]*>/g) ?? []) {
  if (!/\brel="preload"/.test(tag)) continue;
  const href = tag.match(/\bhref="([^"]+)"/)?.[1];
  if (!href?.startsWith('/fonts/')) continue;
  if (!/\bas="font"/.test(tag) || !/\btype="font\/woff2"/.test(tag) || !/\scrossorigin(\s|=|\/?>)/.test(tag)) {
    fail(`the preload of ${href} needs as="font" type="font/woff2" crossorigin (without crossorigin it is fetched twice)`);
  }
  preloads.add(href);
}
for (const u of cssFonts) if (!preloads.has(u)) fail(`the CSS names ${u}, which index.html does not preload`);
for (const u of preloads) if (!cssFonts.has(u)) fail(`index.html preloads ${u}, which no CSS names`);

// The unicode-range as a set of code points, however the minifier wrote it.
const codePoints = (range) => {
  const out = new Set();
  for (const term of range.split(',').map((t) => t.trim().replace(/^u\+/i, '')).filter(Boolean)) {
    const [a, b] = term.includes('?') ? [term.replace(/\?/g, '0'), term.replace(/\?/g, 'f')] : term.split('-');
    for (let c = parseInt(a, 16); c <= parseInt(b ?? a, 16); c++) out.add(c);
  }
  return out;
};
const sameSet = (x, y) => x.size === y.size && [...x].every((v) => y.has(v));

const shipped = files.filter((f) => rel(f).startsWith('fonts/') && f.endsWith('.woff2')).map((f) => `/${rel(f)}`);
const recorded = Object.keys(manifest.fonts).map((n) => `/fonts/${n}`);
for (const u of shipped) if (!recorded.includes(u)) fail(`${u} ships, but fonts.json does not record it`);
for (const u of recorded) if (!cssFonts.has(u)) fail(`fonts.json records ${u}, which no CSS names`);
for (const u of cssFonts) {
  const name = basename(u);
  const want = manifest.fonts[name];
  if (!want) fail(`the CSS names ${u}, which fonts.json does not record`);
  const p = join(dist, u);
  if (!existsSync(p)) fail(`the CSS names ${u}, which is not in dist`);
  const buf = readFileSync(p);
  if (buf.length !== want.bytes || sha256(buf) !== want.sha256) fail(`${u} differs from fonts.json: run node scripts/fonts.mjs, or restore the committed file`);
  if (!ranges.has(u) || !sameSet(codePoints(ranges.get(u)), codePoints(want.unicodeRange))) {
    fail(`the @font-face for ${u} must carry unicode-range: ${want.unicodeRange} (fonts.json)`);
  }
  const licence = join(dist, 'fonts', want.licence);
  if (!existsSync(licence) || sha256(readFileSync(licence)) !== manifest.licences[want.licence].sha256) fail(`${want.licence} must ship beside ${name}`);
}

// Each metric-matched fallback face ("<family> Fallback", local() fonts only) stands in for the web
// face of the same family and style, and for exactly its characters: a character the web face lacks
// then falls to the next family at its own size, not to a system face scaled for other letters.
const faceRanges = new Map();
for (const block of cssText.match(/@font-face\s*{[^}]*}/g) ?? []) {
  const family = block.match(/font-family\s*:\s*["']?([^"';}]+)["']?/)?.[1]?.trim();
  const style = block.match(/font-style\s*:\s*(\w+)/)?.[1] ?? 'normal';
  const range = block.match(/unicode-range\s*:\s*([^;}]+)/)?.[1];
  if (family) faceRanges.set(`${family}|${style}`, range);
}
for (const [key, range] of faceRanges) {
  const [family, style] = key.split('|');
  if (!family.endsWith(' Fallback')) continue;
  const web = faceRanges.get(`${family.replace(/ Fallback$/, '')}|${style}`);
  if (!web) fail(`@font-face ${family} (${style}) stands in for no web face`);
  if (!range || !sameSet(codePoints(range), codePoints(web))) fail(`@font-face ${family} (${style}) must carry its web face's unicode-range: ${web}`);
}

// ---- inline style: the CSP (style-src 'self') applies to the HTML page and to SVG documents -------
// (React's style prop sets the CSSOM, which the CSP allows; a style attribute in markup it blocks.)
const INLINE_STYLE = /<style\b|\sstyle\s*=/i;
if (INLINE_STYLE.test(html)) fail('index.html carries inline style: the CSP blocks it; use the stylesheet');
for (const f of files.filter((p) => p.endsWith('.svg'))) {
  if (INLINE_STYLE.test(readFileSync(f, 'utf8'))) fail(`${rel(f)} carries inline style: use presentation attributes`);
}

// ---- sizes -------------------------------------------------------------------------------------------
// Budgets over what a visitor downloads, not over one file: code the bundler moves into a shared
// chunk (React sits in one) still counts. The first load is the entry and its static imports. The
// scene is its chunk and its static imports; it may share the bundler's tiny runtime chunk with the
// first load, and nothing else (three.js split into a vendor chunk the landing also imports would
// be three.js on the first load).
const BUDGET = { firstLoad: 85 * 1024, scene: 160 * 1024 };
const RUNTIME = /^assets\/rolldown-runtime-[^/]+\.js$/;
const gzOf = (list) => list.reduce((n, f) => n + gz(join(dist, f)), 0);
const entryGz = gz(join(dist, entry));
const eagerGz = gzOf(eager);
if (eagerGz > BUDGET.firstLoad) {
  fail(`the first load is ${kb(eagerGz)} gzipped (${eager.join(', ')}), over its ${kb(BUDGET.firstLoad)} budget: move what the landing does not need behind an import()`);
}
const scenes = files.map(rel).filter((f) => /^assets\/lantern-scene-[^/]+\.js$/.test(f));
const sceneSet = new Set();
let sceneGz = 0;
for (const f of scenes) {
  const parts = closure(f);
  const shared = parts.filter((p) => eager.includes(p) && !RUNTIME.test(p));
  if (shared.length) fail(`the scene (${f}) shares ${shared.join(', ')} with the first load: the scene must import nothing from the app`);
  const own = parts.filter((p) => !eager.includes(p));
  own.forEach((p) => sceneSet.add(p));
  const n = gzOf(own);
  if (n > BUDGET.scene) fail(`the scene is ${kb(n)} gzipped (${own.join(', ')}), over its ${kb(BUDGET.scene)} budget`);
  sceneGz = Math.max(sceneGz, n);
}
const sized = files.filter((f) => /\.(js|css|wasm|woff2)$/.test(f)).sort((a, b) => rel(a).localeCompare(rel(b)));
const width = Math.max(...sized.map((f) => rel(f).length));
console.log('check-bundle: sizes (raw, gzip -9)');
for (const f of sized) {
  const note = rel(f) === entry ? '  entry' : eager.includes(rel(f)) ? '  first load' : sceneSet.has(rel(f)) ? '  scene' : '';
  console.log(`  ${rel(f).padEnd(width)}  ${kb(statSync(f).size).padStart(10)}  ${kb(gz(f)).padStart(10)}${note}`);
}

const h = createHash('sha256');
for (const f of files.map(rel).sort()) {
  h.update(f).update('\0').update(createHash('sha256').update(readFileSync(join(dist, f))).digest()).update('\0');
}
console.log(`check-bundle: 1 .wasm (${(statSync(wasm[0]).size / 1e6).toFixed(1)} MB), no local Midnight packages, landing entry wasm-free and WebGL-free`);
console.log(`check-bundle: ${cssFonts.size} fonts preloaded and matching fonts.json, fallbacks on their ranges; HTML and SVGs style-free; first load ${kb(eagerGz)} of ${kb(BUDGET.firstLoad)} gzipped (entry ${kb(entryGz)} and ${eager.length - 1} static imports)${scenes.length ? `, scene ${kb(sceneGz)} of ${kb(BUDGET.scene)}` : ', no scene chunk yet'}`);
console.log(`check-bundle: build hash ${h.digest('hex')}`);
