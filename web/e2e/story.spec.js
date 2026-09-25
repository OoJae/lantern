import { test, expect } from '@playwright/test';
import { openDemo, expectNoSideScroll } from './helpers.js';

test('the whole story runs in the browser, exactly as expected', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await expect(page.getByTestId('summary')).toContainText('Every step went exactly as expected.');
  await expect(page.getByTestId('summary')).toContainText('74 steps');

  // Every secret any circuit call read: seen privately, absent publicly.
  const boxes = page.locator('.absent li');
  await expect(boxes).toHaveCount(7);
  for (const li of await boxes.all()) await expect(li).toHaveAttribute('data-ticked', 'true');

  // The ledger pane carries full values; assert on those, not the shortened text.
  const ids = page.locator('.ledger .values li[data-retired]');
  await expect(ids).toHaveCount(3);                                // Hana, Minji, Hana's successor
  await expect(page.locator('.ledger li[data-retired="true"]')).toHaveCount(1);
  for (const li of await ids.all()) expect(await li.getAttribute('data-full')).toMatch(/^[0-9a-f]{64}$/);
  const recoveries = page.locator('.ledger li[data-approvals]');
  await expect(recoveries).toHaveCount(2);
  await expect(page.locator('.ledger li[data-vetoed="true"]')).toHaveAttribute('data-approvals', '1');
  await expect(page.locator('.ledger li[data-vetoed="false"]')).toHaveAttribute('data-approvals', '2');

  // The independent DApp: four epochs sealed, one committee rotation, four gated actions.
  await expect(page.locator('.host [data-count="sealedEpochs"] dd')).toHaveText('4');
  await expect(page.locator('.host [data-count="committeeGen"] dd')).toHaveText('1');
  await expect(page.locator('.host [data-count="hostActions"] dd')).toHaveText('4');
  for (const li of await page.locator('.host li[data-epoch]').all()) expect(await li.getAttribute('data-full')).toMatch(/^[0-9a-f]+$/);
  await expectNoSideScroll(page);
});

