// The landing page: a story told over a sticky stage (pages/Landing.jsx). The stage draws the lantern
// (the WebGL scene, or the SVG poster when there is none); the words are always real text beside it.
import { test, expect } from '@playwright/test';
import { BANNED, expectNoSeriousA11yIssues, expectNoSideScroll, expectFiniteAnimations, watchCsp } from './helpers.js';

const STEPS = 8;
const night = (page) => page.locator('section.night');

async function openLanding(page) {
  await page.goto('/');
  // pending (the poster, while the scene would load) settles on what draws the lantern.
  await expect(night(page)).toHaveAttribute('data-scene', /^(webgl|poster|still)$/);
}

// Scroll so that block i's centre is on the viewport's centre line: the tracker's clock reads
// exactly i there. Block 0 is the hero, read from the top of the page.
async function toStep(page, i) {
  await page.evaluate((i) => {
    if (i === 0) { window.scrollTo(0, 0); return; }
    const r = document.querySelector(`[data-step="${i}"]`).getBoundingClientRect();
    window.scrollTo(0, r.top + window.scrollY + r.height / 2 - window.innerHeight / 2);
  }, i);
}

test('one h1, the story in eight blocks, and every way out of it', async ({ page }) => {
  const noCspViolations = await watchCsp(page);
  await openLanding(page);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Lose the device. Keep the identity.');
  await expect(page.locator('[data-step]')).toHaveCount(STEPS);
  // Each block marks the boxes its words sit in, which the scene keeps dim behind them: the hero
  // two (its words, and the scroll cue's row), every other block one.
  await expect(page.locator('[data-step="0"] [data-text-safe]')).toHaveCount(2);
  for (let i = 1; i < STEPS; i++) await expect(page.locator(`[data-step="${i}"] [data-text-safe]`)).toHaveCount(1);

  const hero = page.locator('.hero');
  await expect(hero.getByRole('link', { name: 'Watch a recovery' })).toHaveAttribute('href', '/demo');
  await expect(hero.getByRole('link', { name: 'Try to break it' })).toHaveAttribute('href', '/demo#break');
  await expect(hero.getByRole('link', { name: 'Skip the story' })).toHaveAttribute('href', '#after-story');
  const after = page.locator('#after-story');
  await expect(after.getByRole('link', { name: 'Watch a recovery' })).toHaveAttribute('href', '/demo');
  await expect(after.getByRole('link', { name: 'Try to break it' })).toHaveAttribute('href', '/demo#break');
  await expect(page.getByRole('link', { name: 'Try to find the guardians' })).toHaveAttribute('href', '/attacks');
  await expect(page.locator('.what-is-real').getByRole('link', { name: 'What is real' })).toHaveAttribute('href', '/about');
  for (const [name, href] of [['Run beat 4', '/demo?beat=4'], ['Run beat 7', '/demo?beat=7'], ['Run beat 8', '/demo?beat=8'], ['Tamper with a share yourself', '/demo#break']]) {
    await expect(page.locator('.story').getByRole('link', { name })).toHaveAttribute('href', href);
  }
  // The four facts, I to IV, under their headings.
  await expect(page.locator('.fact-list h3')).toHaveText(['No recovery by default', 'Correct, not just authorised', 'The guardians stay hidden', 'Downstream apps keep working']);
  expect(await page.locator('body').innerText()).not.toMatch(BANNED);
  await noCspViolations();
});

test('without reduced motion the stage draws the lantern, and the story clock follows the scroll both ways', async ({ page }) => {
  await openLanding(page);
  await expect(night(page)).toHaveAttribute('data-scene', /^(webgl|poster)$/);
  const stage = page.locator('.stage');
  await expect(stage).toHaveAttribute('aria-hidden', 'true');
  await expect(stage).toHaveCSS('pointer-events', 'none');
  await expect(stage.locator('svg.lantern-poster')).toHaveCount(1);

  const header = await page.locator('header.site').elementHandle();
  const order = [...Array(STEPS).keys()];
  for (const i of [...order, ...order.slice(0, -1).reverse()]) {
    await toStep(page, i);
    await expect(night(page)).toHaveAttribute('data-stage', String(i));
    await expectNoSideScroll(page);
  }
  // The same header throughout, still stuck to the top.
  expect(await header.evaluate((h) => h.isConnected && h === document.querySelector('header.site'))).toBe(true);
  expect(await header.evaluate((h) => h.getBoundingClientRect().top)).toBe(0);
});

