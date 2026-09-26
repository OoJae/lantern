// /kit, "Recovery kits": a fresh identity made in the browser, dealt to 2-7 guardians as a veto card and
// one kit per guardian, in words; printed one to a page; and a dry run that types the veto card back in.
// Also the six fingerprint words /demo shows beside the phone's key.
import { test, expect } from '@playwright/test';
import { BANNED, expectNoSeriousA11yIssues, expectNoSideScroll, expectFiniteAnimations, pageCopy, watchCsp } from './helpers.js';
import { WORDLIST } from '../../src/words.js';

const LIST = new Set(WORDLIST);
// What a guardian is told, verbatim: the guardian places the call (or meets), never the owner; and the
// voice must be one they know, since whoever holds the owner's lost phone answers a call to its number.
const SCRIPT = 'Only approve a recovery after the owner reads you all six words, in order: in person, or on a call you placed to a number you already know, in a voice you know. Never read your kit’s words to anyone who calls you.';
const FOLD = 'Fold it in half, edge to edge, printed side in. Write whose it is on the blank outside, never the words.';
const NEVER = 'Never read or type these words for anyone: not a caller, not a website, not “support”.';

async function openKit(page) {
  // window.print would open a dialog: record the call instead.
  await page.addInitScript(() => {
    window.__printed = [];
    window.print = () => { window.__printed.push(document.querySelector('.kit-page')?.dataset.print ?? null); };
  });
  await page.goto('/kit');
  await expect(page.locator('.kit-page[data-ready="true"]')).toBeVisible();
}

const words = (loc) => loc.locator('.kit-w').allInnerTexts();
const guardians = (page) => page.getByRole('group', { name: 'Guardians' });
const needed = (page) => page.getByRole('group', { name: 'Needed to recover' });

async function make(page, n, t) {
  if (n) await guardians(page).getByRole('radio', { name: String(n), exact: true }).check();
  if (t) await needed(page).getByRole('radio', { name: String(t), exact: true }).check();
  await page.getByRole('button', { name: /^Make (the|new) kits/ }).click();
  await expect(page.locator('.kit-sheet[data-sheet="veto"]')).toBeVisible();
}

async function vetoWords(page) {
  await page.getByRole('tab', { name: 'Veto card' }).click();
  return words(page.locator('.kit-sheet[data-sheet="veto"] .kit-grid'));
}

async function typeAndCheck(page, text) {
  const box = page.getByLabel('Your veto card’s words, from paper');
  await box.fill(text);
  await page.getByRole('button', { name: 'Check the words' }).click();
  return page.locator('.kit-result');
}

