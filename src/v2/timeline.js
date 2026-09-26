// Lantern v2's clock, for a client and a watcher (docs/v2.md §3.3-§3.4).
//
// Every constant here MIRRORS an `export pure circuit` of contracts/v2/lantern2.compact.
// The contract is the authority: checkConstants(pureCircuits) throws if a mirror
// has drifted from the compiled code, and test/v2-client.test.js calls it. The
// mirrors exist so a page can render a timeline without loading the contract.
//
// Portable and runtime-free: the ledger view and the pure circuits are passed in.
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const DEFAULT_DELAY = 259_200;        // 72 h: the client's default, v1's fixed delay
export const MIN_DELAY = 86_400;             // minRecoveryDelaySeconds(): 24 h
export const MAX_DELAY = 7_776_000;          // maxRecoveryDelaySeconds(): 90 days
export const OPEN_SLACK = 600;               // openSlackSeconds()
export const VETO_SLACK = 3_600;             // vetoSlackSeconds(): the veto's own, wider bracket
export const APPROVAL_WINDOW = 604_800;      // approvalWindowSeconds(): 7 days
export const FINALIZE_WINDOW = 604_800;      // finalizeWindowSeconds(): 7 days
export const PERIOD = 7_862_400;             // periodSeconds(): 91 days
// cooldownSecondsOf(0..6); six or more vetoes stay at the 32-day bound.
export const COOLDOWNS = Object.freeze([0, 86_400, 172_800, 345_600, 691_200, 1_382_400, 2_764_800]);

const num = (x) => Number(x);
const ZERO32 = new Uint8Array(32);
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The wait before the next open after `vetoes` vetoes. */
export const cooldownOf = (vetoes) => COOLDOWNS[Math.min(Math.max(num(vetoes), 0), COOLDOWNS.length - 1)];

/** The period containing Unix time `t`, as the Uint<32> the circuits take. */
export const periodOf = (t) => BigInt(Math.floor(num(t) / PERIOD));

/** [start, end) of period `p`, in Unix seconds. */
export const periodBounds = (p) => ({ start: num(p) * PERIOD, end: (num(p) + 1) * PERIOD });

/** Throws unless every mirror above equals the compiled contract's own constant. */
export function checkConstants(pure) {
  const pairs = [
    ['openSlackSeconds', OPEN_SLACK], ['vetoSlackSeconds', VETO_SLACK], ['minRecoveryDelaySeconds', MIN_DELAY],
    ['maxRecoveryDelaySeconds', MAX_DELAY], ['approvalWindowSeconds', APPROVAL_WINDOW],
    ['finalizeWindowSeconds', FINALIZE_WINDOW], ['periodSeconds', PERIOD],
  ];
  for (const [name, mirror] of pairs) {
    const actual = num(pure[name]());
    if (actual !== mirror) throw new Error(`timeline.js: ${name} is ${actual} in the contract, ${mirror} here`);
  }
  for (let v = 0; v <= COOLDOWNS.length + 1; v++) {
    const actual = num(pure.cooldownSecondsOf(BigInt(v)));
    if (actual !== cooldownOf(v)) throw new Error(`timeline.js: cooldownSecondsOf(${v}) is ${actual} in the contract, ${cooldownOf(v)} here`);
  }
  return true;
}

/** A delay the contract will accept at enrolment, or a clear error. */
export function checkDelay(delay) {
  const d = num(delay);
  if (!Number.isInteger(d)) throw new Error('the delay is a whole number of seconds');
  if (d < MIN_DELAY) throw new Error(`delay below the minimum (${MIN_DELAY} s, 24 h)`);
  if (d > MAX_DELAY) throw new Error(`delay above the maximum (${MAX_DELAY} s, 90 days)`);
  return BigInt(d);
}

/** The frozen timeline of a recovery record, as numbers. */
export function timelineOf(rec) {
  return {
    openedAtLo: num(rec.openedAtLo), openedAtHi: num(rec.openedAtHi),
    unlockAt: num(rec.unlockAt), approveBy: num(rec.approveBy), expiresAt: num(rec.expiresAt),
  };
}

