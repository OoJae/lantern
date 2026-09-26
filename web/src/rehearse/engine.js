// "Rehearse a recovery": a world the visitor builds with their own choices, loaded only by /rehearse.
// It is made with the story's engine, as "Try to break it" is: the same executor (the compiled
// circuits against an in-memory ledger), the same witnesses, identity and Shamir code, and every
// circuit call goes through the story's own runStep. So each accept, and each refusal and its
// message, is the compiled contract's, never the page's: the page decides only which call to make,
// as whom. No wallet, no chain, no proofs.
//
// The visitor is the owner. They choose three to five guardians and a threshold, enrol, lose the
// laptop, open a recovery from a new phone, and then play each guardian in turn: compare six words and
// approve, or refuse. A phishing call can join in, from a caller who opens a recovery of his own and
// reads out his own device's words. Whoever a guardian approves gets that guardian's share.
import '../polyfills.js';
import { rootBindings } from '../../../src/bindings/root.mjs';
import { simExecutor } from '../../../src/demo/sim-executor.mjs';
import { storyRng } from '../../../src/demo/rng.mjs';
import { runStep, publicRecord, fingerprint, duration, ACCEPT } from '../../../src/demo/story.mjs';
import { newIdentity, dealShares, recoverFromShares } from '../../../src/identity.js';
import { fingerprintWords } from '../../../src/words.js';
import { buildGuardianKit, buildVetoCard } from '../../../src/kit.js';
import { flipByte, shareFingerprint } from '../lib/breakit.js';
import { hex } from '../lib/format.js';
import { possessive } from './copy.js';

export { duration, fingerprint, fingerprintWords };

export const MIN_GUARDIANS = 3;
export const MAX_GUARDIANS = 5;
/** Fictional, like everyone in the story. The visitor can rename them; names never leave the page. */
export const DEFAULT_NAMES = Object.freeze(['Ara', 'Dad', 'Min-jun', 'Yuna', 'Bora']);
export const NAME_MAX = 24;

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
// A secret's first four bytes, grouped as the story groups every fingerprint (3303-F64D), so a share
// and a secret read alike in one panel.
const first8 = (v) => (v instanceof Uint8Array ? hex(v) : v.toString(16).padStart(64, '0'))
  .slice(0, 8).toUpperCase().replace(/(....)(....)/, '$1-$2');

/**
 * A new rehearsal: fresh Web Crypto secrets, an empty in-memory ledger, and nothing called yet.
 * @param {{ names: string[], threshold: number }} choice
 */