test('says what it is: made in the browser, nothing sent, practice kits for no enrolled identity', async ({ page }) => {
  await openKit(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Recovery kits' })).toBeVisible();
  const honesty = page.locator('.honesty');
  await expect(honesty).toContainText('Made in your browser.');
  await expect(honesty).toContainText('nothing is sent or stored');
  await expect(honesty).toContainText('practice kits, for trying the format');
  await expect(honesty).toContainText('enrolled on a Lantern contract');
  // A guardian keeps paper; the app that would read it on the day is not claimed.
  const choose = page.locator('.kit-step').first();
  await expect(choose).toContainText('A guardian needs no crypto to keep their part: it is a sheet of paper.');
  await expect(choose).toContainText('That app is not built yet.');
  await expect(choose.getByRole('link', { name: 'Rehearse a recovery' })).toHaveAttribute('href', '/rehearse');
  await expect(page.locator('body')).not.toContainText('needs no wallet');
});

test('makes a veto card and one kit per guardian, all in list words', async ({ page }) => {
  await openKit(page);
  await expect(page.getByTestId('kit-sentence')).toHaveText('Any 2 of your 3 guardians can recover your identity. One alone learns nothing about it.');
  await make(page);

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText(['Veto card', 'Guardian 1', 'Guardian 2', 'Guardian 3']);
  await expect(page.getByRole('tab', { name: 'Veto card' })).toHaveAttribute('aria-selected', 'true');

  const veto = await vetoWords(page);
  expect(veto).toHaveLength(24);
  const check = (await page.locator('.kit-sheet[data-sheet="veto"] .kit-check-words').innerText()).split(' · ');
  expect(check).toHaveLength(3);
  expect([...veto, ...check].every((w) => LIST.has(w))).toBe(true);

  for (const x of [1, 2, 3]) {
    await page.getByRole('tab', { name: `Guardian ${x}` }).click();
    const sheet = page.locator(`.kit-sheet[data-sheet="kit-${x}"]`);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 3 })).toHaveText(`Share ${x} of 3`);
    const w = await words(sheet.locator('.kit-grid'));
    expect(w).toHaveLength(72);
    expect(w.every((v) => LIST.has(v))).toBe(true);
    await expect(sheet.getByRole('note')).toContainText(SCRIPT);
    // Every value in the small print as the kit's text form spells it, so it can be typed back in.
    await expect(sheet.locator('.kit-public div:nth-child(1) dt')).toHaveText('Network');
    await expect(sheet.locator('.kit-public div:nth-child(1) dd')).toHaveText('practice');
    await expect(sheet.locator('.kit-public div:nth-child(2) dd')).toHaveText('none');
    await expect(sheet.locator('.kit-foot')).toContainText('lantern-guardian-kit/1');
    // Practice, in the head of the sheet itself, not only in its small print.
    await expect(sheet.locator('.kit-kind')).toHaveText('Lantern · Guardian kit · practice');
    await expect(sheet.locator('.kit-practice')).toHaveText('Practice: protects nothing');
    // The share goes only to the device the guardian checked; the words go to no one.
    await expect(sheet.locator('.kit-section').nth(2).locator('.kit-small')).toHaveText('Your part of the identity secret. Give it only to the device whose six words the owner read to you, and only after you have approved its recovery.');
    await expect(sheet.locator('.kit-never')).toHaveText(NEVER);
    await expect(sheet.locator('.kit-expires')).toHaveText('After a recovery, the share here stops working, but the guardian secret and leaf salt still approve recoveries until the owner replaces the guardians. If the owner replaces the guardians without a recovery, the share here still works. Keep this kit safe or destroy it: never throw it away whole.');
  }
  // An old kit's share dies with a recovery; its guardian secret and leaf salt do not (the guardian
  // context survives finalizeRecovery), so the page never calls old kits dead paper.
  await expect(page.locator('.kit-sheets .kit-note')).toContainText('the shares on the old kits stop working, but each old kit can still approve a recovery. So replace your guardians with your new veto card');
  // A replacement without a recovery leaves the identity secret as it was (rotateGuardianSet changes only
  // the guardian context), so every old kit's share still rebuilds it: old kits are destroyed, not dropped.
  await expect(page.locator('.kit-sheets .kit-note')).toContainText('have every old kit destroyed: without a recovery your secret is unchanged, so an old kit’s share still rebuilds it.');
  await expect(page.locator('.kit-sheets .kit-note')).toContainText('recover to a new secret before you make new kits: new kits of the same secret leave every old share working.');
  // One identity: every kit names the same commitment, and at enrolment it is the guardian context too,
  // which the kit says in words rather than print the same 64 characters twice.
  const ids = await page.locator('.kit-public div:nth-child(3) dd').allInnerTexts();
  expect(new Set(ids).size).toBe(1);
  expect(ids[0]).toMatch(/^[0-9a-f]{64}$/);
  expect(await page.locator('.kit-public div:nth-child(4) dd').allInnerTexts()).toEqual(ids.map(() => 'same as identity'));
  const vetoSheet = page.locator('.kit-sheet[data-sheet="veto"]');
  await expect(vetoSheet.locator('.kit-kind')).toHaveText('Lantern · Veto card · practice');
  await expect(vetoSheet.locator('.kit-practice')).toHaveText('Practice: protects nothing');
  await expect(vetoSheet.locator('.kit-never')).toHaveText(NEVER);
  await expect(vetoSheet.locator('.kit-expires')).toHaveText('After a recovery, make a new veto card: this one stops working.');
  // No sheet adds landmarks to the page, and no paragraph is given a name.
  await expect(page.locator('.kit-sheet section, .kit-sheet [aria-label]')).toHaveCount(0);
  await expect(page.locator('.kit-check-words[aria-labelledby]')).toHaveCount(0);

  // The arrow keys move between the sheets.
  await page.getByRole('tab', { name: 'Guardian 3' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Veto card' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Veto card' })).toHaveAttribute('aria-selected', 'true');
});

