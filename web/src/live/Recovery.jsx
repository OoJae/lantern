// The shipped contract's real recovery: where it stands, the time it can finalize from, and a
// countdown to it. What the record says is drawn at once; the chain's own state replaces it as soon
// as the indexer answers, and the page says which of the two it is showing.
//
// The ring is the lock's dial: 72 ticks, one for each hour of the timelock, filled as the hours pass.
// Hanji while it waits; when the finalize lands (the lock), the ring and the seal at its centre take
// the flame's colour, the only Ember on the page.
import { useEffect, useState } from 'react';
import { Seal } from '../brand/Seal.jsx';
import FingerprintWords from '../components/FingerprintWords.jsx';
import { contractUrl, txUrl } from '../lib/indexer.js';
import { contractByKey, SHIPPED_RECOVERY } from './records.js';
import { blockNo, CHIP, recordedRecoveryView, shortHex, spanParts, spanWords, STATE_WORDS, utc, utcClock, utcDay, utcHM } from './status.js';
import { useNow } from './useChain.js';

const HOUR = 3_600_000;
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;
const RING_PITCH = RING_C / 72;
const RING_TICK = RING_PITCH * 0.42;

function LockRing({ hours, lit }) {
  // Drawn empty first, then filled: one finite transition to where the hours stand (none under
  // reduced motion, live.css).
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const f = requestAnimationFrame(() => setShown(hours));
    return () => cancelAnimationFrame(f);
  }, [hours]);
  return (
    <div className="lv-ring" data-lit={lit ? 'true' : undefined} aria-hidden="true">
      <svg className="lv-ring-arc" viewBox="0 0 64 64" focusable="false">
        <g transform="rotate(-90 32 32)" fill="none">
          <circle className="arc-track" cx="32" cy="32" r={RING_R} strokeWidth="5" />
          <circle className="arc-fill" cx="32" cy="32" r={RING_R} strokeWidth="5"
            strokeDasharray={`${RING_C} ${RING_C}`} strokeDashoffset={RING_C * (1 - shown / 72)} />
          <circle className="arc-gaps" cx="32" cy="32" r={RING_R} strokeWidth="6"
            strokeDasharray={`${RING_PITCH - RING_TICK} ${RING_TICK}`} strokeDashoffset={-RING_TICK} />
        </g>
      </svg>
      <Seal state={lit ? 'lit' : 'closed'} notches={false} className="lv-ring-seal" />
    </div>
  );
}

function Countdown({ to, now }) {
  const { d, h, m, s } = spanParts(to - now);
  const parts = [[d, 'd', d === 1 ? 'day' : 'days'], [h, 'h', 'hours'], [m, 'min', 'minutes'], [s, 's', 'seconds']];
  const shown = d ? parts : parts.slice(1);
  return (
    <p className="lv-countdown" role="timer" aria-label={`${spanWords(to - now)} to go`}>
      {shown.map(([n, unit]) => (
        <span key={unit} className="lv-unit"><span className="lv-n">{String(n).padStart(unit === 'd' ? 1 : 2, '0')}</span><span className="lv-u">{unit}</span></span>
      ))}
    </p>
  );
}

const TITLE = {
  waiting: <>A recovery, waiting <em>in plain sight</em></>,
  short: <>A recovery, <em>short of approvals</em></>,
  ready: <>A recovery, <em>ready to finalize</em></>,
  finalized: <>A recovery, <em>finalized</em></>,
  closed: <>A recovery, <em>closed</em></>,
  vetoed: <>A recovery, <em>vetoed</em></>,
  cancelled: <>A recovery, <em>cancelled</em></>,
};

/** Where the new device's six words come from, when they are not drawn: said, never left hanging. */
function deviceNote(got, decoded) {
  if (got.status === 'reading') return 'read from the chain in a moment';
  if (got.decodeError) return 'this browser could not read it from the chain';
  if (got.status === 'missing') return 'not read: the indexer knows no such contract';
  if (got.status === 'error' || !decoded) return 'not read: the indexer did not answer';
  return 'the chain holds no such recovery';
}

