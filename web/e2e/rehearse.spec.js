// "Rehearse a recovery" (/rehearse): the visitor makes every choice, and every accept and refusal is
// the compiled circuits'. Each test reads the contract's answer from the page's data-* hooks, which
// carry the circuit, the outcome and the contract's own message.
import { test, expect } from '@playwright/test';
import { BANNED, expectNoSeriousA11yIssues, expectNoSideScroll, expectFiniteAnimations, pageCopy, watchCsp } from './helpers.js';

async function openRehearse(page) {
  await page.goto('/rehearse');
  await expect(page.locator('.rehearse[data-ready="true"]')).toBeVisible();
}

/** Steps 1 to 4: choose (the default three guardians, or `threshold`), enrol, lose the laptop, open. */
async function upToTheRequests(page, { threshold } = {}) {
  if (threshold) await page.getByRole('radio', { name: new RegExp(`^${threshold} of `) }).check();
  await page.getByRole('button', { name: 'Use these guardians' }).click();
  await page.getByRole('button', { name: 'Enrol and deal the shares' }).click();
  await expect(page.locator('#rh-enrol-done')).toBeVisible();
  await page.getByRole('button', { name: 'Lose the laptop' }).click();
  await expect(page.locator('#rh-lose-done')).toBeVisible();
  await page.getByRole('button', { name: 'Open a recovery from the new phone' }).click();
  await expect(page.locator('#rh-open-done')).toBeVisible();
}

/** Guardian `i` answers the request from `device` ('phone' or 'caller'). */
async function answer(page, i, device, approve) {
  const request = page.locator(`.rh-guardian[data-guardian="${i}"] .rh-request[data-device="${device}"]`);
  await request.getByRole('button', { name: approve ? /^Approve/ : /^Refuse/ }).click();
  await expect(request).toHaveAttribute('data-answer', approve ? 'approved' : 'refused');
  if (approve) {
    await expect(request.locator('.step[data-circuit="approveRecovery"]')).toHaveAttribute('data-outcome', 'accepted');
  }
}

const skip = (page) => page.getByRole('button', { name: /^Skip .* \(simulated clock\)$/ }).click();
const finalize = (page) => page.getByRole('button', { name: 'Finalize', exact: true }).click();
/** The newest call of a step, as the page stamped it. */
const lastCall = (page, step) => page.locator(`#rh-${step} .rh-calls > li.step.call`).last();


async function expectRefused(call, message) {
  await expect(call).toHaveAttribute('data-circuit', 'finalizeRecovery');
  await expect(call).toHaveAttribute('data-outcome', 'refused');
  await expect(call).toHaveAttribute('data-message', message);
  await expect(call.locator('.chip.no')).toHaveText(`refused: “${message}”`);
}

// Names no word list or hash could hold by chance, so finding one anywhere means the page put it there.
const TOKENS = ['Qorvathine', 'Zendrixelle', 'Myloquent'];

test('the happy path: two of three guardians approve, the clock runs out, the phone finalizes', async ({ page }) => {
  await openRehearse(page);
  for (const [i, name] of TOKENS.entries()) await page.getByLabel(`Guardian ${i + 1}`, { exact: true }).fill(name);
  await upToTheRequests(page);
  await answer(page, 0, 'phone', true);
  await answer(page, 1, 'phone', true);
  await answer(page, 2, 'phone', false);
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await expect(page.locator('#rh-window-title')).toBeFocused();
  await skip(page);
  await expect(page.locator('.rh-clock')).toHaveAttribute('data-over', 'true');
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);

  const call = lastCall(page, 'finalize');
  await expect(call).toHaveAttribute('data-circuit', 'finalizeRecovery');
  await expect(call).toHaveAttribute('data-outcome', 'accepted');
  await expect(page.locator('#rh-finalize-done')).toBeFocused();
  await expect(page.locator('.rh')).toHaveAttribute('data-finalized', 'you');
  // The lock: the one Ember chip, as on /demo.
  await expect(call.locator('.chip.ok')).toHaveCSS('background-color', 'rgb(255, 138, 61)');

  await page.getByRole('button', { name: 'See what the public record saw' }).click();
  const record = page.locator('#rh-record');
  await expect(record.locator('[data-count="retired"] dd').first()).toHaveText('1');
  await expect(record.locator('[data-count="approvals"] dd').first()).toHaveText('2');
  // Names never reach the record: not its text, not an accessible name, not an attribute.
  const text = await record.innerText();
  const html = await record.evaluate((el) => el.outerHTML);
  const labels = await record.evaluate((el) => [...el.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).join(' '));
  for (const name of TOKENS) {
    expect(text).not.toContain(name);
    expect(html).not.toContain(name);
    expect(labels).not.toContain(name);
  }
  // Refused calls are listed apart from the transactions, as never on the record.
  await expect(record.locator('.rh-transcript-list li[data-outcome="refused"]')).toHaveCount(0);
  // A root or guardian context that is one of the listed commitments is named, not printed again:
  // the first commitment first, its successor after it.
  const ids = record.locator('.rh-id-public');
  await expect(ids).toHaveCount(2);
  for (const [k, root] of [[0, 'this commitment'], [1, 'the first commitment']]) {
    await expect(ids.nth(k).locator('div').filter({ hasText: /^root/ }).locator('dd')).toHaveText(root);
    await expect(ids.nth(k).locator('div').filter({ hasText: /^guardian context/ }).locator('dd')).toHaveText(root);
  }
  // Beside step 8, from 1080px, the side panel keeps to what each device holds: the record above
  // already opens on the counts.
  const wide = (page.viewportSize()?.width ?? 0) >= 1080;
  await expect(page.locator('#rh-state [data-count="retired"]')).toHaveCount(wide ? 0 : 1);
  await expect(page.locator('#rh-state .rh-people')).toBeVisible();
});

