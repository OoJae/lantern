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
const BOOK_NAME = Object.freeze({ seoyeon: 'seo-yeon.example', mum: 'mum.example', jihoon: 'jihoon.example' });

export const BEATS = Object.freeze([
  { n: 0, title: 'Thirty days earlier', caption: 'Hana enrols her identity and deals a 2-of-3 guardian quorum. Elsewhere, an independent DApp\'s committee attests who owns what.' },
  { n: 1, title: 'An ordinary day', caption: 'Her laptop acts at two DApps that gate on her identity root: one built on Lantern, one deployed independently.' },
  { n: 2, title: 'The laptop is gone', caption: 'A wallet seed restores keys, not state. Her identity secret is gone with it.' },
  { n: 3, title: 'A new phone', caption: 'Anyone may open a recovery. Seo-yeon opens one for the phone, which holds no secret yet.' },
  { n: 4, title: 'Two guardians approve', caption: 'They check the phone\'s fingerprint first. The public record gains two opaque nullifiers and a count of two approvals, but not who gave them.' },
  { n: 5, title: 'The attacker reads the ledger', caption: 'Everything on chain, and an address book of Hana\'s contacts.' },
  { n: 6, title: 'What the chain refuses', caption: 'A real guardian of someone else. A guardian approving twice.' },
  { n: 7, title: 'Jihoon turns', caption: 'With Mum\'s phished share he rebuilds Hana\'s secret. Watch what it buys him.' },
  { n: 8, title: 'Seventy-two hours', caption: 'The phone finalizes, once the timelock allows it and only with the real shares.' },
  { n: 9, title: 'The DApp never noticed', caption: 'The old secret dies at once where Lantern is read directly, and where a committee relays it as soon as the committee seals a snapshot taken after the recovery.' },
  { n: 10, title: 'Epilogue', caption: 'Fresh shares, a guardian set without Jihoon, and a committee that replaces a leaked key.' },
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
    snaps: {}, candidate: null, leaked: null,
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
  // Steps against the independently deployed host. `host` marks everything that
  // belongs to it, so a run can leave the whole thread out (the devnet's --quick).
  const hostCall = (...a) => ({ ...call(...a), contract: 'host', host: true });
  const hostOffchain = (...a) => ({ ...offchain(...a), host: true });
  const member = (i) => () => ({ name: `committee member ${i + 1}` });
  const u32 = (n) => BigInt(n);
  const gate = (id, beat, actor, as, e, current, expect, say) =>
    hostCall(id, beat, actor, as, 'requireCurrentOwnerAttested', () => [u32(e), w.id, current(), nonce()], expect, say);
  const onPath = (ps, e, member) => ({ ...ps, snapshotPath: w.snaps[e].pathFor(w.id, member) });

  // A committee epoch: rebuild the canonical live set from Lantern's public ledger,
  // propose its root, two Jubjub Schnorr signatures (verified in-circuit), seal.
  const epoch = (ids, beat, e, say, voters = [0, 1]) => [
    hostOffchain(ids[0], beat, 'the committee', say, async (x) => {
      const snap = await x.snapshot();
      w.snaps[e] = snap;
      const n = snap.entries.length;
      return { detail: `${n} current owner${n === 1 ? '' : 's'} · canonical root ${snap.root.toString(16).slice(0, 12)}…` };
    }),
    hostCall(ids[1], beat, 'committee member 1', member(0), 'openEpoch', () => [u32(e), w.snaps[e].root], ACCEPT,
      `Member 1 proposes that root as epoch ${e}.`),
    ...voters.map((slot, k) => hostCall(ids[2 + k], beat, `committee member ${slot + 1}`, member(slot), 'attestVote',
      async (x) => {
        const root = w.snaps[e].root;
        const gen = (await x.hostLedger()).committeeGen;
        return [u32(e), root, BigInt(slot), x.committee.pk(slot), x.committee.sign(slot, x.hostPure.attestDigest(x.hostTag, gen, u32(e), root))];
      }, ACCEPT, `Member ${slot + 1} signs it. The circuit verifies the Jubjub Schnorr signature itself.`)),
    hostCall(ids[2 + voters.length], beat, 'committee member 1', member(0), 'sealEpoch', () => [u32(e), w.snaps[e].root], ACCEPT,
      `Two of three: epoch ${e} is sealed.`),
  ];
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
    ...epoch(['0.8', '0.9', '0.10', '0.11', '0.12'], 0, 0,
      'An independent DApp, deployed separately, cannot read Lantern. It trusts a three-member committee, which rebuilds the list of current owners from Lantern\'s public ledger.'),

    // ---- 1 · an ordinary day -------------------------------------------------
    call('1.1', 1, 'Hana\'s laptop', () => p.laptop, 'hostGatedAction', () => [w.id, w.id, nonce()], ACCEPT,
      'The DApp stores one value, Hana\'s identity root, and asks: is the caller its current owner? Yes.'),
    gate('1.2', 1, 'Hana\'s laptop', () => onPath(p.laptop, 0, w.id), 0, () => w.id, ACCEPT,
      'The independent DApp asks the same question of the committee\'s latest epoch, with a Merkle path the laptop fetched off the chain. Yes.'),

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
    gate('7.11', 7, 'Jihoon', () => onPath(p.rogue, 0, w.id), 0, () => w.id, ACCEPT,
      'But until Hana\'s recovery finalizes, the secret he holds is the owner\'s at the independent DApp too.'),

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
    ...epoch(['8.4', '8.5', '8.6', '8.7', '8.8'], 8, 1,
      'Meanwhile the committee seals its daily epoch. Hana\'s old commitment is still current: her recovery has not finalized.'),
    call('8.9', 8, 'Hana\'s new phone', () => ({ ...p.phone, ...recoverFromShares([p.seoyeon.share, forged(p.mum.share, rng)]) }),
      'finalizeRecovery', () => [w.rid, w.successorCommits.id, w.successorCommits.veto],
      refuse('reconstructed secret does not open idCommit'),
      'Suppose one share had been tampered with in transit. The rebuilt secret is wrong, and the chain can tell.'),
    call('8.10', 8, 'the fee sponsor', () => p.sponsor, 'finalizeRecovery', () => [w.rid, w.successorCommits.id, w.successorCommits.veto],
      refuse('not the device the guardians approved'),
      'The sponsor who pays for Hana\'s transactions tries to finalize for itself.'),
    call('8.11', 8, 'Hana\'s new phone', () => p.phone, 'finalizeRecovery', () => [w.rid, w.successorCommits.id, w.successorCommits.veto],
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
    gate('9.6', 9, 'Jihoon', () => onPath(p.rogue, 1, w.id), 1, () => w.id, ACCEPT,
      'At the independent DApp, the old secret still works: epoch 1 was built and sealed before the recovery, and a snapshot can only say who owned what when it was built. SECURITY.md §4.4 bounds the gap: at most 24 hours after epoch 1 sealed.'),
    ...epoch(['9.7', '9.8', '9.9', '9.10', '9.11'], 9, 2,
      'The committee\'s next epoch rebuilds the list from the ledger: Hana\'s old commitment is retired, her successor is current.'),
    gate('9.12', 9, 'Jihoon', () => onPath(p.rogue, 1, w.id), 2, () => w.id, refuse('ownership leaf is not in the attested snapshot'),
      'Jihoon tries epoch 2 with his path from epoch 1.'),
    gate('9.13', 9, 'Jihoon', () => onPath(p.rogue, 1, w.id), 1, () => w.id, refuse('not the latest epoch'),
      'And epoch 1 again: it is no longer the latest.'),
    gate('9.14', 9, 'Hana\'s new phone', () => onPath(p.phone, 2, w.newId), 2, () => w.newId, ACCEPT,
      'Hana\'s phone passes at the independent DApp too. It never changed the value it stores either.'),

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
    hostOffchain('10.5', 10, 'the committee', 'Committee member 3\'s signing key leaks. The committee is deliberately not sealed, so the other two can replace it.',
      (x) => {
        w.leaked = x.committee.signer(2);
        w.candidate = x.committee.candidate(rng.bytes32());
        return { detail: 'a new key for slot 3' };
      }),
    hostCall('10.6', 10, 'committee member 1', member(0), 'openRotation', () => [2n, ...w.candidate.xy], ACCEPT,
      'Member 1 proposes the replacement.'),
    ...[0, 1].map((slot, k) => hostCall(`10.${7 + k}`, 10, `committee member ${slot + 1}`, member(slot), 'rotateVote',
      async (x) => {
        const gen = (await x.hostLedger()).committeeGen;
        const sig = x.committee.sign(slot, x.hostPure.rotateDigest(x.hostTag, gen, 2n, ...w.candidate.xy));
        return [2n, ...w.candidate.xy, BigInt(slot), x.committee.pk(slot), sig];
      }, ACCEPT, `Member ${slot + 1} signs the rotation.`)),
    hostCall('10.9', 10, 'committee member 1', member(0), 'sealRotation', () => [2n, ...w.candidate.xy], ACCEPT,
      'Sealed: slot 3 has a new key, and the generation moves on, voiding every signature the leaked key ever made.',
      () => { w.candidate.install(2); }),
    ...epoch(['10.10', '10.11', '10.12', '10.13', '10.15'], 10, 3,
      'The committee seals epoch 3 under the new generation, with member 3\'s new key.', [1, 2]),
  ];
  // The leaked key tries to vote for epoch 3, before it seals.
  steps.splice(steps.findIndex((s) => s.id === '10.15'), 0,
    hostCall('10.14', 10, 'whoever holds the leaked key', member(2), 'attestVote',
      async (x) => {
        const root = w.snaps[3].root;
        const gen = (await x.hostLedger()).committeeGen;
        return [3n, root, 2n, w.leaked.pk, w.leaked.sign(x.hostPure.attestDigest(x.hostTag, gen, 3n, root))];
      }, refuse('public key does not match this committee slot'),
      'Whoever holds the leaked key tries to vote for epoch 3 in slot 3.'));

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

/** The independent host's public state, summarised the same way. */
export function hostRecord(L) {
  let votes = 0; for (const _ of L.voteNullifiers) votes++;
  return { sealedEpochs: Number(L.latestEpoch), committeeGen: Number(L.committeeGen),
    committeeVotes: votes, hostActions: Number(L.gateActions) };
}

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
    const onHost = step.contract === 'host';
    const read = async () => (onHost ? hostRecord(await x.hostLedger()) : publicRecord(await x.ledger()));
    const ps = step.as();
    const args = await step.args(x);
    rec.circuit = step.circuit;
    if (onHost) rec.contract = 'host';
    rec.args = args.map(show);
    rec.expect = step.expect.accept ? 'accepted' : `refused: ${step.expect.refuse}`;
    const before = await read();
    try {
      const result = await x.call(ps, step.circuit, args, rec, onHost ? 'host' : 'lantern');
      rec.outcome = 'accepted';
      rec.result = show(result);
      rec.publicChange = diff(before, await read());
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
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, u]) => [k, show(u)]));
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
