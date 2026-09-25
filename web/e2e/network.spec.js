// The honesty strip promises: once loaded, the page makes no network requests. Test it.
import { test, expect } from '@playwright/test';
import { openDemo } from './helpers.js';

test('the landing page loads no WASM: the runtime is only fetched by pages that run circuits', async ({ page }) => {
  const wasm = [];
  page.on('request', (r) => { if (r.url().endsWith('.wasm')) wasm.push(r.url()); });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(wasm).toEqual([]);
});

test('every request / makes is same-origin', async ({ page, baseURL }) => {
  const origins = new Set();
  page.on('request', (r) => origins.add(new URL(r.url()).origin));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect([...origins]).toEqual([new URL(baseURL).origin]);
});

test('/demo makes no request after it has loaded, through the whole story', async ({ page }) => {
  await openDemo(page);
  await page.waitForLoadState('networkidle');
  const after = [];
  page.on('request', (r) => after.push(r.url()));
  await page.getByRole('button', { name: 'Next step' }).click();
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await expect(page.getByTestId('summary')).toBeVisible();
  await page.getByRole('button', { name: /The attacker reads the ledger/ }).click();
  await page.getByRole('button', { name: 'Start again, new secrets' }).click();
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await expect(page.getByTestId('summary')).toBeVisible();
  expect(after).toEqual([]);
});

test('every request /demo makes is same-origin', async ({ page, baseURL }) => {
  const origins = new Set();
  page.on('request', (r) => origins.add(new URL(r.url()).origin));
  await openDemo(page);
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await expect(page.getByTestId('summary')).toBeVisible();
  expect([...origins]).toEqual([new URL(baseURL).origin]);
});

// A face first used mid-story would be fetched mid-story. Every face that has a file is loaded by
// the time the demo is ready. The metric-matched fallbacks (" Fallback") name only local() fonts:
// they fetch nothing, and whether one was needed before the files arrived depends on the machine.
test('by the time /demo is ready, every font file is loaded', async ({ page }) => {
  await openDemo(page);
  // Some engines keep the quotes the stylesheet wrote around a family name.
  const faces = await page.evaluate(() => [...document.fonts].map((f) => ({ face: `${f.family.replace(/^["']|["']$/g, '')} ${f.style}`, status: f.status })));
  const files = faces.filter((f) => !/ Fallback /.test(f.face));
  expect(files.map((f) => f.face).sort()).toEqual([
    'Lantern Display italic', 'Lantern Display normal', 'Lantern KR normal', 'Lantern Mono normal', 'Lantern Sans normal',
  ]);
  expect(files.filter((f) => f.status !== 'loaded')).toEqual([]);
});
