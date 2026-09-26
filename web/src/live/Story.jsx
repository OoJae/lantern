// The whole story's run on Preprod: its two contracts, what each holds now next to what the record
// ends with, and every call each took, in <details> (49 transactions between them).
import { contractUrl } from '../lib/indexer.js';
import { contractByKey, COUNT_LABEL, STORY_FINAL } from './records.js';
import { blockNo, shortHex, utc } from './status.js';
import Timeline from './Timeline.jsx';

function Card({ k, chain, final }) {
  const c = contractByKey[k];
  const got = chain.byKey[k];
  const tl = chain.timelines[k];
  const deploy = tl.actions.find((a) => a.kind === 'deploy');
  const counts = got.decoded?.counts;
  const same = counts ? Object.keys(final).every((x) => counts[x] === final[x]) : null;
  return (
    <article className="lv-contract" aria-labelledby={`lv-c-${k}`} data-testid={`contract-${k}`}>
      <h3 id={`lv-c-${k}`}>{c.name}</h3>
      <p className="lv-contract-detail">{c.detail}.</p>
      <p className="lv-contract-where">
        <a href={contractUrl(c.address)}><code>{shortHex(c.address)}</code><span className="sr-only">, on the Preprod explorer</span></a>
        <span className="meta"> · deployed in block {blockNo(deploy?.tx.height ?? c.deploy.blockHeight)}{deploy ? `, ${utc(deploy.tx.time)}` : ''}{got.decoded ? (got.decoded.frozen ? ' · rules frozen' : ' · rules not frozen') : ''}</span>
      </p>
      <div className="lv-counts-head">
        <p className="lv-label">Its public record</p>
        <p className="meta">
          {got.status === 'reading' ? 'reading…'
            : !counts ? (got.decodeError ? 'this browser could not run the contract’s reader: shown as recorded' : 'the state could not be read: shown as recorded')
            : same ? 'now on chain, and exactly as the run ended' : 'now on chain; it has changed since the run ended'}
        </p>
      </div>
      <dl className="lv-counts">
        {Object.entries(final).map(([x, v]) => (
          <div key={x} data-differs={counts && counts[x] !== v ? 'true' : undefined}>
            <dt>{COUNT_LABEL[x] ?? x}</dt>
            <dd>{counts ? counts[x] : v}{counts && counts[x] !== v ? <span className="lv-sub">recorded {v}</span> : null}</dd>
          </div>
        ))}
      </dl>
      <details className="lv-more">
        <summary>Every call on it · {c.calls.length + 2} transactions</summary>
        <Timeline contract={c} timeline={tl} label={`Every action on ${c.inline}`} />
      </details>
    </article>
  );
}

export default function Story({ chain }) {
  const s = STORY_FINAL.summary;
  const offChain = s.steps - s.accepted - s.refused;
  return (
    <div className="lv-story">
      <p className="lv-story-lede">
        The story’s {s.steps} steps, run against Midnight’s public test network with real proofs from a local proof server
        and fees paid in DUST: {s.accepted} calls the contracts accepted, {s.refused} the circuits refused before any proof, as
        the story expects, and {offChain} that happen off the chain, such as dealing shares and waiting out the timelock.
        {' '}{s.transactions} transactions landed, {s.transactions - s.accepted} of them deploys and freezes. Recorded {utc(Date.parse(STORY_FINAL.recordedAt))}.
      </p>
      <div className="lv-contracts">
        <Card k="story" chain={chain} final={STORY_FINAL.lantern} />
        <Card k="host" chain={chain} final={STORY_FINAL.host} />
      </div>
    </div>
  );
}
