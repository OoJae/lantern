import { test, expect } from '@playwright/test';
import { openDemo, expectNoSideScroll } from './helpers.js';

test('the whole story runs in the browser, exactly as expected', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await expect(page.getByTestId('summary')).toContainText('Every step went exactly as expected.');
  await expect(page.getByTestId('summary')).toContainText('39 steps');

  // Every secret any proof read: seen privately, absent publicly.
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