test('"Skip the story" jumps past it, clear of the header', async ({ page }) => {
  await openLanding(page);
  await page.getByRole('link', { name: 'Skip the story' }).click();
  await expect(page).toHaveURL(/#after-story$/);
  const after = page.locator('#after-story');
  await expect(after).toBeInViewport();
  const headerBottom = await page.locator('header.site').evaluate((h) => h.getBoundingClientRect().bottom);
  expect(await after.evaluate((s) => s.getBoundingClientRect().top)).toBeGreaterThanOrEqual(headerBottom - 1);
});

test('the words are revealed by mask and movement only, never faded, and a keyboard opens a block at once', async ({ page }) => {
  await openLanding(page);
  // Every masked line keeps full opacity at every moment (axe measures contrast mid-reveal).
  const faded = await page.locator('.rv').evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity !== '1').length);
  expect(faded).toBe(0);
  // A link deep in the story, reached by keyboard before it was scrolled to, is not left masked.
  await page.locator('.story').getByRole('link', { name: 'Run beat 8' }).evaluate((a) => a.focus({ preventScroll: true }));
  const clip = await page.locator('.story').getByRole('link', { name: 'Run beat 8' }).evaluate((a) => getComputedStyle(a.closest('.rv')).clipPath);
  expect(clip).not.toMatch(/100%/);
});

test('the story reads well everywhere: at each block, no serious accessibility issue and no endless animation', async ({ page }) => {
  await openLanding(page);
  for (const i of [0, 3, 6]) {
    await toStep(page, i);
    await expect(night(page)).toHaveAttribute('data-stage', String(i));
    await expectFiniteAnimations(page);
    await expectNoSeriousA11yIssues(page);
  }
  await page.locator('#after-story').scrollIntoViewIfNeeded();
  await expectNoSeriousA11yIssues(page);
});

test('on a wide screen each block\'s text box hugs its words, and the blackout alone is centred', async ({ page }) => {
  const { width } = page.viewportSize();
  test.skip(width < 1080, 'the wide layout');
  await openLanding(page);
  for (let i = 1; i < STEPS; i++) {
    await toStep(page, i);
    const box = await page.locator(`[data-step="${i}"] [data-text-safe]`).boundingBox();
    if (i === 3) {
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    } else {
      // columns 1 to 5 of 12: never under the lantern, which hangs over columns 8 to 11
      expect(box.x + box.width).toBeLessThan(width * 0.5);
    }
  }
});

for (const [w, h] of [[320, 568], [375, 667]]) {
  test(`at ${w}px wide nothing scrolls sideways, at any block or after the story`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openLanding(page);
    for (let i = 0; i < STEPS; i++) {
      await toStep(page, i);
      await expect(night(page)).toHaveAttribute('data-stage', String(i));
      await expectNoSideScroll(page);
    }
    for (const sel of ['#after-story', '.attackers', '.how-it-holds', 'footer.site']) {
      await page.locator(sel).scrollIntoViewIfNeeded();
      await expectNoSideScroll(page);
    }
  });
}