test('too few approvals: the contract refuses before it reads a secret, and writes nothing', async ({ page }) => {
  await openRehearse(page);
  await upToTheRequests(page, { threshold: 3 });
  await answer(page, 0, 'phone', true);
  await answer(page, 1, 'phone', true);
  await answer(page, 2, 'phone', false);
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await skip(page);
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);
  await expectRefused(lastCall(page, 'finalize'), 'not enough approvals');
  await expect(page.locator('.rh')).toHaveAttribute('data-finalized', 'none');
  // A refused call writes nothing.
  await expect(page.locator('.rh-side [data-count="retired"] dd')).toHaveText('0');
  // Step 8 lists it apart: tried and refused, never on the record.
  await page.getByRole('button', { name: 'See what the public record saw' }).click();
  const tried = page.locator('#rh-record .rh-tried');
  await expect(tried.getByRole('heading', { name: 'Tried and refused: never on the record' })).toBeVisible();
  await expect(tried.locator('li[data-outcome="refused"]')).toHaveCount(1);
  await expect(tried).toContainText('not enough approvals');
  await expect(page.locator('#rh-record [aria-labelledby="rh-record-written"] li[data-outcome="refused"]')).toHaveCount(0);
});

test('finalizing before the 72 hours are up is refused; after them, the same phone succeeds', async ({ page }) => {
  await openRehearse(page);
  await upToTheRequests(page);
  await answer(page, 0, 'phone', true);
  await answer(page, 1, 'phone', true);
  await answer(page, 2, 'phone', true);
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);
  await expectRefused(lastCall(page, 'finalize'), 'timelock has not elapsed');
  // Refused calls take focus, so a screen reader reads the contract's answer.
  await expect(lastCall(page, 'finalize')).toBeFocused();

  // A different phone and a tampered share, each refused by its own check, once the wait is over.
  await skip(page);
  await page.getByRole('radio', { name: /a different phone/ }).check();
  await finalize(page);
  await expectRefused(lastCall(page, 'finalize'), 'not the device the guardians approved');
  await page.getByRole('radio', { name: /your new phone/ }).check();
  await page.getByRole('checkbox', { name: /a byte changed/ }).check();
  await finalize(page);
  await expectRefused(lastCall(page, 'finalize'), 'reconstructed secret does not open idCommit');
  await page.getByRole('checkbox', { name: /a byte changed/ }).uncheck();
  await finalize(page);
  await expect(lastCall(page, 'finalize')).toHaveAttribute('data-outcome', 'accepted');
});

