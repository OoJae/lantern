// The pieces of "Rehearse a recovery" that only draw: the step rail, the stamped calls, the simulated
// clock, the public counts, what each device holds and the whole public record. They are drawn in
// /demo's language (the same step, chip, clock and panel classes), so a stamp, the clock's roll and
// the lock look and move here exactly as they do there.
import { useEffect, useRef, useState } from 'react';
import FingerprintWords from '../components/FingerprintWords.jsx';
import { FIELD_LABEL, LEDGER_LABEL, clockText, short } from '../lib/format.js';
import { STEPS, stepIndex, why, NEVER_ON_IT } from './copy.js';

/** The eight steps as a string of lights: done, the one you are on, and those still ahead. */
export function Rail({ at, shown, late = false }) {
  const reached = stepIndex(at);
  return (
    <nav className="rh-rail" aria-label="Steps of the rehearsal">
      <ol>
        {STEPS.map((s, i) => {
          const state = i < reached ? 'done' : i === reached ? 'current' : 'todo';
          const body = <>
            <span className="rh-num" aria-hidden="true">{i + 1}</span>
            <span className="rh-label"><span className="sr-only">Step {i + 1}: </span>{s.short}</span>
          </>;
          return (
            <li key={s.key} className={`${state}${late && state === 'current' ? ' late' : ''}`} data-step={s.key}>
              {/* The cord to the next disc: an element of its own, beside the label and never behind it. */}
              {i < STEPS.length - 1 && <span className="rh-cord" aria-hidden="true" />}
              {i <= reached
                ? <a href={`#rh-${s.key}`} aria-current={s.key === (shown ?? at) ? 'step' : undefined}>{body}</a>
                : <span className="rh-todo">{body}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}


const change = (c) => Object.entries(c).map(([k, v]) => `${LEDGER_LABEL[k] ?? k} ${v > 0 ? '+' : ''}${v}`).join(' · ');

/**
 * The calls and off-ledger events of one step, each stamped in as it arrives: a batch of up to six
 * 40ms apart, none apart in a batch of more than eight, as on /demo.
 */
export function Calls({ records, w }) {
  const seen = useRef(new Set());
  const arriving = records.filter((r) => !seen.current.has(r.seq)).map((r) => r.seq);
  useEffect(() => { for (const r of records) seen.current.add(r.seq); });
  if (!records.length) return null;
  const lag = (seq) => {
    const i = arriving.indexOf(seq);
    return i > 0 && arriving.length <= 8 ? `lag-${Math.min(i, 5)}` : '';
  };
  return (
    <ol className="steps rh-calls">
      {records.map((r) => <Call key={r.seq} r={r} w={w} lag={lag(r.seq)} />)}
    </ol>
  );
}

function Call({ r, w, lag = '', inline = false }) {
  // The one outcome drawn inverted: the caller took your identity. The contract did right by its
  // rules; the rehearsal went against you.
  const against = r.tag === 'caller' && r.circuit === 'finalizeRecovery' && r.outcome === 'accepted';
  const fields = r.scan?.fields ?? [];
  const note = why(r, w);
  const Tag = inline ? 'div' : 'li';
  return (
    <Tag className={`step ${r.kind} ${r.outcome ?? ''} ${against ? 'unexpected' : ''} ${inline ? 'rh-inline' : ''} ${lag}`}
      id={`rh-call-${r.seq}`} data-seq={r.seq}
      data-outcome={r.outcome ?? r.kind} data-circuit={r.circuit} data-tag={r.tag} data-message={r.message ?? ''}
      data-against={against ? 'true' : undefined}>
      {!inline && <p className="who">{r.actor}</p>}
      {!inline && <p className="say">{r.say}</p>}
      {r.kind === 'call'
        ? (
          <div className="result">
            <code className="circuit">{r.circuit}</code>
            {r.outcome === 'accepted'
              ? <span className="chip ok">accepted</span>
              : <span className="chip no">refused: “{r.message}”</span>}
          </div>
        )
        : (
          <div className="result">
            <span className={`chip ${r.kind === 'clock' ? 'clock' : 'off'}`}>{r.kind === 'clock' ? 'simulated clock' : 'off the ledger'}</span>
            {r.detail && <span className="detail">{r.detail}</span>}
          </div>
        )}
      {note && <p className="rh-why">{note}</p>}
      {r.outcome === 'accepted' && r.publicChange && Object.keys(r.publicChange).length > 0 && (
        <p className="meta">Public record: {change(r.publicChange)}</p>
      )}
      {r.outcome === 'refused' && <p className="meta">Public record: unchanged. On a chain, a refused call fails before it becomes a transaction.</p>}
      {r.outcome === 'accepted' && (
        <p className="meta">{fields.length
          ? <>Absent from the public record: {fields.map((f) => FIELD_LABEL[f] ?? f).join(', ')}</>
          : 'Reads no secret.'}</p>
      )}
      {r.scan && !r.scan.clean && (
        <p className="meta warn">
          {fields.filter((f) => r.scan.report[f].public).map((f) => `LEAK: ${FIELD_LABEL[f] ?? f}. `)}
          {fields.filter((f) => !r.scan.report[f].private).map((f) => `The scan could not see ${FIELD_LABEL[f] ?? f}, so its absence proves nothing. `)}
        </p>
      )}
    </Tag>
  );
}

/** One call's stamp without its narration, for where the page already says who did what. */
export const Stamp = ({ r, w }) => (r ? <Call r={r} w={w} inline /> : null);

/** The simulated clock, drawn as /demo draws it: the time, and a ring of 72 ticks that fills. */
export function Clock({ clock, duration }) {
  const { now, since, over, left } = clock;
  const hours = since === null ? 0 : Math.max(0, Math.min(72, Math.floor(since / 3600)));
  const [roll, setRoll] = useState({ now, was: null });
  if (roll.now !== now) setRoll({ now, was: roll.now });
  let line;
  if (since === null) line = 'Not moved yet. It moves only when you skip it, once a recovery is open.';
  else if (since === 0) line = 'Your recovery opened just now: 72 hours to go.';
  else line = `${duration(since)} since your recovery opened. ${over ? 'The 72 hours are over.' : `${duration(left)} to go.`}`;
  return (
    <section className="panel clock rh-clock" aria-label="Simulated clock" data-over={String(over)}>
      <h3>Simulated clock</h3>
      <div className="clock-face">
        <ClockRing hours={hours} />
        <div className="clock-digits">
          <p className={`time ${roll.was === null ? '' : 'rolled'}`} data-now={now} key={now}>{clockText(now)}</p>
          {roll.was !== null && (
            <p className="time-was" aria-hidden="true"
              onAnimationEnd={() => setRoll((r) => (r.now === now ? { now, was: null } : r))}>{clockText(roll.was)}</p>
          )}
        </div>
      </div>
      <p className="meta">{line} The in-memory ledger’s block time: the timelock checks it exactly as a node would.</p>
    </section>
  );
}

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;
const RING_PITCH = RING_C / 72;
const RING_TICK = RING_PITCH * 0.42;
function ClockRing({ hours }) {
  return (
    <svg className="clock-arc" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g transform="rotate(-90 32 32)" fill="none">
        <circle className="arc-track" cx="32" cy="32" r={RING_R} strokeWidth="7" />
        <circle className="arc-fill" cx="32" cy="32" r={RING_R} strokeWidth="7"
          strokeDasharray={`${RING_C} ${RING_C}`} strokeDashoffset={RING_C * (1 - hours / 72)} />
        <circle className="arc-gaps" cx="32" cy="32" r={RING_R} strokeWidth="8"
          strokeDasharray={`${RING_PITCH - RING_TICK} ${RING_TICK}`} strokeDashoffset={-RING_TICK} />
      </g>
    </svg>
  );
}

// The counts worth watching here: the DApp's actions never move in a rehearsal.
const COUNTED = Object.keys(LEDGER_LABEL).filter((k) => k !== 'gateActions');

/** The public record's counts, as they stand. */
export function Counts({ counts }) {
  return (
    <section className="panel ledger rh-counts" aria-label="The public record">
      <h2>The public record</h2>
      <p className="meta">What anyone can read, as it stands. Every step you take shows here, or does not.</p>
      <dl className="counts">
        {COUNTED.map((k) => (
          <div key={k} data-count={k}><dt>{LEDGER_LABEL[k]}</dt><dd>{counts[k]}</dd></div>
        ))}
      </dl>
    </section>
  );
}

/** Private state: what each device and person holds. None of it is on the ledger. */
export function Holdings({ people }) {
  return (
    <section className="panel people rh-people" aria-label="What each device holds">
      <h2>What each device holds</h2>
      <p className="meta">Private state, off the ledger. Shares move between people, never through a circuit. Fingerprints are the first four bytes.</p>
      <ul className="persons">
        {people.map((p) => (
          <li key={p.key} className={`person ${p.gone ? 'gone' : ''} ${p.turned ? 'turned' : ''}`} data-persona={p.key}>
            <p className="name">{p.name}{p.gone && <span className="tag">gone</span>}{p.tag && <span className="tag">{p.tag}</span>}</p>
            {p.items.length
              ? <ul className="holds">{p.items.map((h) => (
                <li key={h.label} className={h.shares ? `is-share shares-${Math.min(h.shares, 3)}` : undefined}>
                  <span>{h.label}</span>{h.fp && <code>{h.fp}</code>}
                </li>
              ))}</ul>
              : <p className="meta">nothing</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A root or guardian context, by what it is when it is one of the commitments listed: at enrolment
 * both are the commitment itself, and a successor inherits the first one's. The same hash printed
 * three times in a row would read as a slip; its name says why it repeats. Any other value is shown.
 */
function named(v, c, ids) {
  if (v === c.h) return <span className="rh-named">this commitment</span>;
  if (ids.some((o) => o.h === v && o.root === o.h)) return <span className="rh-named">the first commitment</span>;
  return <code>{short(v)}</code>;
}

/** Step 8: the whole public record, value by value, and each call's mark on it. No name appears. */
export function PublicRecord({ ledger, records, w }) {
  const calls = records.filter((r) => r.kind === 'call').map((c, i) => ({ ...c, n: i + 1 }));
  const written = calls.filter((c) => c.outcome === 'accepted');
  const refused = calls.filter((c) => c.outcome !== 'accepted');
  const num = (n) => String(n).padStart(2, '0');
  return (
    <div className="rh-record">
      <section className="panel ledger" aria-labelledby="rh-record-values">
        <h3 id="rh-record-values">On the record</h3>
        <dl className="counts">
          {COUNTED.map((k) => (
            <div key={k} data-count={k}><dt>{LEDGER_LABEL[k]}</dt><dd>{ledger.counts[k]}</dd></div>
          ))}
        </dl>

        <h3>Identity commitments</h3>
        <p className="meta">
          Commitments to a secret that only the same secret opens. Beside each, in the clear: its threshold, its veto
          commitment, the root it descends from and the guardian context its guardians’ leaves are made under. Enrolling
          makes a commitment its own root and context; a successor inherits both, so every guardian’s leaf still counts.
        </p>
        <ul className="values">
          {ledger.ids.map((c) => (
            <li key={c.h} data-full={c.h} data-retired={String(c.retired)}>
              <code>{short(c.h)}</code><span className="tag">{c.threshold} needed</span>{c.retired && <span className="tag">retired</span>}
              <dl className="rh-id-public">
                {c.veto && <div><dt>veto commitment</dt><dd><code>{short(c.veto)}</code></dd></div>}
                {c.root && <div><dt>root</dt><dd data-full={c.root}>{named(c.root, c, ledger.ids)}</dd></div>}
                {c.ctx && <div><dt>guardian context</dt><dd data-full={c.ctx}>{named(c.ctx, c, ledger.ids)}</dd></div>}
              </dl>
            </li>
          ))}
        </ul>

        <h3>Guardian leaves</h3>
        <p className="meta">
          Salted hashes: without a guardian’s own secret and salt, nothing ties a leaf to a person. But each addGuardian
          call names your identity, so anyone can count your guardians; an approval shows that one of those {w.n} approved,
          never which one.
        </p>
        <ul className="values">
          {ledger.leaves.map((h) => <li key={h} data-full={h}><code>{short(h)}</code></li>)}
        </ul>

        {ledger.recs.length > 0 && <>
          <h3>Recoveries</h3>
          <p className="meta">Each names the identity it recovers and a device key, whose six words anyone can work out, and when it opened.</p>
          <ul className="values rh-recs">
            {ledger.recs.map((r) => (
              <li key={r.h} data-full={r.h} data-approvals={String(r.approvals)} data-vetoed={String(r.vetoed)}>
                <code>{short(r.h)}</code>
                <span className="tag">{r.approvals} approval{r.approvals === 1 ? '' : 's'}</span>
                {r.vetoed && <span className="tag no">vetoed</span>}
                <span className="rh-rec-words"><FingerprintWords publicKey={r.pk} size="sm" label="Device words" /></span>
              </li>
            ))}
          </ul>
        </>}

        {ledger.nullifiers.length > 0 && <>
          <h3>Approval nullifiers</h3>
          <p className="meta">One for each approval, made from the guardian’s secret and the recovery. The same guardian always leaves the same one on a recovery, which stops a second approval, and nothing links it to who gave it.</p>
          <ul className="values">
            {ledger.nullifiers.map((h) => <li key={h} data-full={h}><code>{short(h)}</code></li>)}
          </ul>
        </>}

        {ledger.vetoes.length > 0 && <>
          <h3>Veto nullifiers</h3>
          <ul className="values">
            {ledger.vetoes.map((h) => <li key={h} data-full={h}><code>{short(h)}</code></li>)}
          </ul>
        </>}
      </section>

      <section className="panel rh-never" aria-labelledby="rh-record-never">
        <h3 id="rh-record-never">Never on it</h3>
        <ul className="rh-never-list">
          {NEVER_ON_IT.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </section>

      <section className="rh-transcript" aria-labelledby="rh-record-calls">
        <h3 id="rh-record-calls" className="rh-sub">Every call, in order</h3>
        <p className="meta">
          {calls.length} calls to the compiled circuits, numbered in the order you made them: {written.length} accepted,
          each a transaction anyone can see; {refused.length} refused, which never become one.
        </p>
        <h4 className="rh-transcript-h" id="rh-record-written">Transactions anyone can see</h4>
        <ol className="rh-transcript-list" aria-labelledby="rh-record-written">
          {written.map((c) => (
            <li key={c.seq} data-outcome={c.outcome} value={c.n}>
              <span className="rh-transcript-n" aria-hidden="true">{num(c.n)}</span>
              <code className="circuit">{c.circuit}</code>
              <span className="chip ok">accepted</span>
              <span className="rh-transcript-change">{c.publicChange && Object.keys(c.publicChange).length ? change(c.publicChange) : 'nothing written'}</span>
            </li>
          ))}
        </ol>
        {refused.length > 0 && (
          <div className="rh-tried">
            <h4 className="rh-transcript-h" id="rh-record-refused">Tried and refused: never on the record</h4>
            <ol className="rh-transcript-list" aria-labelledby="rh-record-refused">
              {refused.map((c) => (
                <li key={c.seq} data-outcome={c.outcome} value={c.n}>
                  <span className="rh-transcript-n" aria-hidden="true">{num(c.n)}</span>
                  <code className="circuit">{c.circuit}</code>
                  <span className="chip no">refused: “{c.message}”</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
