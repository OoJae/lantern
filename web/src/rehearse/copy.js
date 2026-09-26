// The words of "Rehearse a recovery". The page writes what each step did and why the contract
// answered as it did; the answer itself, and every refusal message, is the compiled circuit's.

/** "Ara, Dad and Min-jun" */
export const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** "Ara’s, Dad’s and Min-jun’s" */
export const possessive = (xs) => list(xs.map((x) => `${x}’s`));

export const STEPS = Object.freeze([
  { key: 'choose', short: 'Choose', title: 'Choose your guardians',
    caption: 'Pick three to five people who would each keep one share of your identity secret, and how many of them it takes to bring it back.' },
  { key: 'enrol', short: 'Enrol', title: 'Enrol and deal the shares',
    caption: 'Your laptop enrols your identity and adds each guardian. Then it splits your secret into shares and deals each guardian a kit in words, off the ledger.' },
  { key: 'lose', short: 'Lose', title: 'Lose the laptop',
    caption: 'Lost, stolen or broken: the laptop goes, and your identity secret with it.' },
  { key: 'open', short: 'Open', title: 'A new phone opens a recovery',
    caption: 'The new phone holds no secret. It makes a device key and opens a recovery for it. Its six words are what your guardians will check.' },
  { key: 'decide', short: 'Approve', title: 'Each guardian decides',
    caption: 'Each guardian meets you, or calls you on a number they already had and hears a voice they know, and you read them your phone’s six words. Now be each guardian in turn: compare the words in their app with the ones you read, and approve or refuse.' },
  { key: 'window', short: 'Wait', title: 'Seventy-two hours',
    caption: 'Every recovery waits 72 hours where anyone can see it. Watch your identity: if a recovery is not yours, your veto card kills it.' },
  { key: 'finalize', short: 'Finalize', title: 'Finalize',
    caption: 'The phone rebuilds your secret from the shares it was sent, and the circuit checks that it opens the commitment you made when you enrolled.' },
  { key: 'record', short: 'Record', title: 'What the public record saw',
    caption: 'What the in-memory ledger holds after your rehearsal, and the calls that wrote it. Anyone can read all of it. No name is on it.' },
]);

export const stepIndex = (key) => STEPS.findIndex((s) => s.key === key);

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Why the contract answered as it did. Keyed by the contract's own message (or by the circuit, for an
 * accept), never by what the visitor meant to try, so a surprise is never explained as the expected
 * answer. `r` is the record, `w` the rehearsal.
 */
