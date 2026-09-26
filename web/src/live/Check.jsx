// "Check it in your browser": the committed records against the public chain, one fact at a time,
// on a click. Every transaction either file records is looked up by its identifier and must be there,
// at its recorded block, with its recorded hash, carrying the recorded action on the recorded contract.
// Each contract must exist, with its rules frozen and its verifier keys the ones this repository
// compiled (the whole story's finalizeRecovery: the pinned 60-second build's); the shipped recovery
// must be the recorded one; the whole story's counts, in the block of each contract's last recorded
// call, must be the ones the record ends with. Calls anyone made after that (enrolling and opening a
// recovery need no permission) are said beside them, never counted as a mismatch.
//
// A fact is a match, a mismatch, or not checked, and never a mismatch it did not see: when the indexer
// gives no usable answer, or this browser cannot run the contract's reader, the row says which.
//
// What it leaves out, said on the page: a fresh compile of the contracts, which only the terminal can
// run, one command per record: `LANTERN_NETWORK=preprod npm run devnet:verify` (preprod.json, the
// whole story) and `LANTERN_NETWORK=preprod node devnet/src/shipped.mjs verify` (preprod-shipped.json).
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { contractState, contractStateAt, pool, transactionById } from '../lib/indexer.js';
import { compareKeys } from './keys.js';
import { CONTRACTS, contractByKey, COUNT_LABEL, FILE_OF, RECORDED_TXS, SHIPPED_RECOVERY, STORY_FINAL } from './records.js';
import { blockNo, shortHex, utc, utcClock, utcHM } from './status.js';
import { loadDecoder } from './useChain.js';

const FAIL = (detail) => ({ ok: false, detail });
const PASS = (detail) => ({ ok: true, detail });

/** A fact that could not be checked, and why: never counted as a mismatch. */
class Unchecked extends Error {
  constructor(kind) { super(kind); this.kind = kind; }
}
/** The contract's decoded state, or, when this browser could not read it, an Unchecked. */
const decodedOf = (r) => {
  if (r && !r.decoded) throw new Unchecked('reader');
  return r;
};
const WHY = {
  reader: 'could not be checked: this browser could not run the contract’s reader',
  slow: 'could not be checked: the indexer was too slow to answer',
  unreachable: 'could not be checked: the indexer could not be reached',
  refused: 'could not be checked: the indexer refused the question',
  shape: 'could not be checked: the indexer’s answer was not in the expected shape',
};
const whyNot = (e) => WHY[e?.kind] ?? (e?.kind === 'http' ? `could not be checked: ${e.message}` : 'could not be checked: this page failed while checking it');
const plural = (n, one, many) => (n === 1 ? one : many);

