#!/usr/bin/env node
// Writes Lantern's brand kit from the data in web/src/brand/ (marks.js, seal.js,
// pictograms.js, lockup.js, glyphs.js, hangul.js). A dev tool: never part of the build, never run in CI. Its outputs are
// committed, so the build stays reproducible.
//
//   node web/scripts/brand.mjs
//
// SVG (presentation attributes only; checked for "<style" and "style="):
//   web/public/favicon.svg
//   web/public/brand-kit/lantern-mark{,-16,-mono-hanji,-mono-night,-reversed}.svg
//   web/public/brand-kit/lantern-wordmark.svg
//   web/public/brand-kit/lantern-lockup{,-compact,-reversed}.svg
//   web/public/brand-kit/lantern-seal-{open,closed,lit,retired}.svg
//   web/public/brand-kit/pictograms/{01-seal … 07-apps, attacks-named, attacks-held}.svg
// PNG and ICO, rendered with Playwright's Chromium from web/node_modules/@playwright/test:
//   web/public/apple-touch-icon.png (180), web/public/brand-kit/icon-512.png,
//   web/public/brand-kit/lantern-lockup@2x.png, web/public/favicon.ico (16 + 32)
// The manifest the /brand page lists its downloads from: web/src/brand/kit.js
//
// And web/public/og.jpg, og.png as a JPEG (the file og:image names).
//
// With --og, also the social card, web/public/og.png (1200 x 630): the landing's own 3D scene at its
// hero frame (src/landing/scene/lantern-scene.js, bundled here with Vite and drawn on the GPU where
// there is one), with the words, the lockup, three share lights and the seal composed over it. The
// flame flickers, so each run draws a slightly different frame: that is why it is a flag, and every
// other file here stays byte for byte the same from run to run.
//
//   node web/scripts/brand.mjs --og
//
// To change a drawing, edit web/src/brand/marks.js (or run web/scripts/brand-glyphs.py
// for the outlined type), then run this again.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WORDMARK } from '../src/brand/glyphs.js';
import { HANGUL } from '../src/brand/hangul.js';
import { LOCKUP, lockupNodes } from '../src/brand/lockup.js';
import { COLOR, MARK_INK, el, markNodes } from '../src/brand/marks.js';
import { PICTOGRAM_NAMES, pictogramNodes } from '../src/brand/pictograms.js';
import { SEAL, SEAL_STATES, sealNodes } from '../src/brand/seal.js';
import { svgDocument } from '../src/brand/serialize.js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(WEB, 'public');
const KIT = join(PUBLIC, 'brand-kit');
const r2 = (v) => Math.round(v * 100) / 100;

const written = [];
function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  if (typeof data === 'string') {
    // the CSP covers SVG files too: presentation attributes only
    if (/<style|style=/i.test(data)) throw new Error(`${relative(WEB, path)}: contains a style`);
  }
  writeFileSync(path, data);
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  written.push([relative(WEB, path), buf.length, createHash('sha256').update(buf).digest('hex').slice(0, 12)]);
}

// ---------------------------------------------------------------------------------
// SVG files

const MARK_FILES = {
  'lantern-mark.svg': { variant: 'primary', title: 'Lantern' },
  'lantern-mark-mono-hanji.svg': { variant: 'mono-hanji', title: 'Lantern' },
  'lantern-mark-mono-night.svg': { variant: 'mono-night', title: 'Lantern' },
  'lantern-mark-reversed.svg': { variant: 'reversed', title: 'Lantern' },
};
for (const [file, { variant, title }] of Object.entries(MARK_FILES)) {
  // the full drawing (hook and eave): the file is for 48px and up; lantern-mark-16.svg is for small sizes
  const m = markNodes({ variant, detail: 'hook' });
  write(join(KIT, file), svgDocument(m.nodes, { viewBox: m.viewBox, width: 96, height: 96, title }));
}
{
  const m = markNodes({ variant: 'primary', detail: 'optical' });
  write(join(KIT, 'lantern-mark-16.svg'), svgDocument(m.nodes, { viewBox: m.viewBox, width: 16, height: 16, title: 'Lantern' }));
}

