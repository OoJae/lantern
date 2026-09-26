// Lantern v2 on Preprod (deployments/preprod-v2.json): a separate contract, deployed beside the
// shipped one as compiled and frozen, whose run exercised each of its four rules once with real proofs.
// It is not the shipped contract: the recovery at the top of the page runs on that one, unchanged.
//
// Drawn from the record at once: every step, the refused ones included (a refusal is the circuit's own
// assert, raised before anything is proved, so it has no transaction). The chain's state and history
// replace what they can as the indexer answers: whether its rules are frozen, its public counts, and
// each action at its block.
import { Fragment } from 'react';
import { contractUrl, txUrl } from '../lib/indexer.js';
import { contractByKey, COUNT_LABEL, V2_RUN } from './records.js';
import { blockNo, shortHex, utc } from './status.js';
import Timeline from './Timeline.jsx';

const DOCS = 'https://github.com/OoJae/lantern/blob/main/docs/v2.md';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** A circuit's name, free to wrap only where its words join. */
const Camel = ({ name }) => name.split(/(?=[A-Z])/).map((w, i) => (i ? <Fragment key={i}><wbr />{w}</Fragment> : w));

function Step({ step }) {
  const accepted = step.outcome === 'accepted';
  return (
    <li className="lv-v2-step" data-outcome={step.outcome} data-step={step.id}>
      <p className="lv-v2-step-head">
        <span className="lv-v2-id">{step.id}</span>
        <code><Camel name={step.circuit} /></code>
      </p>
      <p className="lv-v2-say">{step.say}</p>
      <p className="lv-v2-out">
        {accepted ? (
          <>
            <span className="chip ok">accepted</span>
            {step.tx ? <a href={txUrl(step.tx.txHash)} className="lv-hash">block {blockNo(step.tx.blockHeight)}<span className="sr-only">, the transaction on the Preprod explorer</span></a> : null}
          </>
        ) : (
          <>
            <span className="chip no"><span className="sr-only">Refused: </span>{step.message}</span>
            <span className="meta">no transaction</span>
          </>
        )}
      </p>
    </li>
  );
}

export default function V2({ chain }) {
  const c = contractByKey.v2;
  const got = chain.byKey.v2;
  const tl = chain.timelines.v2;
  const s = V2_RUN.summary;
  const final = V2_RUN.final;
  const deploy = tl.actions.find((a) => a.kind === 'deploy');
  const counts = got.decoded?.counts;
  const same = counts ? Object.keys(final).every((x) => counts[x] === final[x]) : null;
  const inserted = c.inserts.reduce((n, u) => n + u.operations.length, 0);
  const keys = c.deployKeys + inserted;
  const hours = V2_RUN.delaySeconds / 3600;
  return (
    <div className="lv-v2">
      <p className="lv-intro">
        A separate contract on Preprod, beside the shipped one: Lantern v2, which adds four rules to the design
        (<a href={DOCS}>what v2 changes, and why</a>). <strong>It is not the shipped contract</strong>, and the recovery at
        the top of this page does not run on it. Its run deployed it as compiled, froze its rules, then exercised each
        rule once with real proofs: {s.steps} steps, {s.accepted} calls the contract accepted and {s.refused} its circuit
        refused with its own assert, before anything was proved, as the run expects. Recorded {utc(Date.parse(V2_RUN.recordedAt))}.
      </p>
      <article className="lv-contract lv-v2-card" aria-labelledby="lv-c-v2" data-testid="contract-v2">
        <div className="lv-v2-head">
          <h3 id="lv-c-v2">{c.name}</h3>
          <span className="tag">not the shipped contract</span>
        </div>
        <p className="lv-contract-detail">{c.detail}.</p>
        <p className="lv-contract-where">
          <a href={contractUrl(c.address)}><code>{shortHex(c.address)}</code><span className="sr-only">, on the Preprod explorer</span></a>
          <span className="meta" data-testid="v2-where"> · deployed in block {blockNo(deploy?.tx.height ?? c.deploy.blockHeight)}{deploy ? `, ${utc(deploy.tx.time)}` : ''}{got.decoded ? (got.decoded.frozen ? ' · rules frozen' : ' · rules not frozen') : ''}</span>
        </p>

        <dl className="lv-v2-facts">
          <div>
            <dt>Its run</dt>
            <dd>
              {plural(s.steps, 'step', 'steps')}: {s.accepted} accepted, {s.refused} refused · {plural(s.transactions, 'transaction', 'transactions')} in {s.wallClockMinutes} min
              <span className="lv-sub">the deploy, {c.inserts.length === 1 ? 'one update' : `${c.inserts.length} updates`} inserting verifier keys, the freeze, and {plural(c.calls.length, 'call', 'calls')}; a refusal sends nothing</span>
            </dd>
          </div>
          <div>
            <dt>Delay</dt>
            <dd>
              {hours} h, chosen by the owner at enrolment
              <span className="lv-sub">v2’s minimum. The run never waits it out, so no v2 recovery has been finalized.</span>
            </dd>
          </div>
          <div>
            <dt>Verifier keys</dt>
            <dd>
              {keys} in all: {c.deployKeys} in its deploy, {inserted} inserted after it
              <span className="lv-sub">all {keys} in one transaction would exhaust a block’s limits; its rules were frozen only once every key was in</span>
            </dd>
          </div>
        </dl>

        <div className="lv-counts-head">
          <p className="lv-label">Its public record</p>
          <p className="meta" data-testid="v2-counts-said">
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

        <div className="lv-v2-rules">
          {V2_RUN.rules.map((r) => (
            <section key={r.n} className="lv-v2-rule" aria-labelledby={`lv-v2-rule-${r.n}`}>
              <h4 id={`lv-v2-rule-${r.n}`}><span className="lv-v2-n">{r.n}</span> {r.name}</h4>
              <ol className="lv-v2-steps">
                {r.steps.map((x) => <Step key={x.id} step={x} />)}
              </ol>
            </section>
          ))}
        </div>

        <details className="lv-more">
          <summary>Every action on it · {c.calls.length + c.inserts.length + 2} transactions</summary>
          <Timeline contract={c} timeline={tl} label="Every action on Lantern v2" />
        </details>
      </article>
    </div>
  );
}
