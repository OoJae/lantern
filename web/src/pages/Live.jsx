// /live, "On Preprod": Lantern on Midnight's public test network, read by the visitor's own browser.
//
//  1. the shipped contract's real recovery: where it stands, a countdown to when it can finalize,
//     and every call on that contract;
//  2. "Check it in your browser": the committed records against the chain, fact by fact;
//  3. "Watch an identity": every recovery for an identity commitment, checked every 30 s (in the
//     background too, as often as the browser allows), with a browser notification on anything new
//     (only if asked, with a click);
//  4. the whole story's run: its two contracts and every call they took.
//
// The page draws what the repository's records say at once, with no loading line of its own (so a
// route change here is never held on the indexer), then reads the chain: the indexer over HTTPS, the
// contract's state with its own compiled reader (a lazy chunk with the runtime), and its history
// over a WebSocket that closes once caught up. Nothing is written, signed or sent but questions, and
// only to indexer.preprod.midnight.network (vercel.json's connect-src allows that host, nothing else).
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { INDEXER } from '../lib/indexer.js';
import Check from '../live/Check.jsx';
import Cmd from '../live/Cmd.jsx';
import Recovery from '../live/Recovery.jsx';
import Story from '../live/Story.jsx';
import Timeline from '../live/Timeline.jsx';
import { useChain } from '../live/useChain.js';
import Watch from '../live/Watch.jsx';
import { contractByKey, SETUP } from '../live/records.js';
import { utcClock } from '../live/status.js';
import '../styles/live.css';

const HOST = new URL(INDEXER).host;
// The host name, free to wrap after each dot on a narrow phone, never inside a word.
const hostParts = HOST.split('.').map((p, i, all) => <Fragment key={p}>{p}{i < all.length - 1 ? <>.<wbr /></> : null}</Fragment>);

/** Why no contract could be read, by what went wrong: the headline, and what may be behind it. */
function whyUnread(failed) {
  const kinds = new Set(failed.map((s) => s.error));
  const http = failed.find((s) => s.error === 'http');
  if (http) return ['The indexer is answering with an error.', ` It answered ${http.errorText?.replace(/^the indexer answered /, '') ?? 'with an HTTP error'}. Midnight’s public test network is sometimes down for a while.`];
  if (kinds.has('refused')) return ['The indexer refused this page’s questions.', ' It may have changed what it accepts.'];
  if (kinds.has('shape')) return ['The indexer’s answers could not be used.', ' They were not in the shape this page reads; the indexer may have changed.'];
  if (kinds.has('slow')) return ['The indexer is not answering in time.', ' Midnight’s public test network is sometimes slow.'];
  return ['The indexer could not be reached.', ' A network, an extension or a firewall may be blocking it.'];
}

function Reach({ chain }) {
  const states = Object.values(chain.byKey);
  const failed = states.filter((s) => s.status === 'error');
  // "Try again" keeps its place while the new read runs, as "Trying again…", so the focus on it is not
  // dropped to the page; when the read ends it is the same button again, and the line under the
  // headline changes, so a screen reader hears how the retry went.
  const told = useRef(null);
  const [handoff, setHandoff] = useState(false);
  const back = useRef(null);
  const allFailed = failed.length === states.length;
  const retrying = chain.retrying && !states.some((s) => s.status === 'ok');
  if (allFailed) told.current = whyUnread(failed);
  // A retry that reached the indexer takes the alert away: hand the focus to the line that says so.
  const wasHere = useRef(false);
  useEffect(() => {
    const here = allFailed || retrying;
    if (wasHere.current && !here && handoff) back.current?.focus();
    wasHere.current = here;
  }, [allFailed, retrying, handoff]);
  if (allFailed || retrying) {
    const [head, cause] = told.current ?? whyUnread(failed);
    const onRetry = (e) => {
      if (retrying) return; // aria-disabled, not disabled: it keeps the focus
      setHandoff(document.activeElement === e.currentTarget);
      chain.retry();
    };
    return (
      <div className="lv-reach bad" role="alert">
        <p>
          <strong>{head}</strong>{' '}
          What you see is what the repository’s records say; none of it has been checked against the chain from here yet.
          {cause}
          {chain.retriedAt && !retrying ? <span data-testid="reach-retried"> Tried again at {utcClock(chain.retriedAt)}, with no better answer.</span> : null}
        </p>
        <p>
          <button type="button" onClick={onRetry} aria-disabled={retrying ? 'true' : undefined}>{retrying ? 'Trying again…' : 'Try again'}</button>
        </p>
      </div>
    );
  }
  if (chain.slow) {
    return <p className="lv-reach" role="status">The indexer is slow to answer. Still asking; the records are shown meanwhile.</p>;
  }
  // Read once, then a later check went unanswered: say since when, and how old what is shown is.
  const stale = states.filter((s) => s.pollError && s.okAt);
  if (stale.length) {
    const since = Math.min(...stale.map((s) => s.failingSince));
    const readAt = Math.min(...stale.map((s) => s.okAt));
    return (
      <p className="lv-reach" role="status" data-testid="reach-stale">
        <strong>The indexer has not answered since {utcClock(since)}.</strong>{' '}
        What you see was read from the chain at {utcClock(readAt)}. Still trying.
      </p>
    );
  }
  const answeredAt = states.filter((s) => s.okAt).map((s) => s.okAt);
  if (handoff && answeredAt.length) {
    return <p className="lv-reach" role="status" tabIndex={-1} ref={back} data-testid="reach-back">The indexer answered at {utcClock(Math.min(...answeredAt))}.</p>;
  }
  return null;
}

