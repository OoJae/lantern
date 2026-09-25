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
