// THE STORY. One script of beats, each step with its exact expected outcome.
// Every executor runs this same script: the test suite, `npm run story`, the
// browser demo and the local-chain runner. They differ only in what `x.call`
// does — an in-memory ledger, or a real proof and a real transaction.
//
// Runtime-free: the executor supplies the contract's pure circuits.
//
// The cast. Hana owns an identity on Lantern. Her guardians are Seo-yeon, her
// mother, and Jihoon. Minji is a stranger with an identity of her own on the
// same contract. A fee sponsor pays for transactions without holding anything.
import { newIdentity, dealShares, recoverFromShares } from '../identity.js';
import { runAttack } from '../attack/attack.mjs';
import { observerView } from '../attack/view.mjs';

export const ACCEPT = Object.freeze({ accept: true });
export const refuse = (message) => Object.freeze({ refuse: message });

// How the guardians appear in the attacker's address book (src/attack/candidates.mjs).
const BOOK_NAME = Object.freeze({ seoyeon: 'seo-yeon.eth', mum: 'mum@example.com', jihoon: 'jihoon.eth' });

export const BEATS = Object.freeze([
  { n: 0, title: 'Thirty days earlier', caption: 'Hana enrols her identity and deals a 2-of-3 guardian quorum.' },
  { n: 1, title: 'An ordinary day', caption: 'Her laptop acts at a DApp that gates on her identity root.' },
  { n: 2, title: 'The laptop is gone', caption: 'A wallet seed restores keys, not state. Her identity secret is gone with it.' },
  { n: 3, title: 'A new phone', caption: 'Anyone may open a recovery. Seo-yeon opens one for the phone, which holds no secret yet.' },
  { n: 4, title: 'Two guardians approve', caption: 'They check the phone\'s fingerprint first. The public record gains two opaque nullifiers.' },
  { n: 5, title: 'The attacker reads the ledger', caption: 'Everything on chain, and an address book of Hana\'s contacts.' },
  { n: 6, title: 'What the chain refuses', caption: 'A real guardian of someone else. A guardian approving twice.' },
  { n: 7, title: 'Jihoon turns', caption: 'With Mum\'s phished share he rebuilds Hana\'s secret. Watch what it buys him.' },
  { n: 8, title: 'Seventy-two hours', caption: 'The phone finalizes, once the timelock allows it and only with the real shares.' },
  { n: 9, title: 'The DApp never noticed', caption: 'The old secret is dead everywhere. The DApp still stores one value.' },
  { n: 10, title: 'Epilogue', caption: 'Fresh shares, and a guardian set without Jihoon.' },
]);

/**
 * @param pure  the Lantern module's pureCircuits
 * @param rng   src/demo/rng.mjs — seeded for tests, Web Crypto for demos
 */
