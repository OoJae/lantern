// The brand kit, as a page (/brand), the files it offers, the social card and the 404. The page reads
// its colours, curves and sizes from the stylesheet and works its contrast ratios out in the browser;
// these tests work them out again, independently, and hold the page to the stylesheet.
import { test, expect } from '@playwright/test';
import { expectFiniteAnimations } from './helpers.js';

const openBrand = async (page) => {
  await page.goto('/brand');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brand kit');
};

// WCAG 2 contrast from two #rrggbb colours.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
// The pixel size a PNG says it is (its IHDR chunk).
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
// The pixel size a JPEG says it is (its first start-of-frame marker: FFC0 to FFCF, bar C4, C8, CC).
const jpegSize = (buf) => {
  expect(buf.readUInt16BE(0), 'a JPEG').toBe(0xffd8);
  for (let i = 2; i < buf.length;) {
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
};

const TYPES = {
  svg: /^image\/svg\+xml/,
  png: /^image\/png/,
  jpg: /^image\/jpeg/,
  ico: /^image\/(x-icon|vnd\.microsoft\.icon)/,
  txt: /^text\/plain/,
};

test('/brand: one h1, eight sections in order, and nothing logged', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await openBrand(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const sections = await page.locator('.bk-section h2').allInnerTexts();
  expect(sections).toEqual(['The mark', 'Wordmark and lockups', 'Colour', 'Type', 'The seal', 'Motion', 'Voice', 'Downloads']);
  // every entry in the contents jumps to a section that is there
  for (const href of await page.locator('nav[aria-label="On this page"] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
    await expect(page.locator(href)).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('every kit file the page links to or shows is served as what it is, and no SVG carries a style', async ({ page }) => {
  await openBrand(page);
  // the pictures in the downloads load lazily: ask for them all now, and each must decode
  await page.locator('main img').evaluateAll((imgs) => Promise.all(imgs.map((img) => { img.loading = 'eager'; return img.decode(); })));
  const shown = await page.locator('main img').evaluateAll((imgs) => imgs.map((i) => ({ src: new URL(i.src).pathname, w: i.naturalWidth })));
  expect(shown.length).toBeGreaterThanOrEqual(25);
  for (const { src, w } of shown) expect(w, `${src} decodes`).toBeGreaterThan(0);

  const links = await page.locator('main a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const files = [...new Set([...links, ...shown.map((s) => s.src)])].filter((p) => /\.\w+$/.test(p));
  expect(files).toEqual(expect.arrayContaining(['/brand-kit/lantern-mark.svg', '/brand-kit/lantern-lockup.svg', '/brand-kit/icon-512.png', '/og.png']));
  // each download is a real download
  const downloads = await page.locator('main a[download]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(downloads.length).toBeGreaterThanOrEqual(25);
  for (const file of files) {
    const res = await page.request.get(file);
    expect(res.status(), file).toBe(200);
    const type = TYPES[file.split('.').pop()];
    expect(type, `a type for ${file}`).toBeTruthy();
    expect(res.headers()['content-type'], file).toMatch(type);
    if (file.endsWith('.svg')) {
      const body = await res.text();
      expect(body, file).toMatch(/^<svg /);
      expect(body, `${file} carries a style`).not.toMatch(/<style|style=/i);
    }
  }
});

test('the swatches are the stylesheet’s colours, and every text pair reads at 4.5:1 or more', async ({ page }) => {
  await openBrand(page);
  const swatches = await page.locator('.bk-swatch[data-token]').evaluateAll((els) => {
    const root = getComputedStyle(document.documentElement);
    return els.map((el) => ({
      token: el.dataset.token,
      css: root.getPropertyValue(`--${el.dataset.token}`).trim(),
      shown: el.querySelector('.bk-swatch-hex').textContent.trim(),
      painted: getComputedStyle(el.querySelector('.bk-chip')).backgroundColor,
    }));
  });
  expect(swatches.map((s) => s.token)).toEqual(['night', 'hanji', 'ash', 'ember', 'lacquer', 'rib', 'edge', 'muted-on-paper', 'ember-deep', 'hanji-hover']);
  for (const s of swatches) {
    expect(s.css, s.token).toMatch(/^#[0-9a-f]{6}$/i);
    expect(s.shown.toLowerCase(), s.token).toBe(s.css.toLowerCase());
    expect(s.painted, s.token).toBe(rgb(s.css));
  }
  // the six tokens, as the design spec fixes them
  const hex = Object.fromEntries(swatches.map((s) => [s.token, s.css.toLowerCase()]));
  expect(hex).toMatchObject({ night: '#090a0f', hanji: '#ece4d2', ash: '#948e83', ember: '#ff8a3d', lacquer: '#14151b', rib: '#2c2d35' });

  const rows = await page.locator('.bk-contrast tr[data-ratio]').evaluateAll((trs) => trs.map((tr) => ({
    fg: tr.dataset.fg, bg: tr.dataset.bg, use: tr.dataset.use, shown: tr.querySelector('.bk-ratio').textContent.trim(),
  })));
  expect(rows.length).toBeGreaterThanOrEqual(10);
  for (const r of rows) {
    const ratio = contrast(hex[r.fg], hex[r.bg]);
    expect(r.shown, `${r.fg} on ${r.bg}`).toBe(ratio.toFixed(2));
    if (r.use === 'text') expect(ratio, `${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(4.5);
    if (r.use === 'control') expect(ratio, `${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(3);
    if (r.use === 'never') expect(ratio, `${r.fg} on ${r.bg}`).toBeLessThan(3);
  }
  expect(rows.filter((r) => r.use === 'text').length).toBeGreaterThanOrEqual(6);
});

test('the social card is 1200 × 630 at an absolute address, and the icons are linked in order', async ({ page }) => {
  await page.goto('/');
  const meta = (key) => page.locator(`head meta[property="${key}"], head meta[name="${key}"]`).getAttribute('content');
  const image = await meta('og:image');
  // a JPEG: some link scrapers skip an image as large as the PNG
  expect(image).toBe('https://lantern-midnight.vercel.app/og.jpg');
  expect(await meta('og:image:type')).toBe('image/jpeg');
  expect(await meta('og:image:width')).toBe('1200');
  expect(await meta('og:image:height')).toBe('630');
  expect(await meta('og:image:alt')).toBe('A paper lantern glowing in the dark beside the words: Lose the device. Keep the identity.');
  expect(await meta('og:title')).toBeTruthy();
  expect(await meta('og:description')).toBeTruthy();
  expect(await meta('twitter:card')).toBe('summary_large_image');
  expect(await meta('twitter:image:alt')).toBe(await meta('og:image:alt'));
  expect(await meta('theme-color')).toBe('#090A0F');
  await expect(page.locator('head link[rel="manifest"]')).toHaveCount(0);

  // the card itself, served from this site under the path the absolute address names
  const card = await page.request.get(new URL(image).pathname);
  expect(card.status()).toBe(200);
  expect(card.headers()['content-type']).toMatch(TYPES.jpg);
  const bytes = await card.body();
  expect(jpegSize(bytes)).toEqual({ width: 1200, height: 630 });
  expect(bytes.length).toBeLessThan(300 * 1024);
  // and the lossless copy the brand kit offers
  const png = await page.request.get('/og.png');
  expect(png.status()).toBe(200);
  expect(png.headers()['content-type']).toMatch(TYPES.png);
  expect(pngSize(await png.body())).toEqual({ width: 1200, height: 630 });

  const icons = await page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"]').evaluateAll((ls) => ls.map((l) => [l.rel, l.getAttribute('href'), l.getAttribute('sizes'), l.getAttribute('type')]));
  expect(icons).toEqual([
    ['icon', '/favicon.ico', '32x32', null],
    ['icon', '/favicon.svg', null, 'image/svg+xml'],
    ['apple-touch-icon', '/apple-touch-icon.png', null, null],
  ]);
  const touch = await page.request.get('/apple-touch-icon.png');
  expect(pngSize(await touch.body())).toEqual({ width: 180, height: 180 });
  for (const [, href] of icons) expect((await page.request.get(href)).status(), href).toBe(200);
});

test('“Press to seal” stamps the seal closed from the keyboard, and the stamp ends', async ({ page }) => {
  await openBrand(page);
  const plate = page.locator('.bk-press');
  const button = page.getByRole('button', { name: 'Press to seal' });
  await expect(plate.locator('svg.seal')).toHaveAttribute('data-state', 'open');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(plate).toHaveAttribute('data-stamps', '1');
  await expect(plate.locator('svg.seal')).toHaveAttribute('data-state', 'closed');
  await expect(plate.locator('[aria-live]')).toHaveText('Closed: accepted.');
  // pressed again, it stamps again, and the button keeps the focus
  await page.keyboard.press(' ');
  await expect(plate).toHaveAttribute('data-stamps', '2');
  await expect(button).toBeFocused();
  await expectFiniteAnimations(page);
  await plate.locator('svg.seal').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
});

test('under reduced motion the seal closes at once, with nothing moving', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBrand(page);
  await page.getByRole('button', { name: 'Press to seal' }).press('Enter');
  await expect(page.locator('.bk-press svg.seal')).toHaveAttribute('data-state', 'closed');
  expect(await page.locator('.bk-press svg.seal').evaluate((el) => el.getAnimations().length)).toBe(0);
  expect(await page.locator('.bk-guide').first().evaluate((el) => el.getAnimations().length)).toBe(0);
});

test('an address with no page says so, with the lantern out, and leads back', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here');
  await expect(page.getByText('This lantern is out.')).toBeVisible();
  await expect(page.locator('main svg[data-name="03-dark"]')).toBeVisible();
  await page.getByRole('link', { name: 'Back to the start' }).click();
  await expect(page).toHaveURL(/\/$/);
});

// The page runs to about 20,000px: every section leads back to the contents, which are there.
test('/brand: every section leads back to the contents', async ({ page }) => {
  await openBrand(page);
  const ups = page.locator('.bk-section .bk-head').getByRole('link', { name: 'Contents' });
  await expect(ups).toHaveCount(8);
  for (const href of await ups.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toBe('#contents');
  await expect(page.locator('#contents')).toContainText('Brand kit');
  await expect(page.locator('#contents nav[aria-label="On this page"]')).toHaveCount(1);
  // taken from the last section, it jumps back to the top, clear of the header
  await ups.last().click();
  await expect(page).toHaveURL(/\/brand#contents$/);
  const top = await page.locator('#contents').evaluate((el) => el.getBoundingClientRect().top);
  const header = await page.locator('header.site').evaluate((h) => h.getBoundingClientRect().bottom);
  expect(top).toBeGreaterThanOrEqual(header - 1);
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
});

// The header over paper. Its ground is see-through: over a Hanji plate at 72% Night it turned a mid
// grey, and the Ash nav fell to 2.9:1. The scrim is now denser (tokens.css). Measured from the pixels
// drawn (blur and all) in the nav's own padding, with a paper plate right under the header.
test('/brand: the nav reads at 4.5:1 or more with a paper plate under the header', async ({ page }) => {
  await openBrand(page);
  const plate = page.locator('.bk-press');
  await expect(plate).toHaveClass(/\bpaper\b/);
  const headerBottom = await page.locator('header.site').evaluate((h) => h.getBoundingClientRect().bottom);
  // the plate's middle under the header's middle, so the blur sees only paper
  await plate.evaluate((el, hb) => {
    const r = el.getBoundingClientRect();
    window.scrollBy(0, r.top + r.height / 2 - hb / 2);
  }, headerBottom);
  const box = await plate.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
  expect(box.top).toBeLessThan(-20);
  expect(box.bottom).toBeGreaterThan(headerBottom + 20);
  const navs = await page.locator('header.site .nav').evaluateAll((as) => as.map((a) => {
    const r = a.getBoundingClientRect();
    return { x: Math.round(r.left + 3), y: Math.round(r.top + r.height / 2), color: getComputedStyle(a).color };
  }));
  const under = navs.filter((n) => n.x > box.left + 20 && n.x < box.right - 20);
  expect(under.length).toBeGreaterThan(0);
  const vw = await page.evaluate(() => window.innerWidth);
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: vw, height: Math.ceil(headerBottom) }, scale: 'css' });
  const grounds = await page.evaluate(async ({ png, points }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return points.map(({ x, y }) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)]);
  }, { png: shot.toString('base64'), points: under });
  const hex = (rgbs) => `#${rgbs.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const toHex = (css) => hex(css.match(/\d+/g).slice(0, 3).map(Number));
  under.forEach((n, i) => {
    const ratio = contrast(toHex(n.color), hex(grounds[i]));
    expect(ratio, `${n.color} on ${hex(grounds[i])}`).toBeGreaterThanOrEqual(4.5);
  });
});