/**
 * Where a recovery stands at time `now`, read from the public ledger alone.
 * Mirrors the contract's `recoveryIsDead` clause by clause, in its order. The
 * first five are DEAD states (the slot is free and the recovery can never
 * finalize); the last three are alive.
 */
export function recoveryStatus(ledger, rid, now) {
  const rec = ledger.recoveries.lookup(rid);
  const t = timelineOf(rec);
  const n = num(now);
  const count = ledger.approvals.lookup(rid).read();
  const threshold = ledger.thresholds.lookup(rec.idCommit);
  const ctx = ledger.guardianCtx.lookup(rec.idRoot);
  if (ledger.killed.member(rid)) return 'vetoed';
  if (ledger.retiredIdentities.member(rec.idCommit)) return 'superseded';   // finalized, or its head moved on
  if (!sameBytes(ctx, rec.ctx)) return 'rotated-out';
  if (n >= t.expiresAt) return 'expired';
  if (n >= t.approveBy && count < BigInt(threshold)) return 'missed-quorum';
  if (count < BigInt(threshold)) return 'collecting-approvals';
  if (n < t.unlockAt) return 'in-delay';
  return 'finalizable';
}

const DEAD = new Set(['vetoed', 'superseded', 'rotated-out', 'expired', 'missed-quorum']);
export const isDead = (status) => DEAD.has(status);

/**
 * The root of any enrolled commitment: a root maps to itself, a successor to the
 * genesis root it inherited. The rate limit, the slot, the lock, the delay and
 * the check-ins are all keyed by the root, and after a recovery a caller
 * naturally holds the head, so every reader here normalises first. An unknown
 * commitment gets this clear error, not a raw runtime one.
 */
export function rootOf(ledger, idCommit) {
  if (!ledger.idRoots.member(idCommit)) throw new Error('not an enrolled identity commitment');
  return ledger.idRoots.lookup(idCommit);
}

/**
 * The slot and cooldown of an identity at time `now`: what a guardian's client
 * checks before spending its one open for the period. Takes the root or any
 * commitment of its lineage. Mirrors the contract's cooldown clause: no vetoes
 * means no wait at all (lastVetoAt is not even consulted, so a rotation's reset
 * is immediate), and the recovery the last counted veto reserved may open
 * during the cooldown. A reservation stops counting at the next finalize: the
 * contract resets it to zeros there (second review), because it names the head
 * the finalize retires, and zeros mean none, so `reserved` is null from then on.
 */
export function slotOf(ledger, idCommit, now) {
  const idRoot = rootOf(ledger, idCommit);
  const vetoes = ledger.vetoCounts.lookup(idRoot).read();
  const cooldownUntil = vetoes === 0n ? 0 : num(ledger.lastVetoAt.lookup(idRoot)) + cooldownOf(vetoes);
  const holder = ledger.liveRecovery.member(idRoot) ? ledger.liveRecovery.lookup(idRoot) : null;
  const status = holder ? recoveryStatus(ledger, holder, now) : null;
  const free = !holder || isDead(status);
  const res = vetoes > 0n && ledger.reservedRecovery.member(idRoot) ? ledger.reservedRecovery.lookup(idRoot) : null;
  const reserved = res && !sameBytes(res, ZERO32) ? res : null;
  return {
    vetoes: num(vetoes), cooldownUntil, holder, status, free,
    canOpen: free && num(now) >= cooldownUntil,
    reserved,
    canOpenReserved: free && reserved !== null && !ledger.recoveries.member(reserved),
  };
}

/**
 * What the owner's client checks before a veto (review F2). A veto always kills
 * the recovery, but the contract COUNTS it, restarting the doubling cooldown,
 * whenever the recovery's guardian set is still current -- including when the
 * recovery already missed quorum or expired, because checking those in the
 * circuit would make an honest veto near approveBy fail on replay. So the
 * client refuses to veto a recovery that is already dead: it would only lengthen
 * the wait for the owner's own next recovery.
 */
export function vetoAdvice(ledger, rid, now) {
  if (!ledger.recoveries.member(rid)) return { ok: false, status: null, reason: 'no such recovery' };
  const status = recoveryStatus(ledger, rid, now);
  if (isDead(status)) {
    return { ok: false, status, reason: `the recovery is already dead (${status}); a veto would only restart the cooldown` };
  }
  return { ok: true, status, reason: null };
}

