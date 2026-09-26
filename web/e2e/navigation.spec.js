// Moving between pages. A link in the app changes the page in place, carrying the light across
// (a view transition, where the browser has them and motion is welcome): the header is the same
// element throughout, the new page starts at its top, and every animation of the change ends.
// Back, forward and in-page hash links are instant.
import { test, expect } from '@playwright/test';
import { landsClear, expectFiniteAnimations } from './helpers.js';
import { BUNDLED, compareBundled, packageOf } from '../scripts/notices.mjs';

const nav = (page, name) => page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name });

// Counts calls to document.startViewTransition from before the app's first script, and keeps the
// last transition so a test can wait for it. Also collects uncaught errors: a transition the
// browser skips must not leave a rejected promise behind.
async function watchTransitions(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const start = Document.prototype.startViewTransition;
    window.__lanternVt = { supported: typeof start === 'function', calls: 0, last: null };
    if (!start) return;
    Document.prototype.startViewTransition = function (...args) {
      const t = start.apply(this, args);
      window.__lanternVt.calls += 1;
      window.__lanternVt.last = t;
      // What the browser snapshots as the new page: the page as it is when the update is done.
      window.__lanternVt.atUpdate = null;
      t.updateCallbackDone.then(() => {
        const main = document.querySelector('main');
        window.__lanternVt.atUpdate = {
          path: window.location.pathname,
          loading: main.querySelector('.loading') !== null,
          text: main.innerText.slice(0, 400),
          ready: main.querySelector('[data-ready="true"]') !== null,
          h1: main.querySelector('h1')?.textContent ?? null,
          footerTop: document.querySelector('footer.site').getBoundingClientRect().top,
          innerHeight: window.innerHeight,
          scrollY: window.scrollY,
        };
      }, () => {});
      return t;
    };
  });
  return {
    calls: () => page.evaluate(() => window.__lanternVt.calls),
    supported: () => page.evaluate(() => window.__lanternVt.supported),
    errors,
  };
}

// The change is over: the transition has finished, and so has every animation it started (the
// flare, the wick, the pages). None of them was endless.
async function settled(page) {
  await expectFiniteAnimations(page);
  await page.evaluate(async () => {
    await window.__lanternVt?.last?.finished.catch(() => {});
    for (let round = 0; round < 10; round++) {
      const running = document.getAnimations().filter((a) => a.playState !== 'finished');
      if (running.length === 0) return;
      await Promise.all(running.map((a) => a.finished.catch(() => {})));
    }
  });
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
}

// The header's height as measured into --header-h, and as it is.
const headerHeights = (page) => page.locator('header.site').evaluate((h) => ({
  written: getComputedStyle(document.documentElement).getPropertyValue('--header-h'),
  measured: `${Math.ceil(h.getBoundingClientRect().height)}px`,
}));

test('a route change keeps the header, and the new page starts at its top', async ({ page }) => {
  const vt = await watchTransitions(page);
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here is a mock-up');
  await expect.poll(async () => { const { written, measured } = await headerHeights(page); return written === measured; }).toBe(true);
  const before = await headerHeights(page);
  const header = await page.locator('header.site').elementHandle();
  if (await vt.supported()) expect(await header.evaluate((h) => getComputedStyle(h).viewTransitionName)).toBe('site-header');

  // Far down the page, so a change that kept the scroll would show.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

  await nav(page, 'The recovery').click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // The same element, never replaced, at the same measured height.
  expect(await header.evaluate((h) => h.isConnected && h === document.querySelector('header.site'))).toBe(true);
  await expect(page.locator('header.site')).toHaveCount(1);
  expect(await headerHeights(page)).toEqual(before);

  // The wick has moved to the new item.
  await expect(nav(page, 'The recovery')).toHaveAttribute('aria-current', 'page');
  await expect(nav(page, 'What is real')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('header.site .wick')).toHaveCount(1);
  await expect(nav(page, 'The recovery').locator('.wick')).toHaveCount(1);

  expect(await vt.calls()).toBe(await vt.supported() ? 1 : 0);
  await settled(page);
  expect(vt.errors).toEqual([]);
});

