// "Rehearse a recovery": the stepper. The visitor makes every choice; the rehearsal (engine.js) makes
// each circuit call they chose, as the person they chose, and this component draws what came back.
// Each step stays on the page once reached, as a record of what was done, so the whole rehearsal
// reads top to bottom, by eye or by screen reader; only the step you are on offers its controls,
// except the veto card and the clock, which stay at hand for as long as the 72 hours matter.
import { useEffect, useRef, useState } from 'react';
import FingerprintWords from '../components/FingerprintWords.jsx';
import { Pictogram } from '../brand/Pictogram.jsx';
import { Seal } from '../brand/Seal.jsx';
import { WordGrid, CheckWords } from '../kit/Sheets.jsx';
import { Link } from '../lib/router.jsx';
import { LEDGER_LABEL, clockText, short } from '../lib/format.js';
import { STEPS, stepIndex, verdict, list, possessive } from './copy.js';
import { Rail, Calls, Stamp, Clock, Counts, Holdings, PublicRecord } from './parts.jsx';

// Let the browser paint the progress line before the next burst of circuit work.
const paint = () => new Promise((resolve) => {
  const t = setTimeout(resolve, 50);
  requestAnimationFrame(() => { clearTimeout(t); setTimeout(resolve, 0); });
});
// A name as typed, its spaces run together, and anything invisible at either end dropped (a pasted
// zero-width space, a stray joiner). A name needs something to see: a name made only of invisible
// characters (format characters, the Hangul fillers, a blank braille cell) is no name.
const INVISIBLE = /[\p{Cf}\u115F\u1160\u3164\uFFA0\u2800]/gu;
const tidy = (s) => s.replace(/\s+/g, ' ').replace(/^[\s\p{Cf}]+|[\s\p{Cf}]+$/gu, '');
const seen = (s) => s.replace(INVISIBLE, '').toLowerCase();
const visible = (s) => /[\p{L}\p{N}\p{S}\p{P}]/u.test(s.replace(INVISIBLE, ''));
const WIDE = '(min-width: 1080px)';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const EMPTY = Object.fromEntries(Object.keys(LEDGER_LABEL).map((k) => [k, 0]));

/**
 * A kit's row, which opens on its words. The words are drawn only once it is opened: five kits of 72
 * words are a lot to hand a screen reader's page of links, or a search, before anyone asks for them.
 */
function KitFold({ kit, className = 'rh-kit', summary, children }) {
  const [open, setOpen] = useState(false);
  return (
    <details className={className} data-kit={kit} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}</summary>
      {open && children()}
    </details>
  );
}

/** One guardian's kit in words, as /kit prints it: the share first, the check words over all of it. */
function KitWords({ kit, id }) {
  const section = (key, label, words) => (
    <div className="rh-kit-section" data-section={key}>
      <h3 className="rh-kit-label" id={`${id}-${key}`}>{label}</h3>
      <WordGrid words={words} labelledBy={`${id}-${key}`} />
    </div>
  );
  return (
    <div className="rh-kit-words">
      {section('share', `Share ${kit.share} of ${kit.guardians}`, kit.words.share)}
      {section('secret', 'Guardian secret', kit.words.guardianSecret)}
      {section('salt', 'Leaf salt', kit.words.leafSalt)}
      <p className="rh-kit-check"><span className="rh-kit-label">Check words</span> <CheckWords words={kit.check} /></p>
      <p className="meta">The share is a part of your secret; the guardian secret and leaf salt let this guardian approve, without saying which guardian they are.</p>
    </div>
  );
}

