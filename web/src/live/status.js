// Pure helpers for /live: where a recovery stands, how long until it can finalize, times in words,
// and the watch's input check. No React, no network, no runtime.

// ---- where a recovery stands -----------------------------------------------------------------------
// From the contract's public state alone. Retirement is read first: vetoRecovery never checks it, so
// a veto that lands after the finalize is still accepted and marks the recovery `killed`. `killed`
// alone therefore does not mean a recovery was stopped; it rules out only one that never had quorum
// (approveRecovery refuses a killed recovery, so its approvals stop at the veto).
//  - finalized: its identity commitment is retired, and it is the only recovery of that identity
//    that ever had quorum (vetoed later or not). Only a quorate recovery can retire the identity, so
//    it is the one that did. The state never records WHICH recovery finalized; if two had quorum,
//    each is "closed" and the page says so (a veto before one finalize and a veto after the other
//    leave the same state);
//  - vetoed: the veto card killed it (`killed` holds its id), and it cannot have finalized: the
//    identity is not retired, or it never reached quorum;
//  - cancelled: the identity's guardian set was replaced after it opened, so it can never finalize;
//  - waiting: the 72 hours (the contract's delay) are not over;
//  - ready: over, with enough approvals: the approved device can finalize;
//  - short: over, but not enough approvals yet. Guardians can still approve, and a recovery never
//    expires, so it can take its last approval and finalize in one block (SECURITY.md §6.14).
export const STATE_WORDS = {
  waiting: 'Waiting out the timelock',
  ready: 'Ready to finalize',
  short: 'Timelock over, short of approvals',
  finalized: 'Finalized',
  closed: 'Closed: the identity was recovered',
  vetoed: 'Vetoed',
  cancelled: 'Cancelled: guardians replaced',
};

/** Each state's chip. The lock (a finalize) is the one Ember chip; a real wait on the chain has its
 *  own dial (live.css .lv-wait), not /demo's `clock`, which marks the demo's simulated clock. */
export const CHIP = {
  waiting: 'chip lv-wait', short: 'chip lv-wait', ready: 'chip ok', finalized: 'chip ok lock',
  closed: 'chip ok', vetoed: 'chip no', cancelled: 'chip no',
};

/**
 * @param {object} r a decoded recovery (live/decode.js)
 * @param {object} decoded the decoded contract it is on
 * @param {number} now milliseconds
 * @param {number} delaySeconds that contract's timelock
 */
export function recoveryState(r, decoded, now, delaySeconds) {
  const identity = decoded.identities[r.idCommit] ?? null;
  const threshold = identity?.threshold ?? null;
  const canFinalizeAt = r.openedAtHi + delaySeconds * 1000;
  const enough = threshold != null && r.approvals >= threshold;
  const base = { canFinalizeAt, threshold, approvals: r.approvals, identity };
  if (identity?.retired) {
    // A veto that lands after the finalize is accepted too (see above): `killed` rules out only a
    // recovery that never reached quorum.
    const quorate = (x) => x.idCommit === r.idCommit && threshold != null && x.approvals >= threshold;
    const could = decoded.recoveries.filter(quorate);
    const state = !quorate(r) ? (r.killed ? 'vetoed' : 'closed') : could.length === 1 ? 'finalized' : 'closed';
    const successor = Object.values(decoded.identities).find((i) => i.idRoot === identity.idRoot && i.idCommit !== r.idCommit && !i.retired) ?? null;
    return { ...base, state, successor: successor?.idCommit ?? null };
  }
  if (r.killed) return { ...base, state: 'vetoed' };
  if (!r.ctxCurrent) return { ...base, state: 'cancelled' };
  if (now < canFinalizeAt) return { ...base, state: 'waiting' };
  return { ...base, state: enough ? 'ready' : 'short' };
}

/** The states a recovery does not leave: nothing more can happen to it. */
export const ENDED = new Set(['finalized', 'closed', 'vetoed', 'cancelled']);

