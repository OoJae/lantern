import { test, expect } from '@playwright/test';
import { BANNED, openDemo, expectNoSeriousA11yIssues, expectNoSideScroll, expectFiniteAnimations, watchCsp } from './helpers.js';

test('the pages that run circuits say exactly what they are', async ({ page }) => {
  await openDemo(page);
  await expect(page.locator('.honesty')).toContainText('no wallet, no chain, no proofs');
  await page.goto('/attacks');
  await expect(page.locator('.honesty')).toContainText('no wallet, no chain, no proofs');
});

for (const path of ['/', '/demo', '/attacks', '/about', '/brand', '/nope']) {
  test(`${path}: no overclaiming words, no serious accessibility issue, no side-scroll, no endless animation, no CSP violation`, async ({ page }) => {
    const noCspViolations = await watchCsp(page);
    if (path === '/demo') {
      await openDemo(page);
      await page.getByRole('button', { name: 'Run to the end' }).click();
      await expect(page.getByTestId('summary')).toBeVisible();
    } else {
      await page.goto(path);
      if (path === '/attacks') await expect(page.locator('[data-ready="true"]')).toBeVisible();
      // the brand kit loads as a chunk of its own: read it once it is there
      if (path === '/brand') await expect(page.getByRole('heading', { level: 1, name: 'Brand kit' })).toBeVisible();
      // so does the page for an address with none
      if (path === '/nope') await expect(page.getByRole('heading', { level: 1, name: 'Nothing here' })).toBeVisible();
    }
    expect(await page.locator('body').innerText()).not.toMatch(BANNED);
    await expectFiniteAnimations(page);
    await expectNoSeriousA11yIssues(page);
    await expectNoSideScroll(page);
    await noCspViolations();
  });
}
