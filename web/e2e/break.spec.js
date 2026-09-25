// "Try to break it": every attack the panel offers, run against the compiled contract in the
// browser. Each refusal is asserted by the contract's exact assert message.
import { test, expect } from '@playwright/test';
import { BANNED, openDemo, expectNoSeriousA11yIssues, expectNoSideScroll, landsClear } from './helpers.js';

// The contract's own messages (contracts/src/lantern.compact), as the story expects them too.
const REFUSED = {
  tamper: 'reconstructed secret does not open idCommit',
  otherPhone: 'not the device the guardians approved',
  early: 'timelock has not elapsed',
  guessVeto: 'veto secret does not open this identity\'s veto commitment',
  twice: 'guardian already approved',
  lone: 'not enough approvals',
};
const TRIES = [
  ['tamper', 'Flip the byte and finalize', 'finalizeRecovery'],
  ['otherPhone', 'Finalize from another phone', 'finalizeRecovery'],
  ['early', 'Finalize at 71 hours', 'finalizeRecovery'],
  ['guessVeto', 'Veto with a guess', 'vetoRecovery'],
  ['twice', 'Approve a second time', 'approveRecovery'],
  ['lone', 'Finalize with one approval', 'finalizeRecovery'],
];

const NAME = { seoyeon: 'Seo-yeon', mum: 'Mum' };
const card = (page, key) => page.locator(`.try[data-try="${key}"]`);
const flip = (b) => (0xff ^ parseInt(b, 16)).toString(16).padStart(2, '0').toUpperCase();

// The world's two real shares, as 32 hex bytes each, read out of the panel's own state through
// React's internals. No text or attribute on the page carries them: the test needs them only to
// know which values must never show.
const trueShares = (page) => page.locator('.breakit').evaluate((el) => {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  for (let f = el[key]; f; f = f.return) {
    for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
      const p = h.memoizedState?.current?.main?.p;
      if (p) return Object.fromEntries(['seoyeon', 'mum'].map((g) => [g, p[g].share.y.toString(16).padStart(64, '0').match(/../g)]));
    }
  }
  return null;
});

// Every text and attribute value in the panel, as the strings a visitor or a script could read.
const panelStrings = (page) => page.locator('.breakit').evaluate((root) => {
  const out = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) out.push(walk.currentNode.data);
  for (const el of [root, ...root.querySelectorAll('*')]) for (const a of el.attributes) out.push(a.value);
  for (const input of root.querySelectorAll('input')) out.push(input.value);
  return out;
});
// The two-digit hex numbers standing alone in those strings: how a byte would show.
const hexBytes = (strings) => new Set(strings
  .flatMap((s) => s.match(/(?<![0-9a-z])[0-9a-f]{2}(?![0-9a-z])/gi) ?? []).map((t) => t.toLowerCase()));

async function expectRefused(result, key, circuit) {
  await expect(result).toHaveAttribute('data-outcome', 'refused');
  await expect(result).toHaveAttribute('data-message', REFUSED[key]);
  await expect(result.locator('.chip.no')).toHaveText(`refused: “${REFUSED[key]}”`);
  await expect(result).toHaveAttribute('data-circuit', circuit);
  await expect(result.locator('.circuit')).toHaveText(circuit);
  await expect(result).toHaveAttribute('data-ok', 'true');
  await expect(result).toContainText('Public record: unchanged.');
}

async function runEveryAttack(page) {
  for (const [key, button, circuit] of TRIES) {
    await card(page, key).getByRole('button', { name: button }).click();
    await expectRefused(card(page, key).locator('.try-result'), key, circuit);
    // A screen reader hears the verdict, from that card alone.
    await expect(card(page, key).locator('[role="status"]')).toHaveText(`${circuit} refused: “${REFUSED[key]}”.`);
    await expect(page.locator('.breakit [role="status"]:not(:empty)')).toHaveCount(1);
  }
}

