// The first thing on every page that runs circuits. It says exactly what this page is and is not.
export function Honesty() {
  return (
    <aside className="honesty" aria-label="What this page is">
      <p>
        <strong>Runs in your browser.</strong> Lantern’s real compiled circuits against an in-memory ledger:
        no wallet, no chain, no proofs. Every accept and every refusal is the contract’s own logic.
        Once it has loaded, this page makes no network requests — check DevTools, or build it yourself.
      </p>
      <p className="meta">Real proofs and real transactions on a local chain: <code>npm run devnet</code>.</p>
    </aside>
  );
}

// "Recorded on a local chain": what that run did (the committed record, deployments/local-devnet.json),
// drawn on /about as a certificate. Lacquer inside a double Hanji rule, a closed seal pressed into its
// corner, the text running round it; its figures in mono. /about loads it after the page, with the
// record and the seal, so none of the three is on the first load; both come in as props, so this
// file, which /demo and /attacks load for the strip above, imports neither.
export function Recorded({ record, Seal }) {
  const s = record.summary;
  const sponsored = record.steps.filter((x) => x.sponsorship).length;
  const circuits = new Set(record.steps.filter((x) => x.tx?.txId).map((x) => x.circuit)).size;
  return (
    <section className="panel recorded" aria-label="Recorded on a local chain">
      <Seal state="closed" size={80} className="recorded-seal" />
      <p className="eyebrow">Recorded on a local chain</p>
      <h2>The same story, with <em>real</em> proofs</h2>
      <div className="recorded-body">
        <p>
          On {record.recordedAt.slice(0, 10)}, <code>npm run devnet</code> ran all {s.steps} steps of this story. Its
          contract calls went to a local Midnight node: {s.accepted} accepted and {s.refused} refused, exactly as
          expected, in {s.transactions} real transactions across {circuits} circuits of two contracts. {sponsored} of
          them came from a phone holding no wallet, paid for by a sponsor. The other {s.steps - s.accepted - s.refused}{' '}
          steps happen off chain.
        </p>
        <dl className="counts">
          <div><dt>proofs, median</dt><dd>{s.proveSeconds.median} s</dd></div>
          <div><dt>proofs, range</dt><dd>{s.proveSeconds.min}–{s.proveSeconds.max} s</dd></div>
          <div><dt>call to finalized, median</dt><dd>{s.callToFinalizedSeconds.median} s</dd></div>
          <div><dt>machine</dt><dd>{record.machine.cpuModel ?? record.machine.platform}</dd></div>
        </dl>
        <p className="meta">
          The record is <code>deployments/local-devnet.json</code>. It was written only because every step went as
          expected. While the chain that produced it runs, <code>npm run devnet:verify</code> re-checks it against that chain;
          offline, <code>npm test</code> checks the record against the story (<code>test/record.test.js</code>). The chain
          ran Lantern with one line changed — a 60-second timelock in place of 72 hours — and every other verifier key
          identical to the shipped build’s.
        </p>
      </div>
    </section>
  );
}
