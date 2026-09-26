import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

// Words the site must never use about itself: it runs no chain and makes no proofs.
export const BANNED = /\bon-chain\b|\bsubmitted\b|verified proof|\blive\b/i;

// A device's six fingerprint words and a kit's words and check words are drawn at random from the
// BIP-39 list, which has "live" in it: data, not claims.
export const WORD_LISTS = '.fp-words, .kit-grid, .kit-cws';

/**
 * The page's own words, as a reader meets them, for the scan against BANNED: every text node that is
 * drawn (screen-reader text included; closed details, hidden tabs and display: none left out, as
 * innerText leaves them), except the random word lists above and what is typed into a form field. A
 * textarea's text node is its value, which React writes there from what the visitor typed (a veto
 * card's random words, typed into "Check your backup"): never the site's own words. Joined by single
 * spaces, so a phrase split across elements is still one phrase.
 */
export function pageCopy(page) {
  return page.evaluate((skip) => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest(`${skip}, script, style, template, textarea`)) continue;
      if (!el.checkVisibility()) continue;
      out.push(n.data);
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }, WORD_LISTS);
}

export async function openDemo(page) {
  await page.goto('/demo');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
}

export async function expectNoSeriousA11yIssues(page) {
  // Measure the settled page: a card still fading in has, for a moment, partial opacity
  // and so lower contrast. Firefox runs axe fast enough to catch that; the page itself is fine.
  // A transition replaced mid-flight (a button's hover colour as it becomes disabled) is cancelled,
  // and its `finished` rejects: it is settled all the same. Look again for any that replaced it.
  await page.evaluate(async () => {
    for (let round = 0; round < 10; round++) {
      const running = document.getAnimations().filter((a) => a.playState !== 'finished');
      if (running.length === 0) return;
      await Promise.all(running.map((a) => a.finished.catch(() => {})));
    }
  });
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
}

export async function expectNoSideScroll(page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}

// A jump to #break stops below the sticky header, and not far below it: 0 to 40px.
export async function landsClear(page) {
  await expect(page.locator('#break')).toBeInViewport();
  const header = await page.locator('header.site').evaluate((h) => h.getBoundingClientRect().bottom);
  const panel = await page.locator('#break').evaluate((s) => s.getBoundingClientRect().top);
  expect(panel).toBeGreaterThanOrEqual(header);
  expect(panel - header).toBeLessThan(40);
}

// Every running animation ends. An infinite CSS or Web Animations loop, or one driven by a scroll
// timeline, never finishes: expectNoSeriousA11yIssues would wait on it for ever. Ambient motion
// belongs to requestAnimationFrame, which getAnimations() does not see.
export async function expectFiniteAnimations(page) {
  const endless = await page.evaluate(() => document.getAnimations()
    .filter((a) => a.effect?.getTiming().iterations === Infinity || (a.timeline && a.timeline !== document.timeline))
    .map((a) => {
      const t = a.effect?.target;
      const where = t ? `${t.nodeName.toLowerCase()}${t.className && typeof t.className === 'string' ? `.${t.className.trim().split(/\s+/).join('.')}` : ''}` : 'no target';
      return `${a.animationName || a.transitionProperty || a.id || 'animation'} on ${where}`;
    }));
  expect(endless, 'animations that never finish').toEqual([]);
}

// Collects Content-Security-Policy violations from every document the page loads, from before its
// first script runs. Call it before the first goto; await the returned function to assert none.
export async function watchCsp(page) {
  const seen = [];
  await page.exposeFunction('__lanternCspViolation', (v) => { seen.push(v); });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__lanternCspViolation(`${e.effectiveDirective}: ${e.blockedURI || 'inline'} at ${e.sourceFile || document.URL}:${e.lineNumber}`);
    });
  });
  return async () => {
    // A report is dispatched as a task: let any queued one arrive first.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
    expect(seen, 'Content-Security-Policy violations').toEqual([]);
  };
}

// WCAG 1.4.12 (Text Spacing): the spacing a reader may set with a bookmarklet or an extension. Added
// through the CSSOM, as a rule in one of the site's own sheets: the CSP (style-src 'self') blocks a
// <style> element, not the CSSOM.
export async function withTextSpacing(page) {
  await page.evaluate(() => {
    const sheet = [...document.styleSheets].find((s) => { try { return s.cssRules.length >= 0; } catch { return false; } });
    for (const rule of [
      '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }',
      'p { margin-bottom: 2em !important; }',
    ]) sheet.insertRule(rule, sheet.cssRules.length);
  });
}