test('every attack is refused with the contract’s own message, and the honest control is accepted', async ({ page }) => {
  await openDemo(page);
  const panel = page.locator('.breakit');
  await expect(panel).toHaveAttribute('data-world', 'none');
  await expect(page.locator('.try-world')).toContainText('The main world is not built yet.');

  await runEveryAttack(page);
  await expect(panel).toHaveAttribute('data-world', 'built');
  await expect(page.locator('.try-world [data-fact="approvals"] dd')).toHaveText('2 of 2');
  await expect(page.locator('.try-world [data-fact="timelock"] dd')).toHaveText('over');

  // The two other worlds say what was measured in them, each differing from the first in one thing.
  const early = card(page, 'early').locator('.try-result');
  await expect(early.locator('.say')).toContainText('In a second world, 71 h after the recovery opened,');
  await expect(early.locator('.facts')).toHaveText('Measured in the second world before the call: approvals 2 of 2 · timelock 1 h 10 min to go.');
  await expect(card(page, 'lone').locator('.try-result .facts'))
    .toHaveText('Measured in the third world before the call: approvals 1 of 2 · timelock over.');
  await expect(card(page, 'tamper').locator('.try-result .facts')).toHaveCount(0);

  // The other guardian who approved is refused the same way.
  const twice = card(page, 'twice');
  await twice.getByRole('radio', { name: 'Mum' }).check();
  await twice.getByRole('button', { name: 'Approve a second time' }).click();
  await expect(twice.locator('.try-result .say')).toContainText('Mum approves Hana’s recovery again');
  await expectRefused(twice.locator('.try-result'), 'twice', 'approveRecovery');

  // The control: the same world, the real shares, the approved phone.
  const honest = card(page, 'honest');
  await honest.getByRole('button', { name: 'Finalize honestly' }).click();
  const result = honest.locator('.try-result');
  await expect(result).toHaveAttribute('data-outcome', 'accepted');
  await expect(result).toHaveAttribute('data-ok', 'true');
  await expect(result.locator('.circuit')).toHaveText('finalizeRecovery');
  await expect(result.locator('.chip.ok')).toHaveText('accepted');
  for (const label of ['device key', 'identity secret', 'identity salt']) {
    await expect(result).toContainText(new RegExp(`Absent from the public record: .*${label}`));
  }
  await expect(result).toContainText('retired commitments +1');
  await expect(result.locator('.why')).toContainText('Every check held');
  await expect(honest.locator('[role="status"]')).toHaveText('finalizeRecovery accepted.');
  await expect(panel).toHaveAttribute('data-world', 'spent');
  const spentNote = honest.locator('.spent-note');
  await expect(spentNote).toHaveText('This world is now spent: Hana’s old commitment is retired. Your next attack on it builds a new world with new secrets.');

  // A spent world is replaced: the next attack builds a new one, with new secrets. The results
  // from the old one stay, marked as such; those from the other two worlds are still current.
  const id = page.locator('.try-world [data-fact="id"] dd');
  const spentId = await id.getAttribute('data-full');
  await card(page, 'tamper').getByRole('button', { name: 'Flip the byte and finalize' }).click();
  await expectRefused(card(page, 'tamper').locator('.try-result'), 'tamper', 'finalizeRecovery');
  await expect(panel).toHaveAttribute('data-world', 'built');
  await expect.poll(() => id.getAttribute('data-full')).not.toBe(spentId);
  await expect(card(page, 'tamper').locator('.try-result')).toHaveAttribute('data-stale', 'false');
  for (const key of ['otherPhone', 'guessVeto', 'twice', 'honest']) {
    const old = card(page, key).locator('.try-result');
    await expect(old).toHaveClass(/\bstale\b/);
    // Read out as two phrases, not run together: "Another phone, from the previous world".
    await expect(old.locator('.who')).toHaveText(/\S, from the previous world$/);
  }
  await expect(result).toHaveAttribute('data-outcome', 'accepted');
  await expect(spentNote).toHaveCount(0);
  for (const key of ['early', 'lone']) await expect(card(page, key).locator('.try-result')).toHaveAttribute('data-stale', 'false');

  // None of it touched the story's own session.
  await expect(page.locator('.step')).toHaveCount(0);
  await expect(page.locator('.ledger [data-count="enrolled"] dd')).toHaveText('0');
});

