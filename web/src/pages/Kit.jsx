// /kit, "Recovery kits": what an owner prints so that people with no crypto of their own can hold a part
// of a Lantern identity. The page makes a fresh identity with Web Crypto, deals its secret to 2 to 7
// guardians, and lays out a veto card and one kit per guardian, in words (src/kit.js), to print one to a
// page. Then a dry run: type the veto card back in and check it against the veto commitment.
//
// Honest about what it is: practice kits, for no enrolled identity. Nothing leaves the page: the
// contract's pure circuits load as it opens (kit/engine.js), and after that it asks for nothing.
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '../lib/router.jsx';
import FingerprintWords from '../components/FingerprintWords.jsx';
import { VetoSheet, GuardianSheet } from '../kit/Sheets.jsx';
import { BackupCheck } from '../kit/BackupCheck.jsx';
import { GUARDIAN_SCRIPT } from '../kit/copy.js';
import '../styles/kit.css';

const COUNTS = [2, 3, 4, 5, 6, 7];

export default function Kit() {
  const [engine, setEngine] = useState(null);
  const [n, setN] = useState(3);
  const [t, setT] = useState(2);
  const [made, setMade] = useState(null);
  const [tab, setTab] = useState('veto');
  const [covered, setCovered] = useState(false);
  const [printing, setPrinting] = useState(null);
  const [devices, setDevices] = useState(null);
  const sheetsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    import('../kit/engine.js').then((e) => {
      if (cancelled) return;
      setEngine(e);
      setDevices([e.sampleDeviceKey(), e.sampleDeviceKey()]);
    });
    return () => { cancelled = true; };
  }, []);

  // Print one sheet, or all: the page says which, the print styles show only that, and the end of printing
  // puts it back. The end is heard twice, since a browser that skips afterprint (iOS Safari may) would
  // otherwise leave one sheet chosen, and a later print from its own menu would print only that one: once
  // as afterprint, once as the print media query turning false.
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(null);
    const media = window.matchMedia?.('print');
    const ended = (e) => { if (!e.matches) done(); };
    window.addEventListener('afterprint', done);
    media?.addEventListener?.('change', ended);
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
      media?.removeEventListener?.('change', ended);
    };
  }, [printing]);

  const chooseN = (v) => { setN(v); if (t > v) setT(v); };
  const make = () => {
    setMade({ ...engine.makeKits({ guardians: n, threshold: t }), n, t });
    setTab('veto');
    setCovered(false);
    // The kits appear below the button; take the reader to them.
    requestAnimationFrame(() => sheetsRef.current?.focus({ preventScroll: false }));
  };
  const stale = made && (made.n !== n || made.t !== t);

  return (
    <section className="page narrow kit-page" data-ready={String(Boolean(engine))} data-print={printing?.target}>
      <header className="page-head">
        <p className="eyebrow">Words on paper</p>
        <h1>Recovery kits</h1>
        <p className="lede">A veto card and guardian kits, in words you can write down.</p>
      </header>

      <aside className="honesty" aria-label="What this page is">
        <p>
          <strong>Made in your browser.</strong> Every secret here comes from your browser’s own random numbers
          (Web Crypto) and stays on this page: nothing is sent or stored, and it is gone when you close the tab.
          Once it has loaded, the page makes no network requests.
        </p>
        <p className="meta">
          These are practice kits, for trying the format. A kit protects an identity only once that identity is
          enrolled on a Lantern contract and its guardians are added there. This page does neither.
        </p>
      </aside>

      <section className="kit-step" aria-labelledby="kit-choose">
        <h2 className="kit-step-h" id="kit-choose"><span className="kit-step-n" aria-hidden="true">1</span>Choose your guardians</h2>
        <p className="kit-prose">
          Your identity secret is split into shares, one per guardian, so that enough of them together can bring
          it back to a new device and fewer learn nothing at all. A guardian needs no crypto to keep their part:
          it is a sheet of paper. On the day, a Lantern app reads it, shows the six words and makes the approval.
        </p>
        <p className="meta kit-note">
          That app is not built yet. <Link to="/rehearse">Rehearse a recovery</Link> walks through the flow.
        </p>
        <div className="kit-choices">
          <Choice legend="Guardians" name="kit-n" values={COUNTS} value={n} onChange={chooseN} />
          <Choice legend="Needed to recover" name="kit-t" values={COUNTS.filter((v) => v <= n)} value={t} onChange={setT} />
        </div>
        <p className="kit-sentence" data-testid="kit-sentence">
          Any <b>{t}</b> of your <b>{n}</b> guardians can recover your identity.
          {t > 1 && <> {t - 1 === 1 ? 'One alone learns' : `${t - 1} together learn`} nothing about it.</>}
        </p>
        <div className="kit-row">
          {engine
            ? <button type="button" className="primary" onClick={make}>{made ? (stale ? `Make new kits for ${t} of ${n}` : 'Make new kits') : 'Make the kits'}</button>
            : <p className="loading">Loading the contract…</p>}
          {made && !stale && <p className="meta kit-made">New secrets each time. The old kits are gone.</p>}
        </div>
      </section>

      {made && (
        <section className="kit-step kit-sheets" aria-labelledby="kit-print" ref={sheetsRef} tabIndex={-1} data-stale={stale ? 'true' : undefined}>
          <h2 className="kit-step-h" id="kit-print"><span className="kit-step-n" aria-hidden="true">2</span>Print them</h2>
          <p className="kit-prose">
            A veto card for you, and a kit for each guardian. Each prints on a page of its own. Fold it in half,
            edge to edge, printed side in, write whose it is on the blank outside, and give it by hand.
          </p>
          <p className="meta kit-note">
            After a recovery, make new kits and a new veto card: the old ones stop working. After you replace
            your guardians, make new kits for all of them.
          </p>
          {stale && (
            <p className="kit-stale" data-testid="kit-stale">
              These kits are for {made.t} of {made.n}; make new ones to match.
            </p>
          )}
          <Deck made={made} tab={tab} setTab={setTab} covered={covered} onPrint={(target) => setPrinting({ target })} />
        </section>
      )}

      {made && (
        <section className="kit-step" aria-labelledby="kit-check">
          <h2 className="kit-step-h" id="kit-check"><span className="kit-step-n" aria-hidden="true">3</span>Check your backup</h2>
          <p className="kit-prose">
            Type your veto card back in from the paper, before you need it. A card with a slip in it fails the day it
            matters; this finds the slip now.
          </p>
          <BackupCheck key={made.vetoCommit} card={made.vetoCard} vetoCommit={made.vetoCommit} check={engine.checkVetoWords} onCover={setCovered} />
        </section>
      )}

      <section className="kit-step" aria-labelledby="kit-day">
        <h2 className="kit-step-h" id="kit-day">On the day</h2>
        <p className="kit-prose">
          Your laptop is gone, and your identity secret with it. A new phone opens a recovery for its own key and
          shows six words for that key; each guardian’s app shows six words for the recovery they are asked to
          approve. Ask each guardian to call you back on the number they already have for you, or to meet you,
          and read yours out when they do. They approve only if they know your voice and all six words match,
          in order.
        </p>
        <p className="kit-prose" data-testid="kit-sim">
          If your old phone went too, whoever has it can answer a call to your number. Have the number moved to
          a new SIM first, which cuts the old one off, or meet your guardians instead.
        </p>
        <blockquote className="kit-quote kit-quote-page"><p>{GUARDIAN_SCRIPT}</p></blockquote>
        {devices && (
          <div className="kit-devices">
            <figure className="kit-device">
              <figcaption className="kit-field-label">Your new phone’s six words</figcaption>
              <FingerprintWords publicKey={devices[0]} label="Your new phone’s fingerprint" />
            </figure>
            <figure className="kit-device">
              <figcaption className="kit-field-label">Someone else’s phone, opening a recovery of yours</figcaption>
              <FingerprintWords publicKey={devices[1]} label="Someone else’s phone’s fingerprint" />
              <p className="meta kit-device-note">Not the words you read out: a guardian refuses this one.</p>
            </figure>
          </div>
        )}
        <p className="meta">
          Six words are 66 bits. To make a phone whose words match yours, someone would have to try about
          74 billion billion keys. The eight-character fingerprint <Link to="/demo">the demo</Link> shows beside
          them is 32 bits: about 4 billion tries, within reach of one laptop.
        </p>
      </section>
    </section>
  );
}