export function newRehearsal({ names, threshold }) {
  const n = names.length;
  const t = threshold;
  if (!Number.isInteger(n) || n < MIN_GUARDIANS || n > MAX_GUARDIANS) throw new Error(`choose ${MIN_GUARDIANS} to ${MAX_GUARDIANS} guardians`);
  if (!Number.isInteger(t) || t < 2 || t > n) throw new Error(`the threshold must be a whole number from 2 to ${n}`);

  const rng = storyRng();
  const x = simExecutor(rootBindings);
  const pure = x.pure;
  const DELAY = Number(pure.recoveryDelaySeconds());
  const SLACK = Number(pure.openSlackSeconds());
  const startedAt = x.now;

  const me = newIdentity(rng.field);
  const id = pure.idCommitOf(me.identitySecret, me.idSalt);
  const vetoCommit = pure.vetoCommitOf(me.vetoSecret, me.vetoSalt);
  const commitsOf = (ident) => [pure.idCommitOf(ident.identitySecret, ident.idSalt), pure.vetoCommitOf(ident.vetoSecret, ident.vetoSalt)];
  const successor = newIdentity(rng.field);
  const callerSuccessor = newIdentity(rng.field);

  // Private state: what each device or person holds. Witnesses read these and nothing else.
  const p = {
    laptop: { name: 'Your laptop', identitySecret: me.identitySecret, idSalt: me.idSalt },
    card: { name: 'Your veto card', vetoSecret: me.vetoSecret, vetoSalt: me.vetoSalt, words: null },
    guardians: names.map((name, i) => ({ i, name, guardianSecret: rng.bytes32(), leafSalt: rng.bytes32(), leaf: null, share: null, kit: null })),
    phone: { name: 'Your new phone', ephemeralSk: null, from: [] },   // from: the guardians whose shares it holds
    caller: null,                                                       // { ephemeralSk, from }
    other: null,                                                        // a second phone, if the visitor finalizes from one
  };
  const owner = (g) => ({ ...p.laptop, ...p.card, name: 'You (laptop and veto card)',
    ...(g ? { guardianSecret: g.guardianSecret, leafSalt: g.leafSalt } : {}) });

  const s = {
    enrolled: false, lost: false, dealt: false,
    rid: null, phonePk: null, openedAt: null, lockEnds: null,
    callerRid: null, callerPk: null, callerTried: false,
    decisions: {},       // `${i}:${who}` -> 'approved' | 'refused'
    skipped: false,
    finalized: null,     // 'you' | 'caller'
  };
  const records = [];
  let seq = 0;

  // One step through the story's own runner. A refusal must be the circuit's assert: anything else
  // the call threw is a fault in the page, and the contract refused nothing.
  async function run(stage, step) {
    let thrown = null;
    const via = Object.create(x);
    via.call = async (...a) => {
      try {
        return await x.call(...a);
      } catch (e) {
        thrown = e;
        throw e;
      }
    };
    const full = { id: `r${++seq}`, beat: stage, expect: ACCEPT, ...step };
    const rec = await runStep(full, via);
    if (rec.kind === 'call' && rec.outcome === 'refused' && !String(thrown?.message ?? thrown).includes('failed assert: ')) {
      throw new Error(`The page failed while running ${rec.circuit}, so this is not a refusal by the contract: ${rec.message}`);
    }
    // The page expects nothing of a call: the visitor chose it, and the contract answers.
    delete rec.ok;
    delete rec.expect;
    rec.stage = stage;
    rec.seq = seq;
    rec.at = x.now;
    if (step.tag) rec.tag = step.tag;
    if (step.guardian !== undefined) rec.guardian = step.guardian;
    if (step.approvals !== undefined) rec.approvals = step.approvals;
    records.push(rec);
    return rec;
  }
  const call = (stage, actor, say, as, circuit, args, extra = {}) =>
    run(stage, { kind: 'call', actor, say, as: () => as, circuit, args: () => args, ...extra });
  const note = (stage, actor, say, detail, extra = {}) =>
    run(stage, { kind: 'offchain', actor, say, run: () => ({ detail }), ...extra });

  const shareOf = (i) => p.guardians[i].share;
  const approvalsOf = (rid) => {
    const L = x.ledger();
    return rid && L.approvals.member(rid) ? Number(L.approvals.lookup(rid).read()) : 0;
  };
  const rebuiltFrom = (from) => (from.length ? recoverFromShares(from.map(shareOf)) : {});
  const guardianName = (i) => p.guardians[i].name;

  const api = {
    n, t, names: p.guardians.map((g) => g.name), DELAY, SLACK,
    get records() { return records; },
    get state() { return s; },
    get now() { return x.now; },
    startedAt,

    /** Enrol, add every guardian, and deal the shares. `onStep(label, i, of)` is awaited before each call. */
    async enrol(onStep = async () => {}) {
      if (s.enrolled) throw new Error('already enrolled');
      const of = n + 2;
      let k = 0;
      await onStep('Enrolling your identity', ++k, of);
      const r = await call('enrol', 'You', `You enrol your identity: a commitment to its secret, a commitment to a separate veto secret, and the rule, ${t} of ${n}.`,
        owner(), 'enrollIdentity', [id, vetoCommit, BigInt(t)]);
      if (r.outcome !== 'accepted') return records;
      s.enrolled = true;
      for (const g of p.guardians) {
        await onStep(`Adding ${g.name}`, ++k, of);
        await call('enrol', 'You', `You add ${g.name} as a guardian. The leaf is public; the secret inside it goes to ${g.name} privately.`,
          owner(g), 'addGuardian', [id], { save: (leaf) => { g.leaf = leaf; } });
      }
      await onStep('Dealing the shares', ++k, of);
      // Each guardian's kit, in words, as /kit prints one: their guardian secret, leaf salt and share,
      // for the guardian context their leaf was minted under (read from the ledger, not assumed), and
      // three check words over all of it. A practice kit: it names no network's contract.
      const ctx = x.ledger().guardianCtx.lookup(id);
      dealShares(me.identitySecret, n, t, rng.field).forEach((share, i) => {
        const g = p.guardians[i];
        g.share = share;
        g.kit = buildGuardianKit({ network: 'practice', contract: null, idCommit: id, ctx, threshold: t, guardians: n,
          share, guardianSecret: g.guardianSecret, leafSalt: g.leafSalt });
      });
      p.card.words = buildVetoCard(me.vetoSecret);
      s.dealt = true;
      await note('enrol', 'You', `You split your identity secret into ${n} shares, any ${t} of which rebuild it, and give each guardian a kit in words: their share, and the guardian secret that lets them approve. One share alone reveals nothing. Your veto card, in words too, goes in a drawer.`,
        `${n} kits dealt, off the ledger`);
      return records;
    },

    async loseLaptop() {
      if (s.lost) throw new Error('the laptop is already gone');
      s.lost = true;
      delete p.laptop.identitySecret;
      delete p.laptop.idSalt;
      await note('lose', 'You', 'The laptop is gone, and your identity secret with it. A wallet seed restores keys, not private state.',
        'identity secret: gone · veto card: in the drawer');
      return records;
    },

    async openRecovery() {
      if (s.rid) throw new Error('a recovery is already open');
      p.phone.ephemeralSk = rng.bytes32();
      s.phonePk = pure.ephemeralPkOf(p.phone.ephemeralSk);
      const r = await call('open', 'Your new phone',
        'The new phone makes a one-time device key and opens a recovery of your identity for it. Opening needs no secret: the phone has none to offer.',
        { name: 'Your new phone' }, 'openRecovery', [id, s.phonePk], { save: (rid) => { s.rid = rid; } });
      if (r.outcome === 'accepted') {
        s.openedAt = x.now;
        s.lockEnds = Number(x.ledger().recoveries.lookup(s.rid).openedAtHi) + DELAY;
      }
      return records;
    },

    /** The phishing call: a stranger opens a recovery for his own device and calls every guardian. */
    async phish() {
      if (s.callerRid) throw new Error('the caller has already called');
      p.caller = { name: 'The caller’s phone', ephemeralSk: rng.bytes32(), from: [] };
      s.callerPk = pure.ephemeralPkOf(p.caller.ephemeralSk);
      await call('decide', 'The caller',
        'Someone who knows who your guardians are opens a recovery of your identity for his own phone. Anyone may.',
        { name: 'the caller' }, 'openRecovery', [id, s.callerPk], { save: (rid) => { s.callerRid = rid; }, tag: 'caller' });
      await note('decide', 'The caller',
        'He rings each of your guardians. Caller ID can be faked, so the call may even show your name: “It’s me, I lost my laptop. I’m on a new phone. Can you approve it? Here are my words.” He reads out his own phone’s six words.',
        'phone calls, off the ledger', { tag: 'caller' });
      return records;
    },

    /** Guardian `i` approves the recovery for `who` ('phone' or 'caller'), and sends that device their share. */
    async approve(i, who) {
      const g = p.guardians[i];
      const key = `${i}:${who}`;
      if (s.decisions[key]) throw new Error(`${g.name} has already answered`);
      const rid = who === 'caller' ? s.callerRid : s.rid;
      const to = who === 'caller' ? 'the caller’s phone' : 'your new phone';
      const r = await call('decide', g.name,
        who === 'caller'
          ? `${g.name} approves the recovery for the words the caller read out, and sends his phone their share, off the ledger.`
          : `${g.name} compares the six words with the ones you read out, approves, and sends ${to} their share, off the ledger.`,
        g, 'approveRecovery', [id, rid], { tag: who, guardian: i });
      // A refusal here would be the contract's, and the page shows it: the guardian's answer is then
      // not counted, and no share moves.
      s.decisions[key] = r.outcome === 'accepted' ? 'approved' : 'not counted';
      if (r.outcome === 'accepted') (who === 'caller' ? p.caller : p.phone).from.push(i);
      return records;
    },

    async refuse(i, who) {
      const g = p.guardians[i];
      const key = `${i}:${who}`;
      if (s.decisions[key]) throw new Error(`${g.name} has already answered`);
      s.decisions[key] = 'refused';
      await note('decide', g.name,
        who === 'caller'
          ? `${g.name} refuses the caller. Nothing reaches the ledger, and the share stays where it is.`
          : `${g.name} refuses the recovery for your new phone. Nothing reaches the ledger, and the share stays where it is.`,
        'no approval, no share sent', { tag: who, guardian: i });
      return records;
    },

    /** Your veto card, typed into the new phone, kills the recovery for `who`. */
    async veto(who) {
      const rid = who === 'caller' ? s.callerRid : s.rid;
      await call('window', 'You',
        who === 'caller'
          ? 'You see a recovery of your identity that you did not start: its words are not your phone’s. You type your veto card into the new phone and veto it.'
          : 'You type your veto card into the new phone and veto your own recovery.',
        { ...p.card, name: 'Your new phone, with your veto card typed in' }, 'vetoRecovery', [rid], { tag: who });
      return records;
    },

    /** Wait out the timelock on the simulated clock. The caller finalizes the moment he can. */
    async skip() {
      if (s.skipped) throw new Error('the clock has already moved on');
      const seconds = DELAY + SLACK + 10;
      await run('window', { kind: 'clock', actor: 'Time', seconds,
        say: `The simulated clock moves on ${duration(seconds)}: past the timelock, which ends 72 hours after the later of the two times the recovery recorded when it opened.` });
      s.skipped = true;
      if (s.callerRid && !s.callerTried) {
        s.callerTried = true;
        const from = p.caller.from;
        const approvals = approvalsOf(s.callerRid);
        const r = await call('window', 'The caller’s phone',
          from.length
            ? `The caller’s 72 hours end with yours. He rebuilds a secret from the ${from.length === 1 ? 'share' : `${from.length} shares`} he was sent (${possessive(from.map(guardianName))}) and finalizes his recovery at once.`
            : 'The caller’s 72 hours end with yours. No guardian sent him a share, but he finalizes his recovery anyway.',
          { ...p.caller, ...rebuiltFrom(from) }, 'finalizeRecovery', [s.callerRid, ...commitsOf(callerSuccessor)], { tag: 'caller', approvals });
        if (r.outcome === 'accepted') s.finalized = 'caller';
      }
      return records;
    },

    /**
     * Your side of the finalize: from the approved phone or a different one, with the shares it was sent,
     * one of them changed in transit if `tamper`.
     */
    async finalize({ other = false, tamper = false } = {}) {
      const from = p.phone.from;
      let shares = from.map(shareOf);
      let bits = '';
      if (tamper && shares.length) {
        const byte = rng.bytes32()[0] % 32;
        shares = [flipByte(shares[0], byte).share, ...shares.slice(1)];
        bits = ` Byte ${byte} of ${guardianName(from[0])}’s share arrives changed, all eight of its bits inverted.`;
      }
      const rebuilt = shares.length ? recoverFromShares(shares) : {};
      let device = p.phone;
      if (other) {
        p.other ??= { name: 'A different phone', ephemeralSk: rng.bytes32() };
        device = p.other;
      }
      const held = from.length
        ? `rebuilds a secret from the ${from.length === 1 ? 'one share' : `${from.length} shares`} it holds (${possessive(from.map(guardianName))})`
        : 'holds no share, so it has no secret to rebuild,';
      const say = other
        ? `A different phone, with a new device key, ${held.replace('it holds', 'your new phone holds')} and finalizes your recovery.${bits}`
        : `Your new phone ${held} and finalizes your recovery.${bits}`;
      const r = await call('finalize', other ? 'A different phone' : 'Your new phone', say,
        { ...device, ...rebuilt, name: device.name }, 'finalizeRecovery', [s.rid, ...commitsOf(successor)],
        { tag: other ? 'other' : tamper ? 'tampered' : 'phone', approvals: approvalsOf(s.rid) });
      if (r.outcome === 'accepted') {
        s.finalized = 'you';
        Object.assign(p.phone, { identitySecret: successor.identitySecret, idSalt: successor.idSalt });
        Object.assign(p.card, { vetoSecret: successor.vetoSecret, vetoSalt: successor.vetoSalt, name: 'Your new veto card' });
      }
      return records;
    },

    /** The simulated clock, as the page shows it. */
    clock() {
      const since = s.openedAt === null ? null : x.now - s.openedAt;
      return {
        now: x.now, startedAt, since, lockEnds: s.lockEnds,
        over: s.lockEnds !== null && x.now >= s.lockEnds,
        left: s.lockEnds === null ? null : Math.max(0, s.lockEnds - x.now),
      };
    },

    /** Each recovery's public facts: what anyone watching your identity can read. */
    recoveries() {
      const L = x.ledger();
      const one = (who, rid, pk) => {
        if (!rid || !L.recoveries.member(rid)) return null;
        const rec = L.recoveries.lookup(rid);
        return {
          who, rid: hex(rid), device: pk, approvals: Number(L.approvals.lookup(rid).read()),
          threshold: Number(L.thresholds.lookup(rec.idCommit)), vetoed: L.killed.member(rid),
          opensAt: Number(rec.openedAtHi) + DELAY,
        };
      };
      return [one('phone', s.rid, s.phonePk), one('caller', s.callerRid, s.callerPk)].filter(Boolean);
    },

    /** The whole public ledger, as values anyone can read. Names appear nowhere in it. */
    ledger() {
      const L = x.ledger();
      // Each identity with what is public beside it: its threshold, its veto commitment, the genesis root
      // it descends from, and the guardian context its leaves are minted under.
      // The first commitment (its own root) leads, and its successor follows it, whatever order the
      // ledger's set keeps them in.
      const ids = [...L.enrolled].map((c) => {
        const root = L.idRoots.member(c) ? L.idRoots.lookup(c) : null;
        return {
          h: hex(c), threshold: Number(L.thresholds.lookup(c)), retired: L.retiredIdentities.member(c),
          veto: L.vetoCommits.member(c) ? hex(L.vetoCommits.lookup(c)) : null,
          root: root ? hex(root) : null,
          ctx: root && L.guardianCtx.member(root) ? hex(L.guardianCtx.lookup(root)) : null,
        };
      }).sort((a, b) => Number(b.root === b.h) - Number(a.root === a.h));
      const leaves = p.guardians.filter((g) => g.leaf).map((g) => hex(g.leaf));
      const recs = [...L.recoveries].map(([rid, rec]) => ({
        h: hex(rid), device: hex(rec.ephemeralPk), pk: rec.ephemeralPk, opensAt: Number(rec.openedAtHi) + DELAY,
        openedAtLo: Number(rec.openedAtLo), openedAtHi: Number(rec.openedAtHi),
        approvals: Number(L.approvals.lookup(rid).read()), vetoed: L.killed.member(rid),
      }));
      return {
        counts: publicRecord(L),
        ids, leaves, recs,
        nullifiers: [...L.approvedNullifiers].map(hex),
        vetoes: [...L.vetoNullifiers].map(hex),
        lineage: Number(L.lineage.firstFree()),
      };
    },

    /** What each device and person holds: private state, none of it on the ledger. */
    holdings() {
      const out = [
        { key: 'laptop', name: 'Your laptop', gone: s.lost,
          items: s.lost ? [] : [{ label: 'identity secret', fp: first8(p.laptop.identitySecret) }] },
        { key: 'card', name: s.finalized === 'you' ? 'Your new veto card' : 'Your veto card',
          items: [{ label: 'veto secret', fp: first8(p.card.vetoSecret) }] },
      ];
      if (s.phonePk) {
        const items = [{ label: 'device secret key', fp: first8(p.phone.ephemeralSk) }];
        if (p.phone.from.length) items.push({ label: `${p.phone.from.length} share${p.phone.from.length === 1 ? '' : 's'}`, shares: p.phone.from.length });
        if (s.finalized === 'you') items.push({ label: 'new identity secret', fp: first8(p.phone.identitySecret) });
        out.push({ key: 'phone', name: 'Your new phone', items });
      }
      for (const g of p.guardians) {
        const items = [{ label: 'guardian secret', fp: first8(g.guardianSecret) }];
        if (g.share) items.push({ label: `share #${g.share.x}`, fp: shareFingerprint(g.share), shares: 1 });
        out.push({ key: `g${g.i}`, name: g.name, guardian: g.i, items });
      }
      if (p.caller) {
        const items = [{ label: 'device secret key', fp: first8(p.caller.ephemeralSk) }];
        if (p.caller.from.length) items.push({ label: `${p.caller.from.length} of your shares`, shares: p.caller.from.length });
        // With t shares he rebuilds your secret: he can act as you until your own recovery retires it.
        const tag = s.finalized === 'caller' ? 'holds your identity' : p.caller.from.length >= t && s.finalized !== 'you' ? 'can act as you' : 'not you';
        out.push({ key: 'caller', name: 'The caller', turned: true, tag, items });
      }
      return out;
    },

    /** A guardian's kit in words (src/kit.js), once dealt: their share, guardian secret and leaf salt. */
    kit: (i) => p.guardians[i].kit,
    /** Your veto card in words, as dealt at enrolment: the one in the drawer. */
    get vetoCard() { return p.card.words; },
    /** A guardian's share fingerprint, the first four bytes: all the page shows of a share. */
    shareFingerprint: (i) => (p.guardians[i].share ? shareFingerprint(p.guardians[i].share) : null),
    /** Whose shares a device holds, by guardian index. */
    sharesAt: (who) => [...(who === 'caller' ? p.caller?.from ?? [] : p.phone.from)],
    /** Two device keys compared word for word, as a guardian would. */
    sameWords: (a, b) => Boolean(a && b) && same(fingerprintWords(a), fingerprintWords(b)),
  };
  return api;
}