test('tamper: the visitor picks the share and the byte to flip', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Build the world' }).click();
  await expect(page.locator('.breakit')).toHaveAttribute('data-world', 'built');

  const c = card(page, 'tamper');
  const byte = c.getByLabel('Byte to flip, 0 to 31');
  const go = c.getByRole('button', { name: 'Flip the byte and finalize' });
  for (const [who, n] of [['Seo-yeon', 17], ['Mum', 0], ['Mum', 31], ['Seo-yeon', 3]]) {
    await c.getByRole('radio', { name: who }).check();
    await byte.fill(String(n));
    const share = c.locator('.share');
    await expect(share).toHaveAttribute('data-byte', String(n));
    expect(await share.getAttribute('data-before')).toBeNull();
    expect(await share.getAttribute('data-after')).toBeNull();
    // The fingerprint, written as every fingerprint on the site, and the chosen position, marked.
    await expect(c.locator('.share-bytes > *')).toHaveCount(32);
    const cells = await c.locator('.share-bytes > *').allTextContents();
    cells.forEach((cell, i) => expect(cell).toMatch(i < 4 ? /^[0-9A-F]{2}$/ : /^··$/));
    const fp = `${cells[0]}${cells[1]}-${cells[2]}${cells[3]}`;
    expect(fp).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    await expect(c.locator('.share-bytes mark')).toHaveCount(1);
    await expect(c.locator('.share-bytes > *').nth(n)).toHaveJSProperty('tagName', 'MARK');
    const meta = share.locator('.meta');
    await expect(meta).toContainText(`${who}’s share in this world, fingerprint ${fp}.`);
    await expect(meta).toContainText('The bytes after the fingerprint stay hidden, here and in the result: any two shares rebuild Hana’s secret.');
    // A byte's value shows only when the fingerprint already shows it.
    if (n < 4) {
      await expect(c.locator('.share-bytes mark')).toHaveText(cells[n]);
      await expect(meta).toContainText(`Byte ${n} is ${cells[n]}, part of the fingerprint; flipped, it becomes ${flip(cells[n])}.`);
    } else {
      await expect(c.locator('.share-bytes mark')).toHaveText('··');
      await expect(meta).toContainText(`All eight bits of byte ${n} are inverted.`);
      await expect(meta).not.toContainText(`Byte ${n} is`);
    }

    await go.click();
    const result = c.locator('.try-result');
    await expect(result.locator('.say')).toHaveText(`Byte ${n} of ${who}’s share arrives flipped, all eight of its bits inverted. The phone rebuilds a secret from the two shares it holds and finalizes.`);
    await expectRefused(result, 'tamper', 'finalizeRecovery');
  }

  // A value that names no byte would flip nothing, so the page will not run it.
  for (const bad of ['32', '-1', '2.5', '']) {
    await byte.fill(bad);
    await expect(go).toBeDisabled();
    await expect(c.locator('#try-byte-note')).toHaveText('Choose a whole number from 0 to 31.');
    await expect(c.locator('.share')).toHaveCount(0);
  }
  await byte.fill('5');
  await expect(go).toBeEnabled();
});