function Choice({ legend, name, values, value, onChange }) {
  return (
    <fieldset className="kit-choice">
      <legend className="kit-field-label">{legend}</legend>
      <div className="kit-pills">
        {values.map((v) => (
          <label key={v} className="kit-pill">
            <input type="radio" name={name} value={v} checked={v === value} onChange={() => onChange(v)} />
            <span>{v}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The sheets, one at a time on screen behind tabs, all of them in print. The tabs stay on one line and
// scroll sideways when they outrun it (seven guardians on a phone), so the underline under the chosen
// sheet always sits on the tablist's own rule. The chosen tab is kept in view, a peek clear of the edge,
// and an edge with more tabs beyond it fades out (data-more), so a hidden tab is never a surprise.
function Deck({ made, tab, setTab, covered, onPrint }) {
  const id = useId();
  const tabs = [['veto', 'Veto card'], ...made.kits.map((k) => [`kit-${k.share}`, `Guardian ${k.share}`])];
  const refs = useRef({});
  const listRef = useRef(null);
  useEffect(() => {
    const list = listRef.current;
    const el = refs.current[tab];
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    // Sideways only, by the least that shows the whole tab and a peek of its neighbour, clear of the
    // edge's fade: never a vertical jump, and no smooth scroll to disturb a reader who asked for less
    // motion. The arrow keys focus a tab without scrolling (preventScroll), so this is the one scroll
    // in every browser.
    const l = list.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const peek = 32;
    if (r.left < l.left + peek) list.scrollLeft -= l.left + peek - r.left;
    else if (r.right > l.right - peek) list.scrollLeft += r.right - (l.right - peek);
  }, [tab]);
  // Which edges have more tabs beyond them: "start", "end" or "both", for the fade (styles/kit.css).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const mark = () => {
      const max = list.scrollWidth - list.clientWidth;
      const start = max > 1 && list.scrollLeft > 1;
      const end = max > 1 && list.scrollLeft < max - 1;
      const more = start && end ? 'both' : start ? 'start' : end ? 'end' : null;
      if (more) list.dataset.more = more;
      else delete list.dataset.more;
    };
    mark();
    list.addEventListener('scroll', mark, { passive: true });
    const seen = typeof ResizeObserver === 'function' ? new ResizeObserver(mark) : null;
    seen?.observe(list);
    return () => {
      list.removeEventListener('scroll', mark);
      seen?.disconnect();
    };
  }, [tabs.length]);
  const keys = (e, i) => {
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const [next] = tabs[(to + tabs.length) % tabs.length];
    setTab(next);
    refs.current[next]?.focus({ preventScroll: true });
  };
  const current = tabs.find(([k]) => k === tab)?.[1] ?? 'Veto card';
  return (
    <div className="kit-deck">
      <div className="kit-tabs" role="tablist" aria-label="Sheets" ref={listRef}>
        {tabs.map(([k, label], i) => (
          <button key={k} type="button" role="tab" id={`${id}-tab-${k}`} aria-controls={`${id}-panel-${k}`}
            aria-selected={tab === k} tabIndex={tab === k ? 0 : -1} className="kit-tab"
            ref={(el) => { refs.current[k] = el; }} onClick={() => setTab(k)} onKeyDown={(e) => keys(e, i)}>
            {label}
          </button>
        ))}
      </div>
      <div className="kit-row kit-print-row">
        <button type="button" onClick={() => onPrint(tab)}>Print this sheet<span className="sr-only">: {current}</span></button>
        <button type="button" onClick={() => onPrint('all')}>Print all {tabs.length}</button>
      </div>
      {tabs.map(([k]) => (
        <div key={k} role="tabpanel" id={`${id}-panel-${k}`} aria-labelledby={`${id}-tab-${k}`} hidden={tab !== k}
          className="kit-panel" data-panel={k}>
          {k === 'veto'
            ? <VetoSheet card={made.vetoCard} covered={covered} id={`${id}-veto`} />
            : <GuardianSheet kit={made.kits.find((x) => `kit-${x.share}` === k)} id={`${id}-${k}`} />}
        </div>
      ))}
    </div>
  );
}