test('stepping by keyboard, and reviewing a finished beat', async ({ page }) => {
  await openDemo(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.step')).toHaveCount(3);
  await expect(page.locator('.step[data-outcome="accepted"]')).toHaveCount(3);

  await page.getByRole('button', { name: 'Run to the end' }).click();
  await page.getByRole('button', { name: /Jihoon turns/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jihoon turns');
  for (const msg of [
    'adding a guardian requires the veto secret',
    'not the device the guardians approved',
    'rotating the guardian set requires the veto secret',
    'veto secret does not open this identity\'s veto commitment',
    'recovery vetoed',
  ]) await expect(page.locator('.step[data-outcome="refused"]', { hasText: msg })).toHaveCount(1);
  await expect(page.locator('.step[data-ok="false"]')).toHaveCount(0);
});

test('the clock step says it is simulated', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await page.getByRole('button', { name: /Seventy-two hours/ }).click();
  await expect(page.locator('.step.clock')).toContainText('simulated clock');
  await expect(page.locator('.step.clock')).toContainText('72 h 10 min');
});

test('each step also taken on the local chain says where, labelled as a separate recorded run', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await page.getByRole('button', { name: /Seventy-two hours/ }).click();
  const finalize = page.locator('.step[data-step="8.11"] .recorded-chip');
  await expect(finalize).toHaveAttribute('data-recorded', 'accepted');
  await expect(finalize).toContainText(/recorded \d{4}-\d{2}-\d{2} on a local chain: block \d+ · proved in [\d.]+ s · fee paid by a sponsor/);
  const sponsorRefused = page.locator('.step[data-step="8.10"] .recorded-chip');
  await expect(sponsorRefused).toHaveText(/refused the same way, before any transaction/);
});

test('a deep link opens the story at a beat', async ({ page }) => {
  await page.goto('/demo?beat=7');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jihoon turns');
  await expect(page.locator('.step')).toHaveCount(1);
});

test('autoplay steps on its own, and pauses', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Autoplay' }).click();
  await expect(page.locator('.step')).toHaveCount(2, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  const n = await page.locator('.step').count();
  await page.waitForTimeout(2000);
  await expect(page.locator('.step')).toHaveCount(n);
});

// The demo draws its states without a second hue: Hanji ink, Night paper, Ash and Edge. Ember, the
// flame, marks one thing only: the lock, a finalizeRecovery the contract accepted (design-spec "Demo
// states").
const RGB = {
  hanji: 'rgb(236, 228, 210)', night: 'rgb(9, 10, 15)', ash: 'rgb(148, 142, 131)', edge: 'rgb(104, 102, 97)',
  rib: 'rgb(44, 45, 53)', ember: 'rgb(255, 138, 61)', none: 'rgba(0, 0, 0, 0)',
};
// Wait until every animation on the page has finished, as the accessibility check does.
const settle = (page) => page.evaluate(async () => {
  for (let round = 0; round < 10; round++) {
    const running = document.getAnimations().filter((a) => a.playState !== 'finished');
    if (running.length === 0) return;
    await Promise.all(running.map((a) => a.finished.catch(() => {})));
  }
});
const chipColours = (page) => page.locator('.step .chip').evaluateAll((els) => els.map((el) => {
  const s = getComputedStyle(el);
  return { text: el.textContent, color: s.color, background: s.backgroundColor, border: s.borderTopColor };
}));
const rule = (step) => step.evaluate((el) => {
  const s = getComputedStyle(el, '::before');
  return `${s.borderLeftStyle} ${s.borderLeftColor}`;
});

test('the states have no second hue, and the lock is the one Ember chip', async ({ page }) => {
  await page.goto('/demo?beat=8');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Play this beat' }).click();
  const lock = page.locator('.step[data-step="8.11"]');
  await expect(lock).toHaveAttribute('data-circuit', 'finalizeRecovery');
  await expect(lock).toHaveAttribute('data-outcome', 'accepted');
  await settle(page);

  const chips = await chipColours(page);
  expect(chips.length).toBeGreaterThan(8);
  for (const c of chips) {
    expect([RGB.hanji, RGB.night, RGB.ash], `text colour of “${c.text}”`).toContain(c.color);
    expect([RGB.none, RGB.hanji, RGB.ember], `fill of “${c.text}”`).toContain(c.background);
    expect([RGB.none, RGB.hanji, RGB.edge, RGB.ember], `outline of “${c.text}”`).toContain(c.border);
  }
  expect(chips.filter((c) => c.background === RGB.ember).map((c) => c.text)).toEqual(['accepted']);
  await expect(lock.locator('.chip.ok')).toHaveCSS('background-color', RGB.ember);

  // Each outcome's rule: accepted solid Hanji, refused dashed Ash, the clock dotted Hanji, the lock Ember.
  expect(await rule(page.locator('.step[data-step="8.2"]'))).toBe(`dashed ${RGB.ash}`);
  expect(await rule(page.locator('.step.clock'))).toBe(`dotted ${RGB.hanji}`);
  expect(await rule(page.locator('.step.offchain').first())).toBe(`solid ${RGB.rib}`);
  expect(await rule(lock)).toBe(`solid ${RGB.ember}`);
  for (const step of await page.locator('.step[data-outcome="accepted"]:not([data-step="8.11"])').all()) {
    expect(await rule(step)).toBe(`solid ${RGB.hanji}`);
  }
});

test('the clock rolls to its new time and leaves only that time on screen', async ({ page }) => {
  await page.goto('/demo?beat=8');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const time = page.locator('.clock .time');
  const before = await time.textContent();
  await page.getByRole('button', { name: 'Next step' }).click();
  await page.getByRole('button', { name: /simulated clock/ }).click();
  await expect(page.locator('.step.clock')).toContainText('72 h 10 min');
  await expect(time).not.toHaveText(before);
  // The time that was shown is decoration while it rolls away, and is gone once it has.
  await settle(page);
  await expect(page.locator('.clock .time-was')).toHaveCount(0);
  await expect(page.locator('.clock .time')).toHaveCount(1);
  // The 72-tick ring, one tick an hour of the timelock, is full: its fill has no dash left to draw.
  await expect(page.locator('.clock-arc')).toHaveAttribute('aria-hidden', 'true');
  expect(Number(await page.locator('.clock-arc .arc-fill').getAttribute('stroke-dashoffset'))).toBe(0);
  await page.getByRole('button', { name: 'Start again, new secrets' }).click();
  await expect(time).toHaveText(before);
});

test('with reduced motion, steps, seals, the clock and the lock arrive at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/demo?beat=8');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Play this beat' }).click();
  await expect(page.locator('.step[data-step="8.11"]')).toBeVisible();
  // Only a button's colour may still be easing (it was disabled while the beat ran).
  const moving = await page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState !== 'finished' && !a.effect?.target?.closest?.('button'))
    .map((a) => `${a.animationName || a.transitionProperty} on ${a.effect?.target?.className}${a.effect?.pseudoElement ?? ''}`));
  expect(moving).toEqual([]);
  expect(await page.locator('.step[data-step="8.11"] .chip.ok').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(RGB.ember);
  await expect(page.locator('.clock .time-was')).toBeHidden();
  await expect(page.locator('.clock .time')).toBeVisible();
});

