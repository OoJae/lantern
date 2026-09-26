// The watcher's decisions (watch.mjs), kept apart from its reading of the chain so devnet/test can
// check them without a chain, a build or a network: what to alert when a recovery changes, what to
// remember between reads, how an alert reaches the webhook, and what the options may be.
// Dependency-free: only Node's own fs and the site's pure helpers (web/src/live/status.js).
import { readFileSync, statSync } from 'node:fs';
import { lineageOf, recoveriesFor, recoveryState, shortHex, STATE_WORDS } from '../../web/src/live/status.js';

/** The states in which a recovery can still finalize, and so can still be vetoed. */
export const OPEN = new Set(['waiting', 'short', 'ready']);

// ---- options -------------------------------------------------------------------------------------
/** Seconds between reads: at least 10 (the public indexer), at most a day. Past about 24.8 days
 *  setTimeout overflows and fires at once, a loop with no pause; for rarer reads use cron and --once. */
export const EVERY_MIN = 10;
export const EVERY_MAX = 86_400;
export function everyProblem(every) {
  return Number.isFinite(every) && every >= EVERY_MIN && every <= EVERY_MAX ? null
    : `--every takes a number of seconds, from ${EVERY_MIN} to ${EVERY_MAX} (a day); for less often, use --once with cron and --state`;
}