export function why(r, w) {
  const caller = r.tag === 'caller';
  const t = w.t;
  if (r.kind !== 'call') return null;
  // A veto kills one recovery, not the shares the caller was sent. With t of them he rebuilds the
  // identity secret, which opens your commitment until your own recovery finalizes and retires it: until
  // then he can act as you wherever your identity is accepted. The note follows the rehearsal as it is
  // now (the page asks again at every change), so it changes once yours finalizes.
  const sent = w.sharesAt('caller').length;
  const yoursDone = w.state.finalized === 'you';
  const actsAsYou = caller && sent >= t && !yoursDone;
  const untilYours = 'until your own recovery finalizes and retires it, he can act as you wherever your identity is accepted';
  if (r.outcome === 'accepted') {
    if (r.circuit === 'finalizeRecovery') {
      // The count the contract compared with the threshold, as it stood when the call was made.
      const got = r.approvals ?? t;
      const approvals = `${plural(got, 'approval')}${got > t ? ` (${t} needed)` : ''}`;
      return caller
        ? `Every check held for him: his own device, which the guardians who took his call approved; the 72 hours; ${approvals}; and your real secret, rebuilt from the shares they sent him. The contract cannot tell a fooled guardian from a careful one. Once they had approved, only your veto card could have stopped him.`
        : `Every check held: the approved device, the 72 hours, ${approvals} and a rebuilt secret that opens your original commitment. The same call retires the old commitment and enrols its successor, with a new veto card.`;
    }
    if (r.circuit === 'vetoRecovery') {
      if (!caller) return 'Your veto card opens your veto commitment, so the contract kills the recovery: your own, this time. It can never finalize now.';
      return `Only your veto card opens the veto commitment you made when you enrolled, and no guardian holds it. The caller’s recovery can never finalize now, whatever shares he holds.${actsAsYou
        ? ` But the ${plural(sent, 'share')} he holds rebuild your identity secret: ${untilYours}.`
        : ''}`;
    }
    if (r.circuit === 'approveRecovery' && caller) {
      return 'The contract checks that a real guardian approved, without learning which one. It cannot know whose words the guardian compared.';
    }
    return null;
  }
  switch (r.message) {
    case 'timelock has not elapsed':
      return 'Every recovery waits 72 hours after it opens, where anyone can see it, so you have time to notice one you did not start and veto it. The wait is not over: skip the clock in step 6, then finalize again.';
    case 'not enough approvals':
      return caller
        ? `The contract counts the approvals his recovery gathered and compares the count with your threshold of ${t}. There are too few, so it refuses before it looks at any secret.`
        : `The contract counts the approvals your recovery gathered and compares the count with your threshold of ${t}. There are too few, so it refuses before it looks at any secret: shares cannot make up for a missing approval.`;
    case 'not the device the guardians approved':
      return 'Your guardians approved one device key, fixed in the recovery when it opened. A different phone holding the same shares is still a different device, and the approvals are not its to use.';
    case 'reconstructed secret does not open idCommit':
      return 'A changed share rebuilds a different secret, and only your real secret opens the commitment you made when you enrolled. The device, the wait and the approvals were all in order.';
    case 'recovery vetoed':
      if (!caller) return 'This recovery was vetoed with your veto card, so it can never finalize. Getting back in would take a new recovery and a new round of approvals.';
      if (yoursDone) {
        return `Your veto card killed his recovery during the 72 hours, and your own recovery has since retired the commitment it was after. His approvals${sent ? ', and the shares he was sent,' : ''} are worth nothing now.`;
      }
      if (sent >= t) {
        return `Your veto card killed his recovery: it can never finalize, and his approvals died with it. But the ${plural(sent, 'share')} he was sent rebuild your identity secret, and it still opens your commitment: ${untilYours}. Finalize yours.`;
      }
      if (sent > 0) {
        const few = sent === 1 ? 'The share he was sent reveals nothing about your secret on its own, but it counts' : `The ${sent} shares he was sent reveal nothing about your secret on their own, but they count`;
        return `Your veto card killed his recovery, and his approvals died with it. ${few} toward the ${t} that rebuild it until your own recovery finalizes and retires it.`;
      }
      return 'Your veto card killed his recovery during the 72 hours. His approvals are worth nothing now, and no guardian sent him a share.';
    case 'identity already retired':
      return caller
        ? 'Your recovery finalized first, so the commitment he was after is retired.'
        : 'The caller finalized first: your old commitment is retired, and his successor holds your identity. A veto during the 72 hours would have stopped him. Start again, and veto the recovery whose words are not yours.';
    default:
      return 'The page has no note for this answer. The message is the contract’s own.';
  }
}

/** What the status region says when an action ends: each call's answer, in a line. */
export function verdict(fresh) {
  const calls = fresh.filter((r) => r.kind === 'call');
  if (!calls.length) return fresh.at(-1)?.say ?? '';
  if (calls.length > 3 && calls.every((c) => c.outcome === 'accepted')) {
    return `${plural(calls.length, 'circuit call')}, all accepted.`;
  }
  return calls.map((c) => `${c.actor}: ${c.circuit} ${c.outcome === 'accepted' ? 'accepted' : `refused, “${c.message}”`}.`).join(' ');
}

export const NEVER_ON_IT = Object.freeze([
  'your guardians’ names, or how to reach them',
  'which guardian approved which recovery: each approval leaves an opaque nullifier',
  'any share, or your identity secret',
  'your veto secret: only its commitment',
  'who called whom, or what was said',
]);
