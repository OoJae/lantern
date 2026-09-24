// "Try to break it": a world of the panel's own, built only when the visitor runs an attack.
// It is made with the story's engine -- the same executor, witnesses, identity code and step
// runner -- but it never touches the story's session. Each attack is one call to one compiled
// circuit, run through the story's own runStep, so an accept or a refusal here is exactly what
// the story would show: the circuit's own assert message.
import { rootBindings } from '../../../src/bindings/root.mjs';
import { simExecutor } from '../../../src/demo/sim-executor.mjs';
import { storyRng } from '../../../src/demo/rng.mjs';
import { runStep, publicRecord, fingerprint, duration, ACCEPT, refuse } from '../../../src/demo/story.mjs';
import { newIdentity, dealShares, recoverFromShares, be32, vetoSaltOf } from '../../../src/identity.js';
import { mod } from '../../../src/field.js';

const HOUR = 3600;
/** The story's duration(), without a trailing "0 min": 71 hours reads "71 h". */
const span = (seconds) => duration(seconds).replace(/ 0 min$/, '');
export const GUARDIAN_NAME = Object.freeze({ seoyeon: 'Seo-yeon', mum: 'Mum', jihoon: 'Jihoon' });

// Three worlds, each built the same way and only when an attack needs it. `main` is the one the
// panel describes; each of the other two differs from it in one thing.
const WORLDS = {
  main: { approvers: ['seoyeon', 'mum'], early: false },
  early: { approvers: ['seoyeon', 'mum'], early: true },   // the clock stops at 71 h
  lone: { approvers: ['seoyeon'], early: false },          // only Seo-yeon approves
};

/**
 * Hana enrolled with threshold 2 and three guardians, her shares dealt, a recovery opened for
 * her new phone, the approvals given, and the clock moved on. `onStep(label, i, n)` is awaited
 * before each circuit call, so the page can say what it is doing and paint in between.
 */
export async function newWorld(kind = 'main', onStep = async () => {}) {
  const { approvers, early } = WORLDS[kind];
  const rng = storyRng();
  const x = simExecutor(rootBindings);
  const pure = x.pure;
  const DELAY = Number(pure.recoveryDelaySeconds());
  const SLACK = Number(pure.openSlackSeconds());

  const hana = newIdentity(rng.field);
  const guardian = (k) => ({ name: GUARDIAN_NAME[k], guardianSecret: rng.bytes32(), leafSalt: rng.bytes32(), leaf: null, share: null });
  const p = {
    owner: { name: 'Hana (laptop + veto card)', ...hana },
    seoyeon: guardian('seoyeon'), mum: guardian('mum'), jihoon: guardian('jihoon'),
    phone: { name: 'Hana’s new phone', ephemeralSk: rng.bytes32(), shares: [] },
  };
  const id = pure.idCommitOf(hana.identitySecret, hana.idSalt);
  const phonePk = pure.ephemeralPkOf(p.phone.ephemeralSk);
  const next = newIdentity(rng.field);
  const successor = [pure.idCommitOf(next.identitySecret, next.idSalt), pure.vetoCommitOf(next.vetoSecret, next.vetoSalt)];

  // Every setup call must be accepted: a refusal here is a fault in the page, not an attack.
  const n = 5 + approvers.length;
  let i = 0;
  const setup = async (label, ps, circuit, args) => {
    await onStep(label, ++i, n);
    try {
      return await x.call(ps, circuit, args);
    } catch (e) {
      throw new Error(`Building the world, ${circuit} was refused: ${String(e?.message ?? e)}`);
    }
  };

  await setup('Hana enrols', p.owner, 'enrollIdentity', [id, pure.vetoCommitOf(hana.vetoSecret, hana.vetoSalt), 2n]);
  for (const g of ['seoyeon', 'mum', 'jihoon']) {
    p[g].leaf = await setup(`Hana adds ${p[g].name} as a guardian`,
      { ...p.owner, guardianSecret: p[g].guardianSecret, leafSalt: p[g].leafSalt }, 'addGuardian', [id]);
  }
  [p.seoyeon.share, p.mum.share, p.jihoon.share] = dealShares(hana.identitySecret, 3, 2, rng.field);
  const rid = await setup('Seo-yeon opens a recovery for the new phone', { name: 'Seo-yeon' }, 'openRecovery', [id, phonePk]);
  const openedAt = x.now;
  for (const g of approvers) await setup(`${p[g].name} approves`, p[g], 'approveRecovery', [id, rid]);
  // Seo-yeon and Mum send their shares to the phone, off the ledger. In the `lone` world Mum
  // sends hers without approving, so the phone still holds the right secret.
  p.phone.shares = [p.seoyeon.share, p.mum.share];

  // Past the timelock by the story's own margin, or one hour short of 72 hours.
  const lockEnds = Number(x.ledger().recoveries.lookup(rid).openedAtHi) + DELAY;
  await x.advance(early ? DELAY - HOUR : DELAY + SLACK + 10);

  return {
    kind, x, p, rng, id, rid, phonePk, successor, openedAt, lockEnds, spent: false,
    /** What the panel shows of this world: public values and the simulated clock. */
    facts() {
      const L = x.ledger();
      return {
        id, rid, phone: fingerprint(phonePk),
        approvals: Number(L.approvals.lookup(rid).read()), threshold: Number(L.thresholds.lookup(id)),
        since: span(x.now - openedAt), lock: x.now >= lockEnds ? 'over' : `${span(lockEnds - x.now)} to go`,
        retired: L.retiredIdentities.member(id),
      };
    },
  };
}