test('stepping through all 32 bytes of both shares shows no byte past the fingerprint', async ({ page }) => {
  await openDemo(page);
  const panel = page.locator('.breakit');
  // What the panel shows before any secret exists, such as the 72 in "72 h 10 min" and the 31 in
  // "0 to 31": a byte of a share that happens to equal one of these shows nothing about it.
  const plain = hexBytes(await panelStrings(page));
  await page.getByRole('button', { name: 'Build the world' }).click();
  await expect(panel).toHaveAttribute('data-world', 'built');
  const truth = await trueShares(page);
  expect(truth, 'the test reads the real shares').not.toBeNull();
  const hidden = { seoyeon: truth.seoyeon.slice(4), mum: truth.mum.slice(4) };

  const c = card(page, 'tamper');
  const byte = c.getByLabel('Byte to flip, 0 to 31');
  const go = c.getByRole('button', { name: 'Flip the byte and finalize' });
  for (const [g, who] of Object.entries(NAME)) {
    await c.getByRole('radio', { name: who }).check();
    const head = truth[g].slice(0, 4);
    // The shares the test read are the ones on the page: its fingerprint is the one shown.
    const fp = `${head[0]}${head[1]}-${head[2]}${head[3]}`.toUpperCase();
    await expect(c.locator('.share .meta')).toContainText(`${who}’s share in this world, fingerprint ${fp}.`);

    for (let n = 0; n < 32; n++) {
      await byte.fill(String(n));
      await expect(c.locator('.share')).toHaveAttribute('data-byte', String(n));
      await go.click();
      const result = c.locator('.try-result');
      await expect(result.locator('.say')).toContainText(`Byte ${n} of ${who}’s share arrives flipped,`);
      await expect(result).toHaveAttribute('data-outcome', 'refused');

      // Shown already, so allowed: the fingerprint's bytes, the chosen byte's number, and, when the
      // chosen byte is in the fingerprint, its flipped value.
      const strings = await panelStrings(page);
      const allowed = new Set([...plain, String(n), ...head, ...(n < 4 ? [flip(head[n]).toLowerCase()] : [])]);
      const shown = hexBytes(strings);
      for (const [owner, bytes] of Object.entries(hidden)) {
        const leaked = bytes.map((b, i) => [i + 4, b]).filter(([, b]) => shown.has(b) && !allowed.has(b));
        expect(leaked, `with byte ${n} of ${who}’s share chosen, bytes of ${NAME[owner]}’s share show`).toEqual([]);
        // Nor any four of them in a row, as part of a longer string.
        const text = strings.join('\n').toLowerCase();
        for (let i = 0; i + 4 <= bytes.length; i++) expect(text).not.toContain(bytes.slice(i, i + 4).join(''));
      }
    }
  }
});