export function createStory({ pure, rng }) {
  const hana = newIdentity(rng.field);
  const minji = newIdentity(rng.field);
  const guardian = (name) => ({ name, guardianSecret: rng.bytes32(), leafSalt: rng.bytes32(), leaf: null, share: null });

  // Personas are private states: what each party's device holds. Witnesses
  // read them and nothing else.
  const p = {
    laptop: { name: 'Hana\'s laptop', identitySecret: hana.identitySecret, idSalt: hana.idSalt, lineage: null },
    card: { name: 'Hana\'s veto card', vetoSecret: hana.vetoSecret, vetoSalt: hana.vetoSalt },
    seoyeon: guardian('Seo-yeon'),
    mum: guardian('Mum'),
    jihoon: guardian('Jihoon'),
    minji: { name: 'Minji', identitySecret: minji.identitySecret, idSalt: minji.idSalt,
      vetoSecret: minji.vetoSecret, vetoSalt: minji.vetoSalt,
      guardianSecret: rng.bytes32(), leafSalt: rng.bytes32(), leaf: null },
    // The phone that recovers an identity has lost everything, including any wallet: it holds
    // no NIGHT and no DUST. On a chain, a sponsor pays its fees.
    phone: { name: 'Hana\'s new phone', ephemeralSk: rng.bytes32(), shares: [], wallet: 'none' },
    rogue: null, // Jihoon, once he holds Mum's share
    sponsor: { name: 'the fee sponsor', ephemeralSk: rng.bytes32() },
  };

  const w = {
    id: pure.idCommitOf(hana.identitySecret, hana.idSalt),
    vetoCommit: pure.vetoCommitOf(hana.vetoSecret, hana.vetoSalt),
    minjiId: pure.idCommitOf(minji.identitySecret, minji.idSalt),
    minjiVeto: pure.vetoCommitOf(minji.vetoSecret, minji.vetoSalt),
    phonePk: pure.ephemeralPkOf(p.phone.ephemeralSk),
    successor: newIdentity(rng.field),
    rid: null, hostileRid: null, jihoonPk: null, newId: null, attack: null,
  };
  w.successorCommits = {
    id: pure.idCommitOf(w.successor.identitySecret, w.successor.idSalt),
    veto: pure.vetoCommitOf(w.successor.vetoSecret, w.successor.vetoSalt),
  };

  const DELAY = Number(pure.recoveryDelaySeconds());
  const SLACK = Number(pure.openSlackSeconds());
  const nonce = () => rng.bytes32();

  // Hana at setup: laptop and veto card together, plus the material she deals
  // to one guardian. Adding a guardian needs both of her secrets.
  const owner = (g) => ({ ...p.laptop, ...p.card, name: 'Hana (laptop + veto card)',
    ...(g ? { guardianSecret: g.guardianSecret, leafSalt: g.leafSalt } : {}) });
  // Jihoon's best attempt at a veto-gated circuit: he offers the identity secret as the card.
  const rogueAsCard = () => ({ ...p.rogue, vetoSecret: p.rogue.identitySecret, vetoSalt: p.rogue.idSalt,
    name: 'Jihoon, offering the identity secret as a veto card' });
  const phoneWithCard = () => ({ ...p.phone, ...p.card, name: 'Hana\'s phone, with her veto card typed in' });

  const call = (id, beat, actor, as, circuit, args, expect, say, save) =>
    ({ id, beat, kind: 'call', actor, as, circuit, args, expect, say, save });
  const offchain = (id, beat, actor, say, run) => ({ id, beat, kind: 'offchain', actor, say, run });
  // `until` names what the wait is FOR, so an executor on a real chain can wait exactly that long:
  // the timelock ends DELAY after the later of the two open-time bounds.
  const clock = (id, beat, seconds, say, until) => ({ id, beat, kind: 'clock', actor: 'time', seconds, say, until });

  const steps = [
    // ---- 0 · thirty days earlier -------------------------------------------
    call('0.1', 0, 'Hana', () => owner(), 'enrollIdentity', () => [w.id, w.vetoCommit, 2n], ACCEPT,
      'Hana enrols: a commitment to her identity secret, a commitment to a separate veto secret, threshold 2.'),
    ...['seoyeon', 'mum', 'jihoon'].map((g, i) =>
      call(`0.${i + 2}`, 0, 'Hana', () => owner(p[g]), 'addGuardian', () => [w.id], ACCEPT,
        `Hana adds ${p[g].name} as a guardian. The leaf is public; the secret inside it went to ${p[g].name} out of band.`,
        (res) => { p[g].leaf = res; })),
    offchain('0.5', 0, 'Hana', 'She splits her identity secret 2-of-3 and gives each guardian one share. The veto card goes in a drawer.',
      () => {
        const [a, b, c] = dealShares(p.laptop.identitySecret, 3, 2, rng.field);
        p.seoyeon.share = a; p.mum.share = b; p.jihoon.share = c;
        p.laptop.lineage = { root: w.id, member: w.id };
        return { detail: 'three shares dealt, off chain' };
      }),
    call('0.6', 0, 'Minji', () => p.minji, 'enrollIdentity', () => [w.minjiId, w.minjiVeto, 2n], ACCEPT,
      'Elsewhere on the same contract, Minji enrols an identity of her own.'),
    call('0.7', 0, 'Minji', () => p.minji, 'addGuardian', () => [w.minjiId], ACCEPT,
      'She makes herself one of her own guardians, so she holds a real leaf with a real Merkle path.',
      (res) => { p.minji.leaf = res; }),

    // ---- 1 · an ordinary day -------------------------------------------------
    call('1.1', 1, 'Hana\'s laptop', () => p.laptop, 'hostGatedAction', () => [w.id, w.id, nonce()], ACCEPT,
      'The DApp stores one value, Hana\'s identity root, and asks: is the caller its current owner? Yes.'),

    // ---- 2 · the laptop is gone ----------------------------------------------
    offchain('2.1', 2, 'Hana', 'The laptop is destroyed, and its private state with it. No seed phrase brings it back.',
      () => {
        for (const k of ['identitySecret', 'idSalt']) delete p.laptop[k];
        return { detail: 'identity secret: gone. Veto card: in the drawer.' };
      }),

    // ---- 3 · a new phone -------------------------------------------------------
    offchain('3.1', 3, 'Hana\'s new phone', 'The new phone makes a one-time device key. Its fingerprint is what the guardians will check.',
      () => ({ detail: `device fingerprint ${fingerprint(w.phonePk)}` })),
    call('3.2', 3, 'Seo-yeon', () => ({ name: 'Seo-yeon', wallet: 'seo-yeon' }), 'openRecovery', () => [w.id, w.phonePk], ACCEPT,
      'Seo-yeon opens a recovery of Hana\'s identity, for that device key. Opening needs no secret; the new phone has none to offer.',
      (res) => { w.rid = res; }),

    // ---- 4 · two guardians approve --------------------------------------------
    call('4.1', 4, 'Seo-yeon', () => p.seoyeon, 'approveRecovery', () => [w.id, w.rid], ACCEPT,
      'Seo-yeon compares the fingerprint with the one Hana reads to her over the phone, and approves.'),
    call('4.2', 4, 'Mum', () => p.mum, 'approveRecovery', () => [w.id, w.rid], ACCEPT,
      'Mum does the same. Quorum: two of two needed.'),
    offchain('4.3', 4, 'Seo-yeon, Mum', 'Each sends her share to the new phone, off chain.',
      () => { p.phone.shares = [p.seoyeon.share, p.mum.share]; return { detail: 'the phone holds two shares' }; }),

    // ---- 5 · the attacker ----------------------------------------------------
    offchain('5.1', 5, 'an attacker', 'An attacker reads the whole public ledger and tries every derivation it knows against Hana\'s guardian tree, starting from her real guardians\' names.',
      async (x) => {
        const view = observerView('3', 'this ledger', 'commit(secret‖ctx, salt)',
          { idCommit: w.id, idRoot: w.id, rids: [w.rid] }, await x.ledger(), x.pure);
        const r = runAttack(view, { knownNames: Object.values(BOOK_NAME) });
        w.attack = { named: r.named.size, probes: r.probes, votes: r.votes };
        return { ok: r.named.size === 0 && r.votes === 0,
          detail: `${r.probes} probes, ${r.named.size} guardians named, ${r.votes} votes linked` };
      }),

    // ---- 6 · refusals ----------------------------------------------------------
    call('6.1', 6, 'Minji', () => p.minji, 'approveRecovery', () => [w.id, w.rid],
      refuse('path does not bind to this guardian leaf'),
      'Minji tries to approve Hana\'s recovery with her own guardian leaf. The leaf and its path are real — for a different identity.'),
    call('6.2', 6, 'Seo-yeon', () => p.seoyeon, 'approveRecovery', () => [w.id, w.rid],
      refuse('guardian already approved'),
      'Seo-yeon tries to approve a second time.'),

    // ---- 7 · Jihoon turns -------------------------------------------------------
    offchain('7.1', 7, 'Jihoon', 'Jihoon phishes Mum\'s share. With his own, that is two: he rebuilds Hana\'s identity secret, salt and all.',
      (x) => {
        const rebuilt = recoverFromShares([p.jihoon.share, p.mum.share]);
        const sk = rng.bytes32();
        p.rogue = { ...p.jihoon, ...rebuilt, ephemeralSk: sk, lineage: { root: w.id, member: w.id },
          name: 'Jihoon, holding Hana\'s identity secret' };
        w.jihoonPk = x.pure.ephemeralPkOf(sk);
        return { detail: 'he now holds exactly what the lost laptop held' };
      }),
    call('7.2', 7, 'Jihoon', () => p.rogue, 'hostGatedAction', () => [w.id, w.id, nonce()], ACCEPT,
      'He acts as Hana at the DApp. This is the honest cost of any recovery scheme: until her recovery finalizes, that secret IS the owner\'s.'),
    call('7.3', 7, 'Jihoon', () => ({ ...rogueAsCard(), guardianSecret: rng.bytes32(), leafSalt: rng.bytes32() }),
      'addGuardian', () => [w.id], refuse('adding a guardian requires the veto secret'),
      'He tries to mint a guardian token of his own, to fake a quorum.'),
    call('7.4', 7, 'Jihoon', () => ({ name: 'Jihoon' }), 'openRecovery', () => [w.id, w.jihoonPk], ACCEPT,
      'He opens a recovery for his own device. Anyone may.',
      (res) => { w.hostileRid = res; }),
    call('7.5', 7, 'Jihoon', () => p.rogue, 'approveRecovery', () => [w.id, w.hostileRid], ACCEPT,
      'He approves it with his real guardian token: one of the two it needs, and he cannot mint the second.'),
    call('7.6', 7, 'Jihoon', () => p.rogue, 'finalizeRecovery', () => [w.rid, w.successorCommits.id, w.successorCommits.veto],
      refuse('not the device the guardians approved'),
      'He tries to finalize Hana\'s recovery instead: it has a quorum, and he has the secret.'),
    call('7.7', 7, 'Jihoon', rogueAsCard, 'rotateGuardianSet', () => [w.id, rng.bytes32()],
      refuse('rotating the guardian set requires the veto secret'),
      'He tries to evict the guardians, which would kill Hana\'s recovery.'),
    call('7.8', 7, 'Jihoon', rogueAsCard, 'vetoRecovery', () => [w.rid],
      refuse('veto secret does not open this identity\'s veto commitment'),
      'He tries to veto Hana\'s recovery.'),
    call('7.9', 7, 'Hana', phoneWithCard, 'vetoRecovery', () => [w.hostileRid], ACCEPT,
      'Hana sees a recovery she did not start, types her veto card into the phone, and kills it.'),
    call('7.10', 7, 'Jihoon', () => p.rogue, 'finalizeRecovery', () => [w.hostileRid, w.successorCommits.id, w.successorCommits.veto],
      refuse('recovery vetoed'),
      'His own recovery is dead.'),

    // ---- 8 · seventy-two hours ---------------------------------------------------
    offchain('8.1', 8, 'Hana\'s new phone', 'The phone rebuilds Hana\'s identity secret from the two shares, and makes a new identity to succeed it.',
      () => {
        Object.assign(p.phone, recoverFromShares(p.phone.shares));
        return { detail: 'secret and salt rebuilt from shares alone' };
      }),
    call('8.2', 8, 'Hana\'s new phone', () => p.phone, 'finalizeRecovery', () => [w.rid, w.successorCommits.id, w.successorCommits.veto],
      refuse('timelock has not elapsed'),
      'Finalize now?'),
    clock('8.3', 8, DELAY + SLACK + 10, `Wait out the timelock: ${duration(DELAY + SLACK + 10)}.`,
      (L) => Number(L.recoveries.lookup(w.rid).openedAtHi) + DELAY + 5),
    call('8.4', 8, 'Hana\'s new phone', () => ({ ...p.phone, ...recoverFromShares([p.seoyeon.share, forged(p.mum.share, rng)]) }),
      'finalizeRecovery', () => [w.rid, w.successorCommits.id, w.successorCommits.veto],
      refuse('reconstructed secret does not open idCommit'),
      'Suppose one share had been tampered with in transit. The rebuilt secret is wrong, and the chain can tell.'),
    call('8.5', 8, 'the fee sponsor', () => p.sponsor, 'finalizeRecovery', () => [w.rid, w.successorCommits.id, w.successorCommits.veto],
      refuse('not the device the guardians approved'),
      'The sponsor who pays for Hana\'s transactions tries to finalize for itself.'),
    call('8.6', 8, 'Hana\'s new phone', () => p.phone, 'finalizeRecovery', () => [w.rid, w.successorCommits.id, w.successorCommits.veto],
      ACCEPT,
      'The phone finalizes: the approved device, the right secret, after the timelock. The old commitment is retired and a successor takes its place.',
      () => {
        w.newId = w.successorCommits.id;
        const s = w.successor;
        Object.assign(p.phone, { identitySecret: s.identitySecret, idSalt: s.idSalt,
          lineage: { root: w.id, member: w.newId } });
        // A fresh veto card comes with the new identity.
        Object.assign(p.card, { vetoSecret: s.vetoSecret, vetoSalt: s.vetoSalt, name: 'Hana\'s new veto card' });
      }),

    // ---- 9 · the DApp ------------------------------------------------------------
    call('9.1', 9, 'Jihoon', () => p.rogue, 'hostGatedAction', () => [w.id, w.id, nonce()],
      refuse('not the current owner of this identity root'),
      'Jihoon tries the DApp again with the old secret.'),
    call('9.2', 9, 'Hana\'s new phone', () => p.phone, 'hostGatedAction', () => [w.id, w.newId, nonce()], ACCEPT,
      'Hana\'s phone acts at the DApp. The DApp still stores the same single value — her identity root — and never had to change it.'),
    call('9.3', 9, 'anyone', () => ({ name: 'anyone', lineage: { root: w.id, member: w.newId } }), 'proveSuccession',
      () => [w.id, w.newId], ACCEPT,
      'Anyone can prove the new commitment is the current head of Hana\'s root: descent is one Merkle membership proof, headship one non-membership check.'),
    call('9.4', 9, 'anyone', () => ({ name: 'anyone', lineage: { root: w.id, member: w.id } }), 'proveSuccession',
      () => [w.id, w.id], refuse('head has been superseded'),
      'The same proof for the old commitment: it still descends from the root, but it is no longer the head.'),
    call('9.5', 9, 'Hana\'s new phone', () => p.phone, 'proveHeadOwnership', () => [w.id, w.newId], ACCEPT,
      'And the phone proves it holds the head\'s secret, without revealing it.'),

    // ---- epilogue ------------------------------------------------------------------
    offchain('10.1', 10, 'Hana', 'Hana deals fresh shares of her new secret. The old shares rebuild a retired secret, so they are worthless.',
      () => {
        const [a, b] = dealShares(p.phone.identitySecret, 2, 2, rng.field);
        p.seoyeon = { ...guardian('Seo-yeon'), share: a };
        p.mum = { ...guardian('Mum'), share: b };
        return { detail: 'two new shares, off chain' };
      }),
    call('10.2', 10, 'Hana', phoneWithCard, 'rotateGuardianSet', () => [w.newId, rng.bytes32()], ACCEPT,
      'With her new veto card she rotates the guardian set. Every old token is void — Jihoon\'s included.'),
    ...['seoyeon', 'mum'].map((g, i) =>
      call(`10.${i + 3}`, 10, 'Hana', () => ({ ...phoneWithCard(), guardianSecret: p[g].guardianSecret, leafSalt: p[g].leafSalt }),
        'addGuardian', () => [w.newId], ACCEPT, `She adds ${p[g].name} back, with a fresh token.`,
        (res) => { p[g].leaf = res; })),
  ];

  return { steps, world: w, personas: p, beats: BEATS };
}