test('keeps 2 ≤ t ≤ n ≤ 7, and new settings make new kits only when asked', async ({ page }) => {
  await openKit(page);
  await expect(guardians(page).getByRole('radio')).toHaveCount(6);
  await guardians(page).getByRole('radio', { name: '7', exact: true }).check();
  await expect(needed(page).getByRole('radio')).toHaveCount(6);
  await needed(page).getByRole('radio', { name: '6', exact: true }).check();
  // Fewer guardians than the threshold: the threshold follows them down.
  await guardians(page).getByRole('radio', { name: '4', exact: true }).check();
  await expect(needed(page).getByRole('radio', { name: '4', exact: true })).toBeChecked();
  await expect(needed(page).getByRole('radio')).toHaveCount(3);
  await guardians(page).getByRole('radio', { name: '2', exact: true }).check();
  await expect(needed(page).getByRole('radio')).toHaveCount(1);
  await expect(page.getByTestId('kit-sentence')).toContainText('Any 2 of your 2 guardians');

  await make(page, 5, 3);
  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(page.getByTestId('kit-sentence')).toContainText('Any 3 of your 5 guardians can recover your identity. 2 together learn nothing about it.');
  const first = await vetoWords(page);
  await expect(page.locator('.kit-sheets')).not.toHaveAttribute('data-stale');
  await expect(page.getByTestId('kit-stale')).toHaveCount(0);
  await guardians(page).getByRole('radio', { name: '6', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Make new kits for 3 of 6' })).toBeVisible();
  expect(await vetoWords(page)).toEqual(first); // nothing changes until asked
  // ... but the kits on the page say they no longer match what is chosen.
  await expect(page.locator('.kit-sheets')).toHaveAttribute('data-stale', 'true');
  await expect(page.getByTestId('kit-stale')).toHaveText('These kits are for 3 of 5; make new ones to match.');
  await page.getByRole('button', { name: 'Make new kits for 3 of 6' }).click();
  await expect(page.getByRole('tab')).toHaveCount(7);
  expect(await vetoWords(page)).not.toEqual(first);
  await expect(page.locator('.kit-sheets')).not.toHaveAttribute('data-stale');
  await expect(page.getByTestId('kit-stale')).toHaveCount(0);
});

test('prints the sheets and nothing else, one to a page, the words large, each saying how to fold it', async ({ page }) => {
  await openKit(page);
  await make(page, 4, 2);
  await page.emulateMedia({ media: 'print' });
  for (const hidden of ['header.site', 'footer.site', '.honesty', '.kit-tabs', '.kit-print-row', '.kit-backup']) {
    await expect(page.locator(hidden).first()).toBeHidden();
  }
  const sheets = page.locator('.kit-sheet');
  await expect(sheets).toHaveCount(5);
  for (const s of await sheets.all()) {
    await expect(s).toBeVisible();
    // Kept folded in half, printed side in: no fold line to fold along, which a long kit would outrun.
    await expect(s.locator('.kit-fold')).toHaveText(`To keep it ${FOLD}`);
    await expect(s.locator('.kit-practice')).toBeVisible();
    expect(await s.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  }
  await expect(page.getByText('Fold here')).toHaveCount(0);
  // Printed with background graphics on, the margins are white too: the page prints in the light scheme.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(255, 255, 255)');
  const breaks = await page.locator('.kit-panel').evaluateAll((ps) => ps.map((p) => getComputedStyle(p).breakAfter));
  expect(breaks).toEqual(['page', 'page', 'page', 'page', 'auto']);
  // 16pt on the veto card, 11.5pt on a kit: both above the 10pt of the text around them.
  const px = (sel) => page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await px('.kit-sheet[data-sheet="veto"] .kit-grid')).toBeGreaterThanOrEqual(21);
  expect(await px('.kit-sheet[data-sheet="kit-1"] .kit-grid')).toBeGreaterThanOrEqual(15);
  // A covered card still prints its words.
  await page.emulateMedia({ media: 'screen' });
  await page.getByLabel('Your veto card’s words, from paper').fill('abandon');
  await page.getByRole('tab', { name: 'Veto card' }).click();
  await expect(page.locator('.kit-cover')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.kit-sheet[data-sheet="veto"] .kit-grid')).toBeVisible();
  await expect(page.locator('.kit-cover')).toBeHidden();
});

test('"Print this sheet" prints that one sheet; "Print all" prints them all', async ({ page }) => {
  await openKit(page);
  await make(page, 3, 2);
  await page.getByRole('tab', { name: 'Guardian 2' }).click();
  await page.getByRole('button', { name: /^Print this sheet/ }).click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toEqual(['kit-2']);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.kit-sheet:visible')).toHaveCount(1);
  await expect(page.locator('.kit-sheet[data-sheet="kit-2"]')).toBeVisible();
  // The browser's afterprint puts the page back.
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.kit-page')).not.toHaveAttribute('data-print');
  await expect(page.locator('.kit-sheet:visible')).toHaveCount(4);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Print all 4' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toEqual(['kit-2', 'all']);
  // A browser that skips afterprint still ends printing: the print media query turning false puts the
  // page back, so a later print from the browser's own menu prints every sheet.
  await page.getByRole('tab', { name: 'Guardian 3' }).click();
  await page.getByRole('button', { name: /^Print this sheet/ }).click();
  await expect(page.locator('.kit-page')).toHaveAttribute('data-print', 'kit-3');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.kit-sheet:visible')).toHaveCount(1);
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.kit-page')).not.toHaveAttribute('data-print');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.kit-sheet:visible')).toHaveCount(4);
});

// kit.css stays loaded after /kit, and the word grid is shown on /rehearse too: no print rule of the
// kit's may reach a word grid, a label or a note outside the kit page.
test('printing another page after /kit: its word grids and notes print as they show', async ({ page }) => {
  await openKit(page);
  await make(page, 3, 2);
  const probe = () => page.evaluate(() => {
    const el = document.getElementById('kit-probe');
    const cs = (sel) => getComputedStyle(el.querySelector(sel));
    return {
      columns: cs('.kit-grid').gridTemplateColumns.split(' ').length,
      grid: cs('.kit-grid').fontSize,
      numeral: cs('.kit-n').color,
      label: cs('.kit-label').fontSize,
      small: cs('.kit-small').fontSize,
      check: cs('.kit-cws').fontFamily,
    };
  });
  await page.evaluate(() => {
    const box = document.createElement('div');
    box.id = 'kit-probe';
    const add = (parent, tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      parent.append(e);
      return e;
    };
    add(box, 'p', 'kit-label', 'Label');
    add(box, 'p', 'kit-small', 'A note');
    const grid = add(box, 'ol', 'kit-grid');
    for (let i = 1; i <= 24; i++) {
      const li = add(grid, 'li');
      add(li, 'span', 'kit-n', String(i));
      add(li, 'span', 'kit-w', 'abandon');
    }
    add(add(box, 'p'), 'span', 'kit-cws', 'artist · just · valley');
    document.body.append(box);
  });
  const screen = await probe();
  expect(screen.columns).toBeLessThan(6);
  await page.emulateMedia({ media: 'print' });
  // The kit's own grid does change in print (six across), so the probe is not reading stale styles.
  expect(await page.locator('.kit-sheet[data-sheet="kit-1"] .kit-grid').first().evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length)).toBe(6);
  expect(await probe()).toEqual(screen);
});

