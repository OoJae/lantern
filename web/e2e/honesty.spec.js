import { test, expect } from '@playwright/test';
import { BANNED, openDemo, expectNoSeriousA11yIssues, expectNoSideScroll, expectFiniteAnimations, pageCopy, watchCsp } from './helpers.js';

test('the pages that run circuits say exactly what they are', async ({ page }) => {
  await openDemo(page);
  await expect(page.locator('.honesty')).toContainText('no wallet, no chain, no proofs');
  await page.goto('/attacks');
  await expect(page.locator('.honesty')).toContainText('no wallet, no chain, no proofs');
  await page.goto('/rehearse');
  await expect(page.locator('.honesty')).toContainText('no wallet, no chain, no proofs');
});

for (const path of ['/', '/demo', '/attacks', '/about', '/brand', '/live', '/rehearse', '/kit', '/nope']) {
  test(`${path}: no overclaiming words, no serious accessibility issue, no side-scroll, no endless animation, no CSP violation`, async ({ page }) => {
    const noCspViolations = await watchCsp(page);
    if (path === '/live') {
      // Here with Preprod's indexer out of reach, so the run needs no network: the page shows the
      // records and says it could not read the chain (e2e/live.spec.js reads it, recorded).
      await page.route('https://indexer.preprod.midnight.network/**', (route) => route.abort('connectionrefused'));
      await page.routeWebSocket(/^wss:\/\/indexer\.preprod\.midnight\.network\//, (ws) => ws.close());
      await page.goto(path);
      await expect(page.locator('.lv-reach')).toContainText('The indexer could not be reached.');
    } else if (path === '/demo') {
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
      // and the two that load the contract say so until it is in
      if (path === '/rehearse') await expect(page.locator('.rehearse[data-ready="true"]')).toBeVisible();
      if (path === '/kit') await expect(page.locator('.kit-page[data-ready="true"]')).toBeVisible();
    }
    expect(await pageCopy(page)).not.toMatch(BANNED);
    await expectFiniteAnimations(page);
    await expectNoSeriousA11yIssues(page);
    await expectNoSideScroll(page);
    await noCspViolations();
  });
}