/**
 * One recovery's news since the last read, for the watch (Watch.jsx; devnet/src/watch.mjs can share
 * it): at most one alert per recovery per read, and its end first. A recovery can gain its last
 * approval and finalize, or be approved and vetoed, between two reads (a 30-second check, or longer
 * in a background tab), and one first seen already over was opened and ended in between: each is
 * told as its end, never as "opened … unless it is vetoed" or as an approval only.
 *
 * @param {{ approvals: number, state: string } | null} was the recovery at the last read; null if new
 * @param {number} approvals its approvals now
 * @param {string} state where it stands now (recoveryState)
 * @returns {null | { kind: 'opened' | 'approval' | 'ended', isNew: boolean, gained: boolean }}
 *   gained: it has more approvals than at the last read
 */
export function alertFor(was, approvals, state) {
  const ended = ENDED.has(state);
  if (!was) return { kind: ended ? 'ended' : 'opened', isNew: true, gained: false };
  const gained = approvals > was.approvals;
  if (ended && state !== was.state) return { kind: 'ended', isNew: false, gained };
  if (gained) return { kind: 'approval', isNew: false, gained };
  return null;
}

/**
 * The watch's in-page log, newest first: the latest entry per recovery (its tag), at most `max`. Over
 * the cap, news of an opening goes first, oldest first, so a flood of decoy openings cannot push an
 * approval or an end out of the log.
 * @param {{ tag: string, kind: string }[]} list newest first
 */
export function keepNews(list, max) {
  const tags = new Set();
  const one = list.filter((e) => !tags.has(e.tag) && tags.add(e.tag));
  const drop = new Set();
  for (let i = one.length - 1; i >= 0 && one.length - drop.size > max; i -= 1) if (one[i].kind === 'opened') drop.add(i);
  return one.filter((_, i) => !drop.has(i)).slice(0, max);
}

/**
 * One recorded recovery (the shipped run's), as the page draws it: from the chain's state and history
 * where they have it, from the record until then. Pure, so the finalized view (which the chain holds
 * only after the finalize, past the hackathon's deadline) is tested on real data today (live.spec.js).
 *
 * @param {object} rec the record's recovery (records.js SHIPPED_RECOVERY): rid, openedAtLo, openedAtHi,
 *   finalizeFrom, approvals ("2 of 2"), finalize (null until the record holds one)
 * @param {object|null} decoded the contract's decoded state (live/decode.js), or null while unread
 * @param {object[]} actions the contract's actions as the page holds them, oldest first
 * @param {number} now milliseconds
 * @param {number} delaySeconds the contract's timelock
 */
export function recordedRecoveryView(rec, decoded, actions, now, delaySeconds) {
  const accepted = (a) => a.kind === 'call' && a.tx?.status === 'success';
  const onChain = decoded?.recoveries.find((r) => r.rid === rec.rid) ?? null;
  // Without the state (unread, or this browser cannot run the reader), the history still tells a
  // finalize: a finalizeRecovery the contract accepted once the lock was over.
  const finalizedInHistory = actions.some((a) => accepted(a) && a.entryPoint === 'finalizeRecovery' && a.tx.time >= rec.finalizeFrom);
  const st = onChain
    ? recoveryState(onChain, decoded, now, delaySeconds)
    : { state: rec.finalize || finalizedInHistory ? 'finalized' : now < rec.finalizeFrom ? 'waiting' : 'ready', canFinalizeAt: rec.finalizeFrom, approvals: null, threshold: null, successor: null };
  const openedAtLo = onChain?.openedAtLo ?? rec.openedAtLo;
  const openedAtHi = onChain?.openedAtHi ?? rec.openedAtHi;
  // The open is the accepted openRecovery whose block time lies inside the recovery's own bounds (the
  // browser check asks the same). The finalize is the first accepted finalizeRecovery once the lock is
  // over; a finalize the contract refused is never drawn as the lock. The state never says WHICH call
  // finalized a recovery, so this holds for a contract with one recovery at stake, as the shipped one.
  const open = actions.find((a) => accepted(a) && a.entryPoint === 'openRecovery' && a.tx.time >= openedAtLo && a.tx.time < openedAtHi) ?? null;
  const lit = st.state === 'finalized';
  const fin = lit ? actions.find((a) => accepted(a) && a.entryPoint === 'finalizeRecovery' && a.tx.time >= st.canFinalizeAt) ?? null : null;
  const recorded = rec.finalize?.tx ? { hash: rec.finalize.tx.txHash, height: rec.finalize.tx.blockHeight, time: rec.finalize.at ? Date.parse(rec.finalize.at) : null } : null;
  const finTx = lit ? (fin?.tx ?? recorded) : null;
  // How long it waited: from the open's own block time where the chain gave it, else from the later
  // bound (which the timelock counts from), and the page says which.
  const finalizedAfter = finTx?.time ? { ms: finTx.time - (open ? open.tx.time : openedAtHi), from: open ? 'open' : 'bound' } : null;
  const span = delaySeconds * 1000;
  return {
    fromChain: Boolean(onChain),
    onChain,
    state: st.state,
    canFinalizeAt: st.canFinalizeAt,
    approvals: onChain ? `${st.approvals} of ${st.threshold ?? '?'}` : rec.approvals,
    openedAtLo,
    openedAtHi,
    open,
    lit,
    // how much of the lock has passed, 0 to 1: the ring's fill
    elapsed: lit ? 1 : Math.max(0, Math.min(1, (now - openedAtHi) / span)),
    finTx,
    finalizedAfter,
    successor: st.successor ?? null,
  };
}