test('the landing’s “Try to break it” lands on the panel, clear of the header', async ({ page }) => {
  const vt = await watchTransitions(page);
  await page.goto('/');
  // The hero's second call to action (the story's end repeats it).
  const cta = page.locator('main').getByRole('link', { name: 'Try to break it' }).first();
  await expect(cta).toHaveAttribute('href', '/demo#break');
  await cta.click();
  await expect(page).toHaveURL(/\/demo#break$/);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await landsClear(page);
  expect(await vt.calls()).toBe(await vt.supported() ? 1 : 0);
  await settled(page);
  await landsClear(page);
  expect(vt.errors).toEqual([]);
});

test('back and forward return to each page at once, with the header kept', async ({ page }) => {
  const vt = await watchTransitions(page);
  await page.goto('/about');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText('Nothing here is a mock-up');
  const header = await page.locator('header.site').elementHandle();

  await nav(page, 'The recovery').click();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const demoTitle = await h1.textContent();
  await nav(page, 'Attack it').click();
  await expect(h1).toHaveText('One attacker, four guardian designs');
  await settled(page);
  const changes = await vt.calls();
  expect(changes).toBe(await vt.supported() ? 2 : 0);

  await page.goBack();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(h1).toHaveText(demoTitle);
  await expect(nav(page, 'The recovery')).toHaveAttribute('aria-current', 'page');

  await page.goBack();
  await expect(page).toHaveURL(/\/about$/);
  await expect(h1).toHaveText('Nothing here is a mock-up');

  await page.goForward();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(h1).toHaveText(demoTitle);

  await page.goForward();
  await expect(page).toHaveURL(/\/attacks$/);
  await expect(h1).toHaveText('One attacker, four guardian designs');

  // History is instant: no transition was started for it.
  expect(await vt.calls()).toBe(changes);
  expect(await header.evaluate((h) => h.isConnected && h === document.querySelector('header.site'))).toBe(true);
  await settled(page);
  expect(vt.errors).toEqual([]);
});

test('an in-page link jumps at once, with no transition', async ({ page }) => {
  const vt = await watchTransitions(page);
  await page.goto('/demo');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.locator('.hint').getByRole('link', { name: 'try to break it' }).click();
  await expect(page).toHaveURL(/\/demo#break$/);
  await landsClear(page);
  expect(await vt.calls()).toBe(0);
  expect(vt.errors).toEqual([]);
});

test('a second link, taken before the first change is drawn, still ends on its page', async ({ page }) => {
  const vt = await watchTransitions(page);
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here is a mock-up');
  await nav(page, 'The recovery').click();
  await nav(page, 'Attack it').click();
  await expect(page).toHaveURL(/\/attacks$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('One attacker, four guardian designs');
  await expect(nav(page, 'Attack it')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('header.site .wick')).toHaveCount(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await settled(page);
  expect(vt.errors).toEqual([]);
});

test.describe('under reduced motion', () => {
  test('a route change is instant: no view transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const vt = await watchTransitions(page);
    await page.goto('/about');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here is a mock-up');
    const header = await page.locator('header.site').elementHandle();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

    await nav(page, 'The recovery').click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.locator('[data-ready="true"]')).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await header.evaluate((h) => h.isConnected && h === document.querySelector('header.site'))).toBe(true);
    expect(await vt.calls()).toBe(0);
    await settled(page);
    expect(vt.errors).toEqual([]);
  });
});

test('in a browser without view transitions, the change is the same, and instant', async ({ page }) => {
  await page.addInitScript(() => { delete Document.prototype.startViewTransition; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here is a mock-up');
  expect(await page.evaluate(() => 'startViewTransition' in document)).toBe(false);
  const header = await page.locator('header.site').elementHandle();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  await nav(page, 'Attack it').click();
  await expect(page).toHaveURL(/\/attacks$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('One attacker, four guardian designs');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await header.evaluate((h) => h.isConnected && h === document.querySelector('header.site'))).toBe(true);
  await expect(nav(page, 'Attack it')).toHaveAttribute('aria-current', 'page');
  await expectFiniteAnimations(page);
  expect(errors).toEqual([]);
});

test('the footer’s “Brand kit” carries the light to /brand, at its top, and back returns', async ({ page }) => {
  const vt = await watchTransitions(page);
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here is a mock-up');
  const header = await page.locator('header.site').elementHandle();
  const link = page.locator('footer.site').getByRole('link', { name: 'Brand kit' });
  await link.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

  await link.click();
  await expect(page).toHaveURL(/\/brand$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brand kit');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await header.evaluate((h) => h.isConnected && h === document.querySelector('header.site'))).toBe(true);
  // no nav item is current on /brand, so no wick
  await expect(page.locator('header.site .wick')).toHaveCount(0);
  expect(await vt.calls()).toBe(await vt.supported() ? 1 : 0);
  await settled(page);

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here is a mock-up');
  expect(await vt.calls()).toBe(await vt.supported() ? 1 : 0);
  expect(vt.errors).toEqual([]);
});

// A first visit to a lazy page: its chunk (and /demo's contract, /attacks's attack) arrives while the
// old page is held, and the page revealed is the page itself, never a loading line with the real page
// cutting in mid-reveal and the footer rising into view. The chunk is held back 300ms here, as a slow
// network would.
for (const [name, path, chunk, h1] of [
  ['The recovery', '/demo', 'Demo', null],
  ['Attack it', '/attacks', 'Attacks', 'One attacker, four guardian designs'],
]) {
  test(`a first visit to ${path} reveals the page itself, never its loading line`, async ({ page }) => {
    // Timed against a local server. Over a real network a first visit can need more than the route's
    // 1.5 s hold (the contract is 1.4 MB of wasm), and then the loading line is the right thing to show.
    test.skip(!!process.env.BASE_URL, 'the hold is timed against a local server');
    const vt = await watchTransitions(page);
    await page.route(`**/assets/${chunk}-*.js`, async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here is a mock-up');
    test.skip(!(await vt.supported()), 'a browser without view transitions changes the page at once');
    await nav(page, name).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('[data-ready="true"]')).toBeVisible();
    const at = await page.evaluate(async () => {
      await window.__lanternVt.last.ready.catch(() => {});
      return window.__lanternVt.atUpdate;
    });
    expect(at.path).toBe(path);
    expect(at.loading, at.text).toBe(false);
    expect(at.text).not.toMatch(/Loading|Building the four ledgers/);
    expect(at.ready).toBe(true);
    if (h1) expect(at.h1).toBe(h1);
    expect(at.scrollY).toBe(0);
    // the page is taller than the window: the footer is not in view
    expect(at.footerTop).toBeGreaterThan(at.innerHeight);
    expect(await vt.calls()).toBe(1);
    await settled(page);
    expect(vt.errors).toEqual([]);
  });
}

// Loaded directly, a lazy page shows its loading line while its chunk arrives, a window tall: the
// footer waits below the fold.
test('a lazy page loading on its own keeps the footer below the fold', async ({ page }) => {
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route('**/assets/Demo-*.js', async (route) => { await held; await route.continue(); });
  await page.goto('/demo', { waitUntil: 'domcontentloaded' });
  const loading = page.locator('main .page-loading .loading');
  await expect(loading).toHaveText('Loading the contract…');
  const { footerTop, innerHeight } = await page.evaluate(() => ({
    footerTop: document.querySelector('footer.site').getBoundingClientRect().top,
    innerHeight: window.innerHeight,
  }));
  expect(footerTop).toBeGreaterThanOrEqual(innerHeight);
  release();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
});

test('each page names itself in the title, and a route change renames it', async ({ page }) => {
  for (const [path, title] of [
    ['/about', 'What is real · Lantern'],
    ['/demo', 'The recovery · Lantern'],
    ['/attacks', 'Attack it · Lantern'],
    ['/brand', 'Brand kit · Lantern'],
    ['/no-such-page', 'Nothing here · Lantern'],
    ['/', 'Lantern · recovery for Midnight private state'],
  ]) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
  }
  await nav(page, 'Attack it').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('One attacker, four guardian designs');
  await expect(page).toHaveTitle('Attack it · Lantern');
  await page.goBack();
  await expect(page).toHaveTitle('Lantern · recovery for Midnight private state');
});

// Taken from the keyboard, a link moves focus to the new page, so a screen reader announces it: its
// h1, or the #hash's target. Taken with the pointer, it does not (a click on plain text afterwards
// still leaves focus on the body, as break.spec.js holds).
test('a link taken from the keyboard moves focus to the new page’s heading; a click does not', async ({ page }) => {
  await page.goto('/about');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText('Nothing here is a mock-up');
  await nav(page, 'Attack it').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/attacks$/);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(h1).toHaveText('One attacker, four guardian designs');
  await expect(h1).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // no ring round a heading: it is not a control
  expect(await h1.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  await settled(page);

  await nav(page, 'What is real').click();
  await expect(h1).toHaveText('Nothing here is a mock-up');
  await settled(page);
  await expect(h1).not.toBeFocused();
});

// Without a view transition (reduced motion; also a hidden tab, or a browser without them) the change
// is drawn at once, a lazy page's stand-in first: focus waits for the page itself, not the stand-in.
test('with reduced motion, a link taken from the keyboard still moves focus to the new page’s heading', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/attacks');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const h1 = page.getByRole('heading', { level: 1 });
  await nav(page, 'What is real').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/about$/);
  await expect(h1).toHaveText('Nothing here is a mock-up');
  await expect(h1).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('“Try to break it” taken from the keyboard lands on the panel with focus in it, clear of the header', async ({ page }) => {
  await page.goto('/');
  const cta = page.locator('main').getByRole('link', { name: 'Try to break it' }).first();
  await cta.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/demo#break$/);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.locator('#break')).toBeFocused();
  await landsClear(page);
  await settled(page);
  await landsClear(page);
});

// The Preprod page in the header's nav, where the four items keep to one row: from 640px. Below, the
// footer and the landing lead there.
test('the nav names On Preprod from 640px, on one row; below 640px it keeps three items on one row', async ({ page }) => {
  await page.goto('/about');
  // (by its address: hidden, it is out of the accessibility tree, so a role query would not find it)
  const item = page.locator('header.site nav a.nav[href="/live"]');
  await expect(item).toHaveText('On Preprod');
  const rows = () => page.locator('header.site .nav').evaluateAll((els) => new Set(els
    .filter((e) => e.getClientRects().length)
    .map((e) => Math.round(e.getBoundingClientRect().top))).size);
  const height = () => page.locator('header.site').evaluate((e) => e.getBoundingClientRect().height);
  for (const width of [640, 700, 768, 900, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(item).toBeVisible();
    expect(await rows(), `${width}px`).toBe(1);
    expect(await height(), `${width}px`).toBeLessThanOrEqual(60);
  }
  for (const width of [320, 360, 375, 390, 412, 430, 480, 540, 600, 639]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(item).toBeHidden();
    expect(await rows(), `${width}px`).toBe(1);
    expect(await height(), `${width}px`).toBeLessThanOrEqual(60);
  }
  await expect(page.locator('footer.site').getByRole('link', { name: 'On Preprod' })).toHaveAttribute('href', '/live');
});

// A lazy page whose chunk is gone (a tab opened before a redeploy asks for hashed files the new
// deployment no longer serves; a dropped connection): never a blank page.
test('a page whose chunk is gone keeps the header and footer, says so, and offers a reload', async ({ page, browserName }) => {
  await page.route(/\/assets\/Demo-[^/]*\.js$/, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  await page.goto('/');
  await page.locator('.hero').getByRole('link', { name: 'Watch a recovery' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page did not load');
  await expect(page.getByRole('alert')).toContainText('Check your connection, then reload the page. The site may have been updated since this tab opened.');
  await expect(page.locator('header.site')).toBeVisible();
  await expect(page.locator('footer.site')).toBeAttached();
  // another page still draws; back to the landing, it is whole
  await nav(page, 'What is real').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here is a mock-up');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page did not load');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lose the device. Keep the identity.');
  // the button reloads the document: after a redeploy that brings the new build's index.html, and so
  // chunks under new names
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.goForward();
  await page.evaluate(() => { window.__before = true; });
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'reload the page' }).click()]);
  expect(await page.evaluate(() => window.__before)).toBeUndefined();
  // With the same chunk there again (a connection that came back), the page draws. WebKit keeps a
  // chunk that failed in its memory cache across a reload of the same page and does not ask again, so
  // this half holds in Chromium and Firefox; a redeploy's new names are asked for afresh everywhere.
  if (browserName !== 'webkit') await expect(page.locator('[data-ready="true"]')).toBeVisible();
});

test('taken from the keyboard, a page whose chunk is gone takes the focus with its heading', async ({ page }) => {
  await page.route(/\/assets\/Attacks-[^/]*\.js$/, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  await page.goto('/about');
  await nav(page, 'Attack it').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/attacks$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page did not load');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

for (const motion of ['no-preference', 'reduce']) {
  test(`the landing stays whole when a chunk below the fold is gone (${motion === 'reduce' ? 'reduced motion, with the pictograms' : 'motion'})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    const gone = [];
    await page.route(/\/assets\/(AfterStory|Pictogram)-[^/]*\.js$/, (route) => {
      gone.push(route.request().url());
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lose the device. Keep the identity.');
    await expect.poll(() => gone.length).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    // the story, the header and the links on are all still there; only what failed is left out
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lose the device. Keep the identity.');
    await expect(page.locator('#after-story').getByRole('link', { name: 'See the real recovery on Preprod' })).toBeVisible();
    await expect(page.locator('header.site')).toBeVisible();
    await expect(page.getByText('This page did not load')).toHaveCount(0);
  });
}

// The site's JavaScript bundles third-party packages, minified with their licence comments dropped:
// their notices ship as a file of their own, and the footer links it (scripts/notices.mjs).
test('the footer links the third-party notices, which ship as a text file naming every bundled package', async ({ page, request, baseURL }) => {
  await page.goto('/about');
  const link = page.locator('footer.site').getByRole('link', { name: 'third-party licences' });
  await expect(link).toHaveAttribute('href', '/THIRD-PARTY-NOTICES.txt');
  const res = await request.get(new URL('/THIRD-PARTY-NOTICES.txt', baseURL).href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^text\/plain/);
  const text = await res.text();
  // the list the build is checked against (scripts/check-bundle.mjs compares it with the bundle itself)
  expect(BUNDLED).toHaveLength(13);
  for (const name of BUNDLED) {
    expect(text, name).toMatch(new RegExp(`\\n${name.replace(/[/.]/g, '\\$&')}@\\d+\\.\\d+\\.\\d+\\n`));
  }
  expect(text).toContain('/fonts/OFL-Fraunces.txt');
  // The runtime's WASM package states no licence and names a repository that does not resolve: the
  // file says so, and gives its upstream source's licence and a link that does.
  expect(text).toContain('@midnight-ntwrk/onchain-runtime-v3@3.0.0  Apache-2.0 (upstream source; package states none)');
  expect(text).toContain('\nLicence: none stated in its package.json\nUpstream source licence: Apache-2.0 (built from midnightntwrk/midnight-ledger');
  expect(text).toContain('Source: https://github.com/midnightntwrk/midnight-ledger/tree/main/onchain-runtime-wasm');
  expect(text).not.toContain('github.com/midnight-ntwrk/artifacts');
});

// Which packages a build holds is read from its module ids (scripts/check-bundle.mjs builds the site in
// memory and compares them with BUNDLED both ways), so a new import cannot ship without its notice.
test('the notices\' package list is compared with the modules a build holds, both ways', () => {
  test.skip(test.info().project.name !== 'desktop', 'no page: run once');
  expect(packageOf('/r/node_modules/three/build/three.module.js')).toBe('three');
  expect(packageOf('/r/node_modules/@noble/hashes/esm/sha2.js')).toBe('@noble/hashes');
  // a nested dependency is its own package
  expect(packageOf('/r/node_modules/@midnight-ntwrk/compact-runtime/node_modules/object-inspect/index.js?commonjs-es-import')).toBe('object-inspect');
  // the site's own modules and the bundler's helpers are no package
  expect(packageOf('/r/web/src/main.jsx')).toBeNull();
  expect(packageOf('\0vite/preload-helper.js')).toBeNull();
  const ids = BUNDLED.map((n) => `/r/node_modules/${n}/index.js`);
  expect(compareBundled(['/r/web/src/App.jsx', ...ids])).toEqual({ found: [...BUNDLED].sort(), extra: [], missing: [] });
  // an import that pulls in a package with no notice here, and a package no longer bundled
  expect(compareBundled([...ids, '/r/web/node_modules/nanoid/index.browser.js']).extra).toEqual(['nanoid']);
  expect(compareBundled(ids.slice(1)).missing).toEqual([BUNDLED[0]]);
});

// Forced colours (Windows contrast themes) drop backgrounds, box shadows and gradients, and the site
// draws every "this one is current" state with one of them: each is redrawn in system colours.
test('in forced colours, the current page, the chosen numbers, the sheet shown, the step and a passed check still show', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'forced colours are emulated in Chromium only');
  await page.emulateMedia({ forcedColors: 'active' });
  const css = (loc, prop) => loc.evaluate((e, p) => getComputedStyle(e)[p], prop);
  const system = (name) => page.evaluate((c) => {
    const d = document.createElement('div');
    d.style.backgroundColor = c;
    document.body.append(d);
    const v = getComputedStyle(d).backgroundColor;
    d.remove();
    return v;
  }, name);

  // the nav's wick under the current page, and the lockup in the link's colour, not its own beige
  await page.goto('/about');
  const canvas = await system('Canvas');
  expect(await css(page.locator('.nav[aria-current="page"] .wick'), 'backgroundColor')).not.toBe(canvas);
  const footer = page.locator('.footer-lockup svg');
  expect(await css(footer.locator('.lockup-word'), 'fill')).toBe(await css(footer, 'color'));
  expect(await css(footer.locator('.lm-body'), 'stroke')).toBe(await css(footer, 'color'));

  // /kit: the chosen number of guardians and threshold, and the sheet shown
  await page.goto('/kit');
  await expect(page.locator('.kit-page[data-ready="true"]')).toBeVisible();
  const checked = page.locator('.kit-pill input:checked + span').first();
  const unchecked = page.locator('.kit-pill input:not(:checked) + span').first();
  expect(await css(checked, 'backgroundColor')).not.toBe(await css(unchecked, 'backgroundColor'));
  // a fill of its own (Highlight), not the page's, with its text legible on it
  expect(await css(checked, 'backgroundColor')).not.toBe(canvas);
  expect(await css(checked, 'color')).not.toBe(await css(checked, 'backgroundColor'));
  await page.getByRole('button', { name: /^Make (the|new) kits/ }).click();
  await expect(page.locator('.kit-sheet[data-sheet="veto"]')).toBeVisible();
  expect(await css(page.locator('.kit-tab[aria-selected="true"]'), 'textDecorationLine')).toBe('underline');
  expect(await css(page.locator('.kit-tab[aria-selected="false"]').first(), 'textDecorationLine')).toBe('none');

  // /rehearse: the step you are on
  await page.goto('/rehearse');
  await expect(page.locator('.rehearse[data-ready="true"]')).toBeVisible();
  const current = page.locator('.rh-rail .current .rh-num');
  expect(await css(current, 'backgroundColor')).not.toBe(await css(page.locator('.rh-rail .todo .rh-num').first(), 'backgroundColor'));
  expect(await css(current, 'color')).not.toBe(await css(current, 'backgroundColor'));

  // /live: a passed check's mark is a filled disc, not the empty ring of one still running
  await page.route('https://indexer.preprod.midnight.network/**', (route) => route.abort('connectionrefused'));
  await page.routeWebSocket(/^wss:\/\/indexer\.preprod\.midnight\.network\//, (ws) => ws.close());
  await page.goto('/live');
  await expect(page.locator('#check')).toBeVisible();
  await page.evaluate(() => document.querySelector('#check').insertAdjacentHTML('beforeend',
    '<ul class="fc-probe"><li class="lv-check pass"><span class="lv-mark"></span></li><li class="lv-check running"><span class="lv-mark"></span></li></ul>'));
  const marks = page.locator('.fc-probe .lv-mark');
  expect(await css(marks.nth(0), 'backgroundColor')).not.toBe(await css(marks.nth(1), 'backgroundColor'));
});