// the wordmark alone, H = 48px
{
  const h = WORDMARK.bottom - WORDMARK.top;
  const k = 48 / WORDMARK.capHeight;
  write(
    join(KIT, 'lantern-wordmark.svg'),
    svgDocument([el('path', { d: WORDMARK.d, fill: COLOR.hanji })], {
      viewBox: `0 ${WORDMARK.top} ${WORDMARK.width} ${h}`,
      width: r2(WORDMARK.width * k),
      height: r2(h * k),
      title: 'Lantern',
    }),
  );
}

// lockups at H = 48px, tight to the ink (clear space 1H is the user's to keep)
const LOCKUP_FILES = {
  'lantern-lockup.svg': { kind: 'primary', variant: 'primary', title: 'Lantern 등불' },
  'lantern-lockup-compact.svg': { kind: 'compact', variant: 'primary', title: 'Lantern' },
  'lantern-lockup-reversed.svg': { kind: 'primary', variant: 'reversed', title: 'Lantern 등불' },
};
for (const [file, { kind, variant, title }] of Object.entries(LOCKUP_FILES)) {
  const L = lockupNodes({ kind, variant, detail: 'hook', hangul: HANGUL });
  const k = 48 / LOCKUP.H;
  write(join(KIT, file), svgDocument(L.nodes, { viewBox: L.viewBox, width: r2(L.width * k), height: r2(L.height * k), title }));
}

// the seal, four states, for Night
const SEAL_TITLES = { open: 'Seal, open: refused', closed: 'Seal, closed: accepted', lit: 'Seal, lit: the lock', retired: 'Seal, retired' };
for (const state of SEAL_STATES) {
  write(
    join(KIT, `lantern-seal-${state}.svg`),
    // drawn at 128 by default: from 112px up the cuts keep the spec's full depth with a
    // whole pixel of ring behind the deepest (smaller, use the Seal component, which eases them)
    svgDocument(sealNodes({ state }), { viewBox: `0 0 ${SEAL.D} ${SEAL.D}`, width: 128, height: 128, title: SEAL_TITLES[state] }),
  );
}

// pictograms, for Night
const PICTO_TITLES = {
  '01-seal': 'A lit lantern above its seal on the ledger line',
  '02-three-lights': 'One flame sending three lights to three lanterns; three rings on the line',
  '03-dark': 'A dark lantern; the seal still on the line',
  '04-return': 'An unlit lantern with two lights coming back to it; a recovery ring and two hollow rings on the line',
  '05-window': 'A new lantern over its recovery ring, part way round; a paper card over a second, dashed ring',
  '06-lock': 'The lantern lit again, and its seal lit on the line',
  '07-apps': 'Two small windows joined to one knot on the line',
  'attacks-named': 'Three lanterns with name tags; three rings on the line',
  'attacks-held': 'Three unlabelled lights; three rings on the line',
};
for (const name of PICTOGRAM_NAMES) {
  const p = pictogramNodes(name);
  write(join(KIT, 'pictograms', `${name}.svg`), svgDocument(p.nodes, { viewBox: p.viewBox, width: 96, height: 96, title: PICTO_TITLES[name] }));
}

// favicon.svg: a 32 x 32 Night tile (rx 7) with the 16px optical drawing at 2x. Browsers
// show this file at 16 CSS px in a tab (32 device px on a 2x screen), where the 24u drawing
// is 9px tall with sub-pixel strokes; the optical drawing lands every edge on a whole pixel
// at both sizes, and it is the same drawing favicon.ico carries.
{
  const m = markNodes({ variant: 'primary', detail: 'optical' });
  write(
    join(PUBLIC, 'favicon.svg'),
    svgDocument([el('rect', { width: 32, height: 32, rx: 7, fill: COLOR.night }), el('g', { transform: 'scale(2)' }, m.nodes)], {
      viewBox: '0 0 32 32',
      width: 32,
      height: 32,
    }),
  );
}