// Folded in half, printed side in, a sheet hides every word on it only if it is one sheet of paper: a
// kit that ran onto a second page would leave that page's words outside. So each sheet prints on exactly
// one page, on A4 and on US Letter, with seven guardians (the longest kits), all or one at a time.
test('each sheet prints on one page of A4 and of US Letter, so a half fold hides all of it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'page.pdf is Chromium’s');
  await openKit(page);
  await make(page, 7, 4);
  const pages = async (format) => {
    const pdf = await page.pdf({ format });
    return (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  };
  expect(await pages('A4')).toBe(8);
  expect(await pages('Letter')).toBe(8);
  // One sheet on its own: the longest, a guardian kit. Printing fires afterprint, which puts the page
  // back, so the sheet is chosen again for each paper.
  await page.getByRole('tab', { name: 'Guardian 7' }).click();
  for (const format of ['A4', 'Letter']) {
    await page.getByRole('button', { name: /^Print this sheet/ }).click();
    await expect(page.locator('.kit-page')).toHaveAttribute('data-print', 'kit-7');
    expect(await pages(format), format).toBe(1);
    await expect(page.locator('.kit-page')).not.toHaveAttribute('data-print');
  }
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.kit-sheet[data-sheet="kit-7"] .kit-fold')).toContainText(FOLD);
});

test('check your backup: the card passes, typed as a person types; every slip is refused and named', async ({ page }) => {
  await openKit(page);
  await make(page);
  const veto = await vetoWords(page);
  const check = (await page.locator('.kit-sheet[data-sheet="veto"] .kit-check-words').innerText()).split(' · ');

  // Numbered, in capitals, by four letters, with the check words after.
  const typed = `${veto.map((w, i) => `${i + 1}. ${(i % 2 ? w : w.slice(0, 4)).toUpperCase()}`).join('\n')} ${check.join(' ')}`;
  let result = await typeAndCheck(page, typed);
  // The card and its check words are counted as that, not as 27 of 24.
  await expect(page.locator('.kit-count')).toHaveText('24 of 24 words · 3 check words');
  await expect(page.locator('.kit-count')).toHaveAttribute('data-count', '27');
  await expect(result).toHaveAttribute('data-result', 'pass');
  await expect(result).toContainText('Your card is right.');
  await expect(result).toContainText('open this identity’s veto commitment');
  await expect(result).toContainText(`${check.join(' · ')}, the same as on the card`);
  await expect(page.locator('.kit-cover')).toHaveCount(0);

  const changed = [...veto];
  changed[5] = WORDLIST[(WORDLIST.indexOf(veto[5]) + 1) % 2048];
  result = await typeAndCheck(page, changed.join(' '));
  // A changed word fails the checksum, or (1 time in 256) makes another card: refused either way.
  await expect(result).toHaveAttribute('data-result', /^(checksum|other)$/);

  result = await typeAndCheck(page, [...veto.slice(0, 7), 'tobaco', ...veto.slice(8)].join(' '));
  await expect(result).toHaveAttribute('data-result', 'unknown-word');
  await expect(result).toContainText('Word 8, “tobaco”.');
  await expect(page.locator('.kit-count')).toContainText('“tobaco” is not on the list');

  result = await typeAndCheck(page, veto.slice(0, 23).join(' '));
  await expect(result).toHaveAttribute('data-result', 'word-count');
  await expect(result).toContainText('That is 23 words.');

  const wrongCheck = [...check];
  wrongCheck[0] = WORDLIST[(WORDLIST.indexOf(check[0]) + 9) % 2048];
  result = await typeAndCheck(page, [...veto, ...wrongCheck].join(' '));
  await expect(result).toHaveAttribute('data-result', 'check');

  // While the words are being typed, the card on screen is covered.
  await page.getByRole('tab', { name: 'Veto card' }).click();
  await expect(page.locator('.kit-cover')).toHaveText('Covered while you check your backup');
  await expect(page.locator('.kit-sheet[data-sheet="veto"] .kit-grid')).toBeHidden();

  // Good words from another card: they do not open this identity's veto commitment. Without their check
  // words that could also be a slip the checksum missed, and the page says both.
  await page.getByRole('button', { name: 'Make new kits' }).click();
  result = await typeAndCheck(page, veto.join(' '));
  await expect(result).toHaveAttribute('data-result', 'other');
  await expect(result).toContainText('Good words, but not this card.');
  await expect(result).toContainText('either a word is wrong in a way the checksum missed (about 1 slip in 256), or they are from another card. Add the three check words to tell which.');
  await expect(result).toContainText('not the ones on this card');
  // With its check words, it can only be another card.
  result = await typeAndCheck(page, [...veto, ...check].join(' '));
  await expect(result).toHaveAttribute('data-result', 'other');
  await expect(result).toContainText('These words and their check words agree, but they make another identity’s veto secret: they are from another card.');
});

