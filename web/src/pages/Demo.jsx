import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { FIELD_LABEL, LEDGER_LABEL, hex, short, toHex, clockText } from '../lib/format.js';
import { Honesty } from '../components/Honesty.jsx';
import { BreakIt } from '../components/BreakIt.jsx';
import { TargetTable } from '../components/TargetTable.jsx';
// The committed record of the same story on a local chain, read at build time. Each step
// the chain run also took gets a chip saying so -- this page itself makes no proofs.
import record from '../../../deployments/local-devnet.json' with { type: 'json' };

const RECORDED = Object.fromEntries(record.steps.filter((s) => s.kind === 'call').map((s) => [s.id, s]));
const RECORDED_ON = record.recordedAt.slice(0, 10);

export default function Demo() {
  const [engine, setEngine] = useState(null);
  const [session, setSession] = useState(null);
  const [records, setRecords] = useState([]);
  const [busy, setBusy] = useState(false);
  const [enumeration, setEnumeration] = useState(null);
  const [review, setReview] = useState(null);
  const [playing, setPlaying] = useState(false);
  const railRef = useRef(null);
  const controlsRef = useRef(null);
  const inPanel = useRef(false);  // whether the visitor last clicked, tapped or moved focus inside "Try to break it"
  const deepLinked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    import('../lib/engine.js').then((e) => {
      if (cancelled) return;
      setEngine(e);
      setSession(e.newSession());
    });
    return () => { cancelled = true; };
  }, []);

  // Run steps until `stop(nextStep)` says so. One state update per batch.
  const run = useCallback(async (stop) => {
    if (!session || busy || session.runner.done) return;
    setBusy(true);
    const batch = [];
    try {
      do {
        const rec = await session.runner.next();
        batch.push(rec);
        if (rec.id === '5.1') setEnumeration(engine.runEnumeration());
      } while (!session.runner.done && !stop(session.runner.peek(), batch));
    } finally {
      setRecords((r) => [...r, ...batch]);
      setReview(null);
      setBusy(false);
    }
  }, [session, busy, engine]);

  const next = () => run(() => true);
  const playBeat = () => run((step, batch) => step.beat !== batch[0].beat);
  const playAll = () => { setPlaying(false); run(() => false); };
  const restart = () => {
    setPlaying(false);
    setSession(engine.newSession());
    setRecords([]);
    setEnumeration(null);
    setReview(null);
  };

  // Deep link: /demo?beat=7 runs the story up to and including the first step of beat 7.
  useEffect(() => {
    if (!session || deepLinked.current) return;
    deepLinked.current = true;
    const beat = Number(new URLSearchParams(window.location.search).get('beat'));
    if (beat > 0 && beat <= 10) run((step, batch) => batch.at(-1).beat >= beat);
    if (new URLSearchParams(window.location.search).get('autoplay') === '1') setPlaying(true);
    // The panel renders only once the contract has loaded, too late for the browser's own jump.
    if (window.location.hash === '#break') document.getElementById('break')?.scrollIntoView();
  }, [session, run]);

  // Autoplay: one step at a time, at reading pace, until the end or until paused.
  useEffect(() => {
    if (!playing || busy || !session) return undefined;
    if (session.runner.done) { setPlaying(false); return undefined; }
    const t = setTimeout(() => run(() => true), 1400);
    return () => clearTimeout(t);
  }, [playing, busy, session, records.length, run]);

  // Keep the current beat in view on narrow screens, where the rail scrolls sideways.
  useEffect(() => {
    railRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [records.length, review]);

  useEffect(() => {
    const inView = (el) => {
      const r = el?.getBoundingClientRect();
      return Boolean(r) && r.bottom > 0 && r.top < window.innerHeight;
    };
    const onTouch = (e) => { inPanel.current = Boolean(e.target.closest?.('.breakit')); };
    const onKey = (e) => {
      if (e.key !== 'ArrowRight' || e.metaKey || e.ctrlKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      // Not from inside "Try to break it", nor after a click on its text, which leaves focus on the
      // page itself: a key meant for the panel must never move the story on unseen.
      if (e.target.closest?.('.breakit') || inPanel.current) return;
      // Nor while the panel is on screen and the story's controls are not, which would put the step
      // out of sight. Controls that are only further down, below the steps being read, do not stop it.
      if (inView(document.getElementById('break')) && !inView(controlsRef.current)) return;
      next();
    };
    window.addEventListener('pointerdown', onTouch, true);
    window.addEventListener('focusin', onTouch, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onTouch, true);
      window.removeEventListener('focusin', onTouch, true);
      window.removeEventListener('keydown', onKey);
    };
  });

  if (!session) {
    return (
      <section className="page">
        <Honesty />
        <p className="loading" role="status">Loading the compiled contract into your browser…</p>
      </section>
    );
  }

  const { BEATS } = engine;
  const nextStep = session.runner.done ? null : session.runner.peek();
  const current = records.length ? records.at(-1).beat : 0;
  const shown = review ?? current;
  const beat = BEATS[shown];
  const shownRecords = records.filter((r) => r.beat === shown);
  const beatDone = (n) => records.some((r) => r.beat > n) || (session.runner.done && records.some((r) => r.beat === n));
  const done = session.runner.done;

  return (
    <section className="page demo" data-ready="true">
      <Honesty />

      <nav className="beats" aria-label="Beats of the story" ref={railRef}>
        <ol>
          {BEATS.map((b) => {
            const state = shown === b.n ? 'current' : beatDone(b.n) ? 'done' : 'todo';
            const reachable = state !== 'todo' || b.n === current;
            return (
              <li key={b.n}>
                <button type="button" className={`beat ${state}`} disabled={!reachable}
                  aria-current={shown === b.n ? 'step' : undefined}
                  onClick={() => setReview(b.n === current ? null : b.n)}>
                  <span className="num">{b.n === 10 ? '✦' : b.n}</span>
                  <span className="title">{b.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="demo-grid">
        <div className="story-col">
          <header className="beat-head">
            <p className="eyebrow">{shown === 10 ? 'Epilogue' : `Beat ${shown} of 9`}</p>
            <h1>{beat.title}</h1>
            <p className="caption">{beat.caption}</p>
          </header>

          <ol className="steps" aria-live="polite">
            {shownRecords.map((r) => (
              <Step key={r.id} r={r} enumeration={r.id === '5.1' ? enumeration : null} />
            ))}
          </ol>

          {!review && nextStep && (
            <div className="upcoming">
              <p className="eyebrow">{nextStep.beat === shown ? 'Next' : `Next · ${nextStep.beat === 10 ? 'Epilogue' : `Beat ${nextStep.beat}`}: ${BEATS[nextStep.beat].title}`}</p>
              <p>{nextStep.say}</p>
            </div>
          )}
          {review !== null && (
            <p className="upcoming"><button type="button" className="linkish" onClick={() => setReview(null)}>Back to where the story is</button></p>
          )}

          {done && <Summary records={records} />}

          <div className="controls" ref={controlsRef}>
            <button type="button" className="primary" onClick={() => { setPlaying(false); next(); }} disabled={busy || done}>
              {nextStep?.kind === 'clock' ? `Skip ${engine.duration(nextStep.seconds)} (simulated clock)` : 'Next step'}
            </button>
            <button type="button" onClick={() => setPlaying((p) => !p)} disabled={done} aria-pressed={playing}>
              {playing ? 'Pause' : 'Autoplay'}
            </button>
            <button type="button" onClick={playBeat} disabled={busy || done}>Play this beat</button>
            <button type="button" onClick={playAll} disabled={busy || done}>Run to the end</button>
            <button type="button" onClick={restart} disabled={busy}>Start again, new secrets</button>
          </div>
          <p className="hint">
            Tip: the → key takes the next step. Link straight to a beat with <code>/demo?beat=7</code>.
            Or skip the script: <a href="#break">try to break it</a>.
          </p>
        </div>

        <aside className="side-col" aria-label="State" tabIndex={0}>
          <Clock now={session.x.now} start={session.startedAt} duration={engine.duration} />
          <Absent records={records} />
          <Ledger x={session.x} publicRecord={engine.publicRecord} />
          <HostPanel x={session.x} />
          <People personas={session.story.personas} records={records} />
        </aside>
      </div>

      <BreakIt engine={engine} />
    </section>
  );
}

function Step({ r, enumeration }) {
  const scanFields = r.scan?.fields ?? [];
  return (
    <li className={`step ${r.kind} ${r.outcome ?? ''} ${r.ok ? '' : 'unexpected'}`} data-step={r.id}
      data-outcome={r.outcome ?? r.kind} data-ok={String(r.ok)}>
      <p className="who">{r.actor}</p>
      <p className="say">{r.say}</p>
      {r.kind === 'call' && (
        <div className="result">
          <code className="circuit">{r.circuit}</code>
          {r.outcome === 'accepted'
            ? <span className="chip ok">accepted</span>
            : <span className="chip no">refused: “{r.message}”</span>}
        </div>
      )}
      {r.kind !== 'call' && (
        <div className="result">
          <span className={`chip ${r.kind === 'clock' ? 'clock' : 'off'}`}>{r.kind === 'clock' ? 'simulated clock' : 'off the ledger'}</span>
          {r.detail && <span className="detail">{r.detail}</span>}
        </div>
      )}
      {r.publicChange && Object.keys(r.publicChange).length > 0 && (
        <p className="meta">Public record: {Object.entries(r.publicChange).map(([k, v]) => `${LEDGER_LABEL[k] ?? k} ${v > 0 ? '+' : ''}${v}`).join(' · ')}</p>
      )}
      {r.outcome === 'accepted' && (
        <p className="meta">{scanFields.length
          ? <>Absent from the public record: {scanFields.map((f) => FIELD_LABEL[f] ?? f).join(', ')}</>
          : 'Reads no secret.'}</p>
      )}
      {r.scan && !r.scan.clean && (
        <p className="meta warn">
          {scanFields.filter((f) => r.scan.report[f].public).map((f) => `LEAK: ${FIELD_LABEL[f] ?? f}. `)}
          {scanFields.filter((f) => !r.scan.report[f].private).map((f) => `The scan could not see ${FIELD_LABEL[f] ?? f}, so its absence proves nothing. `)}
        </p>
      )}
      {!r.ok && <p className="meta warn">Unexpected: the story expected {r.expect}.</p>}
      <Recorded r={r} />
      {enumeration && (
        <div className="inline-attack">
          <p className="meta">The same attacker, against the four guardian designs of <Link to="/attacks">Attack it</Link>:</p>
          <TargetTable enumeration={enumeration} compact />
        </div>
      )}
    </li>
  );
}

// Where the committed chain run took this same step. A different run with different secrets,
// so it shows the block and timing there, never values from this page.
function Recorded({ r }) {
  const rec = RECORDED[r.id];
  if (!rec || r.kind !== 'call') return null;
  const where = `recorded ${RECORDED_ON} on a local chain`;
  const text = rec.outcome === 'accepted'
    ? `${where}: block ${rec.tx.blockHeight} · proved in ${rec.timings.prove} s${rec.sponsorship ? ' · fee paid by a sponsor' : ''}`
    : `${where}: refused the same way, before any transaction`;
  return <p className="recorded-chip" data-recorded={rec.outcome}>{text}</p>;
}

function Summary({ records }) {
  const calls = records.filter((r) => r.kind === 'call');
  const bad = records.filter((r) => !r.ok || (r.scan && !r.scan.clean));
  return (
    <div className={`summary ${bad.length ? 'bad' : 'good'}`} data-testid="summary" role="status">
      <p><strong>{records.length} steps</strong> · {calls.filter((r) => r.outcome === 'accepted').length} accepted · {calls.filter((r) => r.outcome === 'refused').length} refused, each by the circuit's own assert.</p>
      <p>{bad.length ? `${bad.length} step(s) did not go as the story expects.` : 'Every step went exactly as expected.'}</p>
      <p className="meta">The same script, with real proofs and real transactions on a local chain: <code>npm run devnet</code>.</p>
      <p>Now choose the attack yourself: <a href="#break">Try to break it</a>.</p>
    </div>
  );
}

function Clock({ now, start, duration }) {
  const elapsed = now - start;
  return (
    <section className="panel clock" aria-label="Simulated clock">
      <h2>Simulated clock</h2>
      <p className="time" data-now={now}>{clockText(now)}</p>
      <p className="meta">{elapsed > 0 ? `${duration(elapsed)} after the story began` : 'Not advanced yet: it moves only when the story waits out the timelock'}. The in-memory ledger's block time: the timelock checks it exactly as a node would.</p>
    </section>
  );
}

function Absent({ records }) {
  const agg = {};
  for (const r of records) {
    for (const f of r.scan?.fields ?? []) {
      const a = (agg[f] ??= { reads: 0, seen: 0, leaked: 0 });
      a.reads++;
      if (r.scan.report[f].private) a.seen++;
      if (r.scan.report[f].public) a.leaked++;
    }
  }
  return (
    <section className="panel absent" aria-label="Absent from the public record">
      <h2>Absent from the public record</h2>
      <p className="meta">Each circuit call is scanned for every secret it read. A tick needs both halves: the scan found the value in the call's private transcript — so it could see it — and not in the public one.</p>
      <ul>
        {Object.entries(FIELD_LABEL).map(([f, label]) => {
          const a = agg[f];
          const ticked = a && a.seen === a.reads && a.leaked === 0;
          return (
            <li key={f} className={ticked ? 'ticked' : a ? 'bad' : 'pending'} data-field={f} data-ticked={String(Boolean(ticked))}>
              <span className="box" aria-hidden="true">{ticked ? '✓' : a ? '!' : ''}</span>
              <span className="label">{label}</span>
              <span className="count">{a ? `${a.reads} call${a.reads === 1 ? '' : 's'}` : 'not read yet'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Ledger({ x, publicRecord }) {
  const L = x.ledger();
  const counts = publicRecord(L);
  const ids = [...L.enrolled].map((c) => ({ h: hex(c), retired: L.retiredIdentities.member(c) }));
  const recs = [...L.recoveries].map(([rid, rec]) => ({
    h: hex(rid), approvals: L.approvals.lookup(rid).read(), threshold: L.thresholds.lookup(rec.idCommit),
    vetoed: L.killed.member(rid), device: hex(rec.ephemeralPk),
  }));
  return (
    <section className="panel ledger" aria-label="The public ledger">
      <h2>The public ledger</h2>
      <p className="meta">Everything below is readable by anyone. Nothing else is.</p>
      <dl className="counts">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} data-count={k}><dt>{LEDGER_LABEL[k]}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <h3>Identity commitments</h3>
      <ul className="values">
        {ids.map((c) => (
          <li key={c.h} data-full={c.h} data-retired={String(c.retired)}>
            <code>{short(c.h)}</code>{c.retired && <span className="tag">retired</span>}
          </li>
        ))}
      </ul>
      {recs.length > 0 && <>
        <h3>Recoveries</h3>
        <ul className="values">
          {recs.map((r) => (
            <li key={r.h} data-full={r.h} data-approvals={String(r.approvals)} data-vetoed={String(r.vetoed)}>
              <code>{short(r.h)}</code>
              <span className="tag">{`${r.approvals} of ${r.threshold}`}</span>
              {r.vetoed && <span className="tag no">vetoed</span>}
            </li>
          ))}
        </ul>
      </>}
    </section>
  );
}

function HostPanel({ x }) {
  const H = x.hostLedger();
  const epochs = [...H.attestedRoots].map(([e, root]) => ({ e: Number(e), root: root.toString(16) }));
  return (
    <section className="panel host" aria-label="The independent DApp">
      <h2>The independent DApp</h2>
      <p className="meta">Deployed separately: it cannot read Lantern. It trusts a two-of-three committee that
        rebuilds the list of current owners from Lantern’s public ledger and signs its root, each signature
        checked inside the circuit.</p>
      <dl className="counts">
        <div data-count="sealedEpochs"><dt>sealed epochs</dt><dd>{Number(H.latestEpoch)}</dd></div>
        <div data-count="committeeGen"><dt>committee generation</dt><dd>{Number(H.committeeGen)}</dd></div>
        <div data-count="hostActions"><dt>DApp actions</dt><dd>{Number(H.gateActions)}</dd></div>
      </dl>
      {epochs.length > 0 && (
        <ul className="values">
          {epochs.map((ep) => (
            <li key={ep.e} data-epoch={ep.e} data-full={ep.root}>
              <span className="tag">epoch {ep.e}</span><code>{short(ep.root)}</code>
              {ep.e === epochs.length - 1 && <span className="tag">latest</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PEOPLE = [
  ['laptop', 'Hana’s old laptop'], ['card', 'Hana’s veto card'], ['phone', 'Hana’s new phone'],
  ['seoyeon', 'Seo-yeon'], ['mum', 'Mum'], ['jihoon', 'Jihoon'], ['minji', 'Minji'], ['sponsor', 'The fee sponsor'],
];

function holdings(ps) {
  if (!ps) return [];
  const out = [];
  for (const [f, label] of Object.entries(FIELD_LABEL)) {
    if (ps[f] !== undefined && ps[f] !== null) out.push({ label, fp: toHex(ps[f]).slice(0, 8) });
  }
  if (ps.share) out.push({ label: `share #${ps.share.x}`, fp: ps.share.y.toString(16).padStart(64, '0').slice(0, 8) });
  if (ps.shares?.length) out.push({ label: `${ps.shares.length} shares`, fp: null });
  return out;
}

function People({ personas, records }) {
  const ran = new Set(records.map((r) => r.id));
  return (
    <section className="panel people" aria-label="What each device holds">
      <h2>What each device holds</h2>
      <p className="meta">Private state: none of it reaches the chain. Shares move between devices off chain, and no circuit reads them. Fingerprints are the first four bytes.</p>
      <ul className="persons">
        {PEOPLE.map(([k, name]) => {
          const ps = k === 'jihoon' && personas.rogue ? personas.rogue : personas[k];
          const status = k === 'laptop' && ran.has('2.1') ? 'destroyed'
            : k === 'jihoon' && personas.rogue ? 'holds Hana’s stolen secret' : null;
          const items = holdings(ps);
          return (
            <li key={k} className={`person ${status === 'destroyed' ? 'gone' : ''} ${k === 'jihoon' && personas.rogue ? 'turned' : ''}`} data-persona={k}>
              <p className="name">{name}{status && <span className="tag">{status}</span>}</p>
              {items.length
                ? <ul className="holds">{items.map((h) => <li key={h.label}><span>{h.label}</span>{h.fp && <code>{h.fp}</code>}</li>)}</ul>
                : <p className="meta">nothing</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
