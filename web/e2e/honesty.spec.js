import { test, expect } from '@playwright/test';
import { BANNED, openDemo, expectNoSeriousA11yIssues, expectNoSideScroll } from './helpers.js';

test('the pages that run circuits say exactly what they are', async ({ page }) => {
  await openDemo(page);
  await expect(page.locator('.honesty')).toContainText('no wallet, no chain, no proofs');
  await page.goto('/attacks');
  await expect(page.locator('.honesty')).toContainText('no wallet, no chain, no proofs');
});

for (const path of ['/', '/demo', '/attacks', '/about']) {
  test(`${path}: no overclaiming words, no serious accessibility issue, no side-scroll`, async ({ page }) => {
    if (path === '/demo') {
      await openDemo(page);
      await page.getByRole('button', { name: 'Run to the end' }).click();
      await expect(page.getByTestId('summary')).toBeVisible();
    } else {
      await page.goto(path);
      if (path === '/attacks') await expect(page.locator('[data-ready="true"]')).toBeVisible();
    }
    expect(await page.locator('body').innerText()).not.toMatch(BANNED);
    await expectNoSeriousA11yIssues(page);
    await expectNoSideScroll(page);
  });
}
