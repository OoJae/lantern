// "Check your backup": the owner types the veto card back in from paper, and the page checks the words
// the way the contract checks a veto card: the secret they carry, with the salt derived from it, must
// open this identity's veto commitment. A dry run, as Trezor and Casa offer for a seed backup. While the
// words are being typed, the card on screen is covered, so it is checked against the paper and not
// copied from the screen.
//
// Typing a card's words into a website is how seed phrases are stolen, so the form says, above the
// box, that only a practice card belongs in it; and what was typed is cleared when the page is left, so
// a browser's session restore never writes it to disk.
import { useEffect, useId, useRef, useState } from 'react';
import { readWords, WORDLIST } from '../../../src/words.js';
import { KitError, CHECK_WORDS } from '../../../src/kit.js';
import { CheckWords } from './Sheets.jsx';

// Any refusal not named here (a version tag, a label typed twice) has its own message, under this title.
const REFUSED = 'These words cannot be read as a veto card.';
const RESULTS = {
  pass: 'Your card is right.',
  other: 'Good words, but not this card.',
  'unknown-word': 'A word is not on the list.',
  'word-count': 'Not 24 words.',
  checksum: 'The words do not check out.',
  check: 'The check words disagree.',
  'not-a-secret': 'These words make no veto secret.',
};

function explain(code, typed) {
  const { words, unknown } = readWords(typed);
  switch (code) {
    case 'unknown-word': {
      const { at, word } = unknown[0] ?? {};
      return `Word ${at}, “${word}”. Check its spelling: the first four letters of a word are enough.`;
    }
    case 'word-count':
      return `That is ${words.length} word${words.length === 1 ? '' : 's'}. The card has 24, then its 3 check words if you add them.`;
    case 'checksum':
      return 'One is wrong, or two are swapped. The last word carries a checksum over all 24, so a slip is caught before anything is compared.';
    case 'check':
      return 'The 24 words pass their checksum, but the three check words after them do not match them: a word is wrong in a way the checksum missed (about 1 slip in 256), or a check word is. Look again at both.';
    case 'not-a-secret':
      return 'They pass as words, but name a number too large to be a veto secret.';
    default:
      return '';
  }
}

const sentence = (m) => (/[.!?]$/.test(m) ? m : `${m}.`);

// Try it without paper: the card's own words, typed in by the page, whole or with a slip.
function slipped(words, how) {
  const w = [...words];
  const at = Math.floor(Math.random() * 23);
  if (how === 'swap') {
    let i = at;
    while (w[i] === w[i + 1]) i = (i + 1) % 23;
    [w[i], w[i + 1]] = [w[i + 1], w[i]];
  } else if (how === 'change') {
    w[at] = WORDLIST[(WORDLIST.indexOf(w[at]) + 1 + Math.floor(Math.random() * 2046)) % 2048];
  }
  return w.join(' ');
}

/**
 * @param card       the veto card on this page (src/kit.js buildVetoCard)
 * @param vetoCommit this identity's veto commitment, hex
 * @param check      (typed, vetoCommit) => { opens, check, checked }: the engine's checkVetoWords
 * @param onCover    (covered: boolean) => void
 */
export function BackupCheck({ card, vetoCommit, check, onCover }) {
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState(null);
  const id = useId();
  const box = useRef(null);
  const { words, unknown } = readWords(typed);
  // 27 is the card and its check words, as the hint below invites: counted as that, not as 27 of 24.
  const withCheck = words.length === 24 + CHECK_WORDS;

  // Leaving the page forgets what was typed: the field is emptied before the browser can save it.
  useEffect(() => {
    const forget = () => {
      if (box.current) box.current.value = '';
      setTyped('');
      setResult(null);
      onCover(false);
    };
    window.addEventListener('pagehide', forget);
    return () => window.removeEventListener('pagehide', forget);
  }, [onCover]);

  const update = (text, next = null) => {
    setTyped(text);
    setResult(next);
    onCover(text.trim() !== '' && next?.kind !== 'pass');
  };

  const run = (text) => {
    let next;
    try {
      const r = check(text, vetoCommit);
      next = r.opens
        ? { kind: 'pass', check: r.check, checked: r.checked }
        : { kind: 'other', check: r.check, checked: r.checked };
    } catch (e) {
      if (!(e instanceof KitError)) throw e;
      next = { kind: e.code, detail: explain(e.code, text) || sentence(e.message) };
    }
    update(text, next);
  };

  const submit = (e) => {
    e.preventDefault();
    run(typed);
  };

  const sameCheck = result?.check && result.check.join(' ') === card.check.join(' ');

  return (
    <div className="kit-backup">
      <form className="kit-form" onSubmit={submit} noValidate>
        <p className="kit-warn" id={`${id}-warn`} data-testid="kit-warn">
          <strong>Only practice cards belong here.</strong> Type a real veto card only into your own Lantern app,
          on your own device, never into a website. A site that asks for your card’s words is stealing it.
        </p>
        <label className="kit-field-label" htmlFor={`${id}-typed`}>Your veto card’s words, from paper</label>
        <textarea
          ref={box}
          id={`${id}-typed`}
          className="kit-typed"
          rows={4}
          value={typed}
          onChange={(e) => update(e.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          translate="no"
          aria-describedby={`${id}-warn ${id}-count ${id}-hint`}
        />
        <p className="kit-count" id={`${id}-count`} data-count={words.length}>
          {withCheck
            ? <><span className="kit-count-n">24</span> of 24 words · <span className="kit-count-n">3</span> check words</>
            : <><span className="kit-count-n">{Math.min(words.length, 99)}</span> of 24 words</>}
          {unknown.length > 0 && <> · <span className="kit-count-bad">“{unknown[0].word}” is not on the list</span></>}
        </p>
        <p className="meta" id={`${id}-hint`}>
          The first four letters of each word are enough. Numbers, commas and capitals are ignored. Add the three
          check words at the end if you like.
        </p>
        <div className="kit-row">
          <button type="submit" className="primary" disabled={typed.trim() === ''}>Check the words</button>
        </div>
      </form>

      <div className="kit-try" role="group" aria-labelledby={`${id}-try`}>
        <p className="kit-field-label" id={`${id}-try`}>No paper to hand? Let the page type it in:</p>
        <div className="kit-row">
          <button type="button" onClick={() => run(slipped(card.words, 'none'))}>The card, as printed</button>
          <button type="button" onClick={() => run(slipped(card.words, 'change'))}>With one word changed</button>
          <button type="button" onClick={() => run(slipped(card.words, 'swap'))}>With two words swapped</button>
        </div>
      </div>

      <div className="kit-result" role="status" data-result={result?.kind ?? 'none'}>
        {result && (
          <>
            <p className="kit-result-title">{RESULTS[result.kind] ?? REFUSED}</p>
            {result.kind === 'pass' && (
              <p>Its words open this identity’s veto commitment, which is the check the contract makes before it accepts a veto.</p>
            )}
            {result.kind === 'other' && (result.checked
              ? <p>These words and their check words agree, but they make another identity’s veto secret: they are from another card.</p>
              : <p>These words make a veto secret, but not this identity’s: either a word is wrong in a way the checksum missed (about 1 slip in 256), or they are from another card. Add the three check words to tell which.</p>)}
            {result.detail && <p>{result.detail}</p>}
            {result.check && (
              <p className="kit-result-check">
                Check words from what you typed: <CheckWords words={result.check} />
                {sameCheck ? ', the same as on the card.' : ', not the ones on this card.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