test('under reduced motion the story is still: no stage, no canvas, no scene code, each block with its pictogram', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const noCspViolations = await watchCsp(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLanding(page);
  await expect(night(page)).toHaveAttribute('data-scene', 'still');
  await expect(page.locator('html')).not.toHaveClass(/\bmotion\b/);
  await expect(page.locator('.stage')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  // The hero shows the poster, the lantern lit; each of the seven blocks after it its pictogram.
  await expect(page.locator('.hero .hero-poster svg.lantern-poster')).toHaveCount(1);
  await expect(page.locator('.chapter-art svg[data-name]')).toHaveCount(STEPS - 1);
  await expect(night(page)).not.toHaveAttribute('data-stage', /.*/);
  await page.waitForLoadState('networkidle');
  expect(requests.filter((u) => /lantern-scene|three/.test(u))).toEqual([]);
  expect(await page.locator('body').innerText()).not.toMatch(BANNED);
  await expectFiniteAnimations(page);
  await expectNoSeriousA11yIssues(page);
  await expectNoSideScroll(page);
  await page.locator('.blackout').scrollIntoViewIfNeeded();
  await expectNoSeriousA11yIssues(page);
  await noCspViolations();
});

test('with no WebGL at all the poster draws the story', async ({ page }) => {
  // A browser without WebGL: every WebGL context comes back null (a 2D one still works).
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/i.test(type) ? null : getContext.call(this, type, ...rest);
    };
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openLanding(page);
  await expect(night(page)).toHaveAttribute('data-scene', 'poster');
  await expect(page.locator('.stage svg.lantern-poster')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.canvas-host')).not.toHaveAttribute('data-loop', /.*/);
  await toStep(page, 3);
  await expect(night(page)).toHaveAttribute('data-stage', '3');
  expect(errors).toEqual([]);
});

// Headless Chromium draws WebGL2 in software (SwiftShader): the scene runs on its low tier, or, if
// the machine is too slow even for that, hands over to the poster. Either is right; the tests
// below that need the scene skip when the poster is drawing.
test('the scene draws into one canvas of its own, over the poster, and stops drawing once the story is off screen', async ({ page }) => {
  await openLanding(page);
  test.skip(await night(page).getAttribute('data-scene') !== 'webgl', 'only when the WebGL scene is drawing');
  const host = page.locator('.canvas-host');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(host.locator('canvas')).toHaveAttribute('aria-hidden', 'true');
  await expect(host).toHaveCSS('opacity', '1');
  // The poster under the opaque canvas is no longer painted once the canvas is in.
  await expect(page.locator('.stage svg.lantern-poster')).toHaveCSS('visibility', 'hidden');
  await expect(host).toHaveAttribute('data-loop', /^(running|idle)$/);
  // The story's last frame closes to Night before the stage scrolls away; the canvas hands over to
  // the page there, so its edge never shows.
  await toStep(page, 7);
  await expect(night(page)).not.toHaveAttribute('data-closed', /.*/);
  await page.locator('#after-story').scrollIntoViewIfNeeded();
  await expect(night(page)).toHaveAttribute('data-closed', '');
  await expect(host).toHaveCSS('opacity', '0');
  // Off screen, the loop stops; back on screen, it draws again.
  await page.locator('footer.site').scrollIntoViewIfNeeded();
  await expect(host).toHaveAttribute('data-loop', 'paused');
  await toStep(page, 2);
  await expect(host).toHaveAttribute('data-loop', /^(running|idle)$/);
  await expect(night(page)).not.toHaveAttribute('data-closed', /.*/);
  await expect(host).toHaveCSS('opacity', '1');
});

test('leaving the landing and coming back, again and again, leaves one canvas at most and no WebGL warning', async ({ page, browserName }) => {
  const ROUNDS = 4;
  const warnings = [];
  // The page never reads a WebGL frame back itself: every readPixels on any context is counted.
  await page.addInitScript(() => {
    window.__lanternReadPixels = 0;
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      const read = C.prototype.readPixels;
      C.prototype.readPixels = function readPixels(...args) {
        window.__lanternReadPixels += 1;
        return read.apply(this, args);
      };
    }
  });
  page.on('console', (m) => {
    if (['warning', 'error'].includes(m.type()) && /webgl|\bgl_|context|gpu|swiftshader/i.test(m.text())) warnings.push(m.text());
  });
  page.on('pageerror', (e) => warnings.push(e.message));
  await openLanding(page);
  const header = page.locator('header.site');
  for (let round = 0; round < ROUNDS; round++) {
    await expect(night(page)).toHaveAttribute('data-scene', /^(webgl|poster)$/);
    const mode = await night(page).getAttribute('data-scene');
    await expect(page.locator('canvas')).toHaveCount(mode === 'webgl' ? 1 : 0);
    await header.getByRole('link', { name: 'The recovery' }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.locator('[data-ready="true"]')).toBeVisible();
    // The scene let go of its canvas and its context when the landing went.
    await expect(page.locator('canvas')).toHaveCount(0);
    await header.getByRole('link', { name: 'Lantern home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expectNoSideScroll(page);
  }
  await expect(night(page)).toHaveAttribute('data-scene', /^(webgl|poster)$/);
  expect(await page.locator('canvas').count()).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.__lanternReadPixels), 'readPixels calls by the page').toBe(0);
  // Firefox reports every WebGL context a page lets go of on purpose ("WebGL context was lost."):
  // the scene releases its context the moment the landing goes, which is what keeps contexts from
  // piling up, and it reads the GPU once per page through a throwaway one. So Firefox may say it
  // once per visit left and once for that first look, no more.
  const released = warnings.filter((w) => /WebGL context was lost\./.test(w));
  // Chromium with a software WebGL (SwiftShader, as headless Chromium runs it) composites a WebGL
  // canvas in software, reading each frame back itself, and the driver reports that readback as a
  // performance note: "GPU stall due to ReadPixels", four times in a browser's life, the fourth
  // ending "(this message will no longer repeat)". Any canvas that draws brings it (a loop of
  // clear() alone does); the page reads nothing back (counted above). Which test in a worker draws
  // WebGL first is a matter of scheduling, so the note is Chromium's own and allowed there, on a
  // software renderer, four times at most. Nothing else about WebGL, anywhere.
  const stalls = warnings.filter((w) => /GL Driver Message \(OpenGL, Performance, \w+, High\): GPU stall due to ReadPixels( \(this message will no longer repeat\))?$/.test(w));
  expect(warnings.filter((w) => !released.includes(w) && !stalls.includes(w))).toEqual([]);
  if (browserName === 'firefox') expect(released.length).toBeLessThanOrEqual(ROUNDS + 1);
  else expect(released).toEqual([]);
  const software = browserName === 'chromium' && await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return /SwiftShader|llvmpipe|Software/i.test(info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '');
  });
  if (software) expect(stalls.length).toBeLessThanOrEqual(4);
  else expect(stalls).toEqual([]);
});

