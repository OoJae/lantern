// "Rehearse a recovery": the visitor runs a whole recovery with their own guardians and their own
// choices, on the compiled circuits /demo runs, in memory. The page is a lazy chunk of its own; the
// contract and its runtime come after it, as a second chunk, exactly as on /demo, and once both are
// here the page makes no network requests.
import { useEffect, useState } from 'react';
import { Honesty } from '../components/Honesty.jsx';
import { Rehearsal } from '../rehearse/Rehearsal.jsx';
import '../styles/rehearse.css';

export default function Rehearse() {
  const [engine, setEngine] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import('../rehearse/engine.js').then(
      (e) => { if (!cancelled) setEngine(e); },
      // A chunk that never arrives (a dropped connection, a deploy since the page loaded) says so,
      // rather than leave "Loading" up for ever.
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="page rehearse" data-ready={engine ? 'true' : undefined}>
      <Honesty />
      <header className="page-head">
        <p className="eyebrow">Your turn, with your choices</p>
        <h1>Rehearse a recovery</h1>
        <p className="lede">
          Choose your guardians and walk through a recovery on the compiled circuits: lose the laptop, answer as each
          guardian, watch the 72 hours, and finalize. Every accept and every refusal is the contract’s own.
        </p>
      </header>
      {engine
        ? <Rehearsal engine={engine} />
        : failed
          ? (
            <p className="loading warn" role="alert">
              The compiled contract did not load. Check your connection, then{' '}
              <button type="button" className="linkish" onClick={() => window.location.reload()}>reload the page</button>.
            </p>
          )
          : <p className="loading" role="status">Loading the compiled contract into your browser…</p>}
    </section>
  );
}
