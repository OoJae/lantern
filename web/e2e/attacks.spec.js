import { test, expect } from '@playwright/test';
import { expectNoSideScroll, expectNoSeriousA11yIssues, expectFiniteAnimations } from './helpers.js';

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

// ---- the look of /attacks and /about (design-spec "Other pages") -------------------------------------
// No second hue: Hanji ink, Night, Ash, Edge. Ember, the flame, marks only the design that held: its
// verdict's seal and its drawing's lights.
const RGB = {
  hanji: 'rgb(236, 228, 210)', night: 'rgb(9, 10, 15)', ash: 'rgb(148, 142, 131)', edge: 'rgb(104, 102, 97)',
  none: 'rgba(0, 0, 0, 0)',
};
const EMBER = '255, 138, 61';
const OLD_HUES = ['130, 215, 164', '244, 161, 149', '157, 189, 245'];
const settle = (page) => page.evaluate(async () => {
  for (let round = 0; round < 10; round++) {
    const running = document.getAnimations().filter((a) => a.playState !== 'finished');
    if (running.length === 0) return;
    await Promise.all(running.map((a) => a.finished.catch(() => {})));
  }
});
const openAttacks = async (page) => {
  await page.goto('/attacks');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
};
const openAbout = async (page) => {
  await page.goto('/about');
  await expect(page.locator('.recorded .counts dd').first()).toBeVisible();
};
// Every colour an element of the page is drawn in, with where it is.
const colours = (page, scope) => page.locator(scope).evaluate((root) => [root, ...root.querySelectorAll('*')].flatMap((el) => {
  const s = getComputedStyle(el);
  const where = `${el.nodeName.toLowerCase()}.${typeof el.className === 'string' ? el.className : el.getAttribute('class')}`;
  return ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor', 'fill', 'stroke', 'backgroundImage']
    .map((p) => ({ where, prop: p, value: s[p], held: Boolean(el.closest('.card.held .card-art')) }));
}));

test('held is the one filled verdict, its seal holding the one Ember light; broken is outlined, with an open ring', async ({ page }) => {
  await openAttacks(page);
  await settle(page);
  const chips = await page.locator('table.targets:not(.compact) .chip').evaluateAll((els) => els.map((el) => {
    const s = getComputedStyle(el);
    const seal = getComputedStyle(el, '::before');
    const mask = seal.maskImage && seal.maskImage !== 'none' ? seal.maskImage : seal.webkitMaskImage;
    return {
      text: el.textContent, verdict: el.closest('tr').dataset.verdict,
      background: s.backgroundColor, border: s.borderTopColor, color: s.color, light: seal.backgroundImage, mask,
    };
  }));
  expect(chips.map((c) => c.text)).toEqual(['broken', 'broken', 'broken', 'held']);
  for (const c of chips.filter((x) => x.verdict === 'BROKEN')) {
    expect([c.background, c.border, c.color]).toEqual([RGB.none, RGB.edge, RGB.hanji]);
    expect(c.light).not.toContain(EMBER);
    expect(c.mask).toContain('conic-gradient');
  }
  const held = chips.find((c) => c.verdict === 'HELD');
  expect([held.background, held.border, held.color]).toEqual([RGB.hanji, RGB.hanji, RGB.night]);
  expect(held.light).toContain(EMBER);

  // Nothing else on the page is Ember but the held design's drawing, and none of the old state hues is left.
  const drawn = await colours(page, 'section.attacks');
  expect(drawn.filter((c) => c.value.includes(EMBER) && !c.held).map((c) => `${c.prop} of ${c.where}`)).toEqual([]);
  expect(drawn.filter((c) => c.held && c.value.includes(EMBER)).length).toBeGreaterThan(0);
  expect(drawn.filter((c) => OLD_HUES.some((h) => c.value.includes(h))).map((c) => `${c.prop} of ${c.where}`)).toEqual([]);
});

