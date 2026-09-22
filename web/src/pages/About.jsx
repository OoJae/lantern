import { Link } from '../lib/router.jsx';

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

      <h2 className="section">Run it yourself</h2>
      <pre className="code" tabIndex={0} aria-label="Commands"><code>{`npm install && npm test      # no toolchain, no Docker
npm run story                # the recovery, in a terminal
npm run attack               # the four-design attack
npm run web:install && npm run web`}</code></pre>

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
