// What /live knows about the four contracts on Preprod, kept fresh while the tab is open.
//
// On mount: each contract's latest action (a small query), and at once, over one WebSocket that closes
// once caught up, every action from its deploy to that latest one. Beside it, each contract's state
// (HTTPS), read with the contract's own reader (./decode.js, a lazy chunk with the runtime).
// Then, every 30 s: each contract's latest action. Only when that has moved is the state read again and
// the history caught up. What the poll compares against (`known`) moves on only once the history has
// caught up to it, so a catch-up the indexer cut short is tried again at the next check. While the tab is hidden it asks nothing, unless an identity is being watched
// (`background`): then it keeps checking, as often as the browser lets a background tab (Chromium slows
// such timers to about once a minute; a phone may pause the tab). On the tab's return, a check that is
// due runs at once.
//
// Every answer is dated per contract (`okAt`), and every failed check is kept (`pollError`, and
// `failingSince`, the first failure since the last answer), so the page never says "checked" for a
// check the indexer did not answer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { catchUpActions, contractState, latestAction } from '../lib/indexer.js';
import { CONTRACTS, V2_RUN } from './records.js';

export const POLL_MS = 30_000;
const SLOW_MS = 6_000;
const LATEST_MS = 15_000;

const initial = () => ({
  byKey: Object.fromEntries(CONTRACTS.map((c) => [c.key, {
    status: 'reading', error: null, errorText: null, latest: null, decoded: null, decodeError: null, readAt: null,
    okAt: null, pollError: null, failingSince: null,
  }])),
  timelines: Object.fromEntries(CONTRACTS.map((c) => [c.key, { status: 'reading', actions: [] }])),
  slow: false,
  checkedAt: null, // the last time every contract answered
  polling: 'on', // on | background | paused
});

/** Whether the page is visible, kept current. */
export function useVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/** The time, every `ms` while the page is visible (a countdown's clock). */
export function useNow(ms = 1000) {
  const visible = useVisible();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, visible]);
  return now;
}

let decoder = null;
/** The contract's reader (./decode.js, with the runtime): loaded once, on first use. */
export const loadDecoder = () => (decoder ??= import('./decode.js').catch((e) => { decoder = null; throw e; }));

/** A contract's state, read with its own reader: Lantern v2's with the identity its run enrolled. */
export async function decodeState(c, stateHex) {
  const d = await loadDecoder();
  if (c.kind === 'host') return d.decodeHost(stateHex);
  if (c.kind === 'lantern2') return d.decodeLantern2(stateHex, { idCommit: V2_RUN.identity.idCommit, period: V2_RUN.identity.checkIns.period });
  return d.decodeLantern(stateHex);
}

async function readContract(c, signal) {
  const s = await contractState(c.address, { signal });
  if (!s) return { status: 'missing', latest: null, decoded: null, decodeError: null };
  let decoded = null;
  let decodeError = null;
  try {
    decoded = await decodeState(c, s.state);
  } catch (e) {
    if (signal?.aborted) throw e;
    decodeError = 'This browser could not run the contract’s reader, so the state is not shown; the history still is.';
  }
  return { status: 'ok', latest: s.action, decoded, decodeError };
}

const heightOf = (a) => (a ? { hash: a.tx.hash, height: a.tx.height } : null);
/** What the socket is asked for: this contract's actions from `fromHeight` (its deploy) to `latest`. */
const want = (c, latest, fromHeight) => ({ key: c.key, address: c.address, fromHeight: fromHeight ?? c.deploy?.blockHeight ?? latest.tx.height, untilHash: latest.tx.hash });

/**
 * @param {{ background?: boolean }} [opts] background: keep checking while the tab is hidden (an
 *   identity is being watched, and its owner wants to hear of a new recovery without looking).
 */
