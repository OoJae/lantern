// Moving between pages. A link in the app changes the page in place, carrying the light across
// (a view transition, where the browser has them and motion is welcome): the header is the same
// element throughout, the new page starts at its top, and every animation of the change ends.
// Back, forward and in-page hash links are instant.
import { test, expect } from '@playwright/test';
import { landsClear, expectFiniteAnimations } from './helpers.js';

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