test('the phishing call: approving it hands the caller your identity, unless your veto card stops him', async ({ page }) => {
  await openRehearse(page);
  await upToTheRequests(page);
  await page.getByRole('button', { name: 'Place the phishing call' }).click();
  await expect(page.locator('#rh-phish-done .step[data-circuit="openRecovery"]')).toHaveAttribute('data-outcome', 'accepted');
  // Each guardian's app now shows two recoveries, told apart only by their words.
  await expect(page.locator('.rh-guardian[data-guardian="0"] .rh-request')).toHaveCount(2);
  for (const i of [0, 1, 2]) {
    await answer(page, i, 'phone', true);
    await answer(page, i, 'caller', true); // fooled: the contract accepts a real guardian's approval
  }
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await expect(page.locator('#rh-rec-caller .rh-mine')).toContainText('you did not start this one');

  // No veto: the caller finalizes the moment the wait ends, and the contract accepts.
  await skip(page);
  const his = page.locator('#rh-window .rh-calls > li[data-tag="caller"][data-circuit="finalizeRecovery"]');
  await expect(his).toHaveAttribute('data-outcome', 'accepted');
  await expect(his).toHaveAttribute('data-against', 'true');
  await expect(page.locator('.rh')).toHaveAttribute('data-finalized', 'caller');
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);
  await expectRefused(lastCall(page, 'finalize'), 'identity already retired');

  // Again, with new secrets: this time the owner vetoes the recovery whose words are not theirs.
  await page.getByRole('button', { name: 'Start again with new secrets' }).click();
  await expect(page.locator('#rh-enrol-title')).toBeFocused();
  await page.getByRole('button', { name: 'Enrol and deal the shares' }).click();
  await page.getByRole('button', { name: 'Lose the laptop' }).click();
  await page.getByRole('button', { name: 'Open a recovery from the new phone' }).click();
  await page.getByRole('button', { name: 'Place the phishing call' }).click();
  for (const i of [0, 1, 2]) {
    await answer(page, i, 'phone', true);
    await answer(page, i, 'caller', true);
  }
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await page.locator('#rh-rec-caller').getByRole('button', { name: /^Veto with your veto card/ }).click();
  await expect(lastCall(page, 'window')).toHaveAttribute('data-circuit', 'vetoRecovery');
  await expect(lastCall(page, 'window')).toHaveAttribute('data-outcome', 'accepted');
  await expect(page.locator('#rh-rec-caller')).toHaveAttribute('data-vetoed', 'true');
  await skip(page);
  const vetoed = page.locator('#rh-window .rh-calls > li[data-tag="caller"][data-circuit="finalizeRecovery"]');
  await expect(vetoed).toHaveAttribute('data-outcome', 'refused');
  await expect(vetoed).toHaveAttribute('data-message', 'recovery vetoed');
  // The veto killed his recovery, not the three shares he was sent: they rebuild your secret, which
  // opens your commitment until your own recovery retires it. The page never says they are worthless.
  const note = vetoed.locator('.rh-why');
  await expect(note).toContainText('But the 3 shares he was sent rebuild your identity secret');
  await expect(note).toContainText('until your own recovery finalizes and retires it, he can act as you wherever your identity is accepted. Finalize yours.');
  await expect(note).not.toContainText('worth nothing');
  await expect(page.locator('.person[data-persona="caller"] .tag')).toHaveText('can act as you');
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);
  await expect(lastCall(page, 'finalize')).toHaveAttribute('data-outcome', 'accepted');
  await expect(page.locator('.rh')).toHaveAttribute('data-finalized', 'you');
  // Once yours has finalized, his shares open nothing: the note says so now.
  await expect(note).toContainText('your own recovery has since retired the commitment it was after. His approvals, and the shares he was sent, are worth nothing now.');
  await expect(page.locator('.person[data-persona="caller"] .tag')).toHaveText('not you');
});

test('a caller one approval short: the contract refuses him before any secret, and your recovery goes on', async ({ page }) => {
  await openRehearse(page);
  await upToTheRequests(page);
  await page.getByRole('button', { name: 'Place the phishing call' }).click();
  for (const i of [0, 1, 2]) {
    await answer(page, i, 'phone', true);
    await answer(page, i, 'caller', i === 0); // one guardian is fooled; your rule needs two
  }
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await skip(page);
  const his = page.locator('#rh-window .rh-calls > li[data-tag="caller"][data-circuit="finalizeRecovery"]');
  await expectRefused(his, 'not enough approvals');
  await expect(his.locator('.rh-why')).toContainText('his recovery gathered');
  await expect(his).not.toHaveAttribute('data-against', 'true');
  await expect(page.locator('.rh')).toHaveAttribute('data-finalized', 'none');
  await expect(page.locator('#rh-window-done')).toHaveText('The 72 hours are over.');
  // Your own recovery is untouched by his: it finalizes.
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);
  await expect(lastCall(page, 'finalize')).toHaveAttribute('data-outcome', 'accepted');
  await expect(page.locator('.rh')).toHaveAttribute('data-finalized', 'you');
});

