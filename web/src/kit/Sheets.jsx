// The papers /kit prints: the owner's veto card, and one kit per guardian. Drawn as paper on screen
// (the inverted .paper scope: Hanji, Night ink) and printed one to a page (styles/kit.css).
//
// Kept folded in half, edge to edge, printed side in, with only a name written on the blank outside.
// A half fold hides the whole printed side whatever the paper (A4 or US Letter) and however long the
// sheet runs, which a printed fold line cannot promise: a guardian kit's three sets of words run well
// past the middle of the page. So no sheet prints a fold line; each says how to fold it instead, and
// each prints on one page (e2e/kit.spec.js holds both).
//
// The class names .kit-outside and .kit-inside are older than that rule: .kit-outside is the part above
// the words (who the sheet is for, what it does, the guardian's script), .kit-inside the words.
import { Fragment } from 'react';
import { contextLabel } from '../../../src/kit.js';
import { GUARDIAN_SCRIPT, NEVER_SHARE } from './copy.js';
import './word-grid.css';

/** 24 words (or 3), numbered, in reading order: across, then down. */
export function WordGrid({ words, labelledBy, className = '' }) {
  return (
    <ol className={`kit-grid ${className}`.trim()} aria-labelledby={labelledBy} translate="no">
      {words.map((w, i) => (
        <li key={i}><span className="kit-n" aria-hidden="true">{i + 1}</span><span className="kit-w" lang="en">{w}</span></li>
      ))}
    </ol>
  );
}

/**
 * Three check words on one line, "artist · just · valley": each word keeps the dot after it, so a
 * narrow line breaks between words, and a line never starts with a dot.
 */
export function CheckWords({ words }) {
  return (
    <span className="kit-cws" translate="no" lang="en">
      {words.map((w, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span className="kit-cw">{w}{i < words.length - 1 && <span aria-hidden="true"> ·</span>}</span>
        </Fragment>
      ))}
    </span>
  );
}

function Check({ words }) {
  return (
    <div className="kit-checkline">
      <p className="kit-label">Check words</p>
      <p className="kit-check-words"><CheckWords words={words} /></p>
      <p className="kit-small">A device you type this into shows the same three words. If they differ, a word went in wrong.</p>
    </div>
  );
}

function Head({ kind, title, aside, practice, id }) {
  return (
    <header className="kit-sheet-head">
      <p className="kit-kind">
        <span className="kit-brand">Lantern</span> <span aria-hidden="true">·</span> {kind}
        {practice && <> <span aria-hidden="true">·</span> practice</>}
      </p>
      <h3 className="kit-title" id={id}>{title}</h3>
      {practice && <p className="kit-practice">Practice: protects nothing</p>}
      {aside && <p className="kit-aside">{aside}</p>}
    </header>
  );
}

// How to keep a sheet: in words, where a fold line used to be.
function Fold() {
  return (
    <p className="kit-fold">
      <span className="kit-label">To keep it</span>{' '}
      Fold it in half, edge to edge, printed side in. Write whose it is on the blank outside, never the words.
    </p>
  );
}

function Never() {
  return <p className="kit-never">{NEVER_SHARE}</p>;
}

export function VetoSheet({ card, covered, id, practice = true }) {
  return (
    <article className="kit-sheet paper" data-sheet="veto" aria-labelledby={`${id}-title`}>
      <div className="kit-outside">
        <Head kind="Veto card" practice={practice} id={`${id}-title`} title="Your veto card" aside="Keep it apart from your phone and laptop." />
        <p className="kit-lead">
          Every recovery of your identity waits 72 hours where anyone can see it. This card cancels one you did
          not ask for. Adding or replacing a guardian needs it too. Nobody else holds it: not your guardians,
          not Lantern.
        </p>
        <Fold />
      </div>
      <div className="kit-inside" data-covered={String(Boolean(covered))}>
        <h4 className="kit-label" id={`${id}-words`}>Veto words</h4>
        <WordGrid words={card.words} labelledBy={`${id}-words`} className="kit-grid-lg" />
        <Check words={card.check} />
        <Never />
        {covered && <p className="kit-cover">Covered while you check your backup</p>}
      </div>
      <footer className="kit-foot">
        <p className="kit-expires">After a recovery, make a new veto card: this one stops working.</p>
        <p><code>{card.version}</code> · {practice ? 'A practice card: no identity is enrolled with it.' : 'Keep it until you replace it.'}</p>
      </footer>
    </article>
  );
}

export function GuardianSheet({ kit, id }) {
  const { threshold: t, guardians: n, share: x } = kit;
  const practice = kit.network === 'practice';
  const section = (key, label, words, note) => (
    <div className="kit-section">
      <h4 className="kit-label" id={`${id}-${key}`}>{label}</h4>
      <WordGrid words={words} labelledBy={`${id}-${key}`} />
      <p className="kit-small">{note}</p>
    </div>
  );
  return (
    <article className="kit-sheet paper" data-sheet={`kit-${x}`} aria-labelledby={`${id}-title`}>
      <div className="kit-outside">
        <Head kind="Guardian kit" practice={practice} id={`${id}-title`} title={`Share ${x} of ${n}`}
          aside={`Any ${t} of the ${n} guardians can recover the identity. Fewer learn nothing.`} />
        <p className="kit-for"><span className="kit-label">Kept for</span><span className="kit-blank" aria-hidden="true" /></p>
        <div className="kit-script" role="note" aria-labelledby={`${id}-script`}>
          <p className="kit-label" id={`${id}-script`}>Before you approve</p>
          <p className="kit-small">When you are asked to approve a recovery, the Lantern app shows six words for the new device.</p>
          <blockquote className="kit-quote"><p>{GUARDIAN_SCRIPT}</p></blockquote>
        </div>
        <Fold />
      </div>
      <div className="kit-inside">
        {section('secret', 'Guardian secret', kit.words.guardianSecret, 'With the leaf salt, it proves you are one of the guardians, without saying which one.')}
        {section('salt', 'Leaf salt', kit.words.leafSalt, 'Keep it with the guardian secret: one is no use without the other.')}
        {section('share', `Share ${x}`, kit.words.share, 'Your part of the identity secret. Give it only to the device whose six words the owner read to you, and only after you have approved its recovery.')}
        <Check words={kit.check} />
        <Never />
      </div>
      <footer className="kit-foot">
        {/* Each value as the kit's text form spells it, so what is printed can be typed back in. */}
        <dl className="kit-public">
          <div><dt>Network</dt><dd>{kit.network}</dd></div>
          <div><dt>Contract</dt><dd><code>{kit.contract ?? 'none'}</code></dd></div>
          <div><dt>Identity</dt><dd><code>{kit.identity}</code></dd></div>
          <div><dt>Guardian context</dt><dd>{kit.context === kit.identity ? contextLabel(kit) : <code>{contextLabel(kit)}</code>}</dd></div>
        </dl>
        <p className="kit-expires">After a recovery, or once the owner replaces the guardians, this kit stops working: the owner makes new ones.</p>
        <p><code>{kit.version}</code> · {practice ? 'A practice kit: no identity is enrolled with it.' : 'Keep it until the owner replaces it.'}</p>
      </footer>
    </article>
  );
}
