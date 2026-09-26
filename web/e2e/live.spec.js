// /live, "On Preprod", against the public indexer's own answers, recorded once
// (e2e/fixtures/record.mjs) and served here with page.route and page.routeWebSocket: the page's real
// code, real Preprod data, no network, and a fixed clock (26 Sep 2026, 12:00 UTC, while the shipped
// recovery waits). One test reads the real indexer instead, only when LANTERN_LIVE=1 is set.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { BANNED, expectFiniteAnimations, expectNoSeriousA11yIssues, expectNoSideScroll, pageCopy, watchCsp } from './helpers.js';
import { COMMITTED_KEYS, compareKeys, FLAVOUR_KEYS } from '../src/live/keys.js';
import { isFrozen, parseIdCommit, recordedRecoveryView, recoveryState, spanWords } from '../src/live/status.js';

const FIX = JSON.parse(readFileSync(new URL('./fixtures/indexer.json', import.meta.url), 'utf8'));
const SHIPPED = JSON.parse(readFileSync(new URL('../../deployments/preprod-shipped.json', import.meta.url), 'utf8'));
const STORY = JSON.parse(readFileSync(new URL('../../deployments/preprod.json', import.meta.url), 'utf8'));
const INDEXER = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const NOW = new Date('2026-09-26T12:00:00Z');
const DEMO_ID = SHIPPED.recovery.idCommit;
const STORY_HANA = STORY.steps.find((s) => s.id === '0.1').args[0];
const STORY_LANTERN = STORY.contracts.lantern.address;
const RECORDED = 58; // transactions across both records: 9 shipped, 23 + 26 for the whole story
const FACTS = 3 * 3 + 5 + 2 + RECORDED;
const CONFIRM = 'Lantern is watching this identity'; // the notification that says the watch is on
const APPROVAL = 'A recovery for the identity you watch gained an approval';
const SHIPPED_ADDRESS = SHIPPED.contract.address;
const lastBlock = (steps, keep) => Math.max(...steps.filter((s) => s.tx?.blockHeight && keep(s)).map((s) => s.tx.blockHeight));
const STORY_LAST = lastBlock(STORY.steps, (s) => s.contract !== 'host'); // 2,704,954
const HOST_LAST = lastBlock(STORY.steps, (s) => s.contract === 'host'); // 2,704,983

/** A contract call the records do not hold, made after them: its action, as the indexer sends it. */
function laterCall(address, entryPoint, height, time) {
  const hash = createHash('sha256').update(`${address}:${entryPoint}:${height}`).digest('hex');
  return {
    __typename: 'ContractCall', address, entryPoint,
    transaction: { hash, identifiers: [`00${hash}`], transactionResult: { status: 'SUCCESS' }, block: { height, timestamp: time } },
  };
}
/** A contract's state answer with a later action on top (the state itself as recorded). */
const withAction = (address, action, base = FIX.state[address]) => ({ contractAction: { ...action, state: base.contractAction.state } });

/** The state in one block, as the indexer answers it: the recorded state whose action is in that
 *  block (the latest, or one of the story's earlier ones), else none. */
function stateAt(address, height) {
  const known = [FIX.state[address], ...(address === STORY_LANTERN ? Object.values(FIX.earlier) : [])];
  return known.find((s) => s?.contractAction?.transaction.block.height === height) ?? { contractAction: null };
}

/**
 * Serves the recorded indexer. `over` can be changed mid-test: over.states[address] replaces that
 * contract's state answer (its latest), over.actions[address] the actions its stream replays,
 * over.tx[id] a transaction's answer, over.fail refuses every request, over.status answers every
 * request with that HTTP status, over.failFor (a Set of addresses) refuses the questions about those
 * contracts, over.delay holds each transaction's answer that many milliseconds. `asked` lists each
 * operation asked, `asked.at` each LanternStateAt's address and block, `asked.subs` each stream's
 * address, `asked.frames` every message the page sent on a stream.
 */
async function serveIndexer(page, over = {}) {
  over.states ??= {};
  over.tx ??= {};
  over.actions ??= {};
  const asked = [];
  asked.at = [];
  asked.subs = [];
  asked.frames = [];
  await page.route(INDEXER, async (route) => {
    if (over.fail) return route.abort('connectionrefused').catch(() => {});
    if (over.status) return route.fulfill({ status: over.status, contentType: 'text/plain', body: 'unavailable' }).catch(() => {});
    const { query, variables } = route.request().postDataJSON();
    const op = /^(?:query|subscription)\s+(\w+)/.exec(query)?.[1];
    asked.push(op);
    if (over.failFor?.has(variables.address)) return route.abort('connectionrefused').catch(() => {});
    if (over.delay && op === 'LanternTx') await new Promise((r) => { setTimeout(r, over.delay); });
    let data;
    if (op === 'LanternStateAt') {
      const height = variables.offset?.blockOffset?.height;
      asked.at.push([variables.address, height]);
      data = stateAt(variables.address, height);
    } else if (op === 'LanternState' || op === 'LanternLatest') {
      const s = over.states[variables.address] ?? FIX.state[variables.address] ?? { contractAction: null };
      if (op === 'LanternLatest' && s.contractAction) {
        const { state, ...action } = s.contractAction; // the same action, without its state
        data = { contractAction: action };
      } else data = s;
    } else if (op === 'LanternTx') {
      data = over.tx[variables.offset.identifier] ?? FIX.tx[variables.offset.identifier] ?? { transactions: [] };
    } else {
      return route.fulfill({ status: 200, json: { errors: [{ message: `unexpected operation ${op}` }] } });
    }
    // (a question the page gave up on, having been left, is not answered: fine)
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data }) }).catch(() => {});
  });
  await page.routeWebSocket(INDEXER_WS, (ws) => {
    ws.onMessage((raw) => {
      asked.frames.push(String(raw));
      const m = JSON.parse(String(raw));
      if (m.type === 'connection_init') ws.send(JSON.stringify({ type: 'connection_ack' }));
      if (m.type === 'subscribe') {
        const { address, offset } = m.payload.variables;
        asked.subs.push(address);
        for (const a of over.actions[address] ?? FIX.actions[address] ?? []) {
          if (a.transaction.block.height >= (offset?.height ?? 0)) ws.send(JSON.stringify({ id: m.id, type: 'next', payload: { data: { contractActions: a } } }));
        }
      }
    });
  });
  return asked;
}

/** A stand-in for the browser's notifications: each one shown is kept in window.__notes, with the
 *  options it was shown with. */
async function recordNotifications(page) {
  await page.addInitScript(() => {
    window.__notes = [];
    window.Notification = class {
      static permission = 'default';
      static async requestPermission() { this.permission = 'granted'; return 'granted'; }
      constructor(title, options) { window.__notes.push({ title, body: options?.body, tag: options?.tag, renotify: options?.renotify }); }
    };
  });
}
const notes = (page) => page.evaluate(() => window.__notes.map((n) => n.title));
const noteOptions = (page) => page.evaluate(() => window.__notes);