test('guardians can be renamed, added and removed; names stay in the page', async ({ page }) => {
  await openRehearse(page);
  await page.getByLabel('Guardian 1', { exact: true }).fill('Hyun-woo');
  await page.getByRole('button', { name: 'Add a guardian' }).click();
  await expect(page.getByLabel('Guardian 4', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Add a guardian' }).click();
  await expect(page.getByRole('button', { name: 'Add a guardian' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove Dad' }).click();
  await expect(page.getByRole('button', { name: 'Add a guardian' })).toBeFocused();
  // Two guardians with one name are refused, before any circuit runs.
  await page.getByLabel('Guardian 2', { exact: true }).fill('hyun-woo');
  await expect(page.getByRole('button', { name: 'Use these guardians' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByLabel('Guardian 3', { exact: true }).press('Enter');
  await expect(page.getByLabel('Guardian 2', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Guardian 2', { exact: true })).toBeFocused();
  await expect(page.locator('#rh-enrol')).toHaveCount(0);
  await page.getByLabel('Guardian 2', { exact: true }).fill('Soo-ah');
  await page.getByRole('radio', { name: '3 of 4' }).check();
  await page.getByRole('button', { name: 'Use these guardians' }).click();
  await page.getByRole('button', { name: 'Enrol and deal the shares' }).click();
  await expect(page.locator('#rh-enrol .rh-calls > li[data-circuit="addGuardian"][data-outcome="accepted"]')).toHaveCount(4);
  await expect(page.locator('.rh-dealt > li')).toHaveCount(4);
  await expect(page.locator('.rh-dealt')).toContainText('Hyun-woo');
  await expect(page.locator('.rh-dealt')).toContainText('Soo-ah');
});

test('each guardian is dealt a kit in words, and the veto card is words too', async ({ page }) => {
  await openRehearse(page);
  await page.getByRole('button', { name: 'Add a guardian' }).click();
  await page.getByRole('button', { name: 'Use these guardians' }).click();
  await page.getByRole('button', { name: 'Enrol and deal the shares' }).click();
  await expect(page.locator('#rh-enrol-done')).toBeVisible();
  const word = /^[a-z]{3,8}$/;
  for (const i of [0, 1, 2, 3]) {
    const kit = page.locator(`.rh-kit[data-kit="${i}"]`);
    // Closed until opened: the words are the guardian's, and the row says whose.
    await expect(kit).not.toHaveAttribute('open', '');
    await expect(kit.locator('> summary')).toHaveAccessibleName(new RegExp(`’s kit, in words: share #${i + 1}`));
    await kit.locator('> summary').click();
    await expect(kit).toHaveAttribute('open', '');
    await expect(kit.getByRole('heading', { name: `Share ${i + 1} of 4` })).toBeVisible();
    for (const section of ['share', 'secret', 'salt']) {
      const words = await kit.locator(`[data-section="${section}"] .kit-w`).allInnerTexts();
      expect(words).toHaveLength(24);
      for (const w of words) expect(w).toMatch(word);
    }
    await expect(kit.locator('.rh-kit-check .kit-cw')).toHaveCount(3);
  }
  const veto = page.locator('.rh-kit[data-kit="veto"]');
  await veto.locator('> summary').click();
  await expect(veto.locator('.kit-w')).toHaveCount(24);
  const check = (await veto.locator('.kit-cw').allInnerTexts()).map((t) => t.replace(/^·\s*/, ''));
  expect(check).toHaveLength(3);
  await expect(page.locator('#rh-enrol-done a[href="/kit"]')).toBeVisible();

  // In the 72 hours, the phone shows the same three check words once the card is typed in.
  await page.getByRole('button', { name: 'Lose the laptop' }).click();
  await page.getByRole('button', { name: 'Open a recovery from the new phone' }).click();
  for (const i of [0, 1, 2, 3]) await answer(page, i, 'phone', true);
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  const shown = (await page.locator('#rh-card-check .kit-cw').allInnerTexts()).map((t) => t.replace(/^·\s*/, ''));
  expect(shown).toEqual(check);
  await expect(page.locator('#rh-window a[href="/live#watch"]')).toBeVisible();
});

// The 72 hours' link to the watch on /live lands on the watch, by pointer and by keyboard, with motion
// or without: the window goes to the top first, and /live draws after the browser's own jump, so the
// app scrolls to the address's #target once the page is ready (App.jsx).
for (const motion of ['no-preference', 'reduce']) {
  test(`the link to the watch on /live lands on it, by click and by Enter (motion: ${motion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    // Preprod's indexer out of reach: the watch is drawn all the same, and the run needs no network
    await page.route('https://indexer.preprod.midnight.network/**', (route) => route.abort('connectionrefused'));
    await page.routeWebSocket(/^wss:\/\/indexer\.preprod\.midnight\.network\//, (ws) => ws.close());
    for (const how of ['click', 'Enter']) {
      await openRehearse(page);
      await upToTheRequests(page);
      await answer(page, 0, 'phone', true);
      await answer(page, 1, 'phone', true);
      await answer(page, 2, 'phone', false);
      await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
      const link = page.locator('#rh-window a[href="/live#watch"]');
      if (how === 'click') await link.click();
      else { await link.focus(); await page.keyboard.press('Enter'); }
      await expect(page).toHaveURL(/\/live#watch$/);
      const watch = page.locator('#watch');
      await expect(watch).toBeInViewport();
      // its top clear of the sticky header, near the top of the window, not thousands of pixels down
      await expect.poll(() => watch.evaluate((e) => Math.round(e.getBoundingClientRect().top)), { message: how }).toBeLessThan(200);
      expect(await watch.evaluate((e) => e.getBoundingClientRect().top >= document.querySelector('header.site').getBoundingClientRect().bottom - 1)).toBe(true);
      if (how === 'Enter') await expect(watch).toBeFocused();
    }
  });
}

test('if the contract cannot load, the page says so and offers a reload', async ({ page }) => {
  await page.route(/\/assets\/engine-[^/]*\.js$/, (route) => route.abort());
  await page.goto('/rehearse');
  await expect(page.getByRole('alert')).toContainText('The compiled contract did not load');
  await expect(page.getByRole('button', { name: 'reload the page' })).toBeVisible();
  await expect(page.locator('.rehearse')).not.toHaveAttribute('data-ready', 'true');
  // not a loading line: the page counts as drawn (App.jsx), so a route change is not held on it
  await expect(page.locator('main .loading')).toHaveCount(0);
});

// Every page that loads the compiled contract, the same way: never "Loading…" for ever, never an
// unhandled rejection, whether the chunk or its WebAssembly fails.
for (const [path, loading] of [['/demo', 'Loading the compiled contract'], ['/attacks', 'Building the four ledgers'], ['/kit', 'Loading the contract']]) {
  for (const what of ['the chunk', 'its WebAssembly']) {
    test(`${path}: if ${what} cannot load, the page says so and offers a reload`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(what === 'the chunk' ? /\/assets\/engine-[^/]*\.js$/ : /\.wasm$/, (route) => route.abort());
      await page.goto(path);
      await expect(page.getByRole('alert')).toContainText('The compiled contract did not load. Check your connection, then reload the page.');
      await expect(page.getByRole('button', { name: 'reload the page' })).toBeVisible();
      await expect(page.locator('main')).not.toContainText(loading);
      await expect(page.locator('main .loading')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}

test('keyboard: a page whose contract did not load still takes the focus after a route change', async ({ page }) => {
  await page.route(/\/assets\/engine-[^/]*\.js$/, (route) => route.abort());
  await page.goto('/about');
  const primary = page.getByRole('navigation', { name: 'Primary' });
  // /demo draws no h1 until the contract is in: the line that says it did not load takes the focus
  await primary.getByRole('link', { name: 'The recovery' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator('main .load-failed')).toBeFocused();
  // /attacks has its h1 above the line
  await primary.getByRole('link', { name: 'Attack it' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/attacks$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('The compiled contract did not load');
});

test('keyboard: every step is done from the keyboard, and focus follows what each one did', async ({ page, browserName }) => {
  // Safari moves Tab through buttons only with Option held, unless the reader has asked otherwise.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await openRehearse(page);
  const press = async (name) => {
    await page.getByRole('button', { name, exact: true }).focus();
    await page.keyboard.press('Enter');
  };
  await press('Use these guardians');
  await expect(page.locator('#rh-enrol-title')).toBeFocused();
  await press('Enrol and deal the shares');
  await expect(page.locator('#rh-enrol-done')).toBeFocused();
  // Tab goes through each kit, the veto card and the way to /kit, then on to the next step's button.
  for (const kit of ['0', '1', '2', 'veto']) {
    await page.keyboard.press(tab);
    await expect(page.locator(`.rh-kit[data-kit="${kit}"] > summary`)).toBeFocused();
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('.rh-kit[data-kit="veto"]')).toHaveAttribute('open', '');
  await page.keyboard.press(tab);
  await expect(page.locator('#rh-enrol-done a[href="/kit"]')).toBeFocused();
  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: 'Lose the laptop' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rh-lose-done')).toBeFocused();
  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: 'Open a recovery from the new phone' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rh-open-done')).toBeFocused();
  // Each answer takes focus to what it did; Tab goes on to the next request's buttons.
  for (const i of [0, 1, 2]) {
    await page.locator(`.rh-guardian[data-guardian="${i}"] .rh-request[data-device="phone"]`).getByRole('button', { name: /^Approve/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`#rh-answer-${i}-phone`)).toBeFocused();
  }
  await press('Continue to the 72 hours');
  await expect(page.locator('#rh-window-title')).toBeFocused();
  await page.getByRole('button', { name: /^Skip/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rh-window-done')).toBeFocused();
  await press('Continue to finalize');
  await press('Finalize');
  await expect(page.locator('#rh-finalize-done')).toBeFocused();
  // The status region says what the contract answered.
  await expect(page.locator('.rh > [role="status"]')).toHaveText(/finalizeRecovery accepted/);
  // The rail links each reached step.
  await expect(page.locator('.rh-rail a')).toHaveCount(7);
  await expect(page.locator('.rh-rail a[aria-current="step"]')).toHaveAttribute('href', '#rh-finalize');
});

test('with reduced motion, nothing animates, and every end state is there at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRehearse(page);
  // Checked straight after each action, while an animation would still be running.
  const running = () => page.evaluate(() => document.getAnimations()
    .filter((a) => a.animationName !== undefined).map((a) => a.animationName));
  await page.getByRole('button', { name: 'Use these guardians' }).click();
  expect(await running()).toEqual([]);
  await page.getByRole('button', { name: 'Enrol and deal the shares' }).click();
  await expect(page.locator('#rh-enrol-done')).toBeVisible();
  expect(await running()).toEqual([]);
  await page.getByRole('button', { name: 'Lose the laptop' }).click();
  await expect(page.locator('#rh-lose-done')).toBeVisible();
  expect(await running()).toEqual([]);
  // The laptop is dark at once: the lit lantern is covered, not being wiped away.
  await expect(page.locator('.rh-lit')).toHaveCSS('clip-path', /^inset\(100%/);
  for (const sel of ['#rh-open .rh-step-head h2', '.rh-rail .current .rh-num', '#rh-lose-done', '.rh-unlit']) {
    await expect(page.locator(sel)).toHaveCSS('animation-name', 'none');
  }
  await page.getByRole('button', { name: 'Open a recovery from the new phone' }).click();
  await expect(page.locator('#rh-open-done')).toBeVisible();
  expect(await running()).toEqual([]);
  await answer(page, 0, 'phone', true);
  await answer(page, 1, 'phone', true);
  await answer(page, 2, 'phone', true);
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await skip(page);
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);
  await expect(lastCall(page, 'finalize')).toHaveAttribute('data-outcome', 'accepted');
  const animations = await page.evaluate(() => document.getAnimations()
    .filter((a) => a.animationName !== undefined).map((a) => a.animationName));
  expect(animations).toEqual([]);
  await expect(lastCall(page, 'finalize').locator('.chip.ok')).toHaveCSS('background-color', 'rgb(255, 138, 61)');
  await expectFiniteAnimations(page);
});

test('/rehearse: no overclaiming words, no serious accessibility issue, no endless animation, no CSP violation', async ({ page }) => {
  const noCspViolations = await watchCsp(page);
  await openRehearse(page);
  await expectNoSeriousA11yIssues(page);
  await upToTheRequests(page);
  await page.getByRole('button', { name: 'Place the phishing call' }).click();
  await answer(page, 0, 'phone', true);
  await answer(page, 0, 'caller', true);
  await expectNoSeriousA11yIssues(page);
  for (const i of [1, 2]) {
    await answer(page, i, 'phone', true);
    await answer(page, i, 'caller', false);
  }
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await page.locator('#rh-rec-caller').getByRole('button', { name: /^Veto/ }).click();
  await skip(page);
  // one share reached him, fewer than the two that rebuild your secret: nothing alone, yet not nothing
  await expect(page.locator('#rh-window .rh-calls > li[data-tag="caller"][data-circuit="finalizeRecovery"] .rh-why'))
    .toContainText('The share he was sent reveals nothing about your secret on its own, but it counts toward the 2 that rebuild it until your own recovery finalizes and retires it.');
  await expect(page.locator('.person[data-persona="caller"] .tag')).toHaveText('not you');
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);
  await page.getByRole('button', { name: 'See what the public record saw' }).click();
  await expect(page.locator('#rh-record')).toBeVisible();
  const copy = await pageCopy(page);
  // The scan reads the whole page: every step's copy, the guardians' cards, the record and the footer.
  for (const line of ['Each guardian decides', 'Heard from a caller who rang', 'What the public record saw', 'Tried and refused', 'The people in the story are fictional']) {
    expect(copy).toContain(line);
  }
  expect(copy).not.toMatch(BANNED);
  await expect(page.locator('.honesty')).toContainText('no wallet, no chain, no proofs');
  await expectFiniteAnimations(page);
  await expectNoSeriousA11yIssues(page);
  await expectNoSideScroll(page);
  await noCspViolations();
});

for (const width of [320, 375]) {
  test(`at ${width}px, no step scrolls the page sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await openRehearse(page);
    await expectNoSideScroll(page);
    // The longest name the field takes, with nowhere to break: it wraps, and never pushes the page.
    await page.getByLabel('Guardian 1', { exact: true }).fill('W'.repeat(24));
    await page.getByRole('button', { name: 'Add a guardian' }).click();
    await page.getByRole('button', { name: 'Add a guardian' }).click();
    await expectNoSideScroll(page);
    await upToTheRequests(page, { threshold: 3 });
    await expectNoSideScroll(page);
    for (const kit of ['0', 'veto']) await page.locator(`.rh-kit[data-kit="${kit}"] > summary`).click();
    await expectNoSideScroll(page);
    await page.getByRole('button', { name: 'Place the phishing call' }).click();
    for (const i of [0, 1, 2, 3, 4]) {
      await answer(page, i, 'phone', true);
      await answer(page, i, 'caller', i < 1);
    }
    await expectNoSideScroll(page);
    await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
    await skip(page);
    await expectNoSideScroll(page);
    await page.getByRole('button', { name: 'Continue to finalize' }).click();
    await finalize(page);
    await expect(lastCall(page, 'finalize')).toHaveAttribute('data-outcome', 'accepted');
    await expectNoSideScroll(page);
    await page.getByRole('button', { name: 'See what the public record saw' }).click();
    await expectNoSideScroll(page);
  });
}

test('/rehearse makes no network request after it has loaded, through whole rehearsals', async ({ page, baseURL }) => {
  const origins = new Set();
  page.on('request', (r) => origins.add(new URL(r.url()).origin));
  await openRehearse(page);
  await page.waitForLoadState('networkidle');
  expect([...origins]).toEqual([new URL(baseURL).origin]);
  const after = [];
  page.on('request', (r) => after.push(r.url()));
  await upToTheRequests(page);
  await page.getByRole('button', { name: 'Place the phishing call' }).click();
  for (const i of [0, 1, 2]) {
    await answer(page, i, 'phone', true);
    await answer(page, i, 'caller', i < 2);
  }
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await skip(page);
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);
  await page.getByRole('button', { name: 'See what the public record saw' }).click();
  await page.getByRole('button', { name: 'Start again, same guardians' }).click();
  await page.getByRole('button', { name: 'Enrol and deal the shares' }).click();
  await page.getByRole('button', { name: 'Lose the laptop' }).click();
  await page.getByRole('button', { name: 'Open a recovery from the new phone' }).click();
  for (const i of [0, 1, 2]) await answer(page, i, 'phone', true);
  await page.getByRole('button', { name: 'Continue to the 72 hours' }).click();
  await skip(page);
  await page.getByRole('button', { name: 'Continue to finalize' }).click();
  await finalize(page);
  await expect(page.locator('#rh-finalize-done')).toBeVisible();
  expect(after).toEqual([]);
});