/** The checks, in the order they are drawn. Each `run(ctx)` resolves { ok, detail }. */
function buildChecks() {
  const contractChecks = CONTRACTS.flatMap((c) => {
    const where = c.kind === 'host' ? 'contracts/managed-host/keys' : 'contracts/managed/keys';
    return [
      {
        id: `exists-${c.key}`, group: 'contracts',
        label: `${c.name} is on Preprod`,
        run: async (ctx) => {
          const r = await ctx.read(c);
          return r ? PASS(`at ${shortHex(c.address)} · latest action in block ${blockNo(r.action.tx.height)}`) : FAIL(`the indexer knows no contract at ${shortHex(c.address)}`);
        },
      },
      {
        id: `frozen-${c.key}`, group: 'contracts',
        label: 'Its rules are frozen',
        run: async (ctx) => {
          const r = decodedOf(await ctx.read(c));
          if (!r) return FAIL('no contract to read');
          const { frozen, committee, threshold } = r.decoded;
          if (frozen) return PASS(`its maintenance authority holds no keys and needs ${threshold} ${plural(threshold, 'signature', 'signatures')}: its rules can never change`);
          return FAIL(committee
            ? `its maintenance authority still holds ${committee} ${plural(committee, 'key', 'keys')}`
            : 'its maintenance authority holds no keys, but needs no signature: a change could pass unsigned');
        },
      },
      {
        id: `keys-${c.key}`, group: 'contracts',
        label: 'Its verifier keys are the ones this repository compiled',
        run: async (ctx) => {
          const r = decodedOf(await ctx.read(c));
          if (!r) return FAIL('no contract to read');
          const k = compareKeys(r.decoded.keys, c.kind, c.key);
          if (!k.ok) {
            const off = [...k.wrong, ...k.extra];
            return FAIL(`${k.total - k.wrong.length} of ${k.total} are the expected keys; ${off.join(', ')} ${plural(off.length, 'is', 'are')} not`);
          }
          if (!k.pinned.length) return PASS(`${k.same.length} of ${k.total} identical to ${where}, by SHA-256`);
          const builds = k.pinned.map((n) => `${n} to ${k.flavour[n].build}`).join(', ');
          return PASS(`${k.total} of ${k.total} as expected, by SHA-256: ${k.same.length} identical to ${where}, and ${builds}`);
        },
      },
    ];
  });

  const R = SHIPPED_RECOVERY;
  const shipped = contractByKey.shipped;
  const openTx = RECORDED_TXS.find((t) => t.contract === 'shipped' && t.circuit === 'openRecovery');
  const withRecovery = async (ctx, fn) => {
    const r = decodedOf(await ctx.read(shipped));
    if (!r) return FAIL('no contract to read');
    const rec = r.decoded.recoveries.find((x) => x.rid === R.rid);
    if (!rec) return FAIL(`no recovery ${shortHex(R.rid)} on the contract`);
    return fn(rec, r.decoded);
  };
  const recoveryChecks = [
    {
      id: 'recovery', group: 'recovery',
      label: 'The recovery is on chain, for the recorded identity',
      run: (ctx) => withRecovery(ctx, (rec) => (rec.idCommit === R.idCommit
        ? PASS(`recovery ${shortHex(R.rid)}, identity ${shortHex(R.idCommit)}`)
        : FAIL(`it is for ${shortHex(rec.idCommit)}, not ${shortHex(R.idCommit)}`))),
    },
    {
      id: 'bounds', group: 'recovery',
      label: 'It opened when the record says, in a block inside its own bounds',
      run: (ctx) => withRecovery(ctx, async (rec) => {
        if (rec.openedAtLo !== R.openedAtLo || rec.openedAtHi !== R.openedAtHi) return FAIL(`bounds ${utcHM(rec.openedAtLo)} to ${utcHM(rec.openedAtHi)} UTC, not the recorded ones`);
        const t = await ctx.tx(openTx.tx.txId);
        if (!t) return FAIL('the transaction that opened it was not found');
        const inside = t.time >= rec.openedAtLo && t.time < rec.openedAtHi;
        return inside ? PASS(`${utcHM(rec.openedAtLo)} to ${utcHM(rec.openedAtHi)} UTC; its block’s time, ${utcClock(t.time)}, lies between`) : FAIL(`its block’s time, ${utc(t.time)}, lies outside ${utcHM(rec.openedAtLo)} to ${utcHM(rec.openedAtHi)}`);
      }),
    },
    {
      id: 'unlock', group: 'recovery',
      label: 'It can finalize from the recorded time: 72 hours after the later bound',
      run: (ctx) => withRecovery(ctx, (rec) => {
        const at = rec.openedAtHi + shipped.delaySeconds * 1000;
        return at === R.finalizeFrom ? PASS(utc(at)) : FAIL(`${utc(at)}, not ${utc(R.finalizeFrom)}`);
      }),
    },
    {
      id: 'approvals', group: 'recovery',
      label: 'It has the recorded approvals',
      run: (ctx) => withRecovery(ctx, (rec, d) => {
        const got = `${rec.approvals} of ${d.identities[rec.idCommit]?.threshold ?? '?'}`;
        return got === R.approvals ? PASS(got) : FAIL(`${got}, not ${R.approvals}`);
      }),
    },
    {
      id: 'standing', group: 'recovery',
      label: 'Where it stands agrees with the record',
      run: (ctx) => withRecovery(ctx, (rec, d) => {
        const retired = d.identities[rec.idCommit]?.retired;
        if (R.finalize) return retired ? PASS('finalized, as the record says: the old commitment is retired') : FAIL('the record says finalized, but the old commitment is not retired');
        if (retired) return PASS('finalized after the record was written: the old commitment is retired');
        if (rec.killed) return FAIL('vetoed, which the record does not say');
        return PASS('open, not vetoed, the old commitment still current: as the record says');
      }),
    },
  ];

  // The counts in the block of the contract's last recorded call: the state right after the run.
  // What anyone did since is said after them, as news, not as a mismatch.
  const countsCheck = (key, final, label) => {
    const c = contractByKey[key];
    const block = blockNo(c.last.blockHeight);
    const name = (k) => COUNT_LABEL[k] ?? k;
    return {
      id: `counts-${key}`, group: 'story',
      label,
      run: async (ctx) => {
        const r = decodedOf(await ctx.readAt(c, c.last.blockHeight));
        if (!r) return FAIL(`the indexer holds no action of it in block ${block}, where the record’s last call is`);
        const then = r.decoded.counts;
        const off = Object.keys(final).filter((k) => then[k] !== final[k]);
        if (off.length) return FAIL(`after its last recorded call, in block ${block}: ${off.map((k) => `${name(k)} ${then[k]}, recorded ${final[k]}`).join('; ')}`);
        const counts = Object.entries(final).map(([k, v]) => `${name(k)} ${v}`).join(' · ');
        // Now, for the news: the state the other rows read (a failure here takes nothing from the match).
        const now = await ctx.read(c).catch(() => null);
        const moved = now?.decoded ? Object.keys(final).filter((k) => now.decoded.counts[k] !== final[k]) : [];
        return PASS(`${counts}, after its last recorded call, in block ${block}`
          + (moved.length ? `. Called since the run: now ${moved.map((k) => `${name(k)} ${now.decoded.counts[k]}`).join(', ')}` : ''));
      },
    };
  };
  const storyChecks = [
    countsCheck('story', STORY_FINAL.lantern, 'Lantern’s public counts are the ones the whole story ends with'),
    countsCheck('host', STORY_FINAL.host, 'The host’s public counts are the ones the whole story ends with'),
  ];

  const txChecks = RECORDED_TXS.map((x, i) => ({
    id: `tx-${i}`, group: 'txs', contract: x.contract,
    label: x.action === 'call' ? x.circuit : x.label,
    where: contractByKey[x.contract].name,
    run: async (ctx) => {
      const t = await ctx.tx(x.tx.txId);
      if (!t) return FAIL(`${shortHex(x.tx.txId)} is not on chain`);
      if (t.hash !== x.tx.txHash) return FAIL(`its hash is ${shortHex(t.hash)}, not the recorded ${shortHex(x.tx.txHash)}`);
      if (t.height !== x.tx.blockHeight) return FAIL(`in block ${blockNo(t.height)}, not ${blockNo(x.tx.blockHeight)}`);
      if (t.status !== 'success') return FAIL(`it ended ${t.status ?? 'without a result'}`);
      const carries = t.actions.some((a) => a.address === x.address && a.kind === x.action && (x.action !== 'call' || a.entryPoint === x.circuit));
      return carries ? PASS(`block ${blockNo(t.height)}`) : FAIL(`block ${blockNo(t.height)}, but it does not carry this ${x.action} on ${shortHex(x.address)}`);
    },
  }));

  return [...contractChecks, ...recoveryChecks, ...storyChecks, ...txChecks];
}