test('an attack runs from the keyboard alone', async ({ page, browserName }) => {
  // Safari's Tab skips buttons unless "Press Tab to highlight each item" is on; Option-Tab
  // reaches every control, and Playwright's WebKit behaves the same way.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await openDemo(page);
  const c = card(page, 'tamper');
  const byte = c.getByLabel('Byte to flip, 0 to 31');
  const go = c.getByRole('button', { name: 'Flip the byte and finalize' });

  await c.getByRole('radio', { name: 'Mum' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(c.getByRole('radio', { name: 'Seo-yeon' })).toBeChecked();
  await page.keyboard.press(tab);
  await expect(byte).toBeFocused();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowUp');
  await expect(byte).toHaveValue('5');
  await page.keyboard.press(tab);
  await expect(go).toBeFocused();
  await page.keyboard.press('Enter');

  const result = c.locator('.try-result');
  await expect(result.locator('.say')).toContainText('Byte 5 of Seo-yeon’s share arrives flipped');
  await expectRefused(result, 'tamper', 'finalizeRecovery');
  // Focus stays on the button, so the next Tab carries on from where the visitor was.
  await expect(go).toBeFocused();
  await expect(page.locator('.step')).toHaveCount(0);
});

test('reset builds a new world with new secrets, saying so while it works', async ({ page }) => {
  await openDemo(page);
  // Record every line the world's progress line shows, so the brief "preparing" state is seen for
  // certain, and every line its live region announces.
  await page.evaluate(() => {
    const watch = (sel, lines) => {
      const el = document.querySelector(sel);
      new MutationObserver(() => lines.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
    };
    window.statusLines = [];
    window.saidLines = [];
    watch('.try-world .try-progress', window.statusLines);
    watch('.try-world [role="status"]', window.saidLines);
  });
  await page.getByRole('button', { name: 'Build the world' }).click();
  const id = page.locator('.try-world [data-fact="id"] dd');
  await expect(id).toHaveAttribute('data-full', /^[0-9a-f]{64}$/);
  const first = await id.getAttribute('data-full');

  await card(page, 'guessVeto').getByRole('button', { name: 'Veto with a guess' }).click();
  await expectRefused(card(page, 'guessVeto').locator('.try-result'), 'guessVeto', 'vetoRecovery');

  await page.getByRole('button', { name: 'Reset, new secrets' }).click();
  await expect.poll(() => id.getAttribute('data-full')).not.toBe(first);
  await expect(page.locator('.try-result')).toHaveCount(0);
  await expect(page.locator('.try-world [role="status"]')).toHaveText('The world is built.');
  const lines = await page.evaluate(() => window.statusLines);
  expect(lines.some((l) => /^Preparing the world: Hana enrols \(1 of 7\)…$/.test(l))).toBe(true);
  expect(lines.some((l) => /^Preparing the world: Mum approves \(7 of 7\)…$/.test(l))).toBe(true);
  // Each build is announced once, not step by step: seven steps each time, two lines each time.
  const said = (await page.evaluate(() => window.saidLines)).filter((l, i, all) => l && l !== all[i - 1]);
  expect(said).toEqual([
    'Building the world, with new secrets: 7 circuit calls.', 'The world is built.',
    'Building the world, with new secrets: 7 circuit calls.', 'The world is built.',
  ]);
});

test('the → key steps the story, but not while focus is in the panel', async ({ page }) => {
  await openDemo(page);
  await card(page, 'guessVeto').getByRole('button', { name: 'Veto with a guess' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Build the world' }).focus();
  await page.keyboard.press('ArrowRight');
  // A story step takes a few milliseconds; give any that was wrongly started time to show.
  await page.waitForTimeout(600);
  await expect(page.locator('.step')).toHaveCount(0);
  await expect(page.locator('.try-result')).toHaveCount(0);

  // Nor after a click on the panel's text, which leaves focus on the page itself, even once the
  // story's controls are back in view and the panel is not.
  const showControls = () => page.locator('.controls').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.locator('.breakit-head .caption').click();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await showControls();
  await expect(page.locator('.controls')).toBeInViewport();
  await expect(page.locator('#break')).not.toBeInViewport();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  await expect(page.locator('.step')).toHaveCount(0);

  // Nor while the panel is on screen and the story's controls are not, after a click on the story.
  await page.getByRole('heading', { level: 1 }).click();
  await page.locator('#break').evaluate((s) => s.scrollIntoView());
  await expect(page.locator('.controls')).not.toBeInViewport();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  await expect(page.locator('.step')).toHaveCount(0);

  // The positive control: the same key, after a click on the story with its controls in view, takes one step.
  await page.getByRole('heading', { level: 1 }).click();
  await showControls();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.step')).toHaveCount(1);
});

test('the page links to the panel, and the jump lands clear of the sticky header', async ({ page }) => {
  const clear = () => landsClear(page);
  // A shared link lands there once the contract has loaded, which is after the browser's own jump.
  await page.goto('/demo#break');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await clear();

  // The hint near the top of the story links there.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.hint').getByRole('link', { name: 'try to break it' }).click();
  await expect(page).toHaveURL(/\/demo#break$/);
  await clear();

  // So does the end of the story.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Run to the end' }).click();
  const link = page.getByTestId('summary').getByRole('link', { name: 'Try to break it' });
  await expect(link).toHaveAttribute('href', '#break');
  await link.click();
  await clear();
});

test('at every width, however the header wraps, the jump to the panel lands clear of it', async ({ page }) => {
  await openDemo(page);
  const header = page.locator('header.site');
  for (const width of [320, 344, 360, 390, 412, 480, 560, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    // The page measures the header's new height before the jump is taken.
    await expect.poll(() => header.evaluate((h) => getComputedStyle(document.documentElement).getPropertyValue('--header-h')
      === `${Math.ceil(h.getBoundingClientRect().height)}px`)).toBe(true);
    await page.evaluate(() => { window.history.replaceState(null, '', '/demo'); window.scrollTo(0, 0); });
    await page.locator('.hint').getByRole('link', { name: 'try to break it' }).click();
    await expect(page).toHaveURL(/\/demo#break$/);
    await landsClear(page);
  }
});

test('with every result showing: no overclaiming words, no serious accessibility issue, no side-scroll', async ({ page }) => {
  await openDemo(page);
  await runEveryAttack(page);
  await card(page, 'honest').getByRole('button', { name: 'Finalize honestly' }).click();
  await expect(card(page, 'honest').locator('.try-result')).toHaveAttribute('data-outcome', 'accepted');
  await expect(page.locator('.breakit')).toContainText('no wallet, no chain, no proofs');
  expect(await page.locator('body').innerText()).not.toMatch(BANNED);
  await expectNoSeriousA11yIssues(page);
  await expectNoSideScroll(page);

  // And again with results from a replaced world, set back but still legible.
  await card(page, 'guessVeto').getByRole('button', { name: 'Veto with a guess' }).click();
  await expect(card(page, 'guessVeto').locator('.try-result')).toHaveAttribute('data-stale', 'false');
  await expect(page.locator('.try-result.stale')).toHaveCount(4);
  await expectNoSeriousA11yIssues(page);
  await expectNoSideScroll(page);
});

test('the panel makes no request: its code arrived with the page', async ({ page }) => {
  await openDemo(page);
  await page.waitForLoadState('networkidle');
  const after = [];
  page.on('request', (r) => after.push(r.url()));
  await runEveryAttack(page);
  await card(page, 'honest').getByRole('button', { name: 'Finalize honestly' }).click();
  await expect(card(page, 'honest').locator('.try-result')).toHaveAttribute('data-outcome', 'accepted');
  await page.getByRole('button', { name: 'Reset, new secrets' }).click();
  await expect(page.locator('.breakit')).toHaveAttribute('data-world', 'built');
  expect(after).toEqual([]);
});

// The control is the lock: a finalizeRecovery the contract accepted, the panel's one Ember chip. Once its
// world is replaced, the result is set back and the chip loses its light.
test('the honest control is drawn as the lock, until its world is replaced', async ({ page }) => {
  const EMBER = 'rgb(255, 138, 61)';
  const fill = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  await openDemo(page);
  await card(page, 'guessVeto').getByRole('button', { name: 'Veto with a guess' }).click();
  await expectRefused(card(page, 'guessVeto').locator('.try-result'), 'guessVeto', 'vetoRecovery');
  expect(await fill(card(page, 'guessVeto').locator('.chip.no'))).not.toBe(EMBER);

  await card(page, 'honest').getByRole('button', { name: 'Finalize honestly' }).click();
  const result = card(page, 'honest').locator('.try-result');
  await expect(result).toHaveAttribute('data-outcome', 'accepted');
  await expect(result).toHaveAttribute('data-circuit', 'finalizeRecovery');
  expect(await fill(result.locator('.chip.ok'))).toBe(EMBER);
  const embers = await page.locator('.breakit .chip').evaluateAll((els, e) => els.filter((el) => getComputedStyle(el).backgroundColor === e).length, EMBER);
  expect(embers).toBe(1);

  // A new world: the control's result stays, marked as from the previous world, without the light.
  await card(page, 'tamper').getByRole('button', { name: 'Flip the byte and finalize' }).click();
  await expect(result).toHaveClass(/\bstale\b/);
  await expect.poll(() => fill(result.locator('.chip.ok'))).not.toBe(EMBER);
  await expect(result.locator('.chip.ok')).toHaveText('accepted');
});

// A verdict lands where it can be seen: pressing a card's button with the card's top at the header
// still shows the result's stamp, at 1280×720, the video's size. The jump to the panel leaves one
// hairline under the header, its own: the rule above the panel sits behind it.
test('a verdict lands in view, and the jump to the panel shows one hairline, not two', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openDemo(page);
  await page.getByRole('button', { name: 'Build the world' }).click();
  await expect(page.locator('.breakit')).toHaveAttribute('data-world', 'built');
  const headerBottom = () => page.locator('header.site').evaluate((h) => h.getBoundingClientRect().bottom);
  const tamper = card(page, 'tamper');
  await tamper.evaluate((c) => window.scrollBy(0, c.getBoundingClientRect().top - document.querySelector('header.site').getBoundingClientRect().bottom - 12));
  await tamper.getByRole('button', { name: 'Flip the byte and finalize' }).click();
  const chip = tamper.locator('.try-result .chip.no');
  await expect(chip).toBeVisible();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const box = await chip.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  expect(box.top).toBeGreaterThanOrEqual(await headerBottom());
  expect(box.bottom).toBeLessThanOrEqual(720);

  await page.evaluate(() => { window.history.replaceState(null, '', '/demo'); window.scrollTo(0, 0); });
  await page.locator('.hint').getByRole('link', { name: 'try to break it' }).click();
  await landsClear(page);
  const rule = await page.locator('#break').evaluate((s) => {
    const r = s.getBoundingClientRect();
    return { top: r.top + parseFloat(getComputedStyle(s, '::before').top), border: getComputedStyle(s).borderTopStyle };
  });
  expect(rule.border).toBe('none');
  expect(rule.top).toBeLessThan(await headerBottom());
});
