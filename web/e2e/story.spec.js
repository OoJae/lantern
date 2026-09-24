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
