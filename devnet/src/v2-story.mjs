// Lantern v2 on a real chain: a short script that exercises each rule of docs/v2.md once, with
// real proofs (devnet/src/v2-run.mjs). This file is the script alone: who acts, with what, and
// what the circuit must answer. It holds no chain and no runtime, so the same steps also run in
// memory, against the compiled module, in devnet/test/v2-story.test.mjs, before any chain sees them.
//
// Every refusal is the circuit's own assert, raised where the circuit runs: on the caller's own
// machine, before anything is proved, submitted or paid for. What a real client would see.
//
// One owner enrols with the minimum delay, 24 h, so nothing in the story waits for a clock:
//   1  enrolment with a chosen delay, and three guardians
//   2  guardian-gated, rate-limited opens: a stranger cannot open; a guardian opens; one approval;
//      the owner vetoes and reserves the recovery of her next device; another guardian's open is
//      refused during the cooldown; the reserved recovery opens during it
//   3  the emergency lock: the owner locks; the gate refuses while locked; the owner unlocks with
//      both secrets and a new veto card; the same gate call then passes
//   4  private check-ins: a guardian checks in for this period, and a second time is refused
import { newIdentity, commitmentsOf, assertV2Card } from '../../src/v2/identity.js';
import { MIN_DELAY } from '../../src/v2/timeline.js';
import { lantern2Witnesses } from '../../src/v2/witnesses.js';

/** The delay the owner chooses at enrolment: v2's minimum, 24 h. The story never waits it out. */
export const V2_DELAY = MIN_DELAY;
export const V2_THRESHOLD = 2;

export const RULES = Object.freeze({
  1: 'Enrolment with a chosen delay',
  2: 'Guardian-gated, rate-limited opens',
  3: 'The emergency lock',
  4: 'Private check-ins',
});

const ACCEPT = Object.freeze({ accept: true });
const refuse = (message) => Object.freeze({ accept: false, refuse: message });

/** The refusals the story expects, each the circuit's own assert message. */
export const REFUSALS = Object.freeze({
  '2.1': 'guardian not in tree',
  '2.5': 'cooling down after a veto',
  '3.2': 'identity is locked',
  '4.2': 'guardian already checked in this period',
});

/**
 * v2's witnesses, plus one a stranger fills in for herself. A witness is whatever the caller's
 * own device supplies, so a stranger may hand the circuit any path she likes. Hers has the shape
 * of a real guardian's path, from the public tree, with her OWN leaf, bound to the identity's
 * public context: the leaf binds, and only the tree's root history refuses it ("guardian not in
 * tree"), as test/v2-ratelimit.test.js §3.9.2 does in memory. A persona without `borrowsPathOf`
 * gets v2's witnesses unchanged.
 */
export function storyWitnesses({ pure, clock }) {
  const w = lantern2Witnesses({ pure, clock });
  const honest = w.guardianPath;
  w.guardianPath = (ctx) => {
    const ps = ctx.privateState;
    if (!ps?.borrowsPathOf) return honest(ctx);
    const shape = ctx.ledger.guardians.findPathForLeaf(ps.borrowsPathOf);
    if (!shape) throw new Error(`${ps.name}: the path she borrows is not in the tree`);
    return [ps, { ...shape, leaf: ps.leaf }];
  };
  return w;
}

/**
 * The story's steps, for an executor `x` with:
 *   x.call(persona, circuit, args, rec)   runs one circuit as `persona`; throws the circuit's refusal
 *   x.period()                            the period (Uint<32>) the chain is in now; may return a promise
 * @param pure  Lantern v2's pureCircuits
 * @param rng   { bytes32(), field() }: src/demo/rng.mjs's storyRng, seeded in tests
 */