// The attacker's step carries the four designs' results: on a phone each design is a card, so the
// table never hides a column off its edge; the design that held is the one Ember light in it.
test('the attack step’s table of designs fits a phone, the held design’s seal lit', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openDemo(page);
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await expect(page.getByTestId('summary')).toBeVisible();
  const rail = page.locator('.beats button');
  for (let i = 0; i < await rail.count(); i++) {
    await rail.nth(i).click();
    if (await page.locator('.inline-attack').count()) break;
  }
  const table = page.locator('.inline-attack .table-wrap');
  await expect(table).toBeVisible();
  expect(await table.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await expect(table.getByRole('columnheader')).toHaveCount(4);
  const held = table.locator('tr[data-verdict="HELD"] .chip.ok');
  expect(await held.evaluate((el) => getComputedStyle(el, '::before').backgroundImage)).toContain('255, 138, 61');
  await expectNoSideScroll(page);
});

// Following the story step by step, as the video does at 1280×720: each press keeps the page with the
// reader (the beat rail scrolls sideways only, never the page back up to it), and what arrives lands
// in view, clear of the sticky header, with the controls still at hand.
const press = (page) => page.locator('.controls .primary').evaluate((b) => b.click()); // no scrolling first
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const inView = (loc) => loc.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return r.top >= document.querySelector('header.site').getBoundingClientRect().bottom - 1 && r.bottom <= window.innerHeight + 1;
});
const railCentred = (page) => page.locator('.beats').evaluate((rail) => {
  const r = rail.getBoundingClientRect();
  const p = rail.querySelector('[aria-current="step"]').getBoundingClientRect();
  const end = rail.scrollWidth - rail.clientWidth;
  return Math.abs((p.left + p.width / 2) - (r.left + r.width / 2)) <= 1
    || (rail.scrollLeft <= 1 && p.left + p.width / 2 < r.left + r.width / 2)
    || (rail.scrollLeft >= end - 1 && p.left + p.width / 2 > r.left + r.width / 2);
});

for (const [width, height] of [[1280, 720], [390, 844]]) {
  test(`at ${width}×${height}, each step taken lands in view and the page never jumps back to the beat rail`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/demo?beat=7');
    await expect(page.locator('[data-step="7.1"]')).toBeVisible();
    await frames(page);
    expect(await railCentred(page)).toBe(true);
    for (let n = 2; n <= 5; n++) {
      await page.locator('.steps > li').last().evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const before = await page.evaluate(() => window.scrollY);
      await press(page);
      await expect(page.locator('.steps > li')).toHaveCount(n);
      await frames(page);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(before);
      expect(await inView(page.locator('.steps > li').last())).toBe(true);
      expect(await railCentred(page)).toBe(true);
    }
    // A new beat arrives with its title in view.
    await page.getByRole('button', { name: 'Run to the end' }).click();
    await expect(page.getByTestId('summary')).toBeVisible();
    await frames(page);
    expect(await inView(page.locator('.beat-head h1'))).toBe(true);
    expect(await railCentred(page)).toBe(true);
  });
}

test('following beat 8 step by step at 1280×720, the lock plays in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/demo?beat=8');
  await expect(page.locator('[data-step="8.1"]')).toBeVisible();
  const lock = page.locator('.step[data-step="8.11"]');
  for (let i = 0; i < 12 && !(await lock.count()); i++) {
    const n = await page.locator('.steps > li').count();
    await press(page);
    await expect(page.locator('.steps > li')).toHaveCount(n + 1);
  }
  await frames(page);
  expect(await inView(lock)).toBe(true);
  expect(await inView(lock.locator('.chip.ok'))).toBe(true);
  expect(await inView(page.locator('.controls'))).toBe(true);
});

test('a reader who has scrolled away from the story is left where they are', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openDemo(page);
  await page.getByRole('button', { name: 'Autoplay' }).click();
  await expect(page.locator('.step')).toHaveCount(1, { timeout: 10_000 });
  await frames(page); // the first step has landed, and been kept in view
  await page.locator('#break').evaluate((s) => s.scrollIntoView());
  const panelTop = () => page.locator('#break').evaluate((s) => s.getBoundingClientRect().top);
  const before = await panelTop();
  // From here, count every scroll the page asks for.
  await page.evaluate(() => {
    window.scrollsAsked = 0;
    const own = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(...args) { window.scrollsAsked++; return own.apply(this, args); };
  });
  await expect(page.locator('.step')).toHaveCount(3, { timeout: 10_000 });
  await frames(page);
  // The story moved on twice; the page asked for no scroll, and left the reader at the panel.
  expect(await page.evaluate(() => window.scrollsAsked)).toBe(0);
  await expect(page.locator('#break')).toBeInViewport();
  // Where the engine anchors the scroll to what is on screen, the panel is held still: the steps that
  // landed above it (the story's grid is never the anchor, though its tail is under the header) did
  // not push it down the screen.
  // WebKit reports overflow-anchor but does not always make the adjustment for a list that grows
  // above the reader (it did in some runs, not in others): the exact hold is checked where it is kept.
  if (browserName !== 'webkit' && await page.evaluate(() => CSS.supports('overflow-anchor', 'auto'))) {
    expect(Math.abs((await panelTop()) - before)).toBeLessThanOrEqual(2);
    await expect(page.locator('.steps > li').last()).not.toBeInViewport();
  }
});