/** The identity root of a commitment: the commitment its lineage was first enrolled as. finalizeRecovery
 *  writes idRoots[successor] = the recovery's ROOT, never its predecessor, so every commitment of one
 *  identity (R, then S1, then S2, …) names the same root. An id the contract does not know is its own. */
export const rootOf = (id, decoded) => decoded.identities[id]?.idRoot ?? id;

/** Every recovery on a decoded contract for this identity: opened against it, or against any other
 *  commitment in the same lineage (the same identity root), whichever of its commitments is given. So a
 *  watch on a commitment since succeeded (S1) still sees a recovery opened against the current one (S2). */
export function recoveriesFor(id, decoded) {
  const root = rootOf(id, decoded);
  return decoded.recoveries.filter((r) => r.idCommit === id || r.idRoot === root);
}

/** The other commitments in this identity's lineage (the root included, if it is not `id`): the one
 *  not retired is the identity's current commitment. */
export function lineageOf(id, decoded) {
  const root = rootOf(id, decoded);
  return Object.values(decoded.identities).filter((i) => i.idRoot === root && i.idCommit !== id);
}

/**
 * The order the watch draws recoveries in, most urgent first, and which it leaves out. Anyone can open
 * a recovery against an enrolled identity (openRecovery checks no caller) and a recovery never expires,
 * so a list cut to the newest few can be flooded: twenty decoys at 0 approvals would push the one that
 * can finalize out of sight. Approvals are what an attacker cannot make without guardians, so they
 * rank first, and no open recovery with an approval is ever left out:
 *  - 3: open, with enough approvals to finalize (quorate);
 *  - 2: open, with at least one approval;
 *  - 1: open, with none;
 *  - 0: ended (finalized, closed, vetoed, cancelled): those that had quorum first, then newest first.
 * Within a rank: more approvals first, then the soonest to finalize, then the newest.
 *
 * @param {{ r: object, st: object }[]} items each recovery (r) and where it stands (st, recoveryState)
 * @param {number} shown how many to draw at most, beyond every open one with an approval
 * @returns {{ drawn: object[], hiddenOpen: number, hiddenEnded: number, open: number }}
 *   open: how many of all the items are open (not ended)
 */