test('each design carries its drawing, under its rule: tagged lanterns for the three that broke, three unnamed lights for the one that held', async ({ page }) => {
  await openAttacks(page);
  const cards = page.locator('.cards .card');
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    const held = await card.evaluate((el) => el.classList.contains('held'));
    const art = card.locator('svg.card-art');
    await expect(art).toHaveAttribute('data-name', held ? 'attacks-held' : 'attacks-named');
    await expect(art).toHaveAttribute('aria-hidden', 'true');
    expect(await card.evaluate((el) => { const s = getComputedStyle(el); return `${s.borderTopStyle} ${s.borderTopColor}`; }))
      .toBe(held ? `solid ${RGB.hanji}` : `dashed ${RGB.edge}`);
    // The names the attacker found, as paper tags: Night on Hanji.
    await expect(card.locator('.named .named-tag')).toHaveCount(held ? 0 : 3);
    for (const tag of await card.locator('.named-tag').all()) {
      expect(await tag.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual([RGB.hanji, RGB.night]);
    }
  }
  await expect(page.locator('.verdict-line')).toHaveText('3 of 4 broken. The one that held is the one Lantern ships.');
  expect(await page.locator('.verdict-line').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Lantern Display');
});

// Side by side, the designs share their rows: each part of a design starts level with the same part of
// its neighbours, however their words wrap. Four to a row from 1080px, two from 640px, one below.
for (const [width, perRow] of [[1440, 4], [1080, 4], [768, 2], [390, 1]]) {
  test(`at ${width}px the designs sit ${perRow} to a row, each part level with its neighbours'`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openAttacks(page);
    const tops = await page.locator('.cards .card').evaluateAll((cards) => cards.map((card) => {
      const y = (el) => (el ? Math.round(el.getBoundingClientRect().top + scrollY) : null);
      const top = (sel) => y(card.querySelector(sel));
      return { card: y(card), art: top('.card-art'), name: top('h2'), leaf: top('.scheme'), what: top('.meta'), tries: top('.families'), named: top('.named') };
    }));
    const rows = [];
    tops.forEach((t, i) => (rows[Math.floor(i / perRow)] ??= []).push(t));
    expect(rows.map((r) => r.length)).toEqual(Array(4 / perRow).fill(perRow));
    for (const row of rows) {
      for (const part of ['card', 'art', 'name', 'leaf', 'what', 'tries', 'named']) {
        const ys = row.map((t) => t[part]).filter((y) => y !== null);
        if (ys.length === 0) continue;
        expect(Math.max(...ys) - Math.min(...ys), `${part} at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
    if (perRow === 1) expect(new Set(tops.map((t) => t.card)).size).toBe(4);
  });
}

test('the leaks are a ladder of severity, each rung in words: high filled, medium outlined in Hanji, low in Ash, benign plain', async ({ page }) => {
  await openAttacks(page);
  const rows = await page.locator('table.leaks tbody tr').evaluateAll((trs) => trs.map((tr) => {
    const sev = tr.querySelector('.sev');
    const s = getComputedStyle(sev);
    return { sev: tr.dataset.sev, text: sev.textContent, rung: tr.classList.contains('rung'), look: [s.backgroundColor, s.borderTopColor, s.color] };
  }));
  const LADDER = ['high', 'med', 'low', 'benign'];
  const LOOK = {
    high: [RGB.hanji, RGB.hanji, RGB.night],
    med: [RGB.none, RGB.hanji, RGB.hanji],
    low: [RGB.none, RGB.ash, RGB.ash],
    benign: [RGB.none, RGB.none, RGB.ash],
  };
  expect(rows).toHaveLength(16);
  const steps = rows.map((r) => LADDER.indexOf(r.sev));
  expect(steps).toEqual([...steps].sort((a, b) => a - b));
  expect(rows.filter((r) => r.rung).map((r) => r.sev)).toEqual(LADDER);
  for (const r of rows) {
    expect(r.text.toLowerCase()).toBe(r.sev);
    expect(r.look, `the ${r.sev} chip`).toEqual(LOOK[r.sev]);
  }
});

test('the verdicts are stamped as they land, once; with reduced motion they are simply there', async ({ page }) => {
  const stamps = () => page.locator('table.targets:not(.compact) .chip').evaluateAll((els) => els.map((el) => {
    const s = getComputedStyle(el, '::before');
    return `${s.animationName} ${s.animationIterationCount}`;
  }));
  await openAttacks(page);
  expect(await stamps()).toEqual(['stamp-ring 1', 'stamp-ring 1', 'stamp-ring 1', 'stamp-seal 1']);
  await expectFiniteAnimations(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAttacks(page);
  expect(await stamps()).toEqual(['none 1', 'none 1', 'none 1', 'none 1']);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState !== 'finished').length)).toBe(0);
});

// Where a table's columns would not fit, each row becomes a card that labels its own values: no table
// scrolls sideways, inside its frame or out of it, and every cell keeps its header for a screen reader.
for (const width of [320, 375, 768, 1024, 1280]) {
  test(`at ${width}px no table scrolls sideways, and every header is still read out`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const overflowing = () => page.locator('.table-wrap, pre.code').evaluateAll((els) => els
      .filter((el) => el.scrollWidth > el.clientWidth)
      .map((el) => `${el.querySelector('table')?.className ?? el.className} by ${el.scrollWidth - el.clientWidth}px`));
    await openAttacks(page);
    expect(await overflowing()).toEqual([]);
    await expect(page.getByRole('columnheader')).toHaveCount(10);
    await expect(page.getByRole('rowheader')).toHaveCount(4);
    await expectNoSideScroll(page);
    await openAbout(page);
    expect(await overflowing()).toEqual([]);
    await expect(page.getByRole('columnheader')).toHaveCount(5);
    await expect(page.getByRole('rowheader')).toHaveCount(3);
    await expectNoSideScroll(page);
  });
}

test('/about: the certificate of the local-chain run arrives after the page, sealed, its figures in mono; the landing never downloads the record', async ({ page }) => {
  const record = [];
  page.on('request', (r) => { if (/\/assets\/local-devnet-[^/]+\.js$/.test(new URL(r.url()).pathname)) record.push(r.url()); });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(record).toEqual([]);

  await openAbout(page);
  expect(record.length).toBeGreaterThan(0);
  const cert = page.getByRole('region', { name: 'Recorded on a local chain' });
  await expect(cert).toContainText(/ran all 74 steps of this story/);
  const seal = cert.locator('svg.recorded-seal');
  await expect(seal).toHaveAttribute('data-state', 'closed');
  await expect(seal).toHaveAttribute('aria-hidden', 'true');
  for (const dd of await cert.locator('.counts dd').all()) {
    expect(await dd.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Lantern Mono');
  }
  // The double Hanji rule, and no green left anywhere on the page.
  expect(await cert.evaluate((el) => getComputedStyle(el, '::before').borderTopColor)).toBe(RGB.hanji);
  const drawn = await colours(page, 'section.about');
  expect(drawn.filter((c) => OLD_HUES.some((h) => c.value.includes(h))).map((c) => `${c.prop} of ${c.where}`)).toEqual([]);
  // The commands' comments are set back in Ash.
  for (const note of await page.locator('pre.code .comment').all()) {
    expect(await note.evaluate((el) => getComputedStyle(el).color)).toBe(RGB.ash);
  }
  await settle(page);
  await expectFiniteAnimations(page);
  await expectNoSeriousA11yIssues(page);
});
