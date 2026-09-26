// Watch an identity: every recovery opened against one identity commitment, on either Lantern
// contract on Preprod, from the same public state the rest of the page reads; checked again every
// 30 s while the tab stays open, in the background too (as often as the browser lets a background tab
// run). A new recovery, a new approval, a veto or a finalize is written into the page, and, if the
// visitor asked for it with a click, shown as a browser notification.
//
// Each contract keeps its own baseline: its first read only sets it, and a contract the indexer cannot
// read keeps its last one, so the other contract's alerts go on and nothing old is announced as new
// when it answers again (as devnet/src/watch.mjs does).
//
// An identity commitment is public already (every enrolment writes it to the contract), so pasting
// one gives nothing away. The input is checked strictly (64 hex characters) before anything is
// compared with it, and it is never sent anywhere: the page reads the whole contract state and looks
// for it here.
import { useEffect, useMemo, useRef, useState } from 'react';
import FingerprintWords from '../components/FingerprintWords.jsx';
import Cmd from './Cmd.jsx';
import { Link } from '../lib/router.jsx';
import { fingerprintWords } from '../../../src/words.js';
import { CONTRACTS, DEMO_IDENTITY, RECORDED_TXS, SETUP, SHIPPED_RECOVERY } from './records.js';
import { alertFor, CHIP, ENDED, keepNews, lineageOf, orderForWatch, parseIdCommit, recoveriesFor, recoveryState, shortHex, spanWords, STATE_WORDS, utc, utcClock, utcDay, utcHM } from './status.js';
import { POLL_MS, useNow } from './useChain.js';

const LANTERNS = CONTRACTS.filter((c) => c.kind === 'lantern');
const STORE = 'lantern.watch.id';
const STORE_SW = 'lantern.watch.sw-only';
// Recoveries drawn at most beyond every open one with an approval, most urgent first (status.js
// orderForWatch): anyone can open one against any enrolled identity, and none expires, so a flood of
// decoys must never push one that can finalize out of sight.
const SHOWN = 20;
const NEWS_MAX = 8; // entries the in-page log keeps
const FLOOD = 3; // more open recoveries than this, and the page says what a flood is and how to end it
// What the time under a recovery is, by where it stands: the lock's end, whether or not it can still come.
const WHEN = {
  waiting: 'Can finalize from', short: 'Can finalize from', ready: 'Can finalize from',
  finalized: 'Timelock ended', closed: 'Timelock ended', vetoed: 'Timelock would have ended', cancelled: 'Timelock would have ended',
};
const INPUT_MAX = 4096; // a paste longer than this is cut, and still refused as "far more" than 64

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;
const readStored = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const writeStored = (k, v) => { try { if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); } catch { /* private mode: fine */ } };
const names = (fs) => fs.map((f) => f.c.inline).join(' and ');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The identity in the page's address, #id=…: after the #, a part a browser never sends to the
 *  site's host. */
const hashId = () => (window.location.hash.startsWith('#id=') ? new URLSearchParams(window.location.hash.slice(1)).get('id') : null);