export function createV2Story({ pure, rng }) {
  if (typeof pure?.checkInKeyOf !== 'function') throw new Error('createV2Story needs Lantern v2 pure circuits');
  const ident = newIdentity(rng.field);
  const newCard = assertV2Card(newIdentity(rng.field)); // the card the unlock installs; only its veto half is used
  const { idCommit: id, vetoCommit } = commitmentsOf(pure, ident);
  const guardian = (name) => ({ name, guardianSecret: rng.bytes32(), leafSalt: rng.bytes32(), leaf: null });
  const device = (name) => {
    const ephemeralSk = rng.bytes32();
    return { name, ephemeralSk, pk: pure.ephemeralPkOf(ephemeralSk) };
  };

  const p = {
    owner: { name: 'the owner', identitySecret: ident.identitySecret, idSalt: ident.idSalt,
      vetoSecret: ident.vetoSecret, vetoSalt: ident.vetoSalt, lineage: { root: id, member: id } },
    g1: guardian('guardian 1'),
    g2: guardian('guardian 2'),
    g3: guardian('guardian 3'),
    stranger: { name: 'a stranger', guardianSecret: rng.bytes32(), leafSalt: rng.bytes32() },
    // The device guardian 1 opens a recovery for; the owner's next device, which her veto reserves;
    // and the device guardian 2 tries to open for during the cooldown.
    devA: device('a new device'),
    devB: device('the owner\'s next device'),
    devC: device('another device'),
  };
  // The stranger's leaf: her own secret and salt, under the identity's public context (at
  // enrolment the context is the identity commitment itself).
  p.stranger.leaf = pure.guardianLeafOf(p.stranger.guardianSecret, id, p.stranger.leafSalt);

  const w = {
    id, vetoCommit,
    newVetoCommit: pure.vetoCommitOf(newCard.vetoSecret, newCard.vetoSalt),
    reserved: pure.recoveryIdOf(id, p.devB.pk),
    nonce: rng.bytes32(),
    rid1: null, rid2: null, oldCard: null,
  };

  const owner = (g) => ({ ...p.owner, ...(g ? { guardianSecret: g.guardianSecret, leafSalt: g.leafSalt } : {}) });
  const asGuardian = (g) => () => ({ name: g.name, guardianSecret: g.guardianSecret, leafSalt: g.leafSalt, leaf: g.leaf });
  const call = (id_, rule, actor, as, circuit, args, expect, say, save) =>
    ({ id: id_, rule, kind: 'call', actor, as, circuit, args, expect, say, save });

  const steps = [
    // ---- 1 · enrolment with a chosen delay --------------------------------------------------
    call('1.1', 1, 'the owner', () => owner(), 'enrollIdentity', () => [id, vetoCommit, BigInt(V2_THRESHOLD), BigInt(V2_DELAY)], ACCEPT,
      `The owner enrols with a delay she chooses: ${V2_DELAY / 3600} h, v2's minimum. Threshold ${V2_THRESHOLD}. The delay is stored for the lineage and every open reads it.`),
    ...['g1', 'g2', 'g3'].map((g, i) => call(`1.${i + 2}`, 1, 'the owner', () => owner(p[g]), 'addGuardian', () => [id], ACCEPT,
      `The owner adds ${p[g].name}, with both of her secrets. The leaf is public; the secret inside it is ${p[g].name}'s.`,
      // A call whose finalization was not reported in time returns no result: the leaf is recomputed.
      (leaf) => { p[g].leaf = leaf ?? pure.guardianLeafOf(p[g].guardianSecret, id, p[g].leafSalt); })),

    // ---- 2 · guardian-gated, rate-limited opens ----------------------------------------------
    call('2.1', 2, 'a stranger', () => ({ ...p.stranger, borrowsPathOf: p.g1.leaf }), 'openRecovery',
      async (x) => [id, p.devA.pk, await x.period()], refuse(REFUSALS['2.1']),
      'A stranger tries to open a recovery. Her leaf binds the public context, on a real path\'s shape, but the tree never held it: v2 opens are for guardians only.'),
    call('2.2', 2, 'guardian 1', asGuardian(p.g1), 'openRecovery', async (x) => [id, p.devA.pk, await x.period()], ACCEPT,
      'Guardian 1 opens a recovery for a new device, proving membership of the current set. One open per guardian, per head, per period.',
      (rid) => { w.rid1 = rid ?? pure.recoveryIdOf(id, p.devA.pk); }),
    call('2.3', 2, 'guardian 2', asGuardian(p.g2), 'approveRecovery', () => [id, w.rid1], ACCEPT,
      'Guardian 2 approves it: one of the two approvals it needs.'),
    call('2.4', 2, 'the owner', () => owner(), 'vetoRecovery', () => [w.rid1, w.reserved], ACCEPT,
      'The owner, who never lost anything, vetoes with her card, and reserves the one recovery that may open during the cooldown: her own next device\'s.'),
    call('2.5', 2, 'guardian 2', asGuardian(p.g2), 'openRecovery', async (x) => [id, p.devC.pk, await x.period()], refuse(REFUSALS['2.5']),
      'Guardian 2 tries to open a recovery for another device. After one veto, the next open waits a day: refused.'),
    call('2.6', 2, 'guardian 3', asGuardian(p.g3), 'openRecovery', async (x) => [id, p.devB.pk, await x.period()], ACCEPT,
      'Guardian 3 opens the recovery the veto reserved, for the owner\'s next device. It opens during the cooldown: no race at its end.',
      (rid) => { w.rid2 = rid ?? pure.recoveryIdOf(id, p.devB.pk); }),

    // ---- 3 · the emergency lock -----------------------------------------------------------------
    call('3.1', 3, 'the owner', () => owner(), 'lockIdentity', () => [id], ACCEPT,
      'The owner fears her device is in someone else\'s hands, and locks the identity with her veto card.'),
    call('3.2', 3, 'the owner', () => owner(), 'hostGatedAction', () => [id, id, w.nonce], refuse(REFUSALS['3.2']),
      'While the identity is locked the gate refuses whoever holds the identity secret, the owner included: a thief with her device gets nothing from it.'),
    call('3.3', 3, 'the owner', () => owner(), 'unlockIdentity', () => [id, w.newVetoCommit], ACCEPT,
      'She unlocks, which needs both secrets, and installs a new veto card in the same transaction, so a copy of the old card is worthless.',
      () => { w.oldCard = { vetoSecret: p.owner.vetoSecret, vetoSalt: p.owner.vetoSalt }; p.owner.vetoSecret = newCard.vetoSecret; p.owner.vetoSalt = newCard.vetoSalt; }),
    call('3.4', 3, 'the owner', () => owner(), 'hostGatedAction', () => [id, id, w.nonce], ACCEPT,
      'The same gate call, with the same nonce, now passes: the refused one consumed nothing.'),

    // ---- 4 · private check-ins ------------------------------------------------------------------
    call('4.1', 4, 'guardian 1', asGuardian(p.g1), 'checkIn', async (x) => [id, await x.period()], ACCEPT,
      'Guardian 1 checks in for this period. The count goes up by one; the ledger never says which guardian.'),
    call('4.2', 4, 'guardian 1', asGuardian(p.g1), 'checkIn', async (x) => [id, await x.period()], refuse(REFUSALS['4.2']),
      'Guardian 1 checks in again in the same period: refused. Each guardian counts once per period.'),
  ];

  return { steps, world: w, personas: p };
}

