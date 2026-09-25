import { useEffect, useRef, useState } from 'react';
import { FIELD_LABEL, LEDGER_LABEL, hex, short } from '../lib/format.js';

// "Try to break it". The story above follows a script; here the visitor picks the attack. Each
// run is one call to one compiled circuit, in a world this panel builds for itself when first
// asked and never shares with the story. The verdict and any refusal message are the contract's
// own: the page writes only what each attempt did and the sentence saying why.

const TRIES = [
  { key: 'tamper', title: 'Tamper with a share', button: 'Flip the byte and finalize',
    what: 'Change one byte of a guardian’s share on its way to the phone. The phone rebuilds the secret from the two shares it holds and finalizes.' },
  { key: 'otherPhone', title: 'Finalize from a different phone', button: 'Finalize from another phone',
    what: 'Rebuild the right secret from both real shares on a phone with a new device key, one the guardians never approved, and finalize from it.' },
  { key: 'early', title: 'Finalize before the 72 hours are up', button: 'Finalize at 71 hours',
    what: 'Finalize from the approved phone, holding the right secret, 71 hours after the recovery opened. This runs in a second world, built the same way, whose clock stops at 71 hours.' },
  { key: 'guessVeto', title: 'Veto with a guessed card', button: 'Veto with a guess',
    what: 'Kill Hana’s recovery without her veto card, by guessing the secret on it.' },
  { key: 'twice', title: 'A guardian approves twice', button: 'Approve a second time',
    what: 'A guardian who has already approved this recovery approves it a second time, as if a second guardian had.' },
  { key: 'lone', title: 'Finalize with one approval', button: 'Finalize with one approval',
    what: 'Finalize a recovery that only Seo-yeon approved, from the approved phone holding the right secret. This runs in a third world, built the same way except that Mum sends her share without approving.' },
  { key: 'honest', title: 'Control: finalize honestly', button: 'Finalize honestly',
    what: 'This one should be accepted. The approved phone finalizes with the two real shares, after the timelock. If this were refused too, the refusals above would show nothing.' },
];

// Why the contract answered as it did, keyed by the contract's own message and never by the
// attack chosen, so a surprise answer is never explained as the expected one.
const WHY = {
  'reconstructed secret does not open idCommit':
    'A changed share rebuilds a different secret, and only Hana’s real secret opens the commitment she made when she enrolled; the device, the timelock and the approvals were all in order.',
  'not the device the guardians approved':
    'The guardians approved one device key, fixed in the recovery when it opened, and knowing the secret does not change which device that is.',
  'timelock has not elapsed':
    'Finalizing must wait at least 72 hours after the recovery opens, so Hana has time to notice and veto it; at 71 hours the wait is not over.',
  'veto secret does not open this identity\'s veto commitment':
    'A veto must open the veto commitment Hana made when she enrolled, and only the secret on her card does.',
  'guardian already approved':
    'An approval leaves a nullifier made from the guardian’s secret and this recovery, so the same guardian always leaves the same one: the repeat is caught without anyone learning who it was.',
  'not enough approvals':
    'The contract compares the count of approvals with Hana’s threshold of 2, and holding the secret does not make up for the missing approval.',
};
const ACCEPTED = {
  finalizeRecovery: 'Every check held, from the approved device and the timelock to two approvals and a rebuilt secret that opens Hana’s commitment, so the same call retires her old commitment and enrols her successor.',
};
const NO_NOTE = 'The panel has no note for this answer. The message is the contract’s own.';

const NAME = { seoyeon: 'Seo-yeon', mum: 'Mum' };
const PLACE = { main: 'the world', early: 'the second world', lone: 'the third world' };

// What a card's live region says when its run ends: the contract's answer, in one line.
const verdict = (r) => `${r.circuit} ${r.outcome === 'accepted' ? 'accepted' : `refused: “${r.message}”`}.`
  + (r.ok ? '' : ` Unexpected: the panel expected ${r.expect}.`);

// Let the browser paint the "preparing" line before the next burst of circuit work.
const paint = () => new Promise((resolve) => {
  const t = setTimeout(resolve, 50);
  requestAnimationFrame(() => { clearTimeout(t); setTimeout(resolve, 0); });
});