// ---------------------------------------------------------------------------
// When a guardian checks in (review F7, and the second review's correction).
//
// The count is public and the owner can watch it. A check-in whose moment
// depends on the owner's reminder tells a reminding owner who sent it: the
// first build drew the moment from the 7 days AFTER the reminder, so an owner
// who reminded one guardian a week named every guardian, every time. No delay
// counted from the reminder can fix that. What hides a guardian is a moment
// fixed before any reminder: the guardian's SLOT, derived from its own secret.
// A reminder that comes before the slot changes nothing; one that comes after
// it can only produce a late check-in, and a late check-in follows the prompt,
// so checkInAt says so.
// ---------------------------------------------------------------------------

export const CHECKIN_SLOT_DOMAIN = 'lantern2:checkin-slot:v1';
export const CHECKIN_MARGIN = 3_600;   // no slot in a period's last hour: the send must land in its period
export const CHECKIN_LATE_MIN = 86_400; // a late check-in needs at least a day to hide in, or it waits

const u64be = (x) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(x)); return b; };

/** A uniform float in [0, 1) from the platform's CSPRNG (53 bits). */
export function cryptoUniform() {
  const [hi, lo] = globalThis.crypto.getRandomValues(new Uint32Array(2));
  return ((hi >>> 5) * 67_108_864 + (lo >>> 6)) / 9_007_199_254_740_992;
}

/**
 * The guardian's check-in moment in period `p`: HMAC-SHA256, keyed by the
 * guardian's secret, of (domain, the set's context, p), reduced to a second in
 * [start of p, end of p - margin). Fixed before any reminder is sent and moved
 * by none; unpredictable without the guardian's secret; new each period and
 * with each rotation; and it needs no storage.
 */
export function checkInSlot(guardianSecret, ctx, p, { margin = CHECKIN_MARGIN } = {}) {
  if (!(guardianSecret instanceof Uint8Array) || guardianSecret.length !== 32) throw new Error('the guardian secret is 32 bytes');
  if (!(ctx instanceof Uint8Array) || ctx.length !== 32) throw new Error("the set's context is 32 bytes");
  const mac = hmac(sha256, guardianSecret, concatBytes(utf8ToBytes(CHECKIN_SLOT_DOMAIN), ctx, u64be(p)));
  const x = new DataView(mac.buffer, mac.byteOffset, 8).getBigUint64(0);
  return periodBounds(p).start + Number(x % BigInt(PERIOD - margin));
}

/**
 * When a guardian's client, running at `now`, sends this period's check-in,
 * given its `slot` for the period (checkInSlot). Returns { at, late }:
 *   - before the slot: { at: slot, late: false }. Whatever woke the client, a
 *     reminder included, the moment is the slot, so the count names nobody;
 *   - after it (the client was not running at its slot): a uniformly random
 *     moment in [now + 1, end - margin), late: true. It still FOLLOWS whatever
 *     woke the client: an owner who reminds one guardian at a time and waits
 *     for the counter learns whether that guardian checked in. The random draw
 *     hides it only among the other late check-ins;
 *   - when fewer than `lateMin` seconds (a day) are left before end - margin,
 *     or in the period's last `margin` seconds: { at: null, late: true }. The
 *     only moments left are straight after the prompt; the client checks in at
 *     its next period's slot instead. It never sends at once, nor a second after.
 * `rng()` returns a float in [0, 1); the default is the platform's CSPRNG.
 */
export function checkInAt(now, slot, { margin = CHECKIN_MARGIN, lateMin = CHECKIN_LATE_MIN, rng = cryptoUniform } = {}) {
  const n = num(now);
  if (slot === undefined || slot === null || !Number.isInteger(num(slot))) throw new Error('checkInAt needs the guardian\'s slot for this period (checkInSlot)');
  const p = periodOf(n);
  if (periodOf(slot) !== p) throw new Error('the slot is for another period');
  if (n < num(slot)) return { at: num(slot), late: false };
  const last = periodBounds(p).end - margin;
  const room = last - n - 1;               // the moments in [now + 1, last)
  if (room < lateMin) return { at: null, late: true };
  return { at: n + 1 + Math.floor(rng() * room), late: true };
}