test('check your backup: says only practice cards belong here, names every other refusal, and forgets on leaving', async ({ page }) => {
  await openKit(page);
  await make(page);
  const box = page.getByLabel('Your veto card’s words, from paper');
  // The warning comes before the box, and the box is described by it.
  await expect(page.getByTestId('kit-warn')).toHaveText('Only practice cards belong here. Type a real veto card only into your own Lantern app, on your own device, never into a website. A site that asks for your card’s words is stealing it.');
  await expect(box).toHaveAccessibleDescription(/^Only practice cards belong here\./);
  expect(await page.getByTestId('kit-warn').evaluate((w) => Boolean(w.compareDocumentPosition(document.querySelector('.kit-typed')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);

  // Refusals with no title of their own keep theirs, under a general one: not "the words do not check out".
  let result = await typeAndCheck(page, 'Check: abandon ability able\nCheck: about above absent');
  await expect(result).toHaveAttribute('data-result', 'format');
  await expect(result).toContainText('These words cannot be read as a veto card.');
  await expect(result).toContainText('“Check” appears twice.');
  await expect(result).not.toContainText('do not check out');
  result = await typeAndCheck(page, 'Version: lantern-guardian-kit/1\nWords: abandon');
  await expect(result).toHaveAttribute('data-result', 'version');
  await expect(result).toContainText('This is a guardian kit, not a veto card.');

  // Common numbering is not counted as words.
  await box.fill('(1) abandon (2) ability #3 able 4 - about');
  await expect(page.locator('.kit-count')).toHaveAttribute('data-count', '4');
  await expect(page.locator('.kit-count')).not.toContainText('not on the list');

  // Leaving the page empties the box, before the browser can keep it for a restored session.
  await box.fill('abandon ability able');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(box).toHaveValue('');
  await expect(page.locator('.kit-result')).toHaveAttribute('data-result', 'none');
  await expect(page.locator('.kit-cover')).toHaveCount(0);
});

test('check your backup without paper: the page types the card in, whole or with a slip', async ({ page }) => {
  await openKit(page);
  await make(page);
  const result = page.locator('.kit-result');
  await page.getByRole('button', { name: 'The card, as printed' }).click();
  await expect(result).toHaveAttribute('data-result', 'pass');
  await page.getByRole('button', { name: 'With one word changed' }).click();
  await expect(result).toHaveAttribute('data-result', /^(checksum|other)$/);
  await page.getByRole('button', { name: 'With two words swapped' }).click();
  await expect(result).toHaveAttribute('data-result', /^(checksum|other)$/);
  await expect(page.getByLabel('Your veto card’s words, from paper')).not.toHaveValue('');
});

test('shows two phones’ six words, which differ, beside the guardian’s script', async ({ page }) => {
  await openKit(page);
  // The guardian calls the owner back, on a number they already have: never the other way round.
  const day = page.locator('.kit-step').filter({ has: page.getByRole('heading', { name: 'On the day' }) });
  await expect(day).toContainText('Your laptop is gone, and your identity secret with it.');
  await expect(day).toContainText('Ask each guardian to call you back on the number they already have for you');
  await expect(day).toContainText('They approve only if they know your voice and all six words match, in order.');
  await expect(day).not.toContainText('You call them');
  // A number alone is not enough: whoever holds a lost phone answers a call to it.
  await expect(day.getByTestId('kit-sim')).toHaveText('If your old phone went too, whoever has it can answer a call to your number. Have the number moved to a new SIM first, which cuts the old one off, or meet your guardians instead.');
  await expect(day.getByRole('link', { name: 'the demo' })).toHaveAttribute('href', '/demo');
  await expect(day.locator('blockquote')).toHaveText(SCRIPT);
  // "On the day" is not a numbered step: the steps before it come and go.
  await expect(day.locator('.kit-step-n')).toHaveCount(0);
  const fps = page.locator('.kit-devices .fp-words');
  await expect(fps).toHaveCount(2);
  const [a, b] = await Promise.all([0, 1].map((i) => fps.nth(i).locator('.fp-w').allInnerTexts()));
  expect(a).toHaveLength(6);
  expect(b).toHaveLength(6);
  expect([...a, ...b].every((w) => LIST.has(w))).toBe(true);
  expect(a).not.toEqual(b);
  await expect(fps.first()).toHaveAttribute('aria-label', `Your new phone’s fingerprint: ${a.join(' ')}`);
  // The stranger's words, and what a guardian does with them.
  await expect(day.locator('.kit-device').nth(1).locator('.kit-device-note')).toHaveText('Not the words you read out: a guardian refuses this one.');
});

// Six words read aloud: a word broken over two lines ("bachelo / r") is a wrong word. Each column holds
// the longest word on the list, whatever the box, so every word is written as the longest there is.
test('the six words never break over two lines, at any width, even the longest on the list', async ({ page }) => {
  const longest = WORDLIST.reduce((a, w) => (w.length > a.length ? w : a), '');
  expect(longest).toHaveLength(8);
  const broken = () => page.locator('.fp-words').evaluateAll((ls, word) => ls.flatMap((l) => {
    for (const w of l.querySelectorAll('.fp-w')) w.textContent = word;
    const box = l.parentElement.getBoundingClientRect();
    return [...l.querySelectorAll('.fp-word')].filter((li) => {
      const w = li.querySelector('.fp-w');
      const r = li.getBoundingClientRect();
      return w.getClientRects().length > 1 || li.scrollWidth > li.clientWidth + 0.5 || r.right > box.right + 0.5;
    }).map((li) => li.textContent);
  }), longest);
  // How the words lie: the columns (distinct left edges), whether they read across (each word right of
  // the one before on its row, or first on the next row), and how wide the list asks to be when its box
  // is being sized (min-content). That last is one column: a list that asked for three would push a
  // narrow box (the /demo ledger at 320px) off the screen.
  const layout = (sel) => page.locator(sel).evaluateAll((ls) => ls.map((l) => {
    const items = [...l.querySelectorAll('.fp-word')].map((li) => li.getBoundingClientRect());
    const lefts = new Set(items.map((r) => Math.round(r.left)));
    const across = items.every((r, i) => i === 0
      || (Math.abs(r.top - items[i - 1].top) < 1 && r.left > items[i - 1].left)
      || (r.top > items[i - 1].top && Math.round(r.left) === Math.round(items[0].left)));
    // Measured on a copy in a box that shrinks to its content: in place, a flex-basis (the /demo
    // ledger's row) would override the width asked for.
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:0;top:0;width:min-content;visibility:hidden';
    box.append(l.cloneNode(true));
    document.body.append(box);
    const min = box.firstChild.getBoundingClientRect().width;
    box.remove();
    return { columns: lefts.size, across, minOverColumn: min - items[0].width };
  }));
  await openKit(page);
  for (const width of [1280, 1024, 800, 640, 480, 420, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await broken(), `/kit at ${width}px`).toEqual([]);
    // Three columns where they fit, two or one where they do not: never four or five, and read across.
    for (const l of await layout('.kit-devices .fp-words')) {
      expect([1, 2, 3], `/kit at ${width}px`).toContain(l.columns);
      expect(l.across, `/kit at ${width}px`).toBe(true);
      expect(l.minOverColumn, `/kit at ${width}px`).toBeLessThan(1);
    }
  }
  // With the two cards stacked, a card is wide enough for three columns: 1 2 3 / 4 5 6.
  await page.setViewportSize({ width: 480, height: 900 });
  expect((await layout('.kit-devices .fp-words')).map((l) => l.columns)).toEqual([3, 3]);
  await page.goto('/demo?beat=3');
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.locator('[data-step="3.1"] .fp-words')).toBeVisible();
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await broken(), `/demo at ${width}px`).toEqual([]);
    for (const l of await layout('.fp-words')) {
      expect(l.across, `/demo at ${width}px`).toBe(true);
      expect(l.minOverColumn, `/demo at ${width}px`).toBeLessThan(1);
    }
  }
});