export function BreakIt({ engine }) {
  const worlds = useRef({});             // kind -> world, each built on first use
  const running = useRef(false);
  const runs = useRef(0);                // numbers each result, so a new verdict on a card is stamped afresh
  const [facts, setFacts] = useState(null);   // what the panel shows of the main world
  const [prints, setPrints] = useState(null); // the fingerprints of the two shares the phone holds, and no more of them
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);     // { key, text }: the progress line while preparing or running
  const [said, setSaid] = useState(null);     // { key, text }: what that card's live region announces
  const [slow, setSlow] = useState(false);    // a run has gone on long enough to dim the buttons
  const [error, setError] = useState(null);
  const [whose, setWhose] = useState('mum');
  const [byte, setByte] = useState('0');
  const [who, setWho] = useState('seoyeon');

  // The input must name a byte: a run that flips nothing would prove nothing.
  const byteNo = /^\d{1,2}$/.test(byte.trim()) ? Number(byte) : NaN;
  const byteOk = byteNo >= 0 && byteNo <= 31;

  const guarded = async (key, work) => {
    if (running.current) return;
    running.current = true;
    setError(null);
    setSaid(null);
    // Most runs take a few tens of milliseconds: dim the buttons only for one long enough to notice.
    const dim = setTimeout(() => setSlow(true), 250);
    try {
      await work();
    } catch (e) {
      setError({ key, message: String(e?.message ?? e) });
    } finally {
      clearTimeout(dim);
      running.current = false;
      setBusy(null);
      setSlow(false);
    }
  };

  const show = (w) => {
    setFacts(w.facts());
    setPrints({ seoyeon: engine.shareFingerprint(w.p.seoyeon.share), mum: engine.shareFingerprint(w.p.mum.share) });
  };

  const build = async (kind, key) => {
    const w = await engine.newWorld(kind, async (label, i, n) => {
      // Announced once; each step after that is shown, not read out.
      if (i === 1) setSaid({ key, text: `Building ${PLACE[kind]}, with new secrets: ${n} circuit calls.` });
      setBusy({ key, text: `Preparing ${PLACE[kind]}: ${label} (${i} of ${n})…` });
      await paint();
    });
    worlds.current[kind] = w;
    // Results from the world this one replaces stay, marked as from the previous world.
    setResults((r) => Object.fromEntries(Object.entries(r)
      .map(([k, v]) => [k, engine.worldOf(k) === kind ? { ...v, stale: true } : v])));
    if (kind === 'main') show(w);
    return w;
  };

  const run = (key) => {
    if (key === 'tamper' && !byteOk) return;
    const opts = key === 'tamper' ? { whose, byte: byteNo } : key === 'twice' ? { who } : {};
    return guarded(key, async () => {
      const kind = engine.worldOf(key);
      const current = worlds.current[kind];
      const w = current && !current.spent ? current : await build(kind, key);
      setBusy({ key, text: 'Running the circuit…' });
      await paint();
      try {
        const rec = await engine.runAttack(w, key, opts);
        const seq = ++runs.current;
        setResults((r) => ({ ...r, [key]: { ...rec, seq } }));
        setSaid({ key, text: verdict(rec) });
      } finally {
        if (kind === 'main') setFacts(w.facts());
      }
    });
  };

  const reset = () => guarded(null, async () => {
    worlds.current = {};
    setResults({});
    setFacts(null);
    setPrints(null);
    await build('main', null);
    setSaid({ key: null, text: 'The world is built.' });
  });

  return (
    <section className="breakit" id="break" aria-labelledby="breakit-title" data-world={facts ? (facts.retired ? 'spent' : 'built') : 'none'}>
      <header className="breakit-head">
        <p className="eyebrow">Your turn</p>
        <h2 id="breakit-title">Try to break it</h2>
        <p className="caption">The story above follows a script. Here you choose the attack, and the compiled contract decides.</p>
        <p className="meta">
          This panel builds a world of its own, separate from the story’s, and runs Lantern’s compiled circuits
          against it in your browser: an in-memory ledger, no wallet, no chain, no proofs. The verdict and every
          refusal message are the contract’s own; the page writes only what each attempt did and why the
          contract answered as it did.
        </p>
      </header>

      <World facts={facts} progress={busy?.key === null ? busy.text : ''} status={said?.key === null ? said.text : ''}
        slow={slow} onReset={reset} error={error?.key === null ? error.message : null} />

      <ol className="tries">
        {TRIES.map((t) => (
          <li key={t.key} className={`try ${t.key === 'honest' ? 'control' : ''}`} data-try={t.key}>
            <h3>{t.title}</h3>
            <p className="what">{t.what}</p>
            {t.key === 'tamper' && <>
              <fieldset className="choice">
                <legend>Whose share</legend>
                {['seoyeon', 'mum'].map((g) => (
                  <label key={g}>
                    <input type="radio" name="try-tamper-whose" value={g} checked={whose === g} onChange={() => setWhose(g)} />
                    {NAME[g]}
                  </label>
                ))}
              </fieldset>
              <label className="field">
                <span>Byte to flip, 0 to 31</span>
                <input type="number" min="0" max="31" step="1" inputMode="numeric" value={byte}
                  onChange={(e) => setByte(e.target.value)} aria-invalid={byteOk ? undefined : 'true'} aria-describedby="try-byte-note" />
              </label>
              <p id="try-byte-note" className={`meta ${byteOk ? '' : 'warn'}`}>
                {byteOk
                  ? `Flipping inverts all eight bits of byte ${byteNo}, counting from the most significant.`
                  : 'Choose a whole number from 0 to 31.'}
              </p>
              {prints && byteOk && <Bytes print={prints[whose]} at={byteNo} name={NAME[whose]} />}
            </>}
            {t.key === 'twice' && (
              <fieldset className="choice">
                <legend>Which guardian</legend>
                {['seoyeon', 'mum'].map((g) => (
                  <label key={g}>
                    <input type="radio" name="try-twice-who" value={g} checked={who === g} onChange={() => setWho(g)} />
                    {NAME[g]}
                  </label>
                ))}
              </fieldset>
            )}
            <p className="try-go">
              <button type="button" onClick={() => run(t.key)}
                aria-disabled={slow || (t.key === 'tamper' && !byteOk) ? 'true' : undefined}>{t.button}</button>
            </p>
            <p className="try-progress">{busy?.key === t.key ? busy.text : ''}</p>
            <p className="try-status sr-only" role="status">{said?.key === t.key ? said.text : ''}</p>
            {error?.key === t.key && <p className="meta warn" role="alert">{error.message}</p>}
            {results[t.key] && <TryResult key={results[t.key].seq} r={results[t.key]} />}
            {t.key === 'honest' && results.honest?.spent && !results.honest.stale && (
              <p className="meta spent-note">This world is now spent: Hana’s old commitment is retired. Your next attack on it builds a new world with new secrets.</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function World({ facts, progress, status, slow, onReset, error }) {
  return (
    <section className="panel try-world" aria-labelledby="try-world-title">
      <h3 id="try-world-title">The world under attack</h3>
      <ul className="plain">
        <li>Hana is enrolled with a threshold of 2 and three guardians: Seo-yeon, Mum and Jihoon.</li>
        <li>Her identity secret is split into three shares, one for each guardian.</li>
        <li>Seo-yeon opened a recovery for Hana’s new phone. Seo-yeon and Mum approved it, then sent the phone their shares.</li>
        <li>The simulated clock stands 72&nbsp;h 10&nbsp;min after the recovery opened, past the timelock.</li>
      </ul>
      {facts
        ? (
          <dl className="counts">
            <div data-fact="id"><dt>Hana’s commitment</dt><dd data-full={hex(facts.id)}>{short(hex(facts.id))}</dd></div>
            <div data-fact="rid"><dt>recovery</dt><dd data-full={hex(facts.rid)}>{short(hex(facts.rid))}</dd></div>
            <div data-fact="phone"><dt>approved phone</dt><dd>{facts.phone}</dd></div>
            <div data-fact="approvals"><dt>approvals</dt><dd>{facts.approvals} of {facts.threshold}</dd></div>
            <div data-fact="clock"><dt>simulated clock</dt><dd>{facts.since} after opening</dd></div>
            <div data-fact="timelock"><dt>timelock</dt><dd>{facts.lock}</dd></div>
          </dl>
        )
        : <p className="meta">The main world is not built yet. The first attack that runs in it, or the button below, builds it with new random secrets: seven circuit calls.</p>}
      {facts?.retired && (
        <p className="meta">Hana’s recovery has finalized here, so her old commitment is retired. The next attack on it builds a new world, with new secrets.</p>
      )}
      <p className="try-progress">{progress}</p>
      <p className="try-status sr-only" role="status">{status}</p>
      {error && <p className="meta warn" role="alert">{error}</p>}
      <button type="button" onClick={onReset} aria-disabled={slow ? 'true' : undefined}>
        {facts ? 'Reset, new secrets' : 'Build the world'}
      </button>
    </section>
  );
}

// The share as the phone receives it: 32 bytes, of which the card shows the fingerprint, the first
// four written as every fingerprint on this site, and marks where the chosen byte sits. It is never
// given the value of any other byte: two shares rebuild Hana's secret, and stepping through every
// byte of both would read them out. A chosen byte's value shows only when it is in the fingerprint.
const FINGERPRINT = 4;
function Bytes({ print, at, name }) {
  const head = print.replace('-', '').match(/../g);
  const known = at < FINGERPRINT;
  const flipped = known && (0xff ^ parseInt(head[at], 16)).toString(16).padStart(2, '0').toUpperCase();
  return (
    <div className="share" data-byte={at}>
      <p className="meta">
        {name}’s share in this world, fingerprint {print}.{' '}
        {known
          ? `Byte ${at} is ${head[at]}, part of the fingerprint; flipped, it becomes ${flipped}.`
          : `All eight bits of byte ${at} are inverted.`}
        {' '}The bytes after the fingerprint stay hidden, here and in the result: any two shares rebuild Hana’s secret.
      </p>
      <p className="share-bytes" aria-hidden="true">
        {Array.from({ length: 32 }, (_, i) => {
          const cell = i < FINGERPRINT ? head[i] : '··';
          return i === at ? <mark key={i}>{cell}</mark>
            : <span key={i} className={i < FINGERPRINT ? undefined : 'masked'}>{cell}</span>;
        })}
      </p>
    </div>
  );
}

function TryResult({ r }) {
  const fields = r.scan?.fields ?? [];
  const change = r.publicChange && Object.entries(r.publicChange);
  // The accept note names every check the honest call passed, so it is shown only for that
  // expected accept: an attack the contract accepted passed checks no note here can name.
  const note = r.outcome === 'accepted' ? (r.ok ? ACCEPTED[r.circuit] : undefined) : WHY[r.message];
  // A new verdict lands in view, so its stamp is seen: at once, and only as far as needed (its
  // scroll-margin clears the sticky header). Only while its card's button is still on screen: a
  // visitor who scrolled away while the world was built is left where they are.
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const go = el?.closest('.try')?.querySelector('.try-go')?.getBoundingClientRect();
    if (go && go.bottom > 0 && go.top < window.innerHeight) el.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <div ref={ref} className={`try-result ${r.outcome} ${r.ok ? '' : 'unexpected'} ${r.stale ? 'stale' : ''}`} data-outcome={r.outcome}
      data-circuit={r.circuit} data-message={r.message ?? ''} data-ok={String(r.ok)} data-stale={String(Boolean(r.stale))}>
      <p className="who">
        {r.actor}
        {/* The comma is read out, not shown: without it the actor and the tag run together. */}
        {r.stale && <><span className="sr-only">, </span><span className="tag">from the previous world</span></>}
      </p>
      <p className="say">{r.say}</p>
      {r.world !== 'main' && (
        <p className="meta facts" data-facts={r.world}>
          Measured in {PLACE[r.world]} before the call: approvals {r.facts.approvals} of {r.facts.threshold} · timelock {r.facts.lock}.
        </p>
      )}
      <div className="result">
        <code className="circuit">{r.circuit}</code>
        {r.outcome === 'accepted'
          ? <span className="chip ok">accepted</span>
          : <span className="chip no">refused: “{r.message}”</span>}
      </div>
      <p className="why">{note ?? NO_NOTE}</p>
      {r.unchanged === true && <p className="meta">Public record: unchanged.</p>}
      {r.unchanged === false && <p className="meta warn">The public record changed, although the call was refused.</p>}
      {change?.length > 0 && (
        <p className="meta">Public record: {change.map(([k, v]) => `${LEDGER_LABEL[k] ?? k} ${v > 0 ? '+' : ''}${v}`).join(' · ')}</p>
      )}
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
      {!r.ok && <p className="meta warn">Unexpected: the panel expected {r.expect}.</p>}
    </div>
  );
}