// ---------------------------------------------------------------------------------
// raster: drawn as SVG, rendered by Chromium

/**
 * The app icon: Night, full bleed; the mark (hook to foot) 96/180 of the side, a little
 * left of centre; 등불 set vertically to its right at 20/180 a glyph, Hanji, like a tag.
 * Everything sits inside the central 80% (maskable-safe at 512).
 */
function appIcon(side) {
  const k = side / 180;
  const u = (96 / (MARK_INK.bottom - MARK_INK.hookTop)) * k; // px per mark unit
  const inkTop = (side - 96 * k) / 2;
  const markCx = 78 * k;
  const mx = markCx - 12 * u;
  const my = inkTop - MARK_INK.hookTop * u;
  const mark = markNodes({ variant: 'primary', detail: 'hook' });
  const em = 20 * k;
  const s = em / (HANGUL.deung.emTop - HANGUL.deung.emBottom);
  const step = em * ((1.3 - 0.6) / 0.6); // em top to em top: the lockup's 0.6H glyphs in a 1.3H column
  const tagLeft = markCx + 6 * u + 12 * k; // ink left, 12/180 past the cap's tip
  const tagTop = my + MARK_INK.top * u; // hangs from the cap line
  const tag = [HANGUL.deung, HANGUL.bul].map((g, i) =>
    el('path', {
      d: g.d,
      fill: COLOR.hanji,
      transform: `translate(${r2(tagLeft - g.ink[0] * s)} ${r2(tagTop + i * step + g.emTop * s)}) scale(${Math.round(s * 1e5) / 1e5})`,
    }),
  );
  return svgDocument(
    [
      el('rect', { width: side, height: side, fill: COLOR.night }),
      el('g', { transform: `translate(${r2(mx)} ${r2(my)}) scale(${Math.round(u * 1e4) / 1e4})` }, mark.nodes),
      ...tag,
    ],
    { viewBox: `0 0 ${side} ${side}`, width: side, height: side },
  );
}

/** The favicon tile from the 16px optical drawing, at 16 or 32. */
function icoTile(px) {
  const m = markNodes({ variant: 'primary', detail: 'optical' });
  return svgDocument([el('rect', { width: 16, height: 16, rx: 3.5, fill: COLOR.night }), ...m.nodes], {
    viewBox: '0 0 16 16',
    width: px,
    height: px,
  });
}

/** The primary lockup on Night with its 1H clear space, H = 40px (80px at 2x). */
function lockupBanner() {
  const L = lockupNodes({ kind: 'primary', variant: 'primary', detail: 'hook', clear: true, hangul: HANGUL });
  const k = 40 / LOCKUP.H;
  const [x, y, w, h] = L.viewBox.split(' ').map(Number);
  return svgDocument([el('rect', { x, y, width: w, height: h, fill: COLOR.night }), ...L.nodes], {
    viewBox: L.viewBox,
    width: Math.round(w * k),
    height: Math.round(h * k),
  });
}

function ico(pngs) {
  // ICONDIR + ICONDIRENTRY per image, PNG payloads (Vista and every browser read these)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const require = createRequire(join(WEB, 'package.json'));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
try {
  async function render(svg, { dpr = 1, transparent = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dpr });
    await page.setContent(`<!doctype html><html><body>${svg}</body></html>`);
    await page.addStyleTag({ content: 'html,body{margin:0;background:transparent}svg{display:block}' });
    const shot = await page.locator('svg').first().screenshot({ omitBackground: transparent });
    await page.close();
    return shot;
  }
  write(join(PUBLIC, 'apple-touch-icon.png'), await render(appIcon(180)));
  write(join(KIT, 'icon-512.png'), await render(appIcon(512)));
  write(join(KIT, 'lantern-lockup@2x.png'), await render(lockupBanner(), { dpr: 2 }));
  const png16 = await render(icoTile(16), { transparent: true });
  const png32 = await render(icoTile(32), { transparent: true });
  write(join(PUBLIC, 'favicon.ico'), ico([{ size: 16, data: png16 }, { size: 32, data: png32 }]));
} finally {
  await browser.close();
}