/**
 * A share's fingerprint: its first four bytes, most significant first, written as every other
 * fingerprint on this site. It is all the panel is given of a share: any two whole shares
 * rebuild Hana's secret.
 */
export const shareFingerprint = (share) => fingerprint(be32(mod(share.y)));

/** `share` with every bit of byte `i` inverted: what a tampered share looks like on arrival. */
export function flipByte(share, i) {
  if (!Number.isInteger(i) || i < 0 || i > 31) throw new Error('the byte must be a whole number from 0 to 31');
  const bytes = be32(mod(share.y));
  const before = bytes[i];
  bytes[i] ^= 0xff;
  // A flipped high byte can exceed the field's modulus r; the phone reads it modulo r, as it
  // reads any field value. That is still a different share: a change of one byte is never a
  // multiple of r.
  const y = mod(bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n));
  return { share: { x: share.x, y }, before, after: bytes[i] };
}

const finalize = (w) => ({ circuit: 'finalizeRecovery', args: [w.rid, ...w.successor] });
const rebuilt = (w) => recoverFromShares(w.p.phone.shares);

// Each attack: the world it runs in, what the contract should do, and the one call it makes.
const ATTACKS = {
  tamper: {
    world: 'main', expect: refuse('reconstructed secret does not open idCommit'),
    make(w, { whose, byte }) {
      if (whose !== 'seoyeon' && whose !== 'mum') throw new Error('only Seo-yeon’s and Mum’s shares reach the phone');
      const f = flipByte(w.p[whose].share, byte);
      const shares = w.p.phone.shares.map((s) => (s === w.p[whose].share ? f.share : s));
      // No byte's value goes into what the page shows: stepping through all 32 bytes of both
      // shares would otherwise read them out, and two shares rebuild Hana's secret.
      return {
        ...finalize(w), actor: 'Hana’s new phone', as: { ...w.p.phone, ...recoverFromShares(shares) },
        say: `Byte ${byte} of ${GUARDIAN_NAME[whose]}’s share arrives flipped, all eight of its bits inverted. The phone rebuilds a secret from the two shares it holds and finalizes.`,
        detail: { whose, byte },
      };
    },
  },
  otherPhone: {
    world: 'main', expect: refuse('not the device the guardians approved'),
    make(w) {
      const sk = w.rng.bytes32();
      return {
        ...finalize(w), actor: 'Another phone', as: { name: 'another phone', ephemeralSk: sk, ...rebuilt(w) },
        say: `A phone with a new device key, fingerprint ${fingerprint(w.x.pure.ephemeralPkOf(sk))}, holds the right secret rebuilt from both real shares and finalizes. The guardians approved ${fingerprint(w.phonePk)}.`,
      };
    },
  },
  early: {
    world: 'early', expect: refuse('timelock has not elapsed'),
    make(w) {
      return {
        ...finalize(w), actor: 'Hana’s new phone', as: { ...w.p.phone, ...rebuilt(w) },
        say: `In a second world, ${span(w.x.now - w.openedAt)} after the recovery opened, the approved phone rebuilds the right secret from both real shares and finalizes.`,
      };
    },
  },
  guessVeto: {
    world: 'main', expect: refuse('veto secret does not open this identity\'s veto commitment'),
    make(w) {
      const guess = w.rng.field();
      return {
        circuit: 'vetoRecovery', args: [w.rid], actor: 'Someone without the veto card',
        as: { name: 'a guessed veto card', vetoSecret: guess, vetoSalt: vetoSaltOf(guess) },
        say: 'They draw a veto secret at random, derive its salt the way a real card does, and veto Hana’s recovery.',
      };
    },
  },
  twice: {
    world: 'main', expect: refuse('guardian already approved'),
    make(w, { who }) {
      if (who !== 'seoyeon' && who !== 'mum') throw new Error('only Seo-yeon and Mum have approved');
      return {
        circuit: 'approveRecovery', args: [w.id, w.rid], actor: GUARDIAN_NAME[who], as: w.p[who],
        say: `${GUARDIAN_NAME[who]} approves Hana’s recovery again, with the same guardian token.`,
      };
    },
  },
  lone: {
    world: 'lone', expect: refuse('not enough approvals'),
    make(w) {
      return {
        ...finalize(w), actor: 'Hana’s new phone', as: { ...w.p.phone, ...rebuilt(w) },
        say: 'In a third world only Seo-yeon approved. Past the timelock, the approved phone rebuilds the right secret from both shares and finalizes.',
      };
    },
  },
  honest: {
    world: 'main', expect: ACCEPT,
    make(w) {
      return {
        ...finalize(w), actor: 'Hana’s new phone', as: { ...w.p.phone, ...rebuilt(w) },
        say: `The approved phone rebuilds the secret from Seo-yeon’s and Mum’s real shares and finalizes, ${span(w.x.now - w.openedAt)} after the recovery opened.`,
      };
    },
  },
};