export function useChain({ background = false } = {}) {
  const [chain, setChain] = useState(initial);
  const visible = useVisible();
  // what the poll compares against, outside React's render cycle
  const known = useRef({});
  const busy = useRef(false);
  const lastPoll = useRef(0);
  const run = useRef(0);

  const patch = useCallback((fn) => setChain((c) => fn(c)), []);
  const patchKey = useCallback((key, fn) => setChain((s) => ({ ...s, byKey: { ...s.byKey, [key]: fn(s.byKey[key]) } })), []);
  /** The indexer answered for this contract. */
  const answered = useCallback((key, at, more = {}) => patchKey(key, (v) => ({ ...v, ...more, okAt: at, pollError: null, failingSince: null })), [patchKey]);
  /** It did not. */
  const unanswered = useCallback((key, at, kind, more = {}) => patchKey(key, (v) => ({ ...v, ...more, pollError: kind, failingSince: v.failingSince ?? at })), [patchKey]);

  /** Catch each contract's history up to its latest action, from `fromHeight`. Resolves with which
   *  contracts caught up ({ [key]: true }). */
  const catchUp = useCallback(async (wanted, signal) => {
    if (!wanted.length) return {};
    try {
      const got = await catchUpActions(wanted, { signal });
      patch((c) => {
        const timelines = { ...c.timelines };
        for (const w of wanted) {
          const g = got[w.address];
          const prev = timelines[w.key].actions;
          const merged = [...prev];
          for (const a of g?.actions ?? []) if (!merged.some((x) => x.tx.hash === a.tx.hash)) merged.push(a);
          merged.sort((a, b) => a.tx.height - b.tx.height);
          timelines[w.key] = { status: g?.complete ? 'ok' : merged.length ? 'partial' : 'error', actions: merged };
        }
        return { ...c, timelines };
      });
      return Object.fromEntries(wanted.map((w) => [w.key, Boolean(got[w.address]?.complete)]));
    } catch (e) {
      if (signal?.aborted) return {};
      patch((c) => {
        const timelines = { ...c.timelines };
        for (const w of wanted) timelines[w.key] = { ...timelines[w.key], status: timelines[w.key].actions.length ? 'partial' : 'error' };
        return { ...c, timelines };
      });
      return {};
    }
  }, [patch]);

  /** Read everything afresh: each history from its deploy, and each state. */
  const readAll = useCallback(async (signal) => {
    const mine = ++run.current;
    busy.current = true;
    lastPoll.current = Date.now(); // the 30-second check counts from here
    const slow = setTimeout(() => { if (run.current === mine) patch((c) => ({ ...c, slow: true })); }, SLOW_MS);
    patch((c) => ({
      ...c,
      slow: false,
      byKey: Object.fromEntries(Object.entries(c.byKey).map(([k, v]) => [k, v.status === 'ok' ? v : { ...v, status: 'reading', error: null }])),
    }));

    // The history needs only each contract's latest action, not its state (larger, and read with the
    // contract's reader), so the socket starts catching up as soon as the latest actions are known.
    const early = Promise.all(CONTRACTS.map((c) => latestAction(c.address, { signal, timeoutMs: LATEST_MS }).then((a) => [c, a], () => [c, undefined])))
      .then(async (pairs) => {
        if (signal.aborted) return { latest: {}, done: {} };
        const wanted = pairs.filter(([, a]) => a).map(([c, a]) => want(c, a));
        const done = await catchUp(wanted, signal);
        return { latest: Object.fromEntries(pairs.map(([c, a]) => [c.key, a])), done };
      });

    const states = Promise.all(CONTRACTS.map(async (c) => {
      try {
        const r = await readContract(c, signal);
        if (signal.aborted) return [c, undefined];
        answered(c.key, Date.now(), { ...r, error: null, errorText: null, readAt: Date.now() });
        if (!r.latest) patch((s) => ({ ...s, timelines: { ...s.timelines, [c.key]: { status: 'ok', actions: [] } } }));
        return [c, r];
      } catch (e) {
        if (signal.aborted) return [c, undefined];
        const kind = e?.kind ?? 'unreachable';
        unanswered(c.key, Date.now(), kind, { status: 'error', error: kind, errorText: e?.message ?? null });
        patch((s) => ({ ...s, timelines: { ...s.timelines, [c.key]: { ...s.timelines[c.key], status: 'error' } } }));
        return [c, undefined];
      }
    })).then((pairs) => {
      clearTimeout(slow);
      if (signal.aborted) return pairs;
      lastPoll.current = Date.now();
      patch((c) => ({ ...c, slow: false, ...(pairs.every(([, r]) => r) ? { checkedAt: Date.now() } : {}) }));
      return pairs;
    });

    const [{ latest: earlyLatest, done: earlyDone }, read] = await Promise.all([early, states]);
    if (signal.aborted) return;
    // A contract the early question missed, or that moved between it and the state, is caught up now,
    // from where the early catch-up stopped. The poll then compares against the state's latest action,
    // once its history has caught up to it; until then the poll counts it as unread and reads it again.
    const late = [];
    for (const [c, r] of read) {
      if (!r) continue;
      const e = earlyLatest[c.key];
      if (!r.latest) known.current[c.key] = null;
      else if (e && e.tx.hash === r.latest.tx.hash) { if (earlyDone[c.key]) known.current[c.key] = heightOf(r.latest); }
      else late.push({ w: want(c, r.latest, earlyDone[c.key] ? e?.tx.height : undefined), latest: r.latest });
    }
    const lateDone = await catchUp(late.map((x) => x.w), signal);
    for (const { w, latest } of late) if (lateDone[w.key]) known.current[w.key] = heightOf(latest);
  }, [answered, catchUp, patch, unanswered]);

  /** The 30-second check: has any contract moved? Only then read it again. */
  const poll = useCallback(async (signal) => {
    if (busy.current) return;
    busy.current = true;
    lastPoll.current = Date.now();
    const at = Date.now();
    const moved = [];
    let missed = 0;
    try {
      await Promise.all(CONTRACTS.map(async (c) => {
        const was = known.current[c.key];
        if (was === undefined) { moved.push(c); return; } // never read: read it now
        try {
          const a = await latestAction(c.address, { signal, timeoutMs: LATEST_MS });
          if (signal.aborted) return;
          if ((a?.tx.hash ?? null) !== (was?.hash ?? null)) moved.push(c);
          else answered(c.key, Date.now());
        } catch (e) {
          if (signal.aborted) return;
          missed++;
          unanswered(c.key, at, e?.kind ?? 'unreachable');
        }
      }));
      if (signal.aborted) return;
      const wanted = [];
      await Promise.all(moved.map(async (c) => {
        try {
          const r = await readContract(c, signal);
          if (signal.aborted) return;
          const was = known.current[c.key];
          answered(c.key, Date.now(), { ...r, error: null, errorText: null, readAt: Date.now() });
          // `known` moves on below, once the history has caught up to this action.
          if (r.latest) wanted.push({ w: want(c, r.latest, was?.height), latest: r.latest });
          else known.current[c.key] = null;
        } catch (e) {
          if (signal.aborted) return;
          missed++;
          const kind = e?.kind ?? 'unreachable';
          unanswered(c.key, at, kind, { error: kind, errorText: e?.message ?? null });
          patchKey(c.key, (v) => ({ ...v, status: v.decoded ? 'ok' : 'error' }));
        }
      }));
      if (signal.aborted) return;
      if (!missed) patch((c) => ({ ...c, checkedAt: Date.now() }));
      const done = await catchUp(wanted.map((x) => x.w), signal);
      for (const { w, latest } of wanted) if (done[w.key]) known.current[w.key] = heightOf(latest);
    } finally {
      busy.current = false;
    }
  }, [answered, catchUp, patch, patchKey, unanswered]);

  // the first read; again on "Try again". `retrying` holds from the click until that read settles, so
  // the page can keep the button (and the focus on it) in place meanwhile; `retriedAt` is when the
  // last one settled.
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retriedAt, setRetriedAt] = useState(null);
  useEffect(() => {
    const ctl = new AbortController();
    // A run that was given up on (StrictMode's second mount, "Try again") leaves `busy` to the new one.
    readAll(ctl.signal).finally(() => {
      if (ctl.signal.aborted) return;
      busy.current = false;
      if (attempt) { setRetrying(false); setRetriedAt(Date.now()); }
    });
    return () => ctl.abort();
  }, [readAll, attempt]);

  // the poll: while visible, and while hidden too when an identity is watched
  const mode = visible ? 'on' : background ? 'background' : 'paused';
  useEffect(() => { patch((c) => (c.polling === mode ? c : { ...c, polling: mode })); }, [mode, patch]);
  const active = mode !== 'paused';
  useEffect(() => {
    if (!active) return undefined;
    const ctl = new AbortController();
    const due = () => Date.now() - lastPoll.current >= POLL_MS - 500;
    // back from hidden with a check overdue: run it now
    if (lastPoll.current && due()) poll(ctl.signal);
    const t = setInterval(() => { if (due()) poll(ctl.signal); }, 5_000);
    return () => { clearInterval(t); ctl.abort(); };
  }, [active, poll]);

  const retry = useCallback(() => { setRetrying(true); setAttempt((n) => n + 1); }, []);
  return { ...chain, retrying, retriedAt, retry };
}