/** https only, or http to this machine. `from` names where the URL came from, for the message. */
export function webhookProblem(webhook, from = '--webhook') {
  let u;
  try { u = new URL(webhook); } catch { return `${from} is not a URL`; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  return u.protocol === 'https:' || (u.protocol === 'http:' && local) ? null : `${from} must be https (or http to localhost)`;
}

/**
 * The webhook URL, and where it came from: --webhook, else the first line of --webhook-file, else
 * the LANTERN_WEBHOOK environment variable. A Slack or Discord incoming-webhook URL is a secret
 * (whoever has it can post into the channel), and a process's arguments can be read by every user
 * of the machine (ps, /proc/<pid>/cmdline) while it runs, its environment only by its own user and
 * root: so the file or the variable is the way to pass it, and --webhook is kept for a URL that is
 * not a secret (a local relay, say). Whatever the source, the URL passes webhookProblem.
 * @returns { url, from, warning? } (url null when none is named), or { problem }
 */
export function pickWebhook({ flag = null, file = null, env = null, read = (f) => readFileSync(f, 'utf8'), mode = (f) => statSync(f).mode }) {
  let url = null;
  let from = null;
  let warning;
  if (flag) {
    url = flag.trim();
    from = '--webhook';
  } else if (file) {
    let text;
    try { text = read(file); } catch (e) { return { problem: `--webhook-file ${file} could not be read (${e.code ?? e.message})` }; }
    url = String(text).trim().split(/\r?\n/)[0].trim();
    from = `--webhook-file ${file}`;
    if (!url) return { problem: `--webhook-file ${file} is empty: put the webhook URL on its first line` };
    try {
      if (mode(file) & 0o077) warning = `${file} can be read by other users of this machine: chmod 600 it, as the URL is a secret`;
    } catch { /* read above, so it exists; a mode that cannot be read is not worth failing for */ }
  } else if (env && env.trim()) {
    url = env.trim();
    from = 'LANTERN_WEBHOOK';
  }
  if (!url) return { url: null, from: null };
  const problem = webhookProblem(url, from);
  if (problem) return { problem };
  return warning ? { url, from, warning } : { url, from };
}

// ---- what to alert -------------------------------------------------------------------------------
/**
 * The alerts for one recovery, from what was remembered of it (`was`) and what the chain shows now.
 * Each alert names the part of the memory it reports (`covers`): an alert the webhook does not take
 * leaves that part as it was, so the next read sends it again.
 *
 * @param baselined whether this recovery's contract had been read before (its first read sends
 *                  only what is still open, as a baseline)
 * @param was       { approvals, state } remembered from the last read, or undefined if new
 * @param name      the contract's name, for the text
 * @param r         the recovery as read ({ rid, approvals, ... })
 * @param st        where it stands (status.js recoveryState: { state, threshold, ... })
 * @param d         its description: { words (the new device's fingerprint), when (can finalize from), data }
 */
export function alertsFor({ baselined, was, name, r, st, d }) {
  const state = STATE_WORDS[st.state].toLowerCase();
  const tally = `${r.approvals} of ${st.threshold ?? '?'}`;
  const open = OPEN.has(st.state);
  const event = (type, covers, title, body) => ({ type, covers, title, body, data: d.data });
  if (!baselined) {
    return open ? [event('recovery-open', 'all', 'an open recovery for the identity you watch',
      `On ${name}: ${state}, approvals ${tally}, can finalize from ${d.when}. New device: ${d.words}.`)] : [];
  }
  if (!was) {
    return [open
      ? event('recovery-opened', 'all', 'a recovery was opened for the identity you watch',
        `On ${name}. New device: ${d.words}. It can finalize from ${d.when} unless you veto it.`)
      // Opened and ended between two reads (or while the watcher was not running): never "unless you veto it".
      : event(`recovery-${st.state}`, 'all', `a recovery for the identity you watch was opened and has already ended: ${state}`,
        `On ${name}, recovery ${shortHex(r.rid)}: it opened and ended between two reads. Approvals ${tally}. New device: ${d.words}.`)];
  }
  // Two independent checks: an approval and the end it allowed can land between the same two reads.
  const out = [];
  if (r.approvals > was.approvals) {
    out.push(event('approval', 'approvals', 'a recovery for the identity you watch gained an approval',
      `Now ${tally} on ${name}.${open ? ` It can finalize from ${d.when}.` : ''}`));
  }
  if (st.state !== was.state && !open) {
    out.push(event(`recovery-${st.state}`, 'state', `a recovery for the identity you watch: ${state}`,
      `On ${name}, recovery ${shortHex(r.rid)}.`));
  }
  return out;
}

// ---- what to remember ----------------------------------------------------------------------------
/**
 * The memory after a read.
 * @param seen        Map key -> { approvals, state }: the memory before it
 * @param current     Map key -> { r, st }: every recovery read now (key `${address}:${rid}`)
 * @param unreadable  addresses of contracts that could not be read: what they showed last is kept,
 *                    so their recoveries are not "new" when they answer again
 * @param undelivered Map key -> Set of `covers` whose alert the webhook did not take: that part of
 *                    the memory stays as it was (a recovery not remembered before is left out), so
 *                    the next read alerts it again
 */
export function nextSeen(seen, current, { unreadable = [], undelivered = new Map() } = {}) {
  const next = new Map([...current].map(([k, v]) => [k, { approvals: v.r.approvals, state: v.st.state }]));
  for (const a of unreadable) for (const [k, v] of seen) if (k.startsWith(`${a}:`)) next.set(k, v);
  for (const [k, lost] of undelivered) {
    const was = seen.get(k);
    if (!was || lost.has('all')) { if (was) next.set(k, was); else next.delete(k); continue; }
    const v = { ...next.get(k) };
    if (lost.has('approvals')) v.approvals = was.approvals;
    if (lost.has('state')) v.state = was.state;
    next.set(k, v);
  }
  return next;
}

/**
 * One read's results sorted: `results` holds, for each watched contract, { c, got } or { c, error },
 * as tick() reads them (got: the decoded state, or null when the indexer knows no such contract).
 * A contract the indexer does not know is not read, just as one whose read failed: what it showed
 * last is kept, it is not baselined, and --once exits 2. So a mistyped --contract, or an indexer
 * that forgets a contract for a while (a reindex, a lagging replica), never passes for "no
 * recoveries" and never turns the recoveries already reported into new alerts when it answers again.
 * @returns current     Map `${address}:${rid}` -> { c, r, st, assumed }: every recovery of `id` read now
 *          read        the contracts that answered (only these are baselined)
 *          missing     the contracts the indexer does not know
 *          failed      the contracts whose read failed
 *          unreadable  the addresses of missing and failed together, for nextSeen and outcome
 *          unknown     every contract answered, and on none of them is `id` enrolled, the root of an
 *                      enrolled commitment or the identity of a recovery: most likely a wrong --id
 *                      or --contract, which would otherwise watch nothing in silence
 */
export function classify(results, id, now) {
  const current = new Map();
  const read = [];
  const missing = [];
  const failed = [];
  let known = false;
  for (const x of results) {
    if (x.error) { failed.push(x); continue; }
    if (!x.got) { missing.push(x); continue; }
    read.push(x);
    const { c, got } = x;
    const recs = recoveriesFor(id, got);
    if (Object.hasOwn(got.identities, id) || recs.length || Object.values(got.identities).some((i) => i.idRoot === id)) known = true;
    for (const r of recs) current.set(`${c.address}:${r.rid}`, { c, r, st: recoveryState(r, got, now, got.delay), assumed: got.assumed });
  }
  const unreadable = [...failed, ...missing].map((x) => x.c.address);
  return { current, read, missing, failed, unreadable, unknown: !unreadable.length && !known };
}

/**
 * Where the watched commitment stands on one decoded contract, for the printout. Recoveries are matched
 * on the identity's whole lineage (recoveriesFor: its root), so this names the lineage the same way:
 *  - mine: the commitment's own entry, or null if it is not enrolled here;
 *  - lineage: the other commitments of the same identity (lineageOf), the root included;
 *  - current: the one no recovery has retired (null if none of them is enrolled here).
 * A watch on a commitment since succeeded (S1) so names the current one (S2), whose recoveries it sees.
 */
export function standing(id, got) {
  const mine = got.identities[id] ?? null;
  const lineage = lineageOf(id, got);
  const current = [mine, ...lineage].find((i) => i && !i.retired) ?? null;
  return { mine, lineage, current };
}

/** The one line watch.mjs prints for it. */
export function standingLine({ mine, lineage, current }) {
  const cur = current && current !== mine ? `; current: ${current.idCommit}` : '';
  if (mine) return `enrolled, ${mine.threshold} approvals needed, ${mine.retired ? `since retired by a recovery${cur || '; no current commitment of it is enrolled here'}` : 'current'}`;
  if (lineage.length) return `the root of ${lineage.length} enrolled commitment(s)${cur}`;
  return 'not enrolled here';
}

/**
 * A read's outcome, for --once's exit code: anything but 'ok' exits 2.
 * @param unreadable  how many contracts were not read (a failed read, or no such contract)
 * @param contracts   how many are watched
 * @param undelivered how many recoveries have an alert the webhook did not take
 * @param unsaved     the --state file could not be written (the next run would start afresh)
 * @param unknown     every contract was read and the identity is on none of them (a wrong --id or --contract)
 */
export function outcome({ unreadable, contracts, undelivered, unsaved = false, unknown = false }) {
  if (unreadable) return unreadable === contracts ? 'unreadable' : 'partial';
  if (undelivered) return 'undelivered';
  if (unsaved) return 'unsaved';
  return unknown ? 'unknown' : 'ok';
}

// ---- the --state file ----------------------------------------------------------------------------
const HEX64 = /^[0-9a-f]{64}$/;
/**
 * A --state file's contents, checked: for this identity and network only, and only entries of the
 * contracts watched now, with sound values. Anything else is dropped, never trusted.
 */
export function readSaved(s, { id, networkId, watched }) {
  if (s?.identity !== id || s?.network !== networkId) return { ok: false, why: 'is for another identity or network' };
  const seen = new Map();
  const baselined = new Set();
  const addresses = new Set(watched);
  for (const [k, v] of Object.entries(s.seen && typeof s.seen === 'object' ? s.seen : {})) {
    const [address, rid, extra] = k.split(':');
    if (extra === undefined && addresses.has(address) && HEX64.test(rid ?? '') && Number.isSafeInteger(v?.approvals) && v.approvals >= 0
      && Object.hasOwn(STATE_WORDS, v?.state)) seen.set(k, { approvals: v.approvals, state: v.state });
  }
  for (const a of Array.isArray(s.baselined) ? s.baselined : []) if (addresses.has(a)) baselined.add(a);
  return { ok: true, seen, baselined };
}

// ---- the webhook ---------------------------------------------------------------------------------
/**
 * POST one alert. Delivered only on a 2xx answer. Redirects are not followed: a 307/308 would send
 * the same body on to wherever it points (plain http included, past the https-only rule), and a
 * 301/302/303 would turn the POST into a GET that drops the alert while answering 200.
 */
export async function postAlert(url, payload, { timeoutMs = 10_000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { delivered: false, why: `the webhook could not be reached (${e.cause?.message ?? e.message})` };
  }
  await res.body?.cancel().catch(() => {});
  if (res.ok) return { delivered: true };
  const redirect = res.status >= 300 && res.status < 400;
  return { delivered: false, why: `the webhook answered HTTP ${res.status}${redirect ? ', a redirect, which is not followed: name the final URL' : ''}` };
}
