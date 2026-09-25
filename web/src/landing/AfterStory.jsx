// The landing page after "Now watch the contract do it": one attacker and four guardian designs,
// how it holds (I to IV), and what is real. Normal flow, far below the first screen, so it loads as
// a chunk of its own after the first paint (pages/Landing.jsx), which keeps the first load in its
// budget. The styles are in styles/landing.css with the rest of the page.
import { useEffect, useRef } from 'react';
import { Link } from '../lib/router.jsx';
import Pictogram from '../brand/Pictogram.jsx';

const Arrow = () => <span className="arrow" aria-hidden="true">→</span>;

// The four designs the attacker reads (/attacks runs it; the landing only shows the outcome, which
// needs no runtime). The same three people are guardians in every design.
const NAMES = ['seo-yeon.example', 'mum.example', 'jihoon.example'];
const DESIGNS = [
  { id: '1', what: 'Names in the clear' },
  { id: '2a', what: 'Names hashed with the owner' },
  { id: '2b', what: 'A salt anyone can derive' },
  { id: '3', what: 'Lantern: a secret per guardian', held: true },
];

// The four facts the landing always carried, accuracy-checked; the blackout now carries the quote
// that opened the first.
const FACTS = [
  ['No recovery by default', 'On Midnight, private state lives on one device. A wallet seed restores keys, not state.'],
  ['Correct, not just authorised', 'Guardians approve a specific new device. After 72 hours, the device finalizes by proving the rebuilt secret opens the original commitment. A wrong secret — one tampered share — is refused.'],
  ['The guardians stay hidden', 'Each guardian is a salted commitment in a Merkle tree. An approval leaves an opaque nullifier and adds one to a public count: how many approved, never who. An attacker holding the ledger and the real names still cannot confirm who they are.'],
  ['Downstream apps keep working', 'A DApp stores one value, the identity root, and asks whether the caller is its current owner. The recovery retires the old secret there too, with nothing for the DApp to update: at once where the DApp reads Lantern’s ledger, and for an independently deployed DApp once its committee seals a snapshot taken after the recovery.'],
];
const NUMERALS = ['I', 'II', 'III', 'IV'];

// reveal(root, selector): the landing's own reveal observer (each [data-reveal] block unmasks the
// first time it comes into view), handed down so this chunk shares the page's code rather than
// the first load sharing a chunk with it.
export default function AfterStory({ reveal }) {
  const ref = useRef(null);
  // A fragment has no element of its own: observe the three sections through the first one's parent
  // (the landing), selecting only what this component drew.
  useEffect(() => reveal(ref.current.parentElement, '.attackers [data-reveal], .how-it-holds [data-reveal], [data-reveal].what-is-real'), [reveal]);
  return (
    <>
      <section className="attackers" aria-labelledby="attackers-title" ref={ref}>
        <div className="attackers-text" data-reveal="">
          <h2 id="attackers-title" className="rv">
            <span>One attacker, four guardian designs.</span> <span className="dek">Three designs give their guardians away.</span>
          </h2>
          <p className="rv">
            An attacker gets each design’s public ledger and an address book of 64 people close to Hana, and nothing
            else. Three designs give up every guardian. Lantern’s gives up none, even to an attacker holding the
            real names.
          </p>
        </div>
        <ol className="designs" data-reveal="">
          {DESIGNS.map((d) => (
            <li key={d.id} className={`design rv${d.held ? ' held' : ''}`}>
              <div className="design-art" aria-hidden="true">
                <Pictogram name={d.held ? 'attacks-held' : 'attacks-named'} className="pictogram" />
              </div>
              <p className="design-name"><span className="design-id">Design {d.id}</span> {d.what}</p>
              <p className="design-verdict">
                <span className="named-label">Named</span>
                {d.held ? <span className="named-none">none</span> : NAMES.map((n, i) => (
                  <span key={n} className="name-tag">{n}{i < NAMES.length - 1 && <span className="sr-only">,</span>}</span>
                ))}
              </p>
            </li>
          ))}
        </ol>
        <p className="attackers-go rv" data-reveal="">
          <Link to="/attacks" className="button primary">Try to find the guardians <Arrow /></Link>
        </p>
      </section>

      <section className="how-it-holds" aria-labelledby="holds-title">
        <h2 id="holds-title" className="holds-title" data-reveal=""><span className="rv">How it <em>holds</em></span></h2>
        <ol className="facts fact-list">
          {FACTS.map(([h, p], i) => (
            <li key={h} className="fact" data-reveal="">
              <span className="numeral rv" aria-hidden="true">{NUMERALS[i]}</span>
              <div className="fact-text">
                <h3 className="rv">{h}</h3>
                <p className="rv">{p}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="what-is-real" data-reveal="">
        <span className="rv">
          The same story also ran with real proofs, on a local chain and on Midnight’s public test network. <Link to="/about">What is real <Arrow /></Link>
        </span>
      </p>
    </>
  );
}