/** The tab goes to the background, as far as the page can tell. */
async function hideTab(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function openLive(page, path = '/live') {
  await page.goto(path);
  await expect(page.locator('.lv-recovery')).toHaveAttribute('data-source', 'chain');
  await expect(page.locator('.lv-timeline-note').first()).toContainText('9 of 9 on chain');
}

test.describe('/live on recorded Preprod data', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
  });

  test('the shipped recovery, read from the chain: where it stands, when it can finalize, its countdown', async ({ page }) => {
    await serveIndexer(page);
    await openLive(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('On Preprod');
    await expect(page.getByTestId('shipped-state')).toHaveText('Waiting out the timelock');
    await expect(page.getByTestId('shipped-approvals')).toHaveText('2 of 2');
    await expect(page.getByTestId('finalize-from')).toHaveText('27 Sep 2026, 15:03 UTC');
    // 12:00 on the 26th: a day, 3 hours and 3 minutes to go
    const timer = page.locator('.lv-recovery').getByRole('timer');
    await expect(timer).toHaveAttribute('aria-label', '1 day 3 h to go');
    await expect(timer).toHaveText(/^1d03h0[23]min\d\ds$/); // the clock runs on from 12:00:00
    await expect(page.locator('.lv-recovery [data-fingerprint-words]')).toHaveAttribute('data-fingerprint-words', 'ancient magic divorce appear major gorilla');
    await expect(page.locator('.lv-recovery').getByRole('link', { name: /bfd4fa77…52c9/ }))
      .toHaveAttribute('href', `https://preprod.midnightexplorer.com/contracts/${SHIPPED.contract.address}`);
    await expect(page.locator('.lv-refused')).toContainText('timelock has not elapsed');
  });

  test('every call on the shipped contract, in order, each linked to the explorer', async ({ page }) => {
    await serveIndexer(page);
    await openLive(page);
    const rows = page.locator('.lv-timeline').first().locator('li');
    await expect(rows).toHaveCount(9);
    await expect(rows.and(page.locator('.seen'))).toHaveCount(9);
    const circuits = await rows.evaluateAll((els) => els.map((e) => e.dataset.circuit));
    expect(circuits).toEqual(['deploy', 'update', 'enrollIdentity', 'addGuardian', 'addGuardian', 'addGuardian', 'openRecovery', 'approveRecovery', 'approveRecovery']);
    const hrefs = await rows.locator('a.lv-hash').evaluateAll((els) => els.map((a) => a.getAttribute('href')));
    const recorded = [SHIPPED.contract.txHash, SHIPPED.contract.maintenanceAuthority.frozenBy.txHash, ...SHIPPED.steps.filter((s) => s.tx).map((s) => s.tx.txHash)];
    expect(hrefs).toEqual(recorded.map((h) => `https://preprod.midnightexplorer.com/transactions/${h}`));
    await expect(rows.first()).toContainText('24 Sep, 14:51:06');
    await expect(rows.first()).toContainText('block 2,690,632');
  });

  test('"Check it in your browser" ticks every fact, one by one, against the chain', async ({ page }) => {
    await serveIndexer(page);
    await openLive(page);
    await page.getByRole('button', { name: 'Check it against the chain' }).click();
    await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('check-summary')).toHaveText(`All ${FACTS} checks match the chain.`);
    await expect(page.locator('.lv-check[data-state="pass"]')).toHaveCount(FACTS);
    const contracts = page.locator('.lv-check-group.contracts');
    await expect(contracts).toContainText('10 of 10 identical to contracts/managed/keys, by SHA-256');
    await expect(contracts).toContainText('10 of 10 as expected, by SHA-256: 9 identical to contracts/managed/keys, and finalizeRecovery to the 60-second build (devnet/compile.sh)');
    await expect(contracts).toContainText('7 of 7 identical to contracts/managed-host/keys, by SHA-256');
    await expect(contracts.getByText('holds no keys and needs 1 signature: its rules can never change')).toHaveCount(3);
    // the transactions, contract by contract
    await expect(page.locator('.lv-tx-contract h4')).toHaveText(['The shipped contract · 9', 'The whole story’s Lantern · 23', 'The independent host · 26']);
    // the story's counts, in the block of each contract's last recorded call
    const story = page.locator('.lv-check-group.story');
    await expect(story).toContainText(`after its last recorded call, in block ${STORY_LAST.toLocaleString('en-GB')}`);
    await expect(story).toContainText(`after its last recorded call, in block ${HOST_LAST.toLocaleString('en-GB')}`);
    await expect(story).not.toContainText('Called since');
    // the full check: one command per record, each named with the record it checks
    const full = page.locator('.lv-full');
    await expect(full.locator('.lv-cmds > div')).toHaveCount(2);
    await expect(full.locator('.lv-cmds > div').nth(0)).toContainText('deployments/preprod.json');
    await expect(full.locator('.lv-cmds > div').nth(0)).toContainText('LANTERN_NETWORK=preprod npm run devnet:verify');
    await expect(full.locator('.lv-cmds > div').nth(1)).toContainText('deployments/preprod-shipped.json');
    await expect(full.locator('.lv-cmds > div').nth(1)).toContainText('LANTERN_NETWORK=preprod node devnet/src/shipped.mjs verify');
  });

  test('the story\'s counts are read in the block of its last recorded call: a call anyone makes later is news, not a mismatch', async ({ page }) => {
    // Enrolling and opening a recovery need no permission: someone has called the story's Lantern
    // since the run, so its state now differs from the record's last counts.
    const later = laterCall(STORY_LANTERN, 'enrollIdentity', STORY_LAST + 5000, Date.parse('2026-09-26T09:00:00Z'));
    const asked = await serveIndexer(page, {
      states: { [STORY_LANTERN]: withAction(STORY_LANTERN, later, FIX.earlier['4.1']) },
      actions: { [STORY_LANTERN]: [...FIX.actions[STORY_LANTERN], later] },
    });
    await page.goto('/live');
    await expect(page.getByTestId('contract-story')).toContainText('it has changed since the run ended');
    await page.getByRole('button', { name: 'Check it against the chain' }).click();
    await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('check-summary')).toHaveText(`All ${FACTS} checks match the chain.`);
    const counts = page.locator('.lv-check-group.story .lv-check').first();
    await expect(counts).toHaveAttribute('data-state', 'pass');
    await expect(counts).toContainText(`after its last recorded call, in block ${STORY_LAST.toLocaleString('en-GB')}. Called since the run: now`);
    expect(asked.at.sort()).toEqual([[STORY_LANTERN, STORY_LAST], [STORY.contracts.host.address, HOST_LAST]].sort());
  });

  test('the counts check fails when the state after the run\'s last call is not the recorded one', async ({ page }) => {
    // the indexer's state in that block, if it were an earlier one: a real disagreement
    await serveIndexer(page);
    await page.route(INDEXER, async (route) => {
      const { query, variables } = route.request().postDataJSON();
      if (!/^query LanternStateAt/.test(query) || variables.address !== STORY_LANTERN) return route.fallback();
      const earlier = FIX.earlier['4.1'].contractAction;
      const block = { ...earlier.transaction.block, height: STORY_LAST };
      return route.fulfill({ status: 200, json: { data: { contractAction: { ...earlier, transaction: { ...earlier.transaction, block } } } } });
    });
    await openLive(page);
    await page.getByRole('button', { name: 'Check it against the chain' }).click();
    await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('check-summary')).toHaveText(`${FACTS - 1} of ${FACTS} checks match the chain; 1 does not.`);
    const counts = page.locator('.lv-check-group.story .lv-check').first();
    await expect(counts).toHaveAttribute('data-state', 'fail');
    await expect(counts).toContainText(`after its last recorded call, in block ${STORY_LAST.toLocaleString('en-GB')}:`);
  });

  test('the check says so when the chain disagrees with the record', async ({ page }) => {
    const step = SHIPPED.steps.find((s) => s.circuit === 'approveRecovery');
    const t = structuredClone(FIX.tx[step.tx.txId]);
    t.transactions[0].block.height += 1;
    await serveIndexer(page, { tx: { [step.tx.txId]: t } });
    await openLive(page);
    await page.getByRole('button', { name: 'Check it against the chain' }).click();
    await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('check-summary')).toHaveText(`${FACTS - 1} of ${FACTS} checks match the chain; 1 does not.`);
    await expect(page.locator('.lv-check[data-state="fail"]')).toContainText(`not ${step.tx.blockHeight.toLocaleString('en-GB')}`);
  });

  test('watch: the demo identity\'s recovery, with the new device\'s six words', async ({ page }) => {
    await serveIndexer(page);
    await openLive(page);
    await page.getByRole('button', { name: 'Use the demo identity' }).click();
    const rec = page.getByTestId('watch-recovery');
    await expect(rec).toHaveCount(1);
    await expect(rec).toHaveAttribute('data-state', 'waiting');
    await expect(rec.locator('[data-fingerprint-words]')).toHaveAttribute('data-fingerprint-words', 'ancient magic divorce appear major gorilla');
    await expect(rec).toContainText('2 of 2');
    await expect(rec).toContainText('27 Sep 2026, 15:03 UTC');
    await expect(page.getByTestId('watching')).toContainText('Enrolled on the shipped contract: 2 approvals needed; current.');
    // in the address after the #, which a browser never sends to the site
    expect(new URL(page.url()).hash).toBe(`#id=${DEMO_ID}`);
    expect(new URL(page.url()).search).toBe('');
    await expect(page.locator('.lv-move')).toContainText('Veto it with your veto card');
    // the alerts' log is in the accessibility tree before any alert, so the first one is announced
    await expect(page.locator('.lv-new')).toHaveCount(0);
    await expect(page.getByRole('log', { name: 'New since you started watching' })).toHaveCount(1);
    expect(await page.locator('.lv-news').evaluate((e) => getComputedStyle(e).display)).not.toBe('none');
    await expect(page.locator('.lv-news')).toMatchAriaSnapshot('- log "New since you started watching"');
    await expect(rec.locator('dt').nth(1)).toHaveText('Can finalize from');
    // the watcher's command never breaks inside a flag
    await expect(page.locator('.lv-move .lv-cmd .lv-w', { hasText: /^--$/ })).toHaveCSS('white-space', 'nowrap');
  });

  test('watch: an identity from the whole story shows its finalized and vetoed recoveries', async ({ page }) => {
    await serveIndexer(page);
    await openLive(page, `/live#id=${STORY_HANA}`);
    const recs = page.getByTestId('watch-recovery');
    await expect(recs).toHaveCount(2);
    expect(await recs.evaluateAll((els) => els.map((e) => e.dataset.state).sort())).toEqual(['finalized', 'vetoed']);
    // a recovery that is over is not offered a time it "could" finalize from
    await expect(page.locator('.lv-rec[data-state="finalized"] dt').nth(1)).toHaveText('Timelock ended');
    await expect(page.locator('.lv-rec[data-state="vetoed"] dt').nth(1)).toHaveText('Timelock would have ended');
  });

  test('watch: malformed input is refused, and what it is, if we know, is said', async ({ page }) => {
    await serveIndexer(page);
    await openLive(page);
    const box = page.getByLabel('Identity commitment');
    const watch = page.getByRole('button', { name: 'Watch', exact: true });
    for (const [input, says] of [
      ['', 'Paste an identity commitment first'],
      ['hello', 'this has “h”'],
      ['c23097dd48ab5264494efdf20b0fad21b12a2a397b3efb3b54232e0448cf1a6', 'is 64 characters; this is 63'],
      ['c23097dd 48ab5264494efdf20b0fad21b12a2a397b3efb3b54232e0448cf1a60', 'this has a space'],
      ['<img src=x onerror=alert(1)>', 'this has “<”'],
      [`${DEMO_ID.slice(0, 20)}\u200b${DEMO_ID.slice(20)}`, 'this has an invisible character (U+200B)'],
      ['a'.repeat(300), 'is 64 characters; this is 300'], // a long paste is not cut short and miscounted
    ]) {
      await box.fill(input);
      await watch.click();
      await expect(page.getByRole('alert')).toContainText(says);
      await expect(box).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByTestId('watching')).toHaveCount(0);
    }
    await box.fill(`0x${SHIPPED.contract.address.toUpperCase()}`);
    await watch.click();
    await expect(page.getByTestId('watch-none')).toContainText('That is the address of a contract');
    await box.fill('ab'.repeat(32));
    await watch.click();
    await expect(page.getByTestId('watch-none')).toContainText('Neither Lantern contract on Preprod has enrolled this identity');
    await expect(page.getByTestId('watch-recovery')).toHaveCount(0);
  });

  test('watch: a new approval, seen on the 30-second check, is written into the page and notified', async ({ page }) => {
    await recordNotifications(page);
    const over = { states: { [STORY_LANTERN]: FIX.earlier['4.1'] } };
    await serveIndexer(page, over);
    await page.goto(`/live#id=${STORY_HANA}`);
    const rec = page.getByTestId('watch-recovery');
    await expect(rec).toHaveCount(1);
    await expect(rec).toContainText('1 of 2');
    await page.getByRole('button', { name: 'Tell me in this browser' }).click();
    await expect(page.locator('.lv-notify')).toContainText('This browser will tell you');
    over.states[STORY_LANTERN] = FIX.earlier['4.2'];
    await page.clock.fastForward('00:35');
    await expect(rec).toContainText('2 of 2');
    await expect(page.locator('.lv-new')).toContainText(APPROVAL);
    // the one that says the watch is on, at the click; then the approval
    expect(await notes(page)).toEqual([CONFIRM, APPROVAL]);
    // one tag per recovery, and renotify, so an approval that replaces the "opened" alert still alerts
    const shown = (await noteOptions(page)).find((n) => n.title === APPROVAL);
    expect(shown.tag).toMatch(/^lantern-story:[0-9a-f]{64}$/);
    expect(shown.renotify).toBe(true);
  });

  test('watch: with the tab in the background, it keeps checking, and a new approval is still notified', async ({ page }) => {
    await recordNotifications(page);
    const over = { states: { [STORY_LANTERN]: FIX.earlier['4.1'] } };
    const asked = await serveIndexer(page, over);
    await page.goto(`/live#id=${STORY_HANA}`);
    const rec = page.getByTestId('watch-recovery');
    await expect(rec).toContainText('1 of 2');
    await page.getByRole('button', { name: 'Tell me in this browser' }).click();
    await expect(page.locator('.lv-notify')).toContainText('This browser will tell you');
    await hideTab(page);
    const before = asked.filter((op) => op === 'LanternLatest').length;
    over.states[STORY_LANTERN] = FIX.earlier['4.2'];
    await page.clock.fastForward('02:00');
    await expect.poll(() => asked.filter((op) => op === 'LanternLatest').length).toBeGreaterThan(before);
    await expect.poll(() => notes(page)).toEqual([CONFIRM, APPROVAL]);
    await expect(page.locator('.lv-new')).toContainText(APPROVAL);
    await expect(page.locator('.lv-notify')).toContainText('while this tab stays open, in the background too');
  });

  test('with nothing watched, a hidden tab asks the indexer nothing', async ({ page }) => {
    const asked = await serveIndexer(page);
    await openLive(page);
    await hideTab(page);
    const before = asked.length;
    await page.clock.fastForward('03:00');
    await page.waitForTimeout(500);
    expect(asked.length).toBe(before);
  });

  test('watch: when the indexer stops answering, the page says since when and never claims a fresh check', async ({ page }) => {
    const over = {};
    await serveIndexer(page, over);
    await openLive(page, `/live#id=${DEMO_ID}`);
    const line = page.getByTestId('watch-poll');
    await expect(line).toContainText(/^Checked at 12:00:\d\d UTC\./);
    const at = /Checked at (\d\d:\d\d:\d\d UTC)/.exec(await line.textContent())[1];
    over.fail = true;
    await page.clock.fastForward('00:35');
    await expect(line).toContainText(`Last checked at ${at}. The indexer has not answered since 12:00:`);
    await expect(line).toContainText('still trying');
    await expect(line).toHaveAttribute('data-stale', 'true');
    await expect(page.getByTestId('reach-stale')).toContainText('The indexer has not answered since 12:00:');
    await expect(page.getByTestId('reach-stale')).toContainText(`What you see was read from the chain at ${at}`);
    await expect(page.locator('.lv-recovery .lv-source-tag')).toContainText(`read from the chain at ${at}; the indexer has not answered since`);
    // a minute on, still failing: the time it last answered stays put
    await page.clock.fastForward('01:00');
    await expect(line).toContainText(`Last checked at ${at}.`);
    // and once it answers again, the line is fresh
    over.fail = false;
    await page.clock.fastForward('00:35');
    await expect(line).not.toContainText('has not answered');
    await expect(line).not.toContainText(at);
    await expect(page.getByTestId('reach-stale')).toHaveCount(0);
  });

  test('watch: when one contract cannot be read, the other still alerts, and the page says which is paused', async ({ page }) => {
    const over = { states: { [STORY_LANTERN]: FIX.earlier['4.1'] }, failFor: new Set([SHIPPED.contract.address]) };
    await serveIndexer(page, over);
    await page.goto(`/live#id=${STORY_HANA}`);
    const rec = page.getByTestId('watch-recovery');
    await expect(rec).toContainText('1 of 2');
    await expect(page.getByTestId('watching')).toContainText('The shipped contract could not be read from the indexer yet');
    await expect(page.getByTestId('watching')).toContainText('Alerts for it are paused until it can be read.');
    over.states[STORY_LANTERN] = FIX.earlier['4.2'];
    await page.clock.fastForward('00:35');
    await expect(rec).toContainText('2 of 2');
    await expect(page.locator('.lv-new')).toContainText(APPROVAL);
    // it answers at last: its recoveries are its baseline, not news
    over.failFor.clear();
    await page.clock.fastForward('00:35');
    await expect(page.getByTestId('watching')).not.toContainText('could not be read');
    await page.clock.fastForward('00:35');
    await expect(page.locator('.lv-new')).toHaveCount(1);
  });

  test('watch: a contract read for the first time late sets its baseline; its old recoveries are not news', async ({ page }) => {
    const over = { failFor: new Set([SHIPPED.contract.address]) };
    await serveIndexer(page, over);
    await page.goto(`/live#id=${DEMO_ID}`);
    await expect(page.getByTestId('watching')).toContainText('The shipped contract could not be read from the indexer yet');
    await expect(page.getByTestId('contract-story')).toContainText('now on chain'); // the first read is over
    over.failFor.clear();
    await page.clock.fastForward('00:35');
    await expect(page.getByTestId('watch-recovery')).toHaveCount(1);
    await page.clock.fastForward('00:35');
    await expect(page.locator('.lv-new')).toHaveCount(0);
  });

  test('watch: a browser that shows notifications only from installed apps is told so', async ({ page }) => {
    await page.addInitScript(() => {
      // a grant lasts, as the browser's own does, across a reload
      window.Notification = class {
        static permission = window.sessionStorage.getItem('granted') ? 'granted' : 'default';
        static async requestPermission() { window.sessionStorage.setItem('granted', '1'); this.permission = 'granted'; return 'granted'; }
        constructor() { throw new TypeError('Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.'); }
      };
    });
    await serveIndexer(page);
    await openLive(page, `/live#id=${DEMO_ID}`);
    await page.getByRole('button', { name: 'Tell me in this browser' }).click();
    await expect(page.locator('.lv-notify')).toHaveText('This browser only shows notifications from installed apps. Anything new still appears on this page.');
    // and it remembers, on the next visit
    await page.reload();
    await expect(page.locator('.lv-notify')).toContainText('only shows notifications from installed apps');
  });

  test('keyboard: the check keeps its button focused, and "Stop watching" hands focus to the box', async ({ page }) => {
    await serveIndexer(page);
    await openLive(page, `/live#id=${DEMO_ID}`);
    const go = page.locator('.lv-check-go button');
    await go.focus();
    await page.keyboard.press('Enter');
    await expect(go).toBeFocused();
    await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done');
    await expect(go).toBeFocused();
    await expect(go).toHaveText('Check again');
    await page.getByRole('button', { name: 'Stop watching' }).click();
    await expect(page.getByTestId('watching')).toHaveCount(0);
    await expect(page.locator('#lv-id')).toBeFocused();
  });

  test('leaving the page stops the check: no question reaches the indexer after', async ({ page }) => {
    const asked = await serveIndexer(page, { delay: 400 });
    await openLive(page);
    await page.getByRole('button', { name: 'Check it against the chain' }).click();
    await expect(page.locator('.lv-tx-check[data-state="pass"]').first()).toBeVisible();
    await page.locator('.lv-onward').getByRole('link', { name: 'Watch the story in your browser' }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.locator('.lv-checker')).toHaveCount(0);
    await page.waitForTimeout(600);
    const after = asked.length;
    await page.waitForTimeout(2500);
    expect(asked.length).toBe(after);
    expect(asked.filter((op) => op === 'LanternTx').length).toBeLessThan(RECORDED);
  });

  test('when the indexer cannot be reached, the page says so and shows the record', async ({ page }) => {
    await serveIndexer(page, { fail: true });
    await page.goto('/live');
    await expect(page.locator('.lv-reach')).toContainText('The indexer could not be reached.');
    await expect(page.locator('.lv-recovery')).toHaveAttribute('data-source', 'record');
    await expect(page.getByTestId('shipped-state')).toHaveText('Waiting out the timelock');
    await expect(page.locator('.lv-recovery')).toContainText('from the record');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('when the contract\'s reader cannot run here, the page keeps the history and says what it cannot show', async ({ page }) => {
    await page.route('**/*.wasm', (route) => route.abort());
    await serveIndexer(page);
    await page.goto(`/live#id=${DEMO_ID}`);
    await expect(page.locator('.lv-recovery')).toContainText('from the record: this browser could not read the chain’s state');
    await expect(page.locator('.lv-recovery')).toHaveAttribute('data-source', 'record');
    await expect(page.getByTestId('device-note')).toHaveText('this browser could not read it from the chain');
    await expect(page.locator('.lv-timeline-note').first()).toContainText('9 of 9 on chain');
    await expect(page.getByTestId('watching')).toContainText('This browser could not run the contract’s reader');
    await expect(page.getByTestId('watching')).toContainText('alerts for them are paused');
    await expect(page.getByTestId('watch-none')).toHaveCount(0);
    // the check: what needs the state is not checked, and never counted as a mismatch
    await page.getByRole('button', { name: 'Check it against the chain' }).click();
    await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('check-summary')).toHaveText(`${FACTS - 13} of ${FACTS} checks match the chain; 13 could not be checked (the reader did not run in this browser).`);
    await expect(page.getByTestId('contract-story')).toContainText('this browser could not run the contract’s reader: shown as recorded');
    await expect(page.locator('.lv-check[data-state="fail"]')).toHaveCount(0);
    await expect(page.locator('.lv-check[data-state="error"]').first()).toContainText('could not be checked: this browser could not run the contract’s reader');
  });

  test('when the indexer cannot be reached, the new device\'s words say why they are missing', async ({ page }) => {
    await serveIndexer(page, { fail: true });
    await page.goto('/live');
    await expect(page.locator('.lv-reach')).toContainText('The indexer could not be reached.');
    await expect(page.getByTestId('device-note')).toHaveText('not read: the indexer did not answer');
  });

  test('when the indexer answers with an HTTP error, the page says that, not that it could not be reached', async ({ page }) => {
    await serveIndexer(page, { status: 503 });
    await page.goto('/live');
    const reach = page.locator('.lv-reach');
    await expect(reach).toContainText('The indexer is answering with an error.');
    await expect(reach).toContainText('It answered HTTP 503.');
    await expect(reach).not.toContainText('could not be reached');
    await expect(reach).not.toContainText('firewall');
    await expect(page.locator('.lv-recovery')).toHaveAttribute('data-source', 'record');
  });

  test('the check is announced as it starts and when it ends, not at every fact', async ({ page }) => {
    await serveIndexer(page, { delay: 300 });
    await openLive(page);
    await page.getByRole('button', { name: 'Check it against the chain' }).click();
    await expect(page.locator('.lv-progress .sr-only')).toHaveText(`Checking ${RECORDED} transactions and ${FACTS - RECORDED} facts against the chain…`);
    // the running count is drawn, but hidden from the accessibility tree
    await expect(page.locator('.lv-progress [aria-hidden="true"]')).toHaveText(new RegExp(`^\\d+ of ${FACTS} checked$`));
    await expect(page.getByTestId('check-summary')).toMatchAriaSnapshot(`- status: Checking ${RECORDED} transactions and ${FACTS - RECORDED} facts against the chain…`);
    await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('check-summary')).toMatchAriaSnapshot(`- status: All ${FACTS} checks match the chain.`);
  });

  test('a history catch-up the indexer cuts short is tried again at the next check', async ({ page }) => {
    // A guardian approves on the shipped contract after the record. The first catch-up never
    // reaches it (the stream stops short); the next check asks again and draws it.
    const later = laterCall(SHIPPED_ADDRESS, 'approveRecovery', 2_700_000, Date.parse('2026-09-26T11:59:00Z'));
    const over = {};
    const asked = await serveIndexer(page, over);
    await openLive(page);
    over.states = { [SHIPPED_ADDRESS]: withAction(SHIPPED_ADDRESS, later) };
    over.actions = { [SHIPPED_ADDRESS]: FIX.actions[SHIPPED_ADDRESS] }; // not yet the new call
    const subs = asked.subs.length;
    await page.clock.fastForward('00:35');
    await expect.poll(() => asked.subs.length).toBeGreaterThan(subs);
    await page.clock.fastForward('00:26'); // the stream's time is up
    const note = page.locator('.lv-timeline-note').first();
    await expect(note).toContainText('9 of 9 on chain, each at the block below. The indexer stopped part-way, so a newer action may be missing; it is asked again at the next check.');
    // the stream reaches it now; the next check catches up
    over.actions = { [SHIPPED_ADDRESS]: [...FIX.actions[SHIPPED_ADDRESS], later] };
    await page.clock.fastForward('00:35');
    await expect(note).toHaveText('10 of 10 on chain, each at the block below.');
    const row = page.locator('.lv-timeline').first().locator('li.extra');
    await expect(row).toContainText('A guardian approves the recovery.');
    await expect(row).toContainText('new since the record');
  });

  test('after the finalize, even with the contract\'s reader blocked, the history shows it finalized: the lock, lit', async ({ page }) => {
    await page.clock.setSystemTime(new Date('2026-09-28T09:00:00Z'));
    await page.route('**/*.wasm', (route) => route.abort());
    const at = Date.parse('2026-09-27T15:10:12Z');
    const fin = laterCall(SHIPPED_ADDRESS, 'finalizeRecovery', 2_720_000, at);
    await serveIndexer(page, {
      states: { [SHIPPED_ADDRESS]: withAction(SHIPPED_ADDRESS, fin) },
      actions: { [SHIPPED_ADDRESS]: [...FIX.actions[SHIPPED_ADDRESS], fin] },
    });
    await page.goto('/live');
    const plate = page.locator('.lv-recovery');
    await expect(page.getByTestId('shipped-state')).toHaveText('Finalized');
    await expect(page.getByTestId('shipped-state')).toHaveClass(/\block\b/);
    await expect(plate).toHaveAttribute('data-state', 'finalized');
    await expect(plate.locator('.lv-ring')).toHaveAttribute('data-lit', 'true');
    await expect(plate.getByRole('heading', { level: 2 })).toHaveText('A recovery, finalized');
    const open = FIX.actions[SHIPPED_ADDRESS].find((a) => a.entryPoint === 'openRecovery').transaction.block.timestamp;
    await expect(plate).toContainText(`${Math.round(((at - open) / 3_600_000) * 10) / 10} hours after it opened, in block 2,720,000`);
    await expect(plate).toContainText('27 Sep 2026, 15:10 UTC');
    await expect(plate.locator('.lv-refused')).toHaveCount(0);
    const row = page.locator('.lv-timeline').first().locator('li.extra');
    await expect(row).toHaveClass(/\block\b/);
    await expect(row).toContainText('The approved phone finalizes the recovery.');
    await expect(row).toContainText('new since the record');
  });

  test('after 15:03 UTC on 27 Sep, with no finalize yet, the recovery reads ready to finalize', async ({ page }) => {
    await page.clock.setSystemTime(new Date('2026-09-28T09:00:00Z'));
    await serveIndexer(page);
    await openLive(page);
    await expect(page.getByTestId('shipped-state')).toHaveText('Ready to finalize');
    await expect(page.locator('.lv-recovery')).toContainText('The 72 hours are over. Only the phone the guardians approved can finalize');
  });

  test('the identity watched never leaves the browser: no request, body or stream message carries it', async ({ page }) => {
    const sent = [];
    // what a request carries to its server: the address before any #, and the body
    page.on('request', (r) => sent.push(`${r.url().split('#')[0]} ${r.postData() ?? ''}`.toLowerCase()));
    const asked = await serveIndexer(page);
    await openLive(page, `/live#id=${DEMO_ID}`);
    await expect(page.getByTestId('watch-recovery')).toHaveCount(1);
    await page.getByLabel('Identity commitment').fill(STORY_HANA);
    await page.getByRole('button', { name: 'Watch', exact: true }).click();
    await expect(page.getByTestId('watch-recovery')).toHaveCount(2);
    await expect(page).toHaveURL(new RegExp(`/live#id=${STORY_HANA}$`));
    const reads = sent.length;
    await page.clock.fastForward('00:35'); // the next 30-second check
    await expect.poll(() => sent.length).toBeGreaterThan(reads);
    await page.reload();
    await expect(page.getByTestId('watch-recovery')).toHaveCount(2);
    for (const id of [DEMO_ID, STORY_HANA]) {
      expect(sent.filter((r) => r.includes(id))).toEqual([]);
      expect(asked.frames.filter((f) => f.toLowerCase().includes(id))).toEqual([]);
    }
  });

  test('no request leaves for anything but this site and the Preprod indexer', async ({ page, baseURL }) => {
    const origins = new Set();
    const sockets = [];
    page.on('request', (r) => origins.add(new URL(r.url()).origin));
    page.on('websocket', (ws) => sockets.push(ws.url()));
    const asked = await serveIndexer(page);
    await openLive(page);
    await page.getByRole('button', { name: 'Check it against the chain' }).click();
    await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done');
    await page.getByRole('button', { name: 'Use the demo identity' }).click();
    await expect(page.getByTestId('watch-recovery')).toHaveCount(1);
    expect([...origins].sort()).toEqual([new URL(baseURL).origin, 'https://indexer.preprod.midnight.network'].sort());
    expect(sockets.every((u) => u === INDEXER_WS)).toBe(true);
    expect([...new Set(asked)].filter((op) => !['LanternState', 'LanternStateAt', 'LanternLatest', 'LanternTx'].includes(op))).toEqual([]);
  });

  for (const width of [320, 375, 1440]) {
    test(`at ${width}px: honest words, no serious accessibility issue, no side-scroll, finite animations, no CSP violation`, async ({ page }) => {
      const noCspViolations = await watchCsp(page);
      await page.setViewportSize({ width, height: 800 });
      await serveIndexer(page);
      await openLive(page);
      await page.getByRole('button', { name: 'Use the demo identity' }).click();
      await expect(page.getByTestId('watch-recovery')).toHaveCount(1);
      await page.getByRole('button', { name: 'Check it against the chain' }).click();
      await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done');
      for (const d of await page.locator('details.lv-more').all()) await d.locator('summary').click();
      expect(await pageCopy(page)).not.toMatch(BANNED);
      await expectFiniteAnimations(page);
      await expectNoSeriousA11yIssues(page);
      await expectNoSideScroll(page);
      await noCspViolations();
    });
  }
});

