// Lantern v2's clock, for a client and a watcher (docs/v2.md §3.3-§3.4).
//
// Every constant here MIRRORS an `export pure circuit` of contracts/v2/lantern2.compact.
// The contract is the authority: checkConstants(pureCircuits) throws if a mirror
// has drifted from the compiled code, and test/v2-client.test.js calls it. The
// mirrors exist so a page can render a timeline without loading the contract.
//
// Portable and runtime-free: the ledger view and the pure circuits are passed in.

export const DEFAULT_DELAY = 259_200;        // 72 h: the client's default, v1's fixed delay
export const MIN_DELAY = 86_400;             // minRecoveryDelaySeconds(): 24 h
export const MAX_DELAY = 7_776_000;          // maxRecoveryDelaySeconds(): 90 days
export const OPEN_SLACK = 600;               // openSlackSeconds()
export const APPROVAL_WINDOW = 604_800;      // approvalWindowSeconds(): 7 days
export const FINALIZE_WINDOW = 604_800;      // finalizeWindowSeconds(): 7 days
export const PERIOD = 7_862_400;             // periodSeconds(): 91 days
// cooldownSecondsOf(0..6); six or more vetoes stay at the 32-day bound.
export const COOLDOWNS = Object.freeze([0, 86_400, 172_800, 345_600, 691_200, 1_382_400, 2_764_800]);

const num = (x) => Number(x);

/** The wait before the next open after `vetoes` vetoes. */
export const cooldownOf = (vetoes) => COOLDOWNS[Math.min(Math.max(num(vetoes), 0), COOLDOWNS.length - 1)];

/** The period containing Unix time `t`, as the Uint<32> the circuits take. */
export const periodOf = (t) => BigInt(Math.floor(num(t) / PERIOD));

/** [start, end) of period `p`, in Unix seconds. */
export const periodBounds = (p) => ({ start: num(p) * PERIOD, end: (num(p) + 1) * PERIOD });

/** Throws unless every mirror above equals the compiled contract's own constant. */
export function checkConstants(pure) {
  const pairs = [
    ['openSlackSeconds', OPEN_SLACK], ['minRecoveryDelaySeconds', MIN_DELAY],
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
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (ledger.killed.member(rid)) return 'vetoed';
  if (ledger.retiredIdentities.member(rec.idCommit)) return 'superseded';   // finalized, or its head moved on
  if (!same(ctx, rec.ctx)) return 'rotated-out';
  if (n >= t.expiresAt) return 'expired';
  if (n >= t.approveBy && count < BigInt(threshold)) return 'missed-quorum';
  if (count < BigInt(threshold)) return 'collecting-approvals';
  if (n < t.unlockAt) return 'in-delay';
  return 'finalizable';
}

const DEAD = new Set(['vetoed', 'superseded', 'rotated-out', 'expired', 'missed-quorum']);
export const isDead = (status) => DEAD.has(status);

/**
 * The slot and cooldown of an identity root at time `now`: what a guardian's
 * client checks before spending its one open for the period.
 */
export function slotOf(ledger, idRoot, now) {
  const vetoes = ledger.vetoCounts.lookup(idRoot).read();
  const cooldownUntil = num(ledger.lastVetoAt.lookup(idRoot)) + cooldownOf(vetoes);
  const holder = ledger.liveRecovery.member(idRoot) ? ledger.liveRecovery.lookup(idRoot) : null;
  const status = holder ? recoveryStatus(ledger, holder, now) : null;
  const free = !holder || isDead(status);
  return {
    vetoes: num(vetoes), cooldownUntil, holder, status, free,
    canOpen: free && num(now) >= cooldownUntil,
  };
}
