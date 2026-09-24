import { Link } from '../lib/router.jsx';
// The committed record of a real run on a local chain, read at build time.
import record from '../../../deployments/local-devnet.json' with { type: 'json' };

export default function About() {
  return (
    <section className="page narrow about">
      <header className="page-head">
        <p className="eyebrow">What is real, and where</p>
        <h1>Nothing here is a mock-up</h1>
        <p className="lede">
          Every accept and refusal on this site comes from Lantern’s compiled Compact contract. What differs
          between the places you can run it is what surrounds the circuits.
        </p>
      </header>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="What is real, and where">
        <table className="real">
          <thead>
            <tr><th scope="col">Where</th><th scope="col">Circuits</th><th scope="col">Ledger</th><th scope="col">Zero-knowledge proofs</th><th scope="col">Fees</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">This site</th><td>the compiled contract’s generated JavaScript</td><td>in memory, in your browser</td><td>none</td><td>none</td></tr>
            <tr><th scope="row"><code>npm test</code>, <code>npm run story</code></th><td>the same modules</td><td>in memory</td><td>none</td><td>none</td></tr>
            <tr><th scope="row"><code>npm run devnet</code></th><td>the same source, compiled with one constant changed: a 60-second timelock instead of 72 hours</td><td>a local Midnight node and indexer</td><td>real, from a local proof server</td><td>real DUST</td></tr>
          </tbody>
        </table>
      </div>

      <Recorded />

      <h2 className="section">Run it yourself</h2>
      <pre className="code" tabIndex={0} aria-label="Commands"><code>{`npm install && npm test      # no toolchain, no Docker
npm run story                # the recovery, in a terminal
npm run attack               # the four-design attack
npm run web:install && npm run web   # Node 22.12 or later
npm run devnet               # real proofs on a local chain (Docker, Node 24 or later, compact 0.31.1)
npm run devnet:verify        # re-check that chain against the record`}</code></pre>

      <h2 className="section">What it does not claim</h2>
      <ul className="plain">
        <li>It cannot stop <em>t</em> guardians who collude from taking the identity. It gives you 72 hours of public notice and a veto they cannot hold.</li>
        <li>Until a recovery finalizes, whoever holds the lost device’s secret can act as you. The recovery ends that.</li>
        <li>An open recovery is public: it tells the world an identity’s owner may have lost a key.</li>
      </ul>
      <p>The full threat model, with every limitation and its bound, is <code>SECURITY.md</code> in the repository. The assumptions behind this site and the local-chain runner are tested in <code>docs/spikes.md</code>.</p>
      <p><Link to="/demo">Watch a recovery</Link> · <Link to="/attacks">Try to find the guardians</Link></p>
    </section>
  );
}

function Recorded() {
  const s = record.summary;
  const sponsored = record.steps.filter((x) => x.sponsorship).length;
  const circuits = new Set(record.steps.filter((x) => x.tx?.txId).map((x) => x.circuit)).size;
  return (
    <section className="panel recorded" aria-label="Recorded on a local chain">
      <p className="eyebrow">Recorded on a local chain</p>
      <h2>The same story, with real proofs</h2>
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
    </section>
  );
}