export default function Live() {
  // While an identity is watched, the chain is checked with the tab in the background too.
  const [watching, setWatching] = useState(false);
  const chain = useChain({ background: watching });
  const shipped = contractByKey.shipped;
  return (
    <section className="page live">
      <header className="page-head">
        {/* On a narrow phone it breaks after the dot, never inside "a public". */}
        <p className="eyebrow">Midnight Preprod{'\u00a0'}· a{'\u00a0'}public test network</p>
        <h1>On <em>Preprod</em></h1>
        <p className="lede">The real recovery on Midnight’s public test network, read from its public indexer by your browser.</p>
      </header>

      <div className="honesty lv-honesty">
        <p>
          <strong>Read in your browser.</strong> This page asks Midnight’s public indexer (<code>{hostParts}</code>) for these
          contracts’ public state and history, and reads the state with Lantern’s own compiled contract. It holds no key,
          signs nothing and sends no transaction. Times are UTC.
        </p>
      </div>

      <nav className="lv-jump" aria-label="On this page">
        <a href="#check">Check it in your browser</a>
        <a href="#watch">Watch an identity</a>
        <a href="#story">The whole story</a>
      </nav>

      <Reach chain={chain} />

      <Recovery chain={chain} />

      <section className="spread lv-section" aria-labelledby="lv-calls-title">
        <h2 id="lv-calls-title" className="section">Every call, in order</h2>
        <div>
          <p className="lv-intro">
            Every action on the shipped contract, from its deploy. The record names who made each call (the story’s people,
            who are fictional); the chain gives each its block and time. A call made after the record was written, such as
            the finalize once the 72 hours are over, appears here by itself.
          </p>
          <Timeline contract={shipped} timeline={chain.timelines.shipped} label="Every action on the shipped contract" />
        </div>
      </section>

      <section className="spread lv-section" id="check" aria-labelledby="lv-check-title">
        <h2 id="lv-check-title" className="section">Check it in your browser</h2>
        <div>
          <p className="lv-intro">
            Both records in the repository against the chain, one fact at a time: every transaction, at its block, carrying
            its call; each contract, its frozen rules and its verifier keys; the recovery; the story’s last counts.
          </p>
          <Check />
          <div className="lv-full meta">
            <p>
              The full check also compiles the contracts afresh and compares each verifier key with that compile, which a
              browser cannot do. It runs in a terminal, one command per record (<a href={SETUP}>the setup</a>):
            </p>
            <dl className="lv-cmds">
              <div>
                <dt>The whole story, <code>deployments/preprod.json</code></dt>
                <dd><Cmd>LANTERN_NETWORK=preprod npm run devnet:verify</Cmd></dd>
              </div>
              <div>
                <dt>The shipped contract, <code>deployments/preprod-shipped.json</code></dt>
                <dd><Cmd>LANTERN_NETWORK=preprod node devnet/src/shipped.mjs verify</Cmd></dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="spread lv-section" id="watch" aria-labelledby="lv-watch-title">
        <h2 id="lv-watch-title" className="section">Watch an identity</h2>
        <div>
          <p className="lv-intro">
            A recovery waits 72 hours in plain sight so that its owner can veto it, which only works if the owner hears
            about it. Paste an identity commitment to see every recovery opened against it, with the new device’s
            fingerprint in words, and hear about anything new while this tab stays open, in the background too.
          </p>
          <Watch chain={chain} onWatching={setWatching} />
        </div>
      </section>

      <section className="spread lv-section" id="story" aria-labelledby="lv-story-title">
        <h2 id="lv-story-title" className="section">The whole story, on Preprod</h2>
        <Story chain={chain} />
      </section>

      <p className="lv-onward">
        <Link to="/rehearse">Rehearse your own recovery</Link> · <Link to="/demo">Watch the story in your browser</Link> · <Link to="/about">What is real</Link>
      </p>
    </section>
  );
}