test('once loaded, /kit makes no request: making kits, switching sheets, checking and printing', async ({ page, baseURL }) => {
  const origins = new Set();
  page.on('request', (r) => origins.add(new URL(r.url()).origin));
  await openKit(page);
  await page.waitForLoadState('networkidle');
  const after = [];
  page.on('request', (r) => after.push(r.url()));
  await make(page, 5, 3);
  for (const x of [1, 2, 3, 4, 5]) await page.getByRole('tab', { name: `Guardian ${x}` }).click();
  await page.getByRole('button', { name: 'The card, as printed' }).click();
  await expect(page.locator('.kit-result')).toHaveAttribute('data-result', 'pass');
  await page.getByRole('button', { name: 'Print all 6' }).click();
  await page.emulateMedia({ media: 'print' });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Make new kits' }).click();
  expect(after).toEqual([]);
  expect([...origins]).toEqual([new URL(baseURL).origin]);
});

test('/kit: no overclaiming words, no serious accessibility issue, no side-scroll, no endless animation, no CSP violation', async ({ page }) => {
  const noCspViolations = await watchCsp(page);
  await openKit(page);
  await expectNoSeriousA11yIssues(page);
  await make(page);
  await page.getByRole('button', { name: 'With one word changed' }).click();
  await expect(page.locator('.kit-result')).not.toHaveAttribute('data-result', 'none');
  expect(await pageCopy(page)).not.toMatch(BANNED); // the veto card's words are random: left out
  await expectFiniteAnimations(page);
  await expectNoSeriousA11yIssues(page);
  await expectNoSideScroll(page);
  await page.getByRole('tab', { name: 'Guardian 1' }).click();
  await page.getByRole('button', { name: 'The card, as printed' }).click();
  await expectNoSeriousA11yIssues(page);
  await noCspViolations();
});

