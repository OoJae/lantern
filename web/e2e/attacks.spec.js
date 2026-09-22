import { test, expect } from '@playwright/test';
import { expectNoSideScroll } from './helpers.js';

test('one attacker breaks three designs and not the fourth', async ({ page }) => {
  await page.goto('/attacks');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  for (const id of ['1', '2a', '2b']) {
    const row = page.locator(`table.targets:not(.compact) tr[data-target="${id}"]`);
    await expect(row).toHaveAttribute('data-verdict', 'BROKEN');
    await expect(row).toHaveAttribute('data-named', '3');
  }
  const shipped = page.locator('table.targets:not(.compact) tr[data-target="3"]');
  await expect(shipped).toHaveAttribute('data-verdict', 'HELD');
  await expect(shipped).toHaveAttribute('data-named', '0');
  await expect(page.locator('.verdict-line')).toHaveAttribute('data-ok', 'true');
  await expect(page.locator('table.leaks tbody tr')).toHaveCount(16);
  await expectNoSideScroll(page);
});