// ---- running a step, and what the public ledger shows ----------------------------------------

const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
export function show(v) {
  if (v instanceof Uint8Array) return hex(v);
  if (typeof v === 'bigint') return v.toString();
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(show);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, u]) => [k, show(u)]));
  return String(v);
}
/** The circuit's own message, from a runtime or midnight-js error. */
export function messageOf(e) {
  const m = String(e?.message ?? e);
  const i = m.indexOf('failed assert: ');
  return i >= 0 ? m.slice(i + 'failed assert: '.length) : m;
}

// A ledger Set iterates its keys, and a Map its [key, value] pairs. A Map of Counters cannot be
// iterated at all (the generated ledger gives it no iterator), so its keys come from elsewhere.
const keysOf = (it) => Array.from(it, (e) => (Array.isArray(e) ? e[0] : e));
const count = (it) => keysOf(it).length;
const isZero = (u) => u.every((b) => b === 0);

/** Every enrolled identity root: an idRoots entry that maps to itself. */
const rootsOf = (L) => keysOf(L.idRoots).filter((k) => hex(L.idRoots.lookup(k)) === hex(k));

/**
 * Every public count the v2 ledger holds, as numbers: what each step changed, and where the run
 * ended. vetoCount sums the per-root veto counters over every root; a check-in shows as its
 * nullifier (the per-period counters are keyed by a hash only a known root and period recompute:
 * identityState reads one).
 */
export function v2Summary(L) {
  let vetoCount = 0, locked = 0, reserved = 0;
  for (const root of rootsOf(L)) vetoCount += Number(L.vetoCounts.lookup(root).read());
  for (const [, v] of L.locked) if (v) locked++;
  for (const [, v] of L.reservedRecovery) if (!isZero(v)) reserved++;
  return {
    enrolled: count(L.enrolled), guardianLeaves: Number(L.guardians.firstFree()),
    recoveries: count(L.recoveries), approvals: count(L.approvedNullifiers), vetoes: count(L.vetoNullifiers),
    killed: count(L.killed), retired: count(L.retiredIdentities), lineage: Number(L.lineage.firstFree()),
    guardianSets: count(L.usedGuardianCtx), gateActions: Number(L.gateActions),
    opens: count(L.openNullifiers), vetoCount, reserved, locked, checkIns: count(L.checkInNullifiers),
  };
}