// ---- the pure parts, on the recorded answers (no page) ---------------------------------------------

/** A contract's recorded state, read with the page's own reader (web/src/live/decode.js). */
async function decodeRecorded(address) {
  const { decodeHost, decodeLantern } = await import('../src/live/decode.js');
  const hexState = FIX.state[address].contractAction.state;
  return address === STORY.contracts.host.address ? decodeHost(hexState) : decodeLantern(hexState);
}
const pageActions = async (address) => {
  const { actionOf } = await import('../src/lib/indexer.js');
  return FIX.actions[address].map(actionOf);
};

// No page: they run once, in the default config's desktop project, not again in every browser.
test.describe('the pure parts', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'no page: run once, in the desktop project');

  test('the finalized view, from real data: the whole story\'s finalized recovery, with its open, finalize and successor', async () => {
    const d = await decodeRecorded(STORY_LANTERN);
    const actions = await pageActions(STORY_LANTERN);
    const hana = d.recoveries.find((r) => !r.killed);
    const rec = { rid: hana.rid, openedAtLo: hana.openedAtLo, openedAtHi: hana.openedAtHi, finalizeFrom: hana.openedAtHi + 60_000, approvals: '2 of 2', finalize: null };
    const later = Date.parse('2026-09-28T00:00:00Z');
    const v = recordedRecoveryView(rec, d, actions, later, 60);
    expect(v.fromChain).toBe(true);
    expect(v.state).toBe('finalized');
    expect(v.lit).toBe(true);
    expect(v.elapsed).toBe(1);
    expect(v.approvals).toBe('2 of 2');
    const step = (circuit) => STORY.steps.find((x) => x.circuit === circuit && x.tx && (circuit !== 'openRecovery' || x.actor === 'Seo-yeon'));
    expect(v.open.tx.hash).toBe(step('openRecovery').tx.txHash);
    expect(v.finTx.hash).toBe(step('finalizeRecovery').tx.txHash);
    expect(v.finalizedAfter).toEqual({ ms: v.finTx.time - v.open.tx.time, from: 'open' });
    expect(v.successor).toBe(Object.values(d.identities).find((i) => i.idRoot === STORY_HANA && !i.retired).idCommit);
    // a finalize the contract refused is never drawn as the lock
    const refused = actions.map((a) => (a.entryPoint === 'finalizeRecovery' ? { ...a, tx: { ...a.tx, status: 'failure' } } : a));
    const r = recordedRecoveryView(rec, d, refused, later, 60);
    expect(r.finTx).toBeNull();
    expect(r.finalizedAfter).toBeNull();
    // with no open in the history, the wait is counted from the later bound, and says so
    const noOpen = recordedRecoveryView(rec, d, actions.filter((a) => a.entryPoint !== 'openRecovery'), later, 60);
    expect(noOpen.finalizedAfter).toEqual({ ms: noOpen.finTx.time - hana.openedAtHi, from: 'bound' });
  });

  test('the shipped recovery\'s view: waiting at noon on the 26th, ready after 15:03 on the 27th, and the record until the chain answers', async () => {
    const shipped = SHIPPED.contract.address;
    const d = await decodeRecorded(shipped);
    const actions = await pageActions(shipped);
    const R = SHIPPED.recovery;
    const rec = { rid: R.rid, openedAtLo: Date.parse(R.openedAtLo), openedAtHi: Date.parse(R.openedAtHi), finalizeFrom: Date.parse(R.finalizeNoEarlierThan), approvals: R.approvals, finalize: null };
    const waiting = recordedRecoveryView(rec, d, actions, NOW.getTime(), SHIPPED.timelockSeconds);
    expect([waiting.state, waiting.lit, waiting.finTx, waiting.canFinalizeAt]).toEqual(['waiting', false, null, rec.finalizeFrom]);
    expect(waiting.open.tx.hash).toBe(SHIPPED.steps.find((x) => x.circuit === 'openRecovery').tx.txHash);
    expect(waiting.elapsed).toBeCloseTo((NOW.getTime() - rec.openedAtHi) / (72 * 3_600_000), 6);
    expect(recordedRecoveryView(rec, d, actions, Date.parse('2026-09-27T15:03:00Z'), SHIPPED.timelockSeconds).state).toBe('ready');
    const unread = recordedRecoveryView(rec, null, [], NOW.getTime(), SHIPPED.timelockSeconds);
    expect([unread.fromChain, unread.state, unread.approvals]).toEqual([false, 'waiting', '2 of 2']);
    // with no state (the reader cannot run), an accepted finalize after the lock, in the history, is the
    // finalize; a refused one, or none, leaves it ready
    const { actionOf } = await import('../src/lib/indexer.js');
    const later = Date.parse('2026-09-28T09:00:00Z');
    const fin = actionOf(laterCall(shipped, 'finalizeRecovery', 2_720_000, Date.parse('2026-09-27T15:10:12Z')));
    const blind = recordedRecoveryView(rec, null, [...actions, fin], later, SHIPPED.timelockSeconds);
    expect([blind.state, blind.lit, blind.finTx.hash, blind.finalizedAfter.from]).toEqual(['finalized', true, fin.tx.hash, 'open']);
    const refusedFin = { ...fin, tx: { ...fin.tx, status: 'failure' } };
    expect(recordedRecoveryView(rec, null, [...actions, refusedFin], later, SHIPPED.timelockSeconds).state).toBe('ready');
    expect(recordedRecoveryView(rec, null, actions, later, SHIPPED.timelockSeconds).state).toBe('ready');
  });

  test('where a recovery stands, in the order finalizeRecovery checks: vetoed, finalized or closed, cancelled, waiting, ready, short', () => {
    const id = 'aa'.repeat(32);
    const heir = 'bb'.repeat(32);
    const r = (rid, over = {}) => ({ rid, idCommit: id, idRoot: id, openedAtLo: 0, openedAtHi: 1_000, approvals: 2, killed: false, ctxCurrent: true, ...over });
    const state = (x, recoveries, identity = {}, now = 10_000_000) => recoveryState(x, {
      identities: { [id]: { idCommit: id, idRoot: id, threshold: 2, retired: false, ...identity }, [heir]: { idCommit: heir, idRoot: id, threshold: 2, retired: false } },
      recoveries,
    }, now, 60).state;
    const a = r('01');
    expect(state(a, [a], {}, 30_000)).toBe('waiting');
    expect(state(a, [a])).toBe('ready');
    const short = r('02', { approvals: 1 });
    expect(state(short, [short])).toBe('short');
    const cancelled = r('03', { ctxCurrent: false });
    expect(state(cancelled, [cancelled])).toBe('cancelled');
    const vetoed = r('04', { killed: true, ctxCurrent: false });
    expect(state(vetoed, [vetoed], { retired: true })).toBe('vetoed'); // a veto outranks the retirement
    expect(state(a, [a, vetoed], { retired: true })).toBe('finalized'); // the only one that could have
    expect(recoveryState(a, { identities: { [id]: { idCommit: id, idRoot: id, threshold: 2, retired: true }, [heir]: { idCommit: heir, idRoot: id, threshold: 2, retired: false } }, recoveries: [a] }, 0, 60).successor).toBe(heir);
    const b = r('05');
    expect(state(a, [a, b], { retired: true })).toBe('closed'); // two could have: the state cannot say which
    expect(state(short, [a, short], { retired: true })).toBe('closed');
  });

  test('the watch\'s input: an identity commitment, strictly', () => {
    const id = 'c23097dd48ab5264494efdf20b0fad21b12a2a397b3efb3b54232e0448cf1a60';
    expect(parseIdCommit(id)).toEqual({ ok: true, id });
    expect(parseIdCommit(`  0x${id.toUpperCase()}\n`)).toEqual({ ok: true, id });
    expect(parseIdCommit('').why).toMatch(/^Paste an identity commitment first/);
    expect(parseIdCommit(id.slice(1)).why).toBe('An identity commitment is 64 characters; this is 63.');
    expect(parseIdCommit(`${id}${id}`).why).toBe('An identity commitment is 64 characters; this is 128.');
    expect(parseIdCommit('a'.repeat(1200)).why).toBe('An identity commitment is 64 characters; this is far more.');
    expect(parseIdCommit(`${id.slice(0, 10)} ${id.slice(10)}`).why).toMatch(/this has a space\.$/);
    expect(parseIdCommit(`${id.slice(0, 10)}\t${id.slice(11)}`).why).toMatch(/this has a line break or tab\.$/);
    expect(parseIdCommit(`${id.slice(0, 63)}g`).why).toMatch(/this has “g”\.$/);
    // what the eye cannot see is named by its code point
    expect(parseIdCommit(`${id.slice(0, 10)}\u200b${id.slice(10)}`).why).toMatch(/this has an invisible character \(U\+200B\)\.$/);
    expect(parseIdCommit(`${id.slice(0, 10)}\ufeff${id.slice(10)}`).why).toMatch(/this has an invisible character \(U\+FEFF\)\.$/);
    expect(parseIdCommit(`${id.slice(0, 10)}\u00a0${id.slice(10)}`).why).toMatch(/this has a special space \(U\+00A0\)\.$/);
    expect(parseIdCommit(`${id.slice(0, 10)}\u0301${id.slice(10)}`).why).toMatch(/this has a combining mark \(U\+0301\)\.$/);
    expect(parseIdCommit(`${id.slice(0, 10)}😀${id.slice(10)}`).why).toMatch(/this has “😀”\.$/);
  });

  test('spans in words, and a span already past is "under a minute"', () => {
    const s = 1000; const m = 60 * s; const h = 60 * m; const d = 24 * h;
    expect(spanWords(d + 3 * h + 3 * m)).toBe('1 day 3 h');
    expect(spanWords(2 * d)).toBe('2 days');
    expect(spanWords(3 * h + 12 * m + 40 * s)).toBe('3 h 12 min');
    expect(spanWords(3 * h)).toBe('3 h');
    expect(spanWords(4 * m + 59 * s)).toBe('4 min');
    expect(spanWords(59 * s)).toBe('under a minute');
    expect(spanWords(-5 * m)).toBe('under a minute');
  });

  test('rules are frozen only with no keys AND a threshold of at least 1, and all three contracts are', async () => {
    expect(isFrozen(0, 1)).toBe(true);
    expect(isFrozen(0, 0)).toBe(false); // no keys, no signature needed: a change could pass unsigned
    expect(isFrozen(1, 1)).toBe(false);
    for (const address of Object.keys(FIX.state)) {
      const d = await decodeRecorded(address);
      expect([d.frozen, d.committee, d.threshold >= 1], address).toEqual([true, 0, true]);
    }
  });

  test('the verifier keys: shipped and host are the committed ones; the story\'s finalizeRecovery is the pinned 60-second build and nothing else', async () => {
    const shipped = await decodeRecorded(SHIPPED.contract.address);
    const story = await decodeRecorded(STORY_LANTERN);
    const host = await decodeRecorded(STORY.contracts.host.address);
    expect(compareKeys(shipped.keys, 'lantern', 'shipped')).toMatchObject({ ok: true, pinned: [], wrong: [], extra: [] });
    expect(compareKeys(shipped.keys, 'lantern', 'shipped').same).toHaveLength(10);
    expect(compareKeys(host.keys, 'host', 'host').same).toHaveLength(7);
    const k = compareKeys(story.keys, 'lantern', 'story');
    expect(k).toMatchObject({ ok: true, pinned: ['finalizeRecovery'], wrong: [], extra: [] });
    expect(k.same).toHaveLength(9);
    // any other finalizeRecovery key is refused, the committed one included
    expect(compareKeys({ ...story.keys, finalizeRecovery: COMMITTED_KEYS.lantern.finalizeRecovery }, 'lantern', 'story').wrong).toEqual(['finalizeRecovery']);
    expect(compareKeys({ ...story.keys, finalizeRecovery: '00'.repeat(32) }, 'lantern', 'story').ok).toBe(false);
    expect(compareKeys({ ...shipped.keys, extraCircuit: '00'.repeat(32) }, 'lantern', 'shipped').extra).toEqual(['extraCircuit']);
    // the pin is the 60-second build's key, wherever that build has been made (bash devnet/compile.sh)
    const built = new URL('../../devnet/build/lantern/keys/finalizeRecovery.verifier', import.meta.url);
    if (existsSync(built)) expect(createHash('sha256').update(readFileSync(built)).digest('hex')).toBe(FLAVOUR_KEYS.story.finalizeRecovery.sha);
  });

  test('the verifier-key hashes /live compares against are the committed keys', () => {
    for (const [kind, dir] of [['lantern', 'managed'], ['host', 'managed-host']]) {
      for (const [op, sha] of Object.entries(COMMITTED_KEYS[kind])) {
        const file = readFileSync(new URL(`../../contracts/${dir}/keys/${op}.verifier`, import.meta.url));
        expect(createHash('sha256').update(file).digest('hex'), `${dir}/keys/${op}.verifier`).toBe(sha);
      }
    }
  });

  test('the story\'s counts are compared in the blocks of its last recorded calls', () => {
    expect([STORY_LAST, HOST_LAST]).toEqual([2_704_954, 2_704_983]);
    // and those blocks are where the recorded states end (the recorder's own answers)
    expect(FIX.state[STORY_LANTERN].contractAction.transaction.block.height).toBe(STORY_LAST);
    expect(FIX.state[STORY.contracts.host.address].contractAction.transaction.block.height).toBe(HOST_LAST);
  });
});