if (process.argv.includes('--og')) write(join(PUBLIC, 'og.png'), await socialCard());
// og.jpg: the same card as a JPEG at quality 90, about a seventh of og.png's size and to the eye the
// same. index.html's og:image names it: some link scrapers skip an image this large as a PNG. Encoded
// from og.png on disk on every run, so it always matches it (and, drawing nothing, it is the same
// bytes from run to run). og.png stays the kit's lossless copy.
if (existsSync(join(PUBLIC, 'og.png'))) write(join(PUBLIC, 'og.jpg'), await jpegOf(readFileSync(join(PUBLIC, 'og.png'))));

async function jpegOf(png) {
  const { width, height } = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const b = await chromium.launch();
  try {
    const page = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body><img src="data:image/png;base64,${png.toString('base64')}" width="${width}" height="${height}"></body></html>`);
    await page.addStyleTag({ content: 'html,body{margin:0}img{display:block}' });
    await page.locator('img').evaluate((img) => img.decode());
    return await page.screenshot({ type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width, height } });
  } finally {
    await b.close();
  }
}

// ---------------------------------------------------------------------------------
// the social card (--og)

/**
 * og.png, per the design spec ("OG image"): 64px margins; the primary lockup at a 36px cap height,
 * top left; the tagline in Fraunces 300 at 72px, "identity." in italic; the sentence in Instrument
 * Sans at 26px, Hanji, 560px at most; the footer in Fragment Mono at 18px, Ash. On the right, the
 * lit lantern (the scene's hero frame, u = 0, its glow held down under the words as on the landing),
 * three share lights drifting right at three depths, and the seal faint on the ledger line. All that
 * matters sits inside the central 1200 x 600, where a feed may crop.
 */
async function socialCard() {
  const W = 1200;
  const H = 630;
  const { build } = await import('vite');
  const tmp = mkdtempSync(join(tmpdir(), 'lantern-og-'));
  try {
    // the scene, bundled on its own (it imports nothing from the app)
    const scene = join(WEB, 'src', 'landing', 'scene', 'lantern-scene.js');
    writeFileSync(join(tmp, 'entry.js'), `export { createLanternScene } from ${JSON.stringify(scene)};\n`);
    await build({
      configFile: false,
      root: tmp,
      logLevel: 'error',
      build: {
        outDir: join(tmp, 'dist'),
        emptyOutDir: true,
        assetsInlineLimit: 0,
        lib: { entry: join(tmp, 'entry.js'), formats: ['es'], fileName: () => 'scene.js' },
      },
    });

    const k = 36 / LOCKUP.H;
    const L = lockupNodes({ kind: 'primary', variant: 'primary', detail: 'hook', hangul: HANGUL });
    const lockup = svgDocument(L.nodes, { viewBox: L.viewBox, width: r2(L.width * k), height: r2(L.height * k) });
    // Three shares leave the lantern for the dark on the right, near, middle and far: the nearest
    // largest, lowest and brightest. Each is an Ember point in a warm halo, trailing dots back
    // toward the flame. On the ledger line, faint, the seal lies flat (an ellipse), closed.
    const shares = [
      { x: 1016, y: 268, r: 7, halo: 46, a: 1, from: [948, 312] },
      { x: 1096, y: 206, r: 4.6, halo: 32, a: 0.82, from: [950, 292] },
      { x: 1146, y: 160, r: 2.8, halo: 20, a: 0.62, from: [952, 276] },
    ];
    const trail = ({ x, y, from: [fx, fy] }) => {
      const cx = (fx + x) / 2 + 6;
      const cy = Math.min(fy, y) - 18;
      return `M${fx} ${fy}Q${cx} ${cy} ${x} ${y}`;
    };
    const lightsSvg = `<svg class="lights" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs>
        <radialGradient id="halo"><stop offset="0" stop-color="#FFE2B8" stop-opacity="0.95"/><stop offset="0.18" stop-color="#FF8A3D" stop-opacity="0.55"/><stop offset="0.5" stop-color="#FF8A3D" stop-opacity="0.12"/><stop offset="1" stop-color="#FF8A3D" stop-opacity="0"/></radialGradient>
        <linearGradient id="ledger" x1="0" x2="1"><stop offset="0" stop-color="#ECE4D2" stop-opacity="0"/><stop offset="0.35" stop-color="#ECE4D2" stop-opacity="0.2"/><stop offset="0.75" stop-color="#ECE4D2" stop-opacity="0.2"/><stop offset="1" stop-color="#ECE4D2" stop-opacity="0"/></linearGradient>
      </defs>
      <rect x="744" y="569.5" width="456" height="1" fill="url(#ledger)"/>
      <g fill="none" stroke="#ECE4D2" stroke-opacity="0.34" stroke-width="1.6">
        <ellipse cx="876" cy="566" rx="46" ry="12"/>
      </g>
      <ellipse cx="876" cy="566" rx="3.4" ry="1.4" fill="#ECE4D2" fill-opacity="0.4"/>
      ${shares.map((sh) => `<path d="${trail(sh)}" fill="none" stroke="#FF8A3D" stroke-opacity="${0.5 * sh.a}" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="0.1 5"/>`).join('')}
      ${shares.map((sh) => `<circle cx="${sh.x}" cy="${sh.y}" r="${sh.halo}" fill="url(#halo)" opacity="${sh.a}"/><circle cx="${sh.x}" cy="${sh.y}" r="${sh.r}" fill="#FF8A3D"/><circle cx="${sh.x}" cy="${sh.y}" r="${r2(sh.r * 0.45)}" fill="#FFE2B8"/>`).join('')}
    </svg>`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
      @font-face { font-family: "Lantern Display"; src: url(/fonts/fraunces-roman.v1.woff2) format("woff2"); font-weight: 300 600; }
      @font-face { font-family: "Lantern Display"; src: url(/fonts/fraunces-italic.v1.woff2) format("woff2"); font-weight: 300 500; font-style: italic; }
      @font-face { font-family: "Lantern Sans"; src: url(/fonts/instrument-sans.v1.woff2) format("woff2"); font-weight: 400 600; font-stretch: 80% 100%; }
      @font-face { font-family: "Lantern Mono"; src: url(/fonts/fragment-mono.v1.woff2) format("woff2"); }
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: ${COLOR.night}; }
      body { position: relative; color: ${COLOR.hanji}; -webkit-font-smoothing: antialiased; }
      #host, .lights { position: absolute; inset: 0; }
      #host canvas { display: block; width: 100%; height: 100%; }
      .words { position: absolute; left: 64px; top: 64px; bottom: 64px; width: 600px; display: flex; flex-direction: column; }
      .words svg { display: block; }
      h1 { margin: auto 0 0; font: 300 72px/0.98 "Lantern Display"; font-optical-sizing: auto; letter-spacing: -0.025em; }
      h1 span { display: block; }
      h1 em { font-style: italic; font-weight: 300; }
      p { margin: 28px 0 auto; max-width: 560px; font: 400 26px/1.38 "Lantern Sans"; letter-spacing: -0.005em; text-wrap: pretty; }
      footer { font: 400 18px/1 "Lantern Mono"; color: ${COLOR.ash}; white-space: nowrap; }
    </style></head><body>
      <div id="host"></div>
      ${lightsSvg}
      <div class="words">
        ${lockup}
        <h1><span>Lose the device.</span> <span>Keep the <em>identity.</em></span></h1>
        <p>Lantern lets hidden guardians restore a lost Midnight identity secret, and proves it is the right one.</p>
        <footer>Midnight Korea Hackathon 2026 · lantern-midnight.vercel.app</footer>
      </div>
      <script type="module">
        import { createLanternScene } from '/scene.js';
        await document.fonts.ready;
        // the words' column, as the landing's [data-text-safe] gives it: the scene's glow is held down
        // under every word, the footer's included
        const box = (sel) => document.querySelector(sel).getBoundingClientRect();
        const [top, h1, p, foot] = [box('.words svg'), box('h1'), box('p'), box('footer')];
        const tracker = { u: 0, textRects(out) { out.set([top.left, top.top, Math.max(h1.right, p.right, foot.right), foot.bottom], 0); return 1; } };
        await createLanternScene({ host: document.getElementById('host'), tracker, tier: 'high', onFail: (why) => { document.body.dataset.fail = why; } });
        // a few frames for the flame to settle into its flicker
        let n = 0;
        const tick = () => { n += 1; if (n < 45) requestAnimationFrame(tick); else document.body.dataset.ready = '1'; };
        requestAnimationFrame(tick);
      </script>
    </body></html>`;

    // A GPU where there is one (Metal on a Mac); otherwise Chromium's software rasteriser, at the
    // high tier all the same: slower, the same drawing.
    const args = process.platform === 'darwin'
      ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal']
      : ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    const gpu = await chromium.launch({ args });
    try {
      const page = await gpu.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('http://og.lantern/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
        if (path === '/scene.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(tmp, 'dist', 'scene.js')) });
        if (path.startsWith('/fonts/')) return route.fulfill({ contentType: 'font/woff2', body: readFileSync(join(PUBLIC, path)) });
        return route.fulfill({ status: 404, body: '' });
      });
      await page.goto('http://og.lantern/');
      await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.fail, null, { timeout: 120_000 });
      const fail = await page.evaluate(() => document.body.dataset.fail);
      if (fail || errors.length) throw new Error(`og.png: the scene failed (${fail || errors.join('; ')})`);
      return await page.screenshot({ type: 'png' });
    } finally {
      await gpu.close();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------
// the manifest the /brand page lists its downloads from (web/src/brand/kit.js): every file in
// brand-kit/, the favicons and the social card, with its type, size in bytes and pixel size, read
// back from the files on disk (so an og.png left from an earlier --og run is listed as it is)

const TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
function pixels(file, buf) {
  if (file.endsWith('.png')) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (file.endsWith('.jpg')) {
    // the first start-of-frame marker (FFC0 to FFCF, bar C4, C8 and CC) holds the size
    for (let i = 2; i < buf.length;) {
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (file.endsWith('.ico')) {
    const sizes = [];
    for (let i = 0; i < buf.readUInt16LE(4); i += 1) sizes.push(buf.readUInt8(6 + 16 * i) || 256);
    return { sizes };
  }
  const head = buf.toString('utf8').match(/<svg[^>]*>/)[0];
  return { width: Number(head.match(/\swidth="([\d.]+)"/)[1]), height: Number(head.match(/\sheight="([\d.]+)"/)[1]) };
}
{
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(KIT);
  for (const name of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og.png', 'og.jpg']) {
    if (existsSync(join(PUBLIC, name))) files.push(join(PUBLIC, name));
  }
  const rows = files
    .filter((p) => TYPES[extname(p)])
    .map((p) => {
      const buf = readFileSync(p);
      const url = `/${relative(PUBLIC, p).split(sep).join('/')}`;
      const fields = Object.entries({ type: TYPES[extname(p)], bytes: buf.length, ...pixels(p, buf) })
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
      return `  '${url}': { ${fields.join(', ')} },`;
    });
  write(
    join(WEB, 'src', 'brand', 'kit.js'),
    `// Generated by web/scripts/brand.mjs: the files the /brand page offers for download, with their\n`
      + `// type, size in bytes and pixel size, read from web/public. Do not edit by hand: run it again.\n`
      + `export const KIT = {\n${rows.join('\n')}\n};\n`,
  );
}

for (const [path, bytes, sha] of written) console.log(`${path.padEnd(52)} ${String(bytes).padStart(7)} B  ${sha}`);
console.log(`${written.length} files; no style in any SVG.`);