// ---------------------------------------------------------------------------
// THE RUNNER, shared by every executor.
//
// An executor provides:
//   pure                          the contract's pure circuits
//   ledger()                      the current public ledger view (may be async)
//   call(ps, circuit, args, rec)  run a circuit as a persona; throw on refusal. It may
//                                 annotate `rec` (a chain executor adds tx ids and timings)
//   advance(seconds, until)       move time forward; `until` is the block time the story
//                                 actually needs, for executors that cannot skip time.
//                                 May return a description of what it did
//   scanLast()                    optional: a leak scan of the last accepted call
// ---------------------------------------------------------------------------

/** Counts of every public collection: what an accepted call visibly changed. */
export function publicRecord(L) {
  const n = (it) => { let c = 0; for (const _ of it) c++; return c; };
  return {
    enrolled: n(L.enrolled), guardianLeaves: Number(L.guardians.firstFree()),
    recoveries: n(L.recoveries), approvals: n(L.approvedNullifiers), vetoes: n(L.vetoNullifiers),
    killed: n(L.killed), retired: n(L.retiredIdentities), lineage: Number(L.lineage.firstFree()),
    guardianSets: n(L.usedGuardianCtx), gateActions: Number(L.gateActions),
  };
}

const diff = (a, b) => Object.fromEntries(Object.keys(b).filter((k) => a[k] !== b[k]).map((k) => [k, b[k] - a[k]]));

