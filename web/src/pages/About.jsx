import { lazy, Suspense } from 'react';
import { Link } from '../lib/router.jsx';

// "Recorded on a local chain", the certificate, is drawn after the page, and never on the first load
// (which every page, the landing included, downloads): its words (components/Honesty.jsx, beside the
// strip that points to the same run), the committed record of that run, read at build time, and the
// seal that stamps it arrive together. /demo imports the same record and the same words, so after a
// visit there only the seal is new. Until they arrive, the certificate stands with its title and
// keeps room for the rest.
const Certificate = lazy(() => Promise.all([
  import('../components/Honesty.jsx'),
  import('../../../deployments/local-devnet.json'),
  import('../brand/Seal.jsx'),
]).then(([{ Recorded }, { default: record }, { Seal }]) => ({ default: () => <Recorded record={record} Seal={Seal} /> })));

const Pending = () => (
  <section className="panel recorded" aria-label="Recorded on a local chain">
    <span className="recorded-seal" />
    <p className="eyebrow">Recorded on a local chain</p>
    <h2>The same story, with <em>real</em> proofs</h2>
    <div className="recorded-body" aria-busy="true" />
  </section>
);

// Each command and what it is for: a code block whose comments are set apart, and which, where the
// two do not fit side by side, puts each comment under its command rather than out of sight.
const COMMANDS = [
  ['npm install && npm test', 'no toolchain, no Docker'],
  ['npm run story', 'the recovery, in a terminal'],
  ['npm run attack', 'the four-design attack'],
  ['npm run web:install && npm run web', 'Node 22.12 or later'],
  ['npm run devnet', 'real proofs on a local chain (Docker, Node 24 or later, compact 0.31.1)'],
  ['npm run devnet:verify', 're-check that chain against the record'],
];

// The table's cells carry their column's name for the phone layout, where each row is a card that
// labels its own values (drawn by CSS, read as nothing: the table's headers still name every cell).
// A "none" is set back, so the table reads from nothing real to everything real.
const WHERE = ['Circuits', 'Ledger', 'Zero-knowledge proofs', 'Fees'];
const Cells = ({ values }) => values.map((v, i) => (
  <td key={WHERE[i]} data-label={WHERE[i]} className={v === 'none' ? 'none' : undefined}>{v}</td>
));

export default function About() {
  return (
    <section className="page narrow about">
      <header className="page-head">
        <p className="eyebrow">What is real, and where</p>
        <h1>Nothing here is a <em>mock-up</em></h1>
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
            <tr><th scope="row">This site</th><Cells values={['the compiled contract’s generated JavaScript', 'in memory, in your browser', 'none', 'none']} /></tr>
            <tr><th scope="row"><code>npm test</code>, <code>npm run story</code></th><Cells values={['the same modules', 'in memory', 'none', 'none']} /></tr>
            <tr className="chain"><th scope="row"><code>npm run devnet</code></th><Cells values={['the same source, compiled with one constant changed: a 60-second timelock instead of 72 hours', 'a local Midnight node and indexer', 'real, from a local proof server', 'real DUST']} /></tr>
          </tbody>
        </table>
      </div>

      <Suspense fallback={<Pending />}><Certificate /></Suspense>

      <section className="spread run">
        <h2 className="section">Run it yourself</h2>
        <pre className="code" tabIndex={0} aria-label="Commands"><code>{COMMANDS.map(([command, note]) => (
          [<span className="command" key={command}>{command}</span>, ' ', <span className="comment" key={note}># {note}</span>, '\n']
        ))}</code></pre>
      </section>

      <section className="spread claims">
        <h2 className="section">What it does not claim</h2>
        <div className="spread-body">
          <ul className="plain">
            <li>It cannot stop <em>t</em> guardians who collude from taking the identity. It gives you 72 hours of public notice and a veto they cannot hold.</li>
            <li>Until a recovery finalizes, whoever holds the lost device’s secret can act as you. The recovery ends that.</li>
            <li>An open recovery is public: it tells the world an identity’s owner may have lost a key.</li>
          </ul>
          <p>The full threat model, with every limitation and its bound, is <a href="https://github.com/OoJae/lantern/blob/main/SECURITY.md"><code>SECURITY.md</code></a> in the repository. The assumptions behind this site and the local-chain runner are tested in <a href="https://github.com/OoJae/lantern/blob/main/docs/spikes.md"><code>docs/spikes.md</code></a>.</p>
          <p className="onward"><Link to="/demo">Watch a recovery</Link> · <Link to="/attacks">Try to find the guardians</Link></p>
        </div>
      </section>
    </section>
  );
}