test('the landing and /about lead to /live, and the landing fetches neither /live nor the indexer', async ({ page }) => {
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: 'See the real recovery on Preprod' })).toHaveAttribute('href', '/live');
  await expect(page.getByRole('link', { name: 'Rehearse your own' })).toHaveAttribute('href', '/rehearse');
  expect(urls.filter((u) => /\/assets\/(Live|Rehearse)-|indexer\.preprod/.test(u))).toEqual([]);
  await page.goto('/about');
  await expect(page.getByRole('link', { name: 'Check the Preprod runs in your browser' })).toHaveAttribute('href', '/live');
});

// Against the real indexer: LANTERN_LIVE=1 npx playwright test e2e/live.spec.js -g "real indexer"
test('the real indexer: the recovery reads from the chain and every recorded fact checks out', async ({ page }) => {
  test.skip(!process.env.LANTERN_LIVE, 'set LANTERN_LIVE=1 to read the real Preprod indexer');
  test.setTimeout(240_000);
  await page.goto('/live');
  await expect(page.locator('.lv-recovery')).toHaveAttribute('data-source', 'chain', { timeout: 60_000 });
  await expect(page.getByTestId('shipped-approvals')).toHaveText('2 of 2');
  await page.getByRole('button', { name: 'Check it against the chain' }).click();
  await expect(page.locator('.lv-checker')).toHaveAttribute('data-phase', 'done', { timeout: 180_000 });
  await expect(page.getByTestId('check-summary')).toHaveText(`All ${FACTS} checks match the chain.`);
  await page.getByRole('button', { name: 'Use the demo identity' }).click();
  await expect(page.getByTestId('watch-recovery')).toHaveCount(1);
});