export const worldOf = (key) => ATTACKS[key].world;

const same = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

/**
 * Run attack `key` in world `w` and return its record, in the same shape as a story step's.
 * Throws, rather than returning a refusal, when the call failed for any reason but the
 * contract's own assert: that is a fault in the page, and the contract refused nothing.
 */
export async function runAttack(w, key, opts = {}) {
  const a = ATTACKS[key];
  const m = a.make(w, opts);
  const step = { id: `try-${key}`, beat: null, kind: 'call', actor: m.actor, say: m.say,
    as: () => m.as, circuit: m.circuit, args: () => m.args, expect: a.expect };
  // runStep records any exception inside its call as a refusal, and strips the runtime's
  // "failed assert: " from the message. Keep what the call itself threw, to tell them apart.
  let thrown = null;
  const x = Object.create(w.x);
  x.call = async (...args) => {
    try {
      return await w.x.call(...args);
    } catch (e) {
      thrown = e;
      throw e;
    }
  };
  // The world as it stood before the call, so the result can say where it ran.
  const facts = w.facts();
  const before = publicRecord(w.x.ledger());
  const rec = await runStep(step, x);
  // Measured, not assumed: once Hana's commitment is retired, this world has nothing left to attack.
  w.spent = w.x.ledger().retiredIdentities.member(w.id);
  const asserted = thrown !== null && String(thrown?.message ?? thrown).includes('failed assert: ');
  if (rec.outcome === 'refused' && !asserted) {
    throw new Error(`The page failed while running ${m.circuit}, so this is not a refusal by the contract: ${rec.message}`);
  }
  // Measured, not assumed: a refused call left every public count as it was.
  if (rec.outcome === 'refused') rec.unchanged = same(before, publicRecord(w.x.ledger()));
  return { ...rec, key, world: w.kind, facts, spent: w.spent, detail: m.detail ?? null };
}
