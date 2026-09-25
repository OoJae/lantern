import { useEffect, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { Honesty } from '../components/Honesty.jsx';
import { TargetTable } from '../components/TargetTable.jsx';
// This page is a lazy chunk of its own, so the pictograms' drawings load with it and never on the
// first load.
import { Pictogram } from '../brand/Pictogram.jsx';

export default function Attacks() {
  const [e, setE] = useState(null);
  useEffect(() => {
    let cancelled = false;
    import('../lib/engine.js').then((engine) => { if (!cancelled) setE(engine.runEnumeration()); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="page attacks" data-ready={e ? 'true' : undefined}>
      <Honesty />
      <header className="page-head">
        <p className="eyebrow"><code>npm run attack</code>, in your browser</p>
        <h1>One attacker, <em>four</em> guardian designs</h1>
        <p className="lede">
          The attacker gets the public ledger of each contract and an address book of 64 people close to the
          victim — nothing else. The same three people are guardians in every design. Three designs give them up.
        </p>
      </header>

      {!e && <p className="loading" role="status">Building the four ledgers and running the attack…</p>}
      {e && <>
        <TargetTable enumeration={e} />
        <p className="verdict-line" data-ok={String(e.ok)}>
          {e.results.filter((x) => x.verdict === 'BROKEN').length} of 4 broken. The one that <em>held</em> is the one
          Lantern ships.
        </p>

        <div className="cards">
          {e.results.map(({ t, r, verdict }) => (
            <article key={t.view.id} className={`card ${verdict === 'HELD' ? 'held' : 'broken'}`}>
              {/* The designs that broke: guardians' lanterns with name tags. The one that held: three
                  lights, and no names. */}
              <Pictogram name={verdict === 'HELD' ? 'attacks-held' : 'attacks-named'} className="card-art" />
              <h2>{t.view.label.trim()}</h2>
              <p className="scheme"><code>{t.view.scheme}</code></p>
              <p className="meta">{EXPLAIN[t.view.id]}</p>
              <div className="tries">
                <ul className="families">
                  {r.families.map((f) => (
                    <li key={f.name}><code>{f.name.replace(/\s{2,}/g, ' · ')}</code><span className={f.hits ? 'hit' : undefined}>{f.probes} probes → {f.hits} hit{f.hits === 1 ? '' : 's'}</span></li>
                  ))}
                </ul>
                {r.named.size > 0 && (
                  <p className="named">
                    <span className="named-head">Named:</span>{' '}
                    {[...r.named].map((n, i, all) => (
                      <span key={n} className="named-tag">{n}{i < all.length - 1 && <span className="sr-only">, </span>}</span>
                    ))}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>

        <section className="spread lesson">
          <h2 className="section">The lesson</h2>
          <p className="lede">
            A commitment hides exactly the entropy in its preimage that is not already on chain, and not one bit
            more. Design 2b salts its commitment with 32 bytes — derived from public data, so the salt multiplies
            the attacker’s work by the slot range and by nothing else. Lantern’s leaf commits to a guardian secret
            that is not a function of who the guardian is. Handed the real names, the attacker still cannot confirm one.
          </p>
        </section>

        <section className="spread reveals">
          <h2 className="section">What the shipped contract still reveals</h2>
          <p className="meta">Every field of the ledger, measured from the same view the attacker had. The reasoning for each field is in <code>src/attack/leaks.mjs</code>; the three that matter most are in <code>SECURITY.md</code> §5.</p>
        </section>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="What the shipped contract still reveals">
          <table className="leaks">
            <thead><tr><th scope="col">Severity</th><th scope="col">Field</th><th scope="col">What it reveals</th><th scope="col">Measured</th></tr></thead>
            <tbody>
              {e.leaks.map((l, i) => (
                // The first row of each severity starts a rung of the ladder.
                <tr key={l.field} data-field={l.field} data-sev={l.sev.toLowerCase()} className={i === 0 || e.leaks[i - 1].sev !== l.sev ? 'rung' : undefined}>
                  <td data-label="Severity"><span className={`sev ${l.sev.toLowerCase()}`}>{l.sev}</span></td>
                  <td className="ledger-field" data-label="Field"><code>{l.field}</code></td>
                  <td className="what" data-label="What it reveals">{l.what}</td>
                  <td className="measured" data-label="Measured"><code>{l.measured}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="meta footnote">The deliberately insecure designs are compiled for this page and never deployed anywhere. <Link to="/about">What is real, and where</Link>.</p>
      </>}
    </section>
  );
}

const EXPLAIN = {
  1: 'The common EVM social-recovery pattern: guardian identifiers kept in contract storage, in the clear. No hashing at all.',
  '2a': 'A first pass at hiding them: hash the guardian’s identifier with the owner. One hash per name in the address book finds them.',
  '2b': 'A careful first pass: a real commitment with a 32-byte salt — derived from the owner and a slot number, so a stateless client can recompute it. So can the attacker.',
  3: 'Lantern: the leaf commits to a 32-byte guardian secret and a salt, delivered out of band. Nothing in the preimage is a function of who the guardian is.',
};