export default function Recovery({ chain }) {
  // The countdown's clock lives here, so only this plate redraws each second.
  const now = useNow(1000);
  const c = contractByKey.shipped;
  const R = SHIPPED_RECOVERY;
  const got = chain.byKey.shipped;
  const decoded = got.decoded;
  // The chain's word where it has one, the record's until then (live/status.js).
  const v = recordedRecoveryView(R, decoded, chain.timelines.shipped.actions, now, c.delaySeconds);
  const { state, fromChain, onChain, openedAtLo, openedAtHi, canFinalizeAt, approvals, lit, open, finTx, finalizedAfter } = v;
  const hours = Math.floor(v.elapsed * 72);
  const stale = fromChain && got.pollError ? ` at ${utcClock(got.okAt)}; the indexer has not answered since ${utcClock(got.failingSince)}` : '';

  return (
    <section className="lv-recovery" aria-labelledby="lv-recovery-title" data-state={state} data-source={fromChain ? 'chain' : 'record'}>
      <div className="lv-recovery-head">
        <p className="eyebrow">The shipped contract{'\u00a0'}· a 72-hour timelock</p>
        <h2 id="lv-recovery-title">{TITLE[state]}</h2>
        <p className="lv-state">
          <span className={CHIP[state]} data-testid="shipped-state">{STATE_WORDS[state]}</span>
          <span className="lv-source-tag">
            {fromChain ? `read from the chain${stale}`
              : got.status === 'reading' ? 'from the record, while the chain is read'
              : got.decodeError ? 'from the record: this browser could not read the chain’s state'
              : decoded ? 'from the record: the chain holds no such recovery'
              : 'from the record'}
          </span>
        </p>
      </div>

      <div className="lv-lock">
        <LockRing hours={hours} lit={lit} />
        <div className="lv-lock-text">
          {lit ? (
            <>
              <p className="lv-label">Finalized</p>
              <p className="lv-when">{finTx?.time ? utc(finTx.time) : 'after the 72 hours'}</p>
              <p className="lv-after">
                {finalizedAfter ? `${Math.round(finalizedAfter.ms / HOUR * 10) / 10} hours after ${finalizedAfter.from === 'open' ? 'it opened' : 'the later bound'}` : 'The old commitment is retired'}
                {finTx?.height ? <>, in block <a href={txUrl(finTx.hash)}>{blockNo(finTx.height)}<span className="sr-only">, on the Preprod explorer</span></a></> : null}.
              </p>
              <p className="meta">The phone rebuilt the secret from two shares and proved it opens the original seal. The old commitment is retired{v.successor ? <> and <code>{shortHex(v.successor)}</code> succeeds it</> : null}, under the same identity root.</p>
            </>
          ) : state === 'vetoed' || state === 'cancelled' ? (
            <>
              <p className="lv-label">It will not finalize</p>
              <p className="meta">{state === 'vetoed' ? 'The owner’s veto card killed it: the contract refuses its finalize for good.' : 'The identity’s guardian set was replaced after it opened, so the contract refuses its finalize.'}</p>
            </>
          ) : (
            <>
              <p className="lv-label">Can finalize from</p>
              <p className="lv-when" data-testid="finalize-from">{utc(canFinalizeAt)}</p>
              {now < canFinalizeAt ? <Countdown to={canFinalizeAt} now={now} /> : <p className="lv-countdown lv-zero" role="timer">00<span className="lv-u">h</span> 00<span className="lv-u">min</span></p>}
              <p className="meta">
                {now < canFinalizeAt
                  ? 'By your device’s clock. The contract checks the block’s own time: 72 hours after the later of the two times it recorded at the open.'
                  : state === 'ready' ? 'The 72 hours are over. Only the phone the guardians approved can finalize; this page shows it when it does.' : 'The 72 hours are over, but it needs more approvals before it can finalize.'}
              </p>
            </>
          )}
        </div>
      </div>

      <dl className="lv-facts">
        <div>
          <dt>Opened</dt>
          <dd>
            between {utcHM(openedAtLo)} and {utcHM(openedAtHi)} UTC, {utcDay(openedAtHi)}
            {open ? <span className="lv-sub">block <a href={txUrl(open.tx.hash)}>{blockNo(open.tx.height)}<span className="sr-only">, the transaction on the Preprod explorer</span></a>, at {utcClock(open.tx.time)}{R.openedBy ? ` · by ${R.openedBy}` : ''}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Approvals</dt>
          <dd>
            <span data-testid="shipped-approvals">{approvals}</span>
            <span className="lv-sub">{R.approvedBy.join(' and ')}, says the record. The chain holds a count and two opaque nullifiers, never who.</span>
          </dd>
        </div>
        <div className="lv-device">
          <dt>The new device</dt>
          <dd>
            {onChain ? <FingerprintWords publicKey={onChain.ephemeralPk} size="sm" label="The new device’s fingerprint" /> : <span className="lv-pending" data-testid="device-note">{deviceNote(got, decoded)}</span>}
            <span className="lv-sub">Its fingerprint in six words: what a guardian compares aloud with the owner before approving.</span>
          </dd>
        </div>
        <div>
          <dt>Identity</dt>
          <dd><code title={R.idCommit}>{shortHex(R.idCommit)}</code><span className="lv-sub">the commitment being recovered: public, and nothing more than a seal</span></dd>
        </div>
        <div>
          <dt>Contract</dt>
          <dd><a href={contractUrl(c.address)}><code>{shortHex(c.address)}</code><span className="sr-only">, on the Preprod explorer</span></a><span className="lv-sub">{c.detail}</span></dd>
        </div>
      </dl>

      {R.refusedEarly && !lit ? (
        <p className="lv-refused">
          <span className="chip no">{R.refusedEarly.message}</span>
          <span className="lv-refused-text">Before the 72 hours were up, the phone tried to finalize and the circuit refused, locally, before any proof or transaction.</span>
        </p>
      ) : null}
    </section>
  );
}