/** Puts the identity watched in the address, or takes it out. */
function writeUrlId(value) {
  const url = new URL(window.location.href);
  if (value) url.hash = `id=${value}`;
  else if (hashId() !== null) url.hash = '';
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** The identity to start with: the address's, else the one this browser watched last. */
function startingId() {
  const p = parseIdCommit(hashId() ?? readStored(STORE) ?? '');
  return p.ok ? p.id : null;
}

/** Whether this browser can show a notification: 'granted', 'default', 'denied', 'unsupported', or
 *  'sw-only' (granted, but it shows them only from an installed app's service worker, as Chrome on
 *  Android does; learnt the first time one was refused, and remembered). */
function startingPerm() {
  if (!canNotify()) return 'unsupported';
  const p = Notification.permission;
  return p === 'granted' && readStored(STORE_SW) ? 'sw-only' : p;
}

/** Say what a valid-looking value is, when it is not an identity commitment we know. */
function whatIsIt(id) {
  const c = CONTRACTS.find((x) => x.address === id);
  if (c) return `That is the address of a contract (${c.inline}), not an identity commitment.`;
  if (id === SHIPPED_RECOVERY.rid) return `That is the shipped recovery’s id. The identity it recovers is ${shortHex(SHIPPED_RECOVERY.idCommit)}: use the demo identity.`;
  if (RECORDED_TXS.some((t) => t.tx.txHash === id)) return 'That is a transaction’s hash, not an identity commitment.';
  return null;
}

/** What changed on one contract since its baseline, as alerts: one per recovery at most, its end
 *  first (status.js alertFor), so a finalize or a veto seen together with an approval is not lost. */
function changes(f, prev, map) {
  const events = [];
  for (const [rid, { r, st }] of map) {
    const was = prev.get(rid);
    const news = alertFor(was ? { approvals: was.r.approvals, state: was.st.state } : null, r.approvals, st.state);
    if (!news) continue;
    const tag = `lantern-${f.c.key}:${rid}`;
    const of = `${r.approvals} of ${st.threshold ?? '?'}`;
    const device = `Its new device’s fingerprint: ${fingerprintWords(r.ephemeralPk).join(' ')}.`;
    const said = STATE_WORDS[st.state].toLowerCase();
    if (news.kind === 'opened') {
      events.push({ tag, kind: news.kind, title: 'A recovery was opened for the identity you watch', body: `On ${f.c.inline}. ${device} It can finalize from ${utc(st.canFinalizeAt)} unless it is vetoed.` });
    } else if (news.kind === 'approval') {
      events.push({ tag, kind: news.kind, title: 'A recovery for the identity you watch gained an approval', body: `Now ${of}, on ${f.c.inline}.${ENDED.has(st.state) ? '' : ` It can finalize from ${utc(st.canFinalizeAt)}.`}` });
    } else if (news.isNew) {
      events.push({ tag, kind: news.kind, title: `A recovery was opened for the identity you watch, and is already ${said}`, body: `On ${f.c.inline}, recovery ${shortHex(r.rid)}: opened and ended since the last check, with ${of} approvals. ${device}` });
    } else {
      events.push({ tag, kind: news.kind, title: `A recovery for the identity you watch: ${said}`, body: `On ${f.c.inline}, recovery ${shortHex(r.rid)}.${news.gained ? ` It had reached ${of} approvals.` : ''}` });
    }
  }
  return events;
}

export default function Watch({ chain, onWatching }) {
  const now = useNow(15_000);
  const [id, setId] = useState(startingId);
  const [text, setText] = useState(() => id ?? '');
  const [error, setError] = useState(null);
  const [perm, setPerm] = useState(startingPerm);
  const [news, setNews] = useState([]);
  const input = useRef(null);

  // The page keeps checking with the tab in the background only while an identity is watched.
  useEffect(() => { onWatching?.(Boolean(id)); }, [id, onWatching]);

  const watch = (value) => {
    setId(value);
    setText(value ?? '');
    setNews([]);
    writeStored(STORE, value);
    writeUrlId(value);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const p = parseIdCommit(text);
    if (!p.ok) { setError(p.why); input.current?.focus(); return; }
    setError(null);
    watch(p.id);
  };

  // What each Lantern contract says about this identity.
  const found = useMemo(() => (id ? LANTERNS.map((c) => {
    const got = chain.byKey[c.key];
    const d = got.decoded;
    if (!d) return { c, status: got.status === 'ok' ? 'undecoded' : got.status, error: got.error, recs: [], identity: null, heirs: [] };
    const recs = recoveriesFor(id, d).map((r) => ({ r, st: recoveryState(r, d, now, c.delaySeconds) }));
    const identity = d.identities[id] ?? null;
    // the rest of its lineage, from its root: a commitment since succeeded still names the current one
    const heirs = lineageOf(id, d);
    return { c, status: 'ok', recs, identity, heirs };
  }) : []), [id, chain.byKey, now]);

  // New since the last read, contract by contract (see the head of this file).
  const seen = useRef({ id: null, base: {} });
  const permNow = useRef(perm);
  permNow.current = perm;
  useEffect(() => {
    if (seen.current.id !== id) seen.current = { id, base: {} }; // a new watch starts from its own first read
    if (!id) return;
    const { base } = seen.current;
    const events = [];
    for (const f of found) {
      if (f.status !== 'ok') continue; // unreadable: its baseline stays as it was
      const map = new Map(f.recs.map((x) => [x.r.rid, x]));
      const prev = base[f.c.key];
      base[f.c.key] = map;
      if (prev) events.push(...changes(f, prev, map));
    }
    if (!events.length) return;
    const at = Date.now();
    setNews((n) => keepNews([...events.map((e, i) => ({ ...e, at, key: `${at}-${i}` })), ...n], NEWS_MAX));
    if (permNow.current === 'granted') {
      for (const e of events) {
        try {
          // One tag per recovery, so its news replaces its last alert; renotify, so each replacement
          // (the approval that reaches the threshold, say) still alerts rather than arriving silently.
          new Notification(e.title, { body: e.body, tag: e.tag, renotify: true });
        } catch {
          // This browser shows notifications only from an installed app (Chrome on Android): say so.
          writeStored(STORE_SW, '1');
          setPerm('sw-only');
          break;
        }
      }
    }
  }, [found, id]);

  const ask = async () => {
    if (!canNotify()) return;
    let p;
    try { p = await Notification.requestPermission(); } catch { p = Notification.permission; }
    if (p === 'granted') {
      // One notification at once: it says the watch is on, and shows whether this browser can.
      try {
        new Notification('Lantern is watching this identity', { body: `You will be told here when a recovery for ${shortHex(id)} opens, gains an approval, or ends.`, tag: 'lantern-watch' });
        writeStored(STORE_SW, null);
      } catch {
        writeStored(STORE_SW, '1');
        p = 'sw-only';
      }
    }
    setPerm(p);
  };

  const all = found.flatMap((f) => f.recs.map((x) => ({ ...x, f })));
  const order = orderForWatch(all, SHOWN);
  const recs = order.drawn;
  const reading = found.some((f) => f.status === 'reading');
  const failed = found.filter((f) => f.status === 'error' || f.status === 'missing');
  const undecoded = found.filter((f) => f.status === 'undecoded');
  const known = found.some((f) => f.identity || f.heirs.length || f.recs.length);

  // What a screen reader hears when a watch starts, and once its first read settles: said once, then
  // kept, so later news is spoken by the log below and not twice (WCAG 4.1.3). The region is always in
  // the page, so a change to it is announced; the identity's first characters make two watches differ.
  const who = id ? `Watching ${shortHex(id)}` : '';
  const settled = id && !reading && !failed.length;
  const fresh = !id ? ''
    : reading && !all.length ? `${who}. Reading both Lantern contracts…`
    : all.length ? `${who}: ${all.length} recover${all.length === 1 ? 'y' : 'ies'} found.`
    : known ? `${who}: enrolled, and no recovery opened yet.`
    : failed.length ? `${who}: ${names(failed)} could not be read from the indexer yet.`
    : undecoded.length ? `${who}: this browser could not run the contract’s reader, so no recovery can be listed here.`
    : `${who}. ${whatIsIt(id) ?? 'Neither Lantern contract on Preprod has enrolled this identity, and no recovery names it.'}`;
  const [kept, setKept] = useState(null);
  useEffect(() => { if (settled && kept?.id !== id) setKept({ id, text: fresh }); }, [settled, kept, id, fresh]);
  const said = id && kept?.id === id ? kept.text : fresh;

  // When both Lantern contracts last answered, and whether a later check went unanswered.
  const states = LANTERNS.map((c) => chain.byKey[c.key]);
  const lastOk = states.every((s) => s.okAt) ? Math.min(...states.map((s) => s.okAt)) : null;
  const stale = states.filter((s) => s.pollError && s.okAt);
  const since = stale.length ? Math.min(...stale.map((s) => s.failingSince)) : null;

  return (
    <div className="lv-watch">
      <form className="lv-watch-form" onSubmit={onSubmit} noValidate aria-label="Watch an identity">
        <label htmlFor="lv-id" className="lv-label">Identity commitment</label>
        <div className="lv-watch-row">
          <input
            id="lv-id" ref={input} name="id" type="text" value={text} maxLength={INPUT_MAX}
            onChange={(e) => { setText(e.target.value); if (error) setError(null); }}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} translate="no"
            placeholder="c23097dd48ab5264…"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'lv-id-help lv-id-error' : 'lv-id-help'}
          />
          <button type="submit" className="primary">Watch</button>
        </div>
        <p id="lv-id-help" className="hint">64 characters, 0 to 9 and a to f. It is public already: enrolling writes it to the contract.</p>
        {error ? <p id="lv-id-error" className="lv-error" role="alert">{error}</p> : null}
        <p className="lv-demo-id">
          <button type="button" className="linkish" onClick={() => { setError(null); watch(DEMO_IDENTITY); }}>Use the demo identity</button>
          <span className="meta lv-demo-note">The one the shipped recovery restores: <code>{shortHex(DEMO_IDENTITY)}</code>.</span>
        </p>
      </form>
      <p className="sr-only" role="status" data-testid="watch-said">{said}</p>

      {id ? (
        <div className="lv-watching" data-testid="watching">
          <p className="lv-watching-head">
            Watching <code title={id}>{shortHex(id, 10, 6)}</code>
            <button type="button" className="linkish" onClick={() => { watch(null); input.current?.focus(); }}>Stop watching</button>
          </p>
          <p className="meta lv-poll" data-testid="watch-poll" data-stale={since ? 'true' : undefined}>
            {since
              ? `${lastOk ? `Last checked at ${utcClock(lastOk)}. ` : ''}The indexer has not answered since ${utcClock(since)}; still trying.`
              : `${lastOk ? `Checked at ${utcClock(lastOk)}. ` : ''}Checked again every ${POLL_MS / 1000}\u00a0s while this tab stays open; in the background, as often as the browser allows (about once a minute).`}
          </p>

          {reading && !recs.length ? <p className="lv-pending">Reading both Lantern contracts…</p> : null}
          {failed.length ? (
            <p className="lv-error-note">
              {capital(names(failed))} could not be read from the indexer yet, so this list may be missing recoveries there. Alerts for {failed.length === 1 ? 'it' : 'them'} are paused until {failed.length === 1 ? 'it' : 'they'} can be read.
            </p>
          ) : null}

          {undecoded.length ? (
            <p className="lv-error-note">
              This browser could not run the contract’s reader, so the recoveries on {names(undecoded)} cannot be listed here, and alerts for {undecoded.length === 1 ? 'it' : 'them'} are paused. The watcher in a terminal can: see below.
            </p>
          ) : null}

          {!reading && !known && !failed.length && !undecoded.length ? (
            <p className="lv-none" data-testid="watch-none">
              {whatIsIt(id) ?? 'Neither Lantern contract on Preprod has enrolled this identity, and no recovery names it. Check that you pasted the identity commitment itself.'}
            </p>
          ) : null}

          {found.filter((f) => f.status === 'ok' && (f.identity || f.heirs.length)).map((f) => (
            <p key={f.c.key} className="lv-enrolled">
              {f.identity
                ? <>Enrolled on {f.c.inline}: {f.identity.threshold} approvals needed{f.identity.retired ? '; since retired by a recovery' : '; current'}.</>
                : <>Enrolled on {f.c.inline} as the root of {f.heirs.length} commitment{f.heirs.length === 1 ? '' : 's'}.</>}
              {f.heirs.filter((h) => !h.retired).map((h) => <span key={h.idCommit}> Current: <code>{shortHex(h.idCommit)}</code>.</span>)}
            </p>
          ))}

          {known && !all.length && !reading ? <p className="lv-none" data-testid="watch-none">No recovery has been opened for it. When one is, it appears here.</p> : null}

          {order.hiddenOpen || order.open > FLOOD ? (
            <p className="lv-error-note lv-flood" data-testid="watch-flood">
              {plural(order.open, 'recovery is', 'recoveries are')} open for this identity. Anyone can open one against an enrolled identity, and none expires, so the ones with approvals are drawn first and none of them is left out. Vetoing them one by one does not stop new ones: replacing your guardians, with the veto card, cancels every open recovery in one transaction, your own too.
            </p>
          ) : null}

          {recs.length ? (
            <ol className="lv-recs" aria-label="Recoveries for this identity, most urgent first">
              {recs.map(({ r, st, f }) => (
                <li key={`${f.c.key}:${r.rid}`} className="lv-rec" data-state={st.state} data-testid="watch-recovery">
                  <p className="lv-rec-head">
                    <span className={CHIP[st.state]}>{STATE_WORDS[st.state]}</span>
                    <span className="meta">on {f.c.inline} · recovery <code>{shortHex(r.rid)}</code></span>
                  </p>
                  <div className="lv-rec-device">
                    <p className="lv-label">The new device’s fingerprint</p>
                    <FingerprintWords publicKey={r.ephemeralPk} label="The new device’s fingerprint" />
                  </div>
                  <dl className="lv-rec-facts">
                    <div><dt>Approvals</dt><dd>{r.approvals} of {st.threshold ?? '?'}</dd></div>
                    <div>
                      <dt>{WHEN[st.state]}</dt>
                      <dd>{utc(st.canFinalizeAt)}{st.state === 'waiting' ? <span className="lv-sub">in {spanWords(st.canFinalizeAt - now)}</span> : null}</dd>
                    </div>
                    <div><dt>Opened</dt><dd>between {utcHM(r.openedAtLo)} and {utcHM(r.openedAtHi)} UTC<span className="lv-sub">{utcDay(r.openedAtHi)}</span></dd></div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : null}
          {all.length > recs.length ? (
            <p className="meta lv-recs-more" data-testid="watch-more">
              Not drawn here: {[
                order.hiddenOpen ? `${plural(order.hiddenOpen, 'more open recovery', 'more open recoveries')} with no approvals` : null,
                order.hiddenEnded ? plural(order.hiddenEnded, order.hiddenOpen ? 'ended one' : 'ended recovery', order.hiddenOpen ? 'ended ones' : 'ended recoveries') : null,
              ].filter(Boolean).join(', and ')}. The watcher in a terminal lists every one.
            </p>
          ) : null}

          <div className="lv-notify">
            {perm === 'unsupported' ? <p className="meta">This browser cannot show notifications. Anything new still appears on this page.</p>
              : perm === 'sw-only' ? <p className="meta">This browser only shows notifications from installed apps. Anything new still appears on this page.</p>
              : perm === 'granted' ? <p className="meta">This browser will tell you when a recovery opens, gains an approval, or ends, while this tab stays open, in the background too. A phone may pause a tab it is not showing; the watcher in a terminal does not stop.</p>
              : perm === 'denied' ? <p className="meta">Notifications are blocked for this site in this browser. Anything new still appears on this page.</p>
              : (
                <p>
                  <button type="button" onClick={ask}>Tell me in this browser</button>
                  <span className="meta"> When a recovery opens or gains an approval, while this tab stays open, in the background too. Your browser asks first.</span>
                </p>
              )}
          </div>

          <div className="lv-news" role="log" aria-live="polite" aria-label="New since you started watching">
            {news.map((n) => (
              <p key={n.key} className="lv-new"><span className="lv-new-at">{utcClock(n.at)}</span> <strong>{n.title}.</strong> {n.body}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="lv-move">
        <h3>If a recovery is not yours</h3>
        <ol className="lv-steps">
          <li><p><strong>Compare the six words.</strong> If you opened it, they match the six your new phone shows. If you did not open it, or they differ, it is not your device, whoever tells you otherwise: call your guardians on numbers you already know, and tell them not to approve it.</p></li>
          <li><p><strong>Veto it with your veto card</strong> before it can finalize. The card holds the second secret you kept apart when you enrolled. No guardian holds it, so no number of guardians can stop your veto, and a vetoed recovery never finalizes.</p></li>
          <li><p><strong>If shares may have leaked, recover to a new secret.</strong> Replacing your guardians does not change your secret: every share you have dealt still rebuilds it, and whoever holds enough of them can act as you at every host until a recovery of your own finalizes. Open a recovery for your own new device, have your guardians approve it and finalize it after 72 hours. Do not replace your guardians while it is open, because a replacement kills it. Then replace them with your new veto card, make new kits, and have every old kit destroyed.</p></li>
        </ol>
        <p className="meta">
          This page only watches: a veto is made from your own device, with Lantern’s <code>vetoRecovery</code> circuit and the card. <Link to="/kit">What a veto card holds</Link>.
          To be told with no tab open, run the watcher: <Cmd>{`LANTERN_NETWORK=preprod npm run watch -- --id ${id ?? '<commitment>'}`}</Cmd>, with <code>--webhook-file</code> (or <code>LANTERN_WEBHOOK</code>) to send each change on, since a webhook URL is a secret (and <code>--once --state</code> for a cron job). It needs the <a href={SETUP}>same setup as the full check</a>.
        </p>
      </div>
    </div>
  );
}