/**
 * One identity's v2 state, from the public ledger alone: its delay and threshold, the lock, the
 * veto count, the slot and the reservation, its veto card's commitment, every recovery of its
 * lineage, and the check-in count of `period` for its current guardian set.
 */
export function identityState(L, pure, idCommit, period) {
  const root = L.idRoots.lookup(idCommit);
  const ctx = L.guardianCtx.lookup(root);
  const key = pure.checkInKeyOf(root, ctx, BigInt(period));
  const recoveries = keysOf(L.recoveries).map((rid) => ({ rid, rec: L.recoveries.lookup(rid) }))
    .filter(({ rec }) => hex(rec.idRoot) === hex(root))
    .map(({ rid, rec }) => ({
      rid: hex(rid), device: hex(rec.ephemeralPk), approvals: Number(L.approvals.lookup(rid).read()),
      killed: L.killed.member(rid), openedAtHi: Number(rec.openedAtHi), unlockAt: Number(rec.unlockAt),
      approveBy: Number(rec.approveBy), expiresAt: Number(rec.expiresAt),
    }))
    .sort((a, b) => a.openedAtHi - b.openedAtHi || a.rid.localeCompare(b.rid));
  return {
    idCommit: hex(idCommit), root: hex(root),
    delaySeconds: Number(L.recoveryDelays.lookup(root)), threshold: Number(L.thresholds.lookup(idCommit)),
    locked: L.locked.lookup(root), vetoCommit: hex(L.vetoCommits.lookup(idCommit)),
    vetoCount: Number(L.vetoCounts.lookup(root).read()), lastVetoAt: Number(L.lastVetoAt.lookup(root)),
    liveRecovery: L.liveRecovery.member(root) ? hex(L.liveRecovery.lookup(root)) : null,
    reservedRecovery: L.reservedRecovery.member(root) && !isZero(L.reservedRecovery.lookup(root)) ? hex(L.reservedRecovery.lookup(root)) : null,
    recoveries,
    checkIns: { period: Number(period), count: L.checkIns.member(key) ? Number(L.checkIns.lookup(key).read()) : 0 },
  };
}

const diff = (a, b) => Object.fromEntries(Object.keys(b).filter((k) => a[k] !== b[k]).map((k) => [k, b[k] - a[k]]));

/**
 * Run one step against executor `x` (which also has `ledger()`), and return its record: the same
 * fields as the v1 story's records, with `rule` for v1's `beat` and `contract: 'lantern2'`.
 */
export async function runV2Step(step, x) {
  const rec = { id: step.id, rule: step.rule, kind: step.kind, actor: step.actor, say: step.say, contract: 'lantern2' };
  const ps = step.as();
  const args = await step.args(x);
  rec.circuit = step.circuit;
  rec.args = args.map(show);
  rec.expect = step.expect.accept ? 'accepted' : `refused: ${step.expect.refuse}`;
  const before = v2Summary(await x.ledger());
  try {
    const result = await x.call(ps, step.circuit, args, rec);
    rec.outcome = 'accepted';
    rec.result = show(result);
    rec.publicChange = diff(before, v2Summary(await x.ledger()));
    step.save?.(result);
  } catch (e) {
    // A transaction that was submitted and failed on chain is not a refusal: it stops the run.
    if (rec.tx) throw e;
    rec.outcome = 'refused';
    rec.message = messageOf(e);
  }
  rec.ok = step.expect.accept
    ? rec.outcome === 'accepted'
    : rec.outcome === 'refused' && rec.message.includes(step.expect.refuse);
  return rec;
}

export async function runV2Story(story, x, { onStep = () => {} } = {}) {
  const records = [];
  for (const step of story.steps) {
    const rec = await runV2Step(step, x);
    records.push(rec);
    await onStep(rec);
    // A step that did not go as expected stops the story: the steps after it assume it did, and on
    // Preprod each would still spend the paying wallet's DUST. No record is written either way.
    if (!rec.ok) break;
  }
  return records;
}