test('/kit: a veto card typed into "Check your backup" is the visitor\'s data, not the page\'s words, even when it holds "live"', async ({ page }) => {
  await openKit(page);
  await make(page);
  const box = page.getByLabel('Your veto card’s words, from paper');
  // "live" is a BIP-39 word: one in a card of 24 random words turns up about once in 85 runs
  await box.fill(Array.from({ length: 24 }, (_, i) => (i === 7 ? 'live' : 'abandon')).join(' '));
  expect(await box.evaluate((e) => e.textContent)).toContain('live'); // React writes the value into the textarea's text node
  expect(await pageCopy(page)).not.toMatch(BANNED);
});

for (const width of [320, 375]) {
  test(`/kit at ${width}px: no side-scroll, every word in its sheet`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openKit(page);
    // Three guardians already outrun a phone's width: the far edge fades, so the hidden tab is no surprise.
    await make(page);
    expect(await page.locator('.kit-tabs').evaluate((l) => l.scrollWidth > l.clientWidth)).toBe(true);
    await expect(page.locator('.kit-tabs')).toHaveAttribute('data-more', 'end');
    await make(page, 7, 4);
    await expectNoSideScroll(page);
    for (const tab of ['Veto card', 'Guardian 7']) {
      await page.getByRole('tab', { name: tab }).click();
      await expectNoSideScroll(page);
      const escaped = await page.locator('.kit-panel:not([hidden]) .kit-sheet').evaluate((sheet) => {
        const box = sheet.getBoundingClientRect();
        return [...sheet.querySelectorAll('.kit-w, code')].filter((w) => {
          const r = w.getBoundingClientRect();
          return r.right > box.right + 0.5 || r.left < box.left - 0.5;
        }).length;
      });
      expect(escaped).toBe(0);
      // No word breaks across two lines: a backup copied from a broken word is a wrong backup. A check
      // word keeps the dot after it, so no line starts with one.
      const broken = await page.locator('.kit-panel:not([hidden]) :is(.kit-w, .kit-cw)').evaluateAll((ws) => ws
        .filter((w) => new Set([...w.getClientRects()].map((r) => Math.round(r.top))).size > 1).map((w) => w.textContent));
      expect(broken).toEqual([]);
      const lineStarts = await page.locator('.kit-panel:not([hidden]) .kit-cw').evaluateAll((ws) => ws.map((w) => w.textContent[0]));
      expect(lineStarts.filter((c) => c === '·')).toEqual([]);
    }
    // Eight tabs keep one line and scroll sideways: every tab on the tablist's rule, the chosen one in view
    // and clear of the fade at an edge with more tabs beyond it, whether chosen by click or by the keys.
    const tabs = page.locator('.kit-tabs');
    const rows = await page.getByRole('tab').evaluateAll((ts) => new Set(ts.map((t) => Math.round(t.getBoundingClientRect().top))).size);
    expect(rows).toBe(1);
    expect(await tabs.evaluate((l) => l.scrollWidth > l.clientWidth)).toBe(true);
    const placed = (more) => expect.poll(() => tabs.evaluate((l) => {
      const t = l.querySelector('[aria-selected="true"]').getBoundingClientRect();
      const r = l.getBoundingClientRect();
      const fade = 24;
      const at = l.dataset.more ?? 'none';
      const cs = getComputedStyle(l);
      const mask = (cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage) || 'none';
      return {
        more: at,
        faded: /gradient/.test(mask),
        clearStart: t.left - r.left >= (/start|both/.test(at) ? fade : 0) - 0.5,
        clearEnd: r.right - t.right >= (/end|both/.test(at) ? fade : 0) - 0.5,
      };
    })).toEqual({ more, faded: more !== 'none', clearStart: true, clearEnd: true });
    for (const [name, more] of [['Guardian 7', 'start'], ['Veto card', 'end'], ['Guardian 4', 'both']]) {
      await page.getByRole('tab', { name }).click();
      await placed(more);
    }
    await page.getByRole('tab', { name: 'Guardian 4' }).focus();
    for (const [key, name, more] of [['ArrowRight', 'Guardian 5', 'both'], ['ArrowRight', 'Guardian 6', /./], ['End', 'Guardian 7', 'start'], ['ArrowLeft', 'Guardian 6', /./], ['Home', 'Veto card', 'end']]) {
      await page.keyboard.press(key);
      await expect(page.getByRole('tab', { name })).toBeFocused();
      if (typeof more === 'string') await placed(more);
      else await expect.poll(() => tabs.evaluate((l) => {
        const t = l.querySelector('[aria-selected="true"]').getBoundingClientRect();
        const r = l.getBoundingClientRect();
        return t.left - r.left >= 23.5 && r.right - t.right >= 23.5;
      }), name).toBe(true);
    }
    await page.getByRole('button', { name: 'The card, as printed' }).click();
    await expectNoSideScroll(page);
  });
}

