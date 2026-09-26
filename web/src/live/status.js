// Pure helpers for /live: where a recovery stands, how long until it can finalize, times in words,
// and the watch's input check. No React, no network, no runtime.

// ---- where a recovery stands -----------------------------------------------------------------------
// From the contract's public state alone, in the order finalizeRecovery itself checks:
//  - vetoed: the veto card killed it (`killed` holds its id);
//  - finalized: its identity commitment is retired, and it is the only recovery of that identity
//    that could have finalized (not vetoed, enough approvals). The state never records WHICH
//    recovery finalized; if two could have, each is "closed" and the page says so;
//  - cancelled: the identity's guardian set was replaced after it opened, so it can never finalize;
//  - waiting: the 72 hours (the contract's delay) are not over;
//  - ready: over, with enough approvals: the approved device can finalize;
//  - short: over, but not enough approvals yet (guardians can still approve).
export const STATE_WORDS = {
  waiting: 'Waiting out the timelock',
  ready: 'Ready to finalize',
  short: 'Waiting for approvals',
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
  if (r.killed) return { ...base, state: 'vetoed' };
  if (identity?.retired) {
    const could = decoded.recoveries.filter((x) => x.idCommit === r.idCommit && !x.killed && threshold != null && x.approvals >= threshold);
    const only = could.length === 1 && could[0].rid === r.rid;
    const successor = Object.values(decoded.identities).find((i) => i.idRoot === identity.idRoot && i.idCommit !== r.idCommit && !i.retired) ?? null;
    return { ...base, state: only ? 'finalized' : 'closed', successor: successor?.idCommit ?? null };
  }
  if (!r.ctxCurrent) return { ...base, state: 'cancelled' };
  if (now < canFinalizeAt) return { ...base, state: 'waiting' };
  return { ...base, state: enough ? 'ready' : 'short' };
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

/** Every recovery on a decoded contract for this identity: opened against it, or against any
 *  commitment descended from it (the identity root it was enrolled with). */
export function recoveriesFor(id, decoded) {
  return decoded.recoveries.filter((r) => r.idCommit === id || r.idRoot === id);
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