/** Whether the side panel stands beside the steps (and scrolls on its own), or follows them. */
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(WIDE).matches));
  useEffect(() => {
    const m = window.matchMedia?.(WIDE);
    if (!m) return undefined;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export function Rehearsal({ engine }) {
  const { DEFAULT_NAMES, MIN_GUARDIANS, MAX_GUARDIANS, NAME_MAX } = engine;
  const [names, setNames] = useState(() => DEFAULT_NAMES.slice(0, MIN_GUARDIANS));
  const [threshold, setThreshold] = useState(2);
  const [w, setW] = useState(null);          // the rehearsal, once the guardians are chosen
  const [run, setRun] = useState(0);         // numbers each rehearsal, so a new one draws afresh
  const [at, setAt] = useState('choose');    // the furthest step reached
  const [, setVersion] = useState(0);        // the rehearsal changes in place: redraw after each action
  const [busy, setBusy] = useState(null);    // the progress line while enrolling
  const [slow, setSlow] = useState(false);   // an action has run long enough to dim the buttons
  const [said, setSaid] = useState('');      // what the status region announces
  const [error, setError] = useState(null);
  const [from, setFrom] = useState('phone'); // finalize from the approved phone, or another
  const [tamper, setTamper] = useState(false);
  // A step reached by an action arrives after what the action did has stamped in: one thing moves at
  // a time. A step reached by "Continue" arrives at once.
  const [late, setLate] = useState(null);
  const wide = useWide();
  const running = useRef(false);
  const focusNext = useRef(null);            // { id, block }: where focus goes once the next draw lands

  // A control that did its job is replaced by what it did. Focus moves to that, or to the next
  // step's title, so the keyboard never falls back to the top of the page and a screen reader
  // reads on from the right place. Only as far as needed: scroll margins clear the sticky header.
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    // The rehearsal changes in place, so a draw begun before the action ended can land after it,
    // without the element: then the next draw, which the action's end always asks for, has it.
    const el = document.getElementById(f.id);
    if (!el) return;
    focusNext.current = null;
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: f.block ?? 'nearest' });
  });

  const act = async (work, focus) => {
    if (running.current || !w) return;
    running.current = true;
    focusNext.current = null;
    setError(null);
    const before = w.records.length;
    const dim = setTimeout(() => setSlow(true), 250);
    try {
      await work();
      setSaid(verdict(w.records.slice(before)));
      const f = typeof focus === 'function' ? focus() : focus;
      if (f) focusNext.current = typeof f === 'string' ? { id: f } : f;
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      clearTimeout(dim);
      running.current = false;
      setBusy(null);
      setSlow(false);
      setVersion((v) => v + 1);
    }
  };
  const go = (key, after = false) => {
    setAt(key);
    setLate(after ? key : null);
    focusNext.current = { id: `rh-${key}-title`, block: 'start' };
  };
  const reach = (key) => { setAt(key); setLate(key); };

  // ---- step 1: the choice -------------------------------------------------------------------------
  const cleaned = names.map(tidy);
  const problems = cleaned.map((nm, i) => (!visible(nm) ? 'Give this guardian a name.'
    : cleaned.findIndex((o) => seen(o) === seen(nm)) !== i ? 'Another guardian has this name.' : null));
  const namesOk = problems.every((p) => !p);
  const add = () => {
    if (names.length >= MAX_GUARDIANS) return;
    const next = DEFAULT_NAMES.find((d) => !cleaned.some((c) => seen(c) === seen(d))) ?? `Guardian ${names.length + 1}`;
    focusNext.current = { id: `rh-name-${names.length}` };
    setNames([...names, next]);
  };
  const remove = (i) => {
    const kept = names.filter((_, k) => k !== i);
    focusNext.current = { id: 'rh-add' };
    setNames(kept);
    setThreshold((t) => Math.min(t, kept.length));
  };
  const choose = (e) => {
    e.preventDefault();
    if (!namesOk) {
      focusNext.current = { id: `rh-name-${problems.findIndex(Boolean)}` };
      setVersion((v) => v + 1);
      return;
    }
    setW(engine.newRehearsal({ names: cleaned, threshold }));
    setRun((r) => r + 1);
    setSaid(`${list(cleaned)}: any ${threshold} of ${cleaned.length} can bring your identity back.`);
    go('enrol', true);
  };
  const restart = (same) => {
    if (running.current) return;
    setError(null);
    setFrom('phone');
    setTamper(false);
    setRun((r) => r + 1);
    if (same) {
      setW(engine.newRehearsal({ names: w.names, threshold: w.t }));
      setSaid('A new rehearsal with the same guardians, and new secrets.');
      go('enrol');
    } else {
      setNames(w.names);
      setThreshold(w.t);
      setW(null);
      setSaid('A new rehearsal. Choose your guardians.');
      go('choose');
    }
  };

  // ---- the actions: each one call (or a few) to the compiled circuits -----------------------------
  const enrol = () => act(async () => {
    await w.enrol(async (label, i, of) => { setBusy(`${label} (${i} of ${of})…`); await paint(); });
    if (w.state.dealt) reach('lose');
  }, 'rh-enrol-done');
  const lose = () => act(async () => { await w.loseLaptop(); reach('open'); }, 'rh-lose-done');
  const open = () => act(async () => { await w.openRecovery(); if (w.state.rid) reach('decide'); }, 'rh-open-done');
  const phish = () => act(() => w.phish(), 'rh-phish-done');
  const answer = (i, who, yes) => act(() => (yes ? w.approve(i, who) : w.refuse(i, who)), `rh-answer-${i}-${who}`);
  const veto = (who) => act(() => w.veto(who), `rh-rec-${who}`);
  const skip = () => act(() => w.skip(), 'rh-window-done');
  const finalize = (e) => {
    e.preventDefault();
    act(() => w.finalize({ other: from === 'other', tamper: tamper && w.sharesAt('phone').length > 0 }),
      () => (w.state.finalized === 'you' ? 'rh-finalize-done' : `rh-call-${w.records.at(-1).seq}`));
  };

  const reached = stepIndex(at);
  const s = w?.state;
  const recs = w?.records ?? [];
  const of = (key) => recs.filter((r) => r.stage === key);
  const dim = slow ? 'true' : undefined;

  const requests = w && s.rid ? w.recoveries().sort((a, b) => (a.rid < b.rid ? -1 : 1)) : [];
  const unanswered = w ? w.names.flatMap((_, i) => requests.filter((q) => !s.decisions[`${i}:${q.who}`])).length : 0;
  const attempts = of('finalize').length;
  // Step 8 beside the side panel, from 1080px: the record there already opens on the counts.
  const beside = wide && at === 'record';

  const body = {
    choose: () => (w
      ? <p className="rh-done" id="rh-choose-done">{list(w.names)}. Any {w.t} of {w.n} can bring your identity back.</p>
      : (
        <form className="rh-choose" onSubmit={choose} noValidate>
          <fieldset className="rh-names">
            <legend>Your guardians: three to five</legend>
            <ol>
              {names.map((nm, i) => (
                <li key={i} className="rh-name-row" data-guardian={i}>
                  <label htmlFor={`rh-name-${i}`}>Guardian {i + 1}</label>
                  <input id={`rh-name-${i}`} type="text" value={nm} maxLength={NAME_MAX} autoComplete="off" spellCheck={false}
                    aria-invalid={problems[i] ? 'true' : undefined} aria-describedby={problems[i] ? `rh-name-${i}-note` : undefined}
                    onChange={(e) => setNames(names.map((v, k) => (k === i ? e.target.value : v)))} />
                  {names.length > MIN_GUARDIANS && (
                    <button type="button" className="linkish rh-remove" onClick={() => remove(i)}>
                      Remove<span className="sr-only"> {cleaned[i] || `guardian ${i + 1}`}</span>
                    </button>
                  )}
                  {problems[i] && <p className="meta warn rh-name-note" id={`rh-name-${i}-note`}>{problems[i]}</p>}
                </li>
              ))}
            </ol>
            {names.length < MAX_GUARDIANS
              ? <button type="button" id="rh-add" onClick={add}>Add a guardian</button>
              : <p className="meta">Five is the most this rehearsal takes.</p>}
          </fieldset>
          <fieldset className="choice rh-threshold">
            <legend>Approvals needed</legend>
            {names.map((_, k) => k + 1).filter((k) => k >= 2).map((k) => (
              <label key={k}>
                <input type="radio" name="rh-threshold" value={k} checked={threshold === k} onChange={() => setThreshold(k)} />
                {k} of {names.length}
              </label>
            ))}
          </fieldset>
          <p className="meta rh-rule">
            {threshold === names.length
              ? `Every guardian is needed: if one is lost or unwilling, your identity cannot come back.`
              : `Any ${threshold} of them can bring your identity back; ${threshold - 1 === 1 ? 'one alone' : `${threshold - 1} together`} can do nothing.`}
            {' '}The names stay in this page: no circuit ever receives one.
          </p>
          <p className="rh-go">
            <button type="submit" className="primary" aria-disabled={namesOk ? undefined : 'true'}>Use these guardians</button>
          </p>
        </form>
      )),

    enrol: () => <>
      {!s.enrolled && <>
        <p className="rh-go"><button type="button" className="primary" onClick={enrol} aria-disabled={dim}>Enrol and deal the shares</button></p>
        <p className="try-progress" aria-hidden="true">{busy ?? ''}</p>
      </>}
      <Calls records={of('enrol')} w={w} />
      {s.dealt && (
        <div className="rh-done" id="rh-enrol-done">
          <p>
            Each guardian now holds a kit in words, with one share of your secret on it, shown here by the share’s
            fingerprint: the first four of its 32 bytes. Any {w.t} shares rebuild your secret. Open a kit to see its words.
          </p>
          <ul className="rh-dealt">
            {w.names.map((nm, i) => (
              <li key={i} data-guardian={i}>
                <KitFold kit={i} summary={<>
                  <span className="rh-light" aria-hidden="true" />
                  <span className="rh-dealt-name">{nm}<span className="sr-only">’s kit, in words:</span></span>
                  <span className="rh-kit-meta">
                    <span className="meta">share #{i + 1}</span>
                    <code>{w.shareFingerprint(i)}</code>
                    <span className="rh-kit-open" aria-hidden="true">words</span>
                  </span>
                </>}>
                  {() => <KitWords kit={w.kit(i)} id={`rh-kit-${i}`} />}
                </KitFold>
              </li>
            ))}
          </ul>
          <KitFold kit="veto" className="rh-kit rh-kit-veto" summary={<>
            <span className="rh-card-mark" aria-hidden="true" />
            <span className="rh-dealt-name">Your veto card<span className="sr-only">, in words:</span></span>
            <span className="rh-kit-meta">
              <span className="meta">in a drawer</span>
              <span className="rh-kit-open" aria-hidden="true">words</span>
            </span>
          </>}>
            {() => (
              <div className="rh-kit-words">
                <h3 className="rh-kit-label" id="rh-kit-veto-words">Veto words</h3>
                <WordGrid words={w.vetoCard.words} labelledBy="rh-kit-veto-words" />
                <p className="rh-kit-check"><span className="rh-kit-label">Check words</span> <CheckWords words={w.vetoCard.check} /></p>
                <p className="meta">Only this card vetoes a recovery. No guardian holds it.</p>
              </div>
            )}
          </KitFold>
          <p className="meta rh-kits-note">
            Practice kits: they name no network’s contract and protect nothing. Real ones are printed and folded,
            one to a page: <Link to="/kit">make a practice set to print</Link>.
          </p>
        </div>
      )}
    </>,

    lose: () => <>
      <Calls records={of('lose')} w={w} />
      <div className="rh-lose" data-lost={String(s.lost)}>
        {/* The lit lantern, and once the laptop is lost the dark one drawn down over it like a shade. */}
        <span className="rh-picto">
          <Pictogram name="01-seal" className="pictogram rh-pictogram rh-lit" />
          {s.lost && <Pictogram name="03-dark" className="pictogram rh-pictogram rh-unlit" />}
        </span>
        {s.lost
          ? (
            <p className="rh-done" id="rh-lose-done">
              The record still holds your commitment, and nothing on it gives the secret back. As Midnight’s security
              guide puts it, <q>you cannot recover a witness secret from the chain.</q>
            </p>
          )
          : <p className="rh-go"><button type="button" className="primary" onClick={lose} aria-disabled={dim}>Lose the laptop</button></p>}
      </div>
    </>,

    open: () => <>
      {!s.rid && <p className="rh-go"><button type="button" className="primary" onClick={open} aria-disabled={dim}>Open a recovery from the new phone</button></p>}
      <Calls records={of('open')} w={w} />
      {s.rid && (
        <div className="rh-done rh-phone-words" id="rh-open-done">
          <p className="eyebrow">Your new phone’s words</p>
          <FingerprintWords publicKey={s.phonePk} size="lg" label="Your new phone’s words" />
          <p className="meta">
            You read them to each guardian in person, or on a call the guardian places to a number they already had
            for you, in a voice they know: never on a call they receive. If your old phone went too, whoever has it
            can answer that number, so move it to a new SIM first, or meet. Six words are 66 bits: a look-alike phone
            would take about 74 billion billion tries. The short fingerprint, <code>{engine.fingerprint(s.phonePk)}</code>, is 32 bits: about
            4 billion, within reach of one laptop.
          </p>
        </div>
      )}
    </>,

    decide: () => <>
      {(at === 'decide' || s.callerRid) && (
        <section className={`rh-phish ${s.callerRid ? 'placed' : ''}`} aria-labelledby="rh-phish-title">
          <p className="eyebrow">Optional</p>
          <h3 id="rh-phish-title">A phishing call</h3>
          {s.callerRid
            ? (
              <div className="rh-done" id="rh-phish-done">
                <p>
                  He opened a recovery of your identity for his own phone, then rang {list(w.names)}, said he was you,
                  and read out his phone’s words:
                </p>
                <FingerprintWords publicKey={s.callerPk} size="sm" label="The words the caller read out" />
                <Calls records={of('decide').filter((r) => r.guardian === undefined)} w={w} />
              </div>
            )
            : <>
              <p>
                Someone who knows who your guardians are opens a recovery for his own phone, rings each of them, says he is
                you, and reads out his phone’s words. Place the call, then decide, as each guardian, whether to catch it.
              </p>
              <p className="rh-go"><button type="button" onClick={phish} aria-disabled={dim}>Place the phishing call</button></p>
            </>}
        </section>
      )}

      <ol className="rh-guardians">
        {w.names.map((nm, i) => (
          <li key={i} className="rh-guardian" data-guardian={i}>
            <h3>{nm}</h3>
            <p className="meta">share #{i + 1} · <code>{w.shareFingerprint(i)}</code></p>
            {/* The same words in every card, the name left to the card's title: each label then wraps
                alike, and the words under it line up from card to card, whatever the names. */}
            <dl className="rh-heard">
              <div data-heard="phone">
                <dt>Heard from you, when they rang your number</dt>
                <dd><FingerprintWords publicKey={s.phonePk} size="sm" label={`Heard from you, by ${nm}`} /></dd>
              </div>
              {s.callerRid && (
                <div data-heard="caller">
                  <dt>Heard from a caller who rang them</dt>
                  <dd><FingerprintWords publicKey={s.callerPk} size="sm" label={`Heard from the caller, by ${nm}`} /></dd>
                </div>
              )}
            </dl>
            <p className="meta">{nm}’s app shows {requests.length === 1 ? 'one recovery' : `${requests.length} recoveries`} of your identity:</p>
            <ol className="rh-requests">
              {requests.map((q, k) => {
                const ans = s.decisions[`${i}:${q.who}`];
                const label = `Recovery ${k + 1} for ${nm}`;
                return (
                  <li key={q.who} className="rh-request" data-device={q.who} data-answer={ans ?? 'none'}>
                    <p className="rh-request-head">Recovery {k + 1} <code>{short(q.rid)}</code></p>
                    <FingerprintWords publicKey={q.device} size="sm" label={`${label}, its words`} />
                    {ans
                      ? (
                        <div className="rh-answered" id={`rh-answer-${i}-${q.who}`}>
                          <p>
                            <span className={`rh-verdict ${ans}`}>{ans}</span>{' '}
                            {q.who === 'phone' ? 'These are your phone’s words.' : 'These are the caller’s words, not your phone’s.'}{' '}
                            {ans === 'approved'
                              ? `${nm}’s share goes to ${q.who === 'phone' ? 'your new phone' : 'his phone'}, off the ledger.`
                              : ans === 'refused' ? `The share stays with ${nm}.` : 'The contract refused the approval, and the share stays put.'}
                          </p>
                          <Stamp r={recs.find((r) => r.guardian === i && r.tag === q.who)} w={w} />
                        </div>
                      )
                      : at === 'decide' && (
                        <p className="rh-answer">
                          <button type="button" onClick={() => answer(i, q.who, true)} aria-disabled={dim}>
                            Approve<span className="sr-only"> recovery {k + 1}, as {nm}</span>
                          </button>
                          <button type="button" onClick={() => answer(i, q.who, false)} aria-disabled={dim}>
                            Refuse<span className="sr-only"> recovery {k + 1}, as {nm}</span>
                          </button>
                        </p>
                      )}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>

      {at === 'decide'
        ? <>
          <p className="rh-go">
            <button type="button" className="primary" onClick={() => { if (!unanswered) go('window', true); }}
              aria-disabled={unanswered ? 'true' : undefined} aria-describedby="rh-decide-note">Continue to the 72 hours</button>
          </p>
          <p className="meta" id="rh-decide-note">
            {unanswered ? `Answer every request first: ${unanswered} to go.` : 'Every request has an answer.'}
          </p>
        </>
        : (
          <p className="rh-done" id="rh-decide-done">
            Your recovery has {requests.find((q) => q.who === 'phone')?.approvals ?? 0} of the {w.t} approvals it needs, and your phone
            holds {w.sharesAt('phone').length} share{w.sharesAt('phone').length === 1 ? '' : 's'}.
            {s.callerRid && ` The caller’s has ${requests.find((q) => q.who === 'caller')?.approvals ?? 0}, and his phone holds ${w.sharesAt('caller').length} of your shares.`}
          </p>
        )}
    </>,

    window: () => {
      const clock = w.clock();
      const seconds = w.DELAY + w.SLACK + 10;
      return <>
        <h3 className="rh-sub">Recoveries of your identity, as anyone can read them</h3>
        <p className="meta rh-watch-note">
          Anyone can list them, by the identity each names. For an identity on Preprod, <Link to="/live#watch">Watch an
          identity</Link> does it, and can tell you when a new one opens.
        </p>
        <p className="rh-card-check" id="rh-card-check">
          <span className="rh-card-mark" aria-hidden="true" />
          <span>
            To veto, you type your veto card’s 24 words into the new phone. It shows the card’s check
            words, <CheckWords words={w.vetoCard.check} />, the same three printed on the card: every word went in right.
          </span>
        </p>
        <ul className="rh-watch">
          {w.recoveries().sort((a, b) => (a.rid < b.rid ? -1 : 1)).map((r) => {
            const mine = r.who === 'phone';
            return (
              <li key={r.who} id={`rh-rec-${r.who}`} className="rh-rec" data-device={r.who} data-vetoed={String(r.vetoed)}>
                <p className="rh-request-head">Recovery <code>{short(r.rid)}</code>{r.vetoed && <span className="tag">vetoed</span>}</p>
                <FingerprintWords publicKey={r.device} size="sm" label={`Recovery ${short(r.rid)}, its words`} />
                <p className="rh-mine">{mine ? 'Your phone shows the same six words: this one is yours.' : 'Your phone shows other words: you did not start this one.'}</p>
                <p className="meta">{r.approvals} approval{r.approvals === 1 ? '' : 's'}, {r.threshold} needed · can finalize from {clockText(r.opensAt)}</p>
                {!r.vetoed && !s.finalized && (
                  <p className="rh-go">
                    <button type="button" onClick={() => veto(r.who)} aria-disabled={dim}>
                      Veto with your veto card<span className="sr-only">: recovery {short(r.rid)}</span>
                    </button>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <Clock clock={clock} duration={engine.duration} />
        {!s.skipped && (
          <p className="rh-go">
            <button type="button" className={at === 'window' ? 'primary' : undefined} onClick={skip} aria-disabled={dim}>
              Skip {engine.duration(seconds)} (simulated clock)
            </button>
          </p>
        )}
        <Calls records={of('window')} w={w} />
        {s.skipped && (
          <p className="rh-done" id="rh-window-done">
            {s.finalized === 'caller'
              ? 'The caller holds your identity now. Try finalizing your own recovery in step 7, and see what the contract says.'
              : 'The 72 hours are over.'}
          </p>
        )}
        {at === 'window' && (
          <p className="rh-go">
            <button type="button" className={s.skipped ? 'primary' : undefined} onClick={() => go('finalize')}>Continue to finalize</button>
          </p>
        )}
      </>;
    },

    finalize: () => {
      const held = w.sharesAt('phone');
      return <>
        {s.finalized !== 'you' && (
          <form className="rh-finalize" onSubmit={finalize}>
            <p className="rh-holds" data-shares={held.length}>
              <span className={`rh-lights n${Math.min(held.length, 5)}`} aria-hidden="true" />
              {held.length
                ? `Your new phone holds ${held.length} share${held.length === 1 ? '' : 's'}, ${possessive(held.map((i) => w.names[i]))}. Your rule needs ${w.t}.`
                : `Your new phone holds no share. Your rule needs ${w.t}.`}
            </p>
            <fieldset className="choice rh-from">
              <legend>Finalize from</legend>
              <label><input type="radio" name="rh-from" value="phone" checked={from === 'phone'} onChange={() => setFrom('phone')} />your new phone, the one your guardians approved</label>
              <label><input type="radio" name="rh-from" value="other" checked={from === 'other'} onChange={() => setFrom('other')} />a different phone, holding the same shares</label>
            </fieldset>
            <label className="rh-check">
              <input type="checkbox" checked={tamper && held.length > 0} disabled={!held.length} onChange={(e) => setTamper(e.target.checked)} />
              One share arrives with a byte changed on its way
            </label>
            <p className="rh-go"><button type="submit" className="primary" aria-disabled={dim}>Finalize</button></p>
          </form>
        )}
        <Calls records={of('finalize')} w={w} />
        {s.finalized === 'you' && (
          <div className="rh-done rh-back" id="rh-finalize-done">
            <Seal state="lit" size={64} className="seal rh-seal" />
            <p>
              <em>Your identity is back.</em> The old commitment is retired and a successor takes its place, under the same
              root: an app that stores your identity root has nothing to update. Your new phone holds the new secret, and
              you have a new veto card.
            </p>
          </div>
        )}
        {at === 'finalize' && attempts > 0 && (
          <p className="rh-go">
            <button type="button" className={s.finalized ? 'primary' : undefined} onClick={() => go('record')}>See what the public record saw</button>
          </p>
        )}
      </>;
    },

    record: () => <>
      <PublicRecord ledger={w.ledger()} records={recs} w={w} />
      <p className="rh-go rh-again">
        <button type="button" className="primary" onClick={() => restart(true)}>Start again, same guardians</button>
        <button type="button" onClick={() => restart(false)}>Start again, new guardians</button>
      </p>
    </>,
  };

  // Below 1080px the state follows all eight steps: a line under the step you are on says where the
  // shares are and what the record counts, and links down to the whole of it.
  const glance = () => {
    const counts = w.ledger().counts;
    const mine = w.sharesAt('phone').length;
    const his = w.sharesAt('caller').length;
    const shares = (k) => (k ? plural(k, 'share') : 'no shares');
    const held = s.phonePk
      ? `Your new phone holds ${shares(mine)}${s.callerRid ? `; the caller’s phone, ${shares(his)}` : ''}.`
      : `Your ${w.n} guardians hold one share each${s.lost ? '; the laptop is gone' : ''}.`;
    return `${held} On the record: ${plural(counts.recoveries, 'recovery', 'recoveries')} opened, ${plural(counts.approvals, 'approval')}, ${plural(counts.killed, 'veto', 'vetoes')}, ${plural(counts.retired, 'retired commitment')}.`;
  };

  return (
    <div className="rh" data-at={at} data-finalized={s?.finalized ?? 'none'}>
      <Rail at={at} late={late === at} />
      <div className="rh-grid">
        <div className="rh-main" key={run}>
          {STEPS.slice(0, reached + 1).map((st, i) => (
            <section key={st.key} className={`rh-step ${st.key === at ? 'current' : 'done'}${st.key === late ? ' late' : ''}`} id={`rh-${st.key}`}
              data-step={st.key} aria-labelledby={`rh-${st.key}-title`}>
              <header className="rh-step-head">
                <p className="eyebrow">Step {i + 1} of {STEPS.length}</p>
                <h2 id={`rh-${st.key}-title`} tabIndex={-1}>{st.title}</h2>
                <p className="caption">{st.caption}</p>
              </header>
              {body[st.key]()}
            </section>
          ))}
          {w && s.dealt && !wide && (
            <p className="rh-glance" data-glance="">
              <span>{glance()}</span>{' '}
              <a href="#rh-state">The public record and what each device holds</a>
            </p>
          )}
          {error && <p className="meta warn" role="alert">{error}</p>}
          {w && at !== 'record' && (
            <p className="rh-restart meta">
              <button type="button" className="linkish" onClick={() => restart(true)}>Start again with new secrets</button>
              {' · '}
              <button type="button" className="linkish" onClick={() => restart(false)}>choose other guardians</button>
            </p>
          )}
        </div>
        {/* It scrolls on its own only beside the steps, from 1080px: only there is it a tab stop. Beside
            step 8, whose record opens on the same counts, it keeps to what each device holds. */}
        <aside className="rh-side" id="rh-state" tabIndex={wide ? 0 : undefined}
          aria-label={beside ? 'What each device holds' : 'The public record and what each device holds'}>
          {!beside && <Counts counts={w ? w.ledger().counts : EMPTY} />}
          {w
            ? <Holdings people={w.holdings()} />
            : <section className="panel people rh-people" aria-label="What each device holds"><h2>What each device holds</h2><p className="meta">Nothing yet: choose your guardians.</p></section>}
        </aside>
      </div>
      <p className="sr-only" role="status">{said}</p>
    </div>
  );
}