const CHECKS = buildChecks();
const FACTS = CHECKS.length - RECORDED_TXS.length;
const GROUPS = [
  ['contracts', 'The three contracts'],
  ['recovery', 'The shipped recovery'],
  ['story', 'The whole story’s last counts'],
  ['txs', `Every recorded transaction · ${RECORDED_TXS.length}`],
];
const FILES = Object.values(FILE_OF).filter((f, i, a) => a.indexOf(f) === i).join(' and ');
const SAY = { pass: 'matches', fail: 'does not match', error: 'could not be checked', running: 'checking', todo: 'not checked yet' };

function Row({ check, result }) {
  const state = result?.state ?? 'todo';
  return (
    <li className={`lv-check ${state}`} data-state={state}>
      <span className="lv-mark" aria-hidden="true" />
      <span className="lv-check-body">
        <span className="lv-check-label">{check.label}<span className="sr-only">: {SAY[state]}</span></span>
        {result?.detail ? <span className="lv-check-detail">{result.detail}</span> : null}
      </span>
    </li>
  );
}

/** A circuit's name, free to wrap only where its words join (requireCurrent|Owner|Attested). */
const Camel = ({ name }) => name.split(/(?=[A-Z])/).map((w, i) => (i ? <Fragment key={i}><wbr />{w}</Fragment> : w));

function TxCell({ check, result }) {
  const state = result?.state ?? 'todo';
  return (
    <li className={`lv-check lv-tx-check ${state}`} data-state={state}>
      <span className="lv-mark" aria-hidden="true" />
      <span className="lv-check-body">
        <span className="lv-check-label"><code><Camel name={check.label} /></code><span className="sr-only"> on {check.where}: {SAY[state]}</span></span>
        {result?.detail ? <span className="lv-check-detail">{result.detail}</span> : null}
      </span>
    </li>
  );
}

