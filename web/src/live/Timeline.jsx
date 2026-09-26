// Every action on one contract, oldest first: the deploy, the freeze of its rules, then each circuit
// call. The record names who made each call (the story's people, fictional); the chain gives each one
// its block and its time. An action the chain holds that the record does not (a call made after the
// record was written, such as the finalize that follows the 72 hours) is drawn too, and says so.
//
// Each row's rule is the /demo step's: Hanji for an accepted call, Ember for the lock (a
// finalizeRecovery the contract accepted), dashed Edge for a recorded action the chain has not shown.
import { txUrl } from '../lib/indexer.js';
import { DOES } from './records.js';
import { blockNo, shortHex, utcShort } from './status.js';

/** The record's actions for a contract, each matched with the chain's, plus the chain's extras. */
export function timelineRows(contract, actions) {
  const recorded = [
    contract.deploy && { key: contract.deploy.txHash, kind: 'deploy', circuit: null, actor: null, say: null, tx: contract.deploy },
    contract.freeze && { key: contract.freeze.txHash, kind: 'update', circuit: null, actor: null, say: null, tx: contract.freeze },
    ...contract.calls.map((x) => ({ key: x.tx.txHash, kind: 'call', circuit: x.circuit, actor: x.actor, say: x.say, tx: x.tx })),
  ].filter(Boolean);
  const rows = recorded.map((r) => ({ ...r, chain: actions.find((a) => a.tx.hash === r.tx.txHash) ?? null, extra: false }));
  for (const a of actions) {
    if (!recorded.some((r) => r.tx.txHash === a.tx.hash)) {
      rows.push({ key: a.tx.hash, kind: a.kind, circuit: a.entryPoint, actor: null, say: null, tx: { txHash: a.tx.hash, blockHeight: a.tx.height }, chain: a, extra: true });
    }
  }
  return rows.sort((a, b) => (a.chain?.tx.height ?? a.tx.blockHeight) - (b.chain?.tx.height ?? b.tx.blockHeight));
}

// Who can make a call the record does not hold: only the approved device can finalize, only a
// guardian can approve, only the veto card's holder can veto. Anyone may make the rest.
const ONLY = { finalizeRecovery: 'The approved phone', approveRecovery: 'A guardian', vetoRecovery: 'The owner' };

/** The row's sentence: the record's own, or one made from who called what. */
function sentence(row) {
  if (row.kind === 'deploy') return 'The contract is deployed.';
  if (row.kind === 'update') return 'Its maintenance authority is emptied: no one can change its rules again.';
  const does = DOES[row.circuit];
  if (row.say) return row.say;
  if (row.actor) return `${row.actor} ${does ?? `calls ${row.circuit}`}.`;
  return does ? `${ONLY[row.circuit] ?? 'Someone'} ${does}.` : 'A call.';
}

function What({ row, says }) {
  const pill = row.kind === 'deploy' ? 'deploy' : row.kind === 'update' ? 'freeze' : row.circuit ?? 'a call';
  return <><span className="circuit">{pill}</span><span className="lv-does">{says}</span></>;
}

export default function Timeline({ contract, timeline, label }) {
  const rows = timelineRows(contract, timeline.actions);
  const seen = rows.filter((r) => r.chain).length;
  const status = timeline.status;
  // Cut short: the recorded rows it did not reach are unconfirmed; if it reached them all, only a
  // newer action can be missing. Either way the page asks again at its next check.
  const cut = seen < rows.length
    ? '. The indexer stopped part-way: the rest is from the record, not yet confirmed; it is asked again at the next check'
    : '. The indexer stopped part-way, so a newer action may be missing; it is asked again at the next check';
  return (
    <div className="lv-timeline-wrap">
      <p className="lv-timeline-note meta" aria-live="polite">
        {status === 'reading' ? 'Reading every action from the indexer…'
          : status === 'error' ? 'The indexer’s list of actions could not be read. Below is what the record says; none of it is confirmed here yet.'
          : `${seen} of ${rows.length} on chain, each at the block below${status === 'partial' ? cut : ''}.`}
      </p>
      <ol className="lv-timeline" aria-label={label}>
        {rows.map((r) => {
          // the lock: a finalizeRecovery the contract accepted (a refused one is never drawn as it)
          const lock = r.kind === 'call' && r.circuit === 'finalizeRecovery' && r.chain?.tx.status === 'success';
          const cls = ['lv-row', r.chain ? 'seen' : 'unseen', lock ? 'lock' : '', r.extra ? 'extra' : ''].filter(Boolean).join(' ');
          const hash = r.chain?.tx.hash ?? r.tx.txHash;
          const says = sentence(r);
          // the actor's name once: as a label only when the sentence does not already say it
          const who = r.actor && !says.includes(r.actor) ? r.actor : null;
          return (
            <li key={r.key} className={cls} data-circuit={r.circuit ?? r.kind}>
              <p className="lv-when-row">
                <span className="lv-time">{r.chain ? utcShort(r.chain.tx.time) : 'not yet confirmed'}</span>
                <span className="lv-block">block {blockNo(r.chain?.tx.height ?? r.tx.blockHeight)}</span>
              </p>
              <p className="lv-what"><What row={r} says={says} /></p>
              <p className="lv-tx">
                {r.extra ? <span className="tag">new since the record</span> : who ? <span className="lv-who">{who}</span> : null}
                <a href={txUrl(hash)} className="lv-hash"><code>{shortHex(hash)}</code><span className="sr-only">, the transaction on the Preprod explorer</span></a>
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