/** Run one step against executor `x` and return its record. */
export async function runStep(step, x) {
  const rec = { id: step.id, beat: step.beat, kind: step.kind, actor: step.actor, say: step.say };
  if (step.kind === 'call') {
    const ps = step.as();
    const args = step.args();
    rec.circuit = step.circuit;
    rec.args = args.map(show);
    rec.expect = step.expect.accept ? 'accepted' : `refused: ${step.expect.refuse}`;
    const before = publicRecord(await x.ledger());
    try {
      const result = await x.call(ps, step.circuit, args, rec);
      rec.outcome = 'accepted';
      rec.result = show(result);
      rec.publicChange = diff(before, publicRecord(await x.ledger()));
      if (x.scanLast) rec.scan = x.scanLast();
      step.save?.(result);
    } catch (e) {
      rec.outcome = 'refused';
      rec.message = messageOf(e);
    }
    rec.ok = step.expect.accept
      ? rec.outcome === 'accepted'
      : rec.outcome === 'refused' && rec.message.includes(step.expect.refuse);
  } else if (step.kind === 'offchain') {
    const out = (await step.run(x)) ?? {};
    rec.detail = out.detail;
    rec.ok = out.ok ?? true;
  } else {
    const until = step.until ? step.until(await x.ledger()) : undefined;
    rec.detail = (await x.advance(step.seconds, until)) ?? duration(step.seconds);
    rec.ok = true;
  }
  return rec;
}