/** The summary once every fact has an answer. */
function summary(results) {
  const all = Object.values(results);
  const pass = all.filter((r) => r.state === 'pass').length;
  const fail = all.filter((r) => r.state === 'fail').length;
  const errors = all.filter((r) => r.state === 'error');
  const reader = errors.filter((r) => r.kind === 'reader').length;
  const other = errors.length - reader;
  if (!fail && !errors.length) return `All ${CHECKS.length} checks match the chain.`;
  return `${pass} of ${CHECKS.length} checks match the chain`
    + (fail ? `; ${fail} ${plural(fail, 'does', 'do')} not` : '')
    + (reader ? `; ${reader} could not be checked (the reader did not run in this browser)` : '')
    + (other ? `; ${other} could not be checked (the indexer gave no usable answer): try again` : '')
    + '.';
}

export default function Check() {
  const [results, setResults] = useState({});
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const run = useRef(0);
  const ctl = useRef(null);
  // Leaving the page stops the check: no question is asked of the indexer after that.
  useEffect(() => () => ctl.current?.abort(), []);

  const start = useCallback(async () => {
    const mine = ++run.current;
    ctl.current?.abort();
    const { signal } = (ctl.current = new AbortController());
    setResults({});
    setPhase('running');
    const reads = {};
    const txs = {};
    /** A state from the indexer, read with the contract's own reader. */
    const decode = async (c, s) => {
      if (!s) return null;
      let decoded = null;
      try {
        const d = await loadDecoder();
        decoded = c.kind === 'host' ? await d.decodeHost(s.state) : await d.decodeLantern(s.state);
      } catch { /* each row that needs the state says it could not be checked */ }
      return { action: s.action, decoded };
    };
    const ctx = {
      read: (c) => (reads[c.key] ??= contractState(c.address, { signal }).then((s) => decode(c, s))),
      readAt: (c, height) => (reads[`${c.key}@${height}`] ??= contractStateAt(c.address, height, { signal }).then((s) => decode(c, s))),
      tx: (id) => (txs[id] ??= transactionById(id, { signal })),
    };
    await pool(CHECKS, 4, (c) => {
      if (run.current === mine) setResults((s) => ({ ...s, [c.id]: { state: 'running' } }));
      return c.run(ctx);
    }, (i, r, e) => {
      if (run.current !== mine || signal.aborted) return;
      const id = CHECKS[i].id;
      const res = e ? { state: 'error', kind: e?.kind ?? null, detail: whyNot(e) } : { state: r.ok ? 'pass' : 'fail', detail: r.detail };
      setResults((s) => ({ ...s, [id]: res }));
    }, { signal });
    if (run.current === mine && !signal.aborted) setPhase('done');
  }, []);

  const doneCount = Object.values(results).filter((r) => r.state !== 'running').length;
  const running = phase === 'running';

  return (
    <div className="lv-checker" data-phase={phase}>
      <p className="lv-check-go">
        {/* aria-disabled, not disabled, while it runs: the button keeps the focus it was pressed with. */}
        <button type="button" className={phase === 'idle' ? 'primary' : undefined} onClick={() => { if (!running) start(); }} aria-disabled={running ? 'true' : undefined}>
          {phase === 'idle' ? 'Check it against the chain' : running ? 'Checking…' : 'Check again'}
        </button>
        {/* One announcement as it starts and one with the summary: the running count is for the eye
            only, or a screen reader would hear it up to 74 times. */}
        <span className="lv-progress" role="status" data-testid="check-summary">
          {phase === 'idle' ? `${RECORDED_TXS.length} transactions and ${FACTS} facts about the three contracts and the recovery, from ${FILES}, each looked up on the public indexer.`
            : running ? <><span aria-hidden="true">{doneCount} of {CHECKS.length} checked</span><span className="sr-only">Checking {RECORDED_TXS.length} transactions and {FACTS} facts against the chain…</span></>
            : summary(results)}
        </span>
      </p>
      {phase !== 'idle' ? (
        <div className="lv-check-groups">
          {GROUPS.map(([g, title]) => (
            <section key={g} className={`lv-check-group ${g}`} aria-label={title}>
              <h3>{title}</h3>
              {g === 'txs' ? CONTRACTS.map((c) => {
                const mine = CHECKS.filter((x) => x.group === 'txs' && x.contract === c.key);
                return (
                  <div key={c.key} className="lv-tx-contract">
                    <h4 id={`lv-tx-${c.key}`}>{c.name} · {mine.length}</h4>
                    <ul className="lv-check-list lv-tx-grid" aria-labelledby={`lv-tx-${c.key}`}>
                      {mine.map((x) => <TxCell key={x.id} check={x} result={results[x.id]} />)}
                    </ul>
                  </div>
                );
              }) : (
                <ul className="lv-check-list">
                  {CHECKS.filter((x) => x.group === g).map((x) => <Row key={x.id} check={x} result={results[x.id]} />)}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