// ---- The layout holds the words clear of everything else, on every screen ----------------------

// The poster draws the lantern at the scene's own place and size (the canvas fades in over it with
// no jump), so its geometry stands for both: the tests below read it with WebGL off.
async function withoutWebGL(page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/i.test(type) ? null : getContext.call(this, type, ...rest);
    };
  });
}
// The drawn lantern's box in viewport px: its paper (the body path) and the whole lit lantern
// (roof, paper and foot, the cord running up out of the frame).
const lanternBox = (page) => page.evaluate(() => {
  const svg = [...document.querySelectorAll('.stage svg.lantern-poster > svg')].find((s) => getComputedStyle(s).display !== 'none');
  const lit = svg.querySelector('.lp-lit');
  const paper = [...lit.querySelectorAll('path')].find((p) => p.getAttribute('d').startsWith('M-151 -96')).getBoundingClientRect();
  return { paperLeft: paper.left, foot: lit.getBoundingClientRect().bottom };
});
const portrait = (page) => page.evaluate(() => innerWidth / innerHeight < 0.8);

test('on a wide screen the h1 ends 20px short of the lantern\'s paper, at every size', async ({ page }) => {
  test.skip((page.viewportSize().width) < 1080, 'the wide layout, resized');
  await withoutWebGL(page);
  await openLanding(page);
  await expect(night(page)).toHaveAttribute('data-scene', 'poster');
  await page.evaluate(() => document.fonts.ready);
  // Fraunces widens as it shrinks (its optical size): the fit is read off the line's real width.
  for (const [width, height] of [[900, 700], [1024, 768], [1180, 820], [1280, 800], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(async () => {
      const right = await page.locator('.hero h1').evaluate((h) => {
        const r = document.createRange();
        r.selectNodeContents(h);
        return Math.max(...[...r.getClientRects()].map((x) => x.right));
      });
      const gap = (await lanternBox(page)).paperLeft - right;
      return gap >= 18 && gap <= 26 ? 'clear' : `gap ${gap.toFixed(1)}px at ${width} x ${height}`;
    }).toBe('clear');
  }
});

test('the ledger strip never prints over the story\'s words', async ({ page }) => {
  test.skip((page.viewportSize().width) < 1080, 'the strip is shown from 1080px');
  await withoutWebGL(page);
  await openLanding(page);
  const { shown, over } = await page.evaluate(async () => {
    const section = document.querySelector('section.night');
    const end = document.querySelector('#after-story').getBoundingClientRect().top + window.scrollY;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    let shown = 0;
    const over = [];
    for (let y = 0; y < end; y += 20) {
      window.scrollTo(0, y);
      await frame();
      if (section.hasAttribute('data-strip-hidden') || section.hasAttribute('data-closed')) continue;
      const lines = [...section.querySelectorAll('.ledger-strip span')]
        .filter((s) => getComputedStyle(s).display !== 'none')
        .map((s) => s.getBoundingClientRect());
      if (!lines.length) continue;
      shown += 1;
      const words = [...section.querySelectorAll('.story [data-text-safe]')].map((e) => e.getBoundingClientRect());
      if (lines.some((l) => words.some((w) => hit(l, w)))) over.push(`${y} (stage ${section.dataset.stage})`);
    }
    return { shown, over };
  });
  expect(over, 'scroll positions where the strip overlaps the words').toEqual([]);
  // It still prints: at every block centred, the strip is out.
  expect(shown).toBeGreaterThan(20);
  for (let i = 1; i < STEPS; i++) {
    await toStep(page, i);
    await expect(night(page)).toHaveAttribute('data-stage', String(i));
    await expect(night(page)).not.toHaveAttribute('data-strip-hidden', /.*/);
  }
});

test('on a phone the first screen holds the words, both buttons and the scroll cue, under the lantern', async ({ page }) => {
  const own = page.viewportSize();
  await withoutWebGL(page);
  // The project's own phone, then the short ones (an SE, a small Android, the 320px floor).
  for (const size of [own, { width: 375, height: 667 }, { width: 360, height: 640 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await openLanding(page);
    if (!(await portrait(page))) continue;
    await expect(night(page)).toHaveAttribute('data-scene', 'poster');
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(async () => {
      const { words, cta, cue, fold } = await page.evaluate(() => ({
        words: document.querySelector('.hero-text').getBoundingClientRect().top,
        cta: document.querySelector('.hero .cta').getBoundingClientRect().bottom,
        cue: document.querySelector('.hero-foot').getBoundingClientRect().bottom,
        fold: window.innerHeight,
      }));
      const { foot } = await lanternBox(page);
      const problems = [];
      if (cta > fold) problems.push(`the buttons end at ${cta} of ${fold}`);
      if (cue > fold + 1) problems.push(`the scroll cue's row ends at ${cue} of ${fold}`);
      if (foot > words) problems.push(`the lantern's foot (${foot}) is under the words (${words})`);
      return problems.join('; ') || `clear at ${size.width} x ${size.height}`;
    }).toBe(`clear at ${size.width} x ${size.height}`);
    await expect(page.locator('.hero').getByRole('link', { name: 'Watch a recovery' })).toBeInViewport({ ratio: 1 });
  }
});

test('on a phone each block, while it is the current one, is on the screen whole', async ({ page }) => {
  test.skip(!(await page.evaluate(() => innerWidth / innerHeight < 0.8)), 'a portrait screen');
  await openLanding(page);
  const headerBottom = await page.locator('header.site').evaluate((h) => h.getBoundingClientRect().bottom);
  for (let i = 1; i < STEPS; i++) {
    await toStep(page, i);
    await expect(night(page)).toHaveAttribute('data-stage', String(i));
    const box = await page.locator(`[data-step="${i}"] .chapter-text`).evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, fold: window.innerHeight };
    });
    expect(box.bottom, `block ${i}'s last line`).toBeLessThanOrEqual(box.fold);
    expect(box.top, `block ${i}'s first line`).toBeGreaterThanOrEqual(headerBottom);
  }
});

test('turning the screen or resizing the window mid-story keeps the reader\'s place', async ({ page }) => {
  test.skip((page.viewportSize().width) < 1080, 'starts on a wide screen');
  await openLanding(page);
  await toStep(page, 5);
  await expect(night(page)).toHaveAttribute('data-stage', '5');
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await expect(night(page)).toHaveAttribute('data-stage', '5');
    await expect(night(page)).not.toHaveAttribute('data-closed', /.*/);
  }
});
