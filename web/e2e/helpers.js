import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

// Words the site must never use about itself: it runs no chain and makes no proofs.
export const BANNED = /\bon-chain\b|\bsubmitted\b|verified proof|\blive\b/i;

export async function openDemo(page) {
  await page.goto('/demo');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
}

export async function expectNoSeriousA11yIssues(page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
}

export async function expectNoSideScroll(page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}