test('/kit under reduced motion: nothing moves, and everything still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openKit(page);
  await expect(page.locator('html')).not.toHaveClass(/\bmotion\b/);
  await make(page);
  await page.getByLabel('Your veto card’s words, from paper').fill('abandon');
  await page.getByRole('button', { name: 'Check the words' }).click();
  await expect(page.locator('.kit-result')).toHaveAttribute('data-result', 'word-count');
  // No animation at all, and no transition that moves anything: colour may still ease.
  const moving = await page.evaluate(() => document.getAnimations()
    .filter((a) => a.animationName || /transform|clip-path|translate|scale/.test(a.transitionProperty ?? ''))
    .map((a) => a.animationName || a.transitionProperty));
  expect(moving).toEqual([]);
  await page.getByRole('tab', { name: 'Veto card' }).click();
  await expect(page.locator('.kit-cover')).toBeVisible();
  expect(await page.locator('.kit-cover').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.locator('.kit-result').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.getByRole('button', { name: 'The card, as printed' }).click();
  await expect(page.locator('.kit-result')).toHaveAttribute('data-result', 'pass');
  await expectFiniteAnimations(page);
  await expectNoSeriousA11yIssues(page);
});

test('/demo shows the phone’s key as six words beside its hex fingerprint, and the same words on its recovery', async ({ page }) => {
  // Beat 3: the phone makes its key, then Seo-yeon opens a recovery for it.
  await page.goto('/demo?beat=3');
  await expect(page.locator('[data-step="3.1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.locator('[data-step="3.2"]')).toBeVisible();
  const step = page.locator('[data-step="3.1"]');
  await expect(step.locator('.detail')).toContainText(/device fingerprint [0-9A-F]{4}-[0-9A-F]{4}/);
  const phone = await step.locator('.fp-w').allInnerTexts();
  expect(phone).toHaveLength(6);
  expect(phone.every((w) => LIST.has(w))).toBe(true);
  await expect(step.locator('.fp-words')).toHaveAttribute('aria-label', `Device fingerprint: ${phone.join(' ')}`);

  // The public ledger lists the phone's recovery with the same six words: what a guardian compares.
  const recovery = page.locator('.ledger li[data-approvals]');
  await expect(recovery).toHaveCount(1);
  expect(await recovery.locator('.fp-w').allInnerTexts()).toEqual(phone);

  // Jihoon's recovery, for his own device, reads differently.
  await page.getByRole('button', { name: 'Run to the end' }).click();
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.locator('.ledger li[data-approvals]')).toHaveCount(2);
  const hostile = await page.locator('.ledger li[data-vetoed="true"] .fp-w').allInnerTexts();
  expect(hostile).toHaveLength(6);
  expect(hostile).not.toEqual(phone);
});