test('at the end of a beat the sticky state column stays clear of the header', async ({ page }) => {
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/demo?beat=8');
    await expect(page.locator('[data-step="8.1"]')).toBeVisible();
    await page.getByRole('button', { name: 'Play this beat' }).click();
    await expect(page.locator('[data-step="8.11"]')).toBeVisible();
    await settle(page);
    for (const above of [24, 84]) {
      await page.locator('.hint').evaluate((h, a) => window.scrollBy(0, h.getBoundingClientRect().bottom - window.innerHeight + a), above);
      const header = await page.locator('header.site').evaluate((h) => h.getBoundingClientRect().bottom);
      const title = await page.locator('.panel.clock h2').evaluate((h) => h.getBoundingClientRect().top);
      expect(title, `${width}×${height}, the hint ${above}px above the fold`).toBeGreaterThanOrEqual(header);
    }
  }
});

test('a recorded chip keeps each figure with its unit, on the measure of the step’s words', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await page.getByRole('button', { name: /Seventy-two hours/ }).click();
  await expect(page.locator('[data-step="8.11"] .recorded-chip .nb'))
    .toHaveText([/^block \d+ ·$/, /^proved in [\d.]+ s ·$/, 'fee paid by a sponsor']);
  for (const width of [320, 360, 390, 640, 1080, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const r = await page.locator('.step .recorded-chip').evaluateAll((chips) => ({
      broken: chips.flatMap((c) => [...c.querySelectorAll('.nb')]
        .filter((s) => new Set([...s.getClientRects()].map((q) => Math.round(q.top))).size > 1).map((s) => s.textContent)),
      spilling: chips.filter((c) => c.scrollWidth > c.clientWidth).length,
      widths: new Set(chips.map((c) => Math.round(c.getBoundingClientRect().width))).size,
    }));
    expect(r.broken, `${width}px`).toEqual([]);
    expect(r.spilling, `${width}px`).toBe(0);
    expect(r.widths, `${width}px: one measure for every chip`).toBe(1);
  }
  await expectNoSideScroll(page);
});

// axe cannot measure the rail (each pill's thread overlaps it and it reports them incomplete), so its
// colours are checked here: every pill's words and numeral at 4.5:1 or better, in every state.
test('the beat rail keeps its contrast in every state, and the epilogue’s mark is not read out', async ({ page }) => {
  await page.goto('/demo?beat=5');
  await expect(page.locator('.steps > li')).toHaveCount(1);
  await settle(page);
  const measure = () => page.locator('.beats .beat').evaluateAll((pills) => {
    const rgb = (s) => s.match(/[\d.]+/g).map(Number);
    const opaque = (c, under) => (c.length === 4 && c[3] === 0 ? under : c.slice(0, 3));
    const lum = (c) => {
      const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
    const NIGHT = [9, 10, 15];
    return pills.map((p) => {
      const num = p.querySelector('.num');
      const bg = opaque(rgb(getComputedStyle(p).backgroundColor), NIGHT);
      const numBg = opaque(rgb(getComputedStyle(num).backgroundColor), bg);
      return { state: p.className, words: ratio(rgb(getComputedStyle(p).color), bg), numeral: ratio(rgb(getComputedStyle(num).color), numBg) };
    });
  });
  const pills = await measure();
  expect(new Set(pills.map((p) => p.state.replace('beat ', '')))).toEqual(new Set(['done', 'current', 'todo']));
  for (const p of pills) {
    expect(p.words, `${p.state}: words`).toBeGreaterThanOrEqual(4.5);
    expect(p.numeral, `${p.state}: numeral`).toBeGreaterThanOrEqual(4.5);
  }
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Epilogue', exact: true })).toHaveAttribute('aria-current', 'step');
  await settle(page);
  for (const p of await measure()) expect(p.words, `${p.state}: words`).toBeGreaterThanOrEqual(4.5);
});