/** Step through a story one step at a time (the browser's play button). */
export function createRunner(story, x) {
  let i = 0;
  return {
    get index() { return i; },
    get done() { return i >= story.steps.length; },
    peek() { return story.steps[i]; },
    async next() {
      if (i >= story.steps.length) throw new Error('the story is over');
      return runStep(story.steps[i++], x);
    },
  };
}

export async function runStory(story, x, { onStep = () => {} } = {}) {
  const runner = createRunner(story, x);
  const records = [];
  while (!runner.done) {
    const rec = await runner.next();
    records.push(rec);
    await onStep(rec);
  }
  return records;
}

// --- helpers ----------------------------------------------------------------
const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
export const fingerprint = (u) => hex(u).slice(0, 8).toUpperCase().replace(/(....)(....)/, '$1-$2');
function show(v) {
  if (v instanceof Uint8Array) return hex(v);
  if (typeof v === 'bigint') return v.toString();
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(show);
  return String(v);
}
function messageOf(e) {
  const m = String(e?.message ?? e);
  const i = m.indexOf('failed assert: ');
  return i >= 0 ? m.slice(i + 'failed assert: '.length) : m;
}
function forged(share, rng) {
  return { x: share.x, y: rng.field() };
}
export function duration(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60), s = seconds % 60;
  if (h) return `${h} h ${m} min`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min ${s} s`;
  return `${seconds} s`;
}