export function orderForWatch(items, shown) {
  const ended = (x) => ENDED.has(x.st.state);
  const quorate = (x) => x.st.threshold != null && x.r.approvals >= x.st.threshold;
  const rank = (x) => (ended(x) ? 0 : quorate(x) ? 3 : x.r.approvals > 0 ? 2 : 1);
  const sorted = [...items].sort((a, b) => rank(b) - rank(a)
    || (rank(a) === 0 ? Number(quorate(b)) - Number(quorate(a)) || b.r.openedAtHi - a.r.openedAtHi
      : b.r.approvals - a.r.approvals || a.st.canFinalizeAt - b.st.canFinalizeAt || b.r.openedAtHi - a.r.openedAtHi));
  const must = sorted.filter((x) => rank(x) >= 2);
  const rest = sorted.filter((x) => rank(x) < 2).slice(0, Math.max(0, shown - must.length));
  const drawn = [...must, ...rest];
  const left = sorted.slice(drawn.length);
  return {
    drawn,
    hiddenOpen: left.filter((x) => !ended(x)).length,
    hiddenEnded: left.filter(ended).length,
    open: items.filter((x) => !ended(x)).length,
  };
}

/**
 * Whether a contract's rules are frozen: its maintenance authority holds no keys yet needs at least
 * one signature, so no change to its verifier keys can ever be signed. The same test as
 * devnet/src/verify.mjs and shipped.mjs (committee empty AND threshold at least 1): an empty committee
 * with a threshold of 0 would let a change through with no signature at all.
 */
export const isFrozen = (committee, threshold) => committee === 0 && Number(threshold) >= 1;

// ---- time --------------------------------------------------------------------------------------------
// Written out by hand, in UTC: Intl's month names differ between engines ("Sep", "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n) => String(n).padStart(2, '0');

/** "27 Sep 2026, 15:03 UTC" */
export function utc(ms) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
}
/** "27 Sep 2026" */
export function utcDay(ms) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "15:03" */
export function utcHM(ms) {
  const d = new Date(ms);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}
/** "27 Sep, 15:03:12" (UTC implied by the column it sits in) */
export function utcShort(ms) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
}
/** "15:03:12 UTC" */
export function utcClock(ms) {
  const d = new Date(ms);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} UTC`;
}

/** The parts of a span, largest first: { d, h, m, s }. Negative spans count as zero. */
export function spanParts(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

/** "1 day 14 h", "3 h 12 min", "4 min", "under a minute" */
export function spanWords(ms) {
  const { d, h, m } = spanParts(ms);
  if (d) return `${d} ${d === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`;
  if (h) return `${h} h${m ? ` ${m} min` : ''}`;
  if (m) return `${m} min`;
  return 'under a minute';
}

/** "2,690,659" */
export const blockNo = (n) => Number(n).toLocaleString('en-GB');

/** "bfd4fa77…52c9" */
export const shortHex = (h, head = 8, tail = 4) => (typeof h === 'string' && h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);

// ---- the watch's input -------------------------------------------------------------------------------

const codePoint = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
/** A character the input may not hold, named so that one the eye cannot see is still found. */
function nameOf(ch) {
  if (ch === ' ') return 'a space';
  if (/[\t\n\r]/.test(ch)) return 'a line break or tab';
  // nothing to see, or nothing that looks out of place: name the code point
  if (/\p{M}/u.test(ch)) return `a combining mark (${codePoint(ch)})`;
  if (/\p{C}/u.test(ch)) return `an invisible character (${codePoint(ch)})`;
  if (/[\s\p{Z}]/u.test(ch)) return `a special space (${codePoint(ch)})`;
  return `“${ch}”`;
}

/**
 * An identity commitment as pasted: 32 bytes of hex, with or without 0x, any case, surrounding
 * spaces ignored. Anything else is refused with the reason.
 * @returns {{ ok: true, id: string } | { ok: false, why: string }}
 */
export function parseIdCommit(input) {
  const s = String(input ?? '').trim();
  if (!s) return { ok: false, why: 'Paste an identity commitment first: 64 characters, 0 to 9 and a to f.' };
  const body = /^0x/i.test(s) ? s.slice(2) : s;
  const bad = body.match(/[^0-9a-fA-F]/u);
  if (bad) return { ok: false, why: `An identity commitment holds only 0 to 9 and a to f; this has ${nameOf(bad[0])}.` };
  if (body.length !== 64) {
    return { ok: false, why: `An identity commitment is 64 characters; this is ${body.length > 999 ? 'far more' : body.length}.` };
  }
  return { ok: true, id: body.toLowerCase() };
}
