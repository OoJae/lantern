// The v2 client helpers in src/v2/: every mirror of a contract constant is
// checked against the compiled code, and the wrapper that speaks to the
// contract as owner, guardians and device runs a whole v2 life end to end.
import { describe, it, expect } from 'vitest';
import * as rt from '@midnight-ntwrk/compact-runtime';
import * as Lantern2 from '../contracts/managed-lantern2/contract/index.js';
import { pureCircuits as V1 } from './simulator.js';
import {
  DEFAULT_DELAY, MIN_DELAY, MAX_DELAY, PERIOD, COOLDOWNS,
  checkConstants, checkDelay, cooldownOf, periodOf, periodBounds, slotOf,
} from '../src/v2/timeline.js';
import { newIdentity, commitmentsOf, dealShares, recoverFromShares, idSaltOf } from '../src/v2/identity.js';
import { newIdentity as v1NewIdentity } from '../src/identity.js';
import { lantern2Witnesses } from '../src/v2/witnesses.js';
import { createLantern2Sim } from '../src/v2/sim.js';

const P = Lantern2.pureCircuits;
const DAY = 86_400;
const rand32 = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
const hex = (u) => Buffer.from(u).toString('hex');

describe('src/v2/timeline.js mirrors the contract', () => {
  it('every constant equals the compiled pure circuit', () => {
    expect(checkConstants(P)).toBe(true);
    expect(DEFAULT_DELAY).toBe(3 * DAY);
    expect(COOLDOWNS.map((c) => c / DAY)).toEqual([0, 1, 2, 4, 8, 16, 32]);
    expect(cooldownOf(99)).toBe(32 * DAY);
  });

  it('checkConstants catches a drifted mirror (positive control)', () => {
    const drifted = { ...P, periodSeconds: () => 7_862_401n };
    expect(() => checkConstants(drifted)).toThrow(/periodSeconds is 7862401 in the contract/);
    const drifted2 = { ...P, cooldownSecondsOf: (v) => (v === 3n ? 1n : P.cooldownSecondsOf(v)) };
    expect(() => checkConstants(drifted2)).toThrow(/cooldownSecondsOf\(3\)/);
  });

  it('periods are fixed 91-day blocks from the epoch: period 227 runs from 2026-07-23 to 2026-10-22', () => {
    const { start, end } = periodBounds(227);
    expect(new Date(start * 1000).toISOString().slice(0, 10)).toBe('2026-07-23');
    expect(new Date(end * 1000).toISOString().slice(0, 10)).toBe('2026-10-22');
    expect(periodOf(start)).toBe(227n);
    expect(periodOf(end - 1)).toBe(227n);
    expect(periodOf(end)).toBe(228n);
    expect(end - start).toBe(PERIOD);
  });

  it('checkDelay accepts exactly what enrolment accepts', () => {
    expect(checkDelay(MIN_DELAY)).toBe(BigInt(MIN_DELAY));
    expect(checkDelay(MAX_DELAY)).toBe(BigInt(MAX_DELAY));
    expect(() => checkDelay(MIN_DELAY - 1)).toThrow(/below the minimum/);
    expect(() => checkDelay(MAX_DELAY + 1)).toThrow(/above the maximum/);
    expect(() => checkDelay(1.5 * DAY + 0.5)).toThrow(/whole number/);
  });
});

describe('src/v2/witnesses.js', () => {
  it('refuses v1 pure circuits, whose lineage leaf is under a different domain', () => {
    expect(() => lantern2Witnesses({ pure: V1, clock: () => 0 })).toThrow(/needs Lantern v2 pure circuits/);
    expect(() => lantern2Witnesses({ pure: P, clock: () => 0 })).not.toThrow();
  });
});

describe('src/v2/sim.js: one v2 life, end to end, as its users would live it', () => {
  it('enrol, check in, open, lock, recover from shares, and the lock is gone', () => {
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    const ident = { name: 'Alice', ...newIdentity() };
    const shares = dealShares(ident.identitySecret, 3, 2);
    const root = L.enrol(ident, { threshold: 2, delay: 4 * DAY });
    expect(hex(root)).toBe(hex(commitmentsOf(P, ident).idCommit));

    const guardians = ['Seo-yeon', 'Mum', 'Jihoon'].map((name) =>
      L.addGuardian(ident, root, { name, guardianSecret: rand32(), leafSalt: rand32() }));
    for (const g of guardians) L.checkIn(g, root);
    expect(L.status(root)).toMatchObject({ delay: 4 * DAY, locked: false, holder: null, checkIns: { count: 3n } });

    // The owner believes the laptop is gone: lock first, then recover.
    L.lock(ident, root);
    expect(() => L.gate(ident, root, root, rand32())).toThrow(/identity is locked/);

    const deviceSk = rand32();
    const rid = L.open(guardians[0], root, P.ephemeralPkOf(deviceSk));
    expect(L.status(root).holder.status).toBe('collecting-approvals');
    L.approve(guardians[0], root, rid);
    L.approve(guardians[2], root, rid);
    expect(L.recoveryStatus(rid)).toBe('in-delay');
    L.setTime(L.status(root).holder.unlockAt);
    expect(L.recoveryStatus(rid)).toBe('finalizable');

    // The new phone holds no secret: it rebuilds the secret AND its salt from two shares.
    const device = { name: 'new phone', ephemeralSk: deviceSk, ...recoverFromShares([shares[0], shares[2]]) };
    expect(hex(device.idSalt)).toBe(hex(idSaltOf(ident.identitySecret)));
    const next = { name: 'Alice', ...newIdentity() };
    L.finalize(device, rid, commitmentsOf(P, next));

    const s = L.status(root);
    expect(s.locked).toBe(false);
    expect(s.holder.status).toBe('superseded');
    expect(s.slot.canOpen).toBe(true);
    const nextId = commitmentsOf(P, next).idCommit;
    expect(() => L.gate(next, root, nextId, rand32())).not.toThrow();
    expect(() => L.gate(ident, root, root, rand32())).toThrow(/not the current owner/);
  });

  it('status, checkInCount and slotOf take the head as well as the root, and refuse an unknown commitment clearly', () => {
    // After a recovery the owner holds the head: open, lock and rotate need it.
    // The readers keyed by the root normalise it, as checkIn does (review F8).
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    const owner = newIdentity();
    const root = L.enrol(owner);
    const gs = [0, 1].map(() => L.addGuardian(owner, root, { guardianSecret: rand32(), leafSalt: rand32() }));
    const deviceSk = rand32();
    const rid = L.open(gs[0], root, P.ephemeralPkOf(deviceSk));
    for (const g of gs) L.approve(g, root, rid);
    L.setTime(L.status(root).holder.unlockAt);
    const next = newIdentity();
    L.finalize({ ephemeralSk: deviceSk, identitySecret: owner.identitySecret, idSalt: owner.idSalt }, rid, commitmentsOf(P, next));
    const head = commitmentsOf(P, next).idCommit;
    L.checkIn(gs[1], head);
    L.lock(next, head);

    expect(L.status(head)).toEqual(L.status(root));
    expect(L.status(head)).toMatchObject({ locked: true, checkIns: { count: 1n } });
    expect(L.checkInCount(head)).toBe(1n);
    expect(L.checkInCount(head)).toBe(L.checkInCount(root));
    expect(slotOf(L.ledger, head, L.now)).toEqual(slotOf(L.ledger, root, L.now));
    const stranger = rand32();
    for (const read of [() => L.status(stranger), () => L.checkInCount(stranger), () => slotOf(L.ledger, stranger, L.now),
      () => L.checkIn(gs[0], stranger)]) {
      expect(read).toThrow(/not an enrolled identity commitment/);
    }
  });

  it('refuses a delay outside the bounds before any transaction', () => {
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    expect(() => L.enrol(newIdentity(), { delay: 3600 })).toThrow(/below the minimum/);
    expect(L.ledger.enrolled.size()).toBe(0n);
  });

  it('status reports the cooldown after a veto', () => {
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    const owner = newIdentity();
    const root = L.enrol(owner);
    const g = L.addGuardian(owner, root, { guardianSecret: rand32(), leafSalt: rand32() });
    L.addGuardian(owner, root, { guardianSecret: rand32(), leafSalt: rand32() });
    L.veto(owner, L.open(g, root, rand32()));
    const { slot } = L.status(root);
    expect(slot).toMatchObject({ vetoes: 1, free: true, canOpen: false, status: 'vetoed' });
    expect(slot.cooldownUntil).toBe(Number(L.ledger.lastVetoAt.lookup(root)) + DAY);
    L.setTime(slot.cooldownUntil);
    expect(L.status(root).slot.canOpen).toBe(true);
  });
});

describe('src/v2/identity.js', () => {
  it('the share set is the complete v2 recovery kit', () => {
    const ident = newIdentity();
    const { idCommit } = commitmentsOf(P, ident);
    const shares = dealShares(ident.identitySecret, 3, 2);
    for (const pair of [[0, 1], [0, 2], [1, 2]]) {
      const rebuilt = recoverFromShares(pair.map((i) => shares[i]));
      expect(hex(P.idCommitOf(rebuilt.identitySecret, rebuilt.idSalt))).toBe(hex(idCommit));
    }
    expect(() => newIdentity(() => 7n)).toThrow(/independent/);
  });

  it('refuses an identity whose salts are not v2\'s: a v1 identity would link the ledgers and not recover', () => {
    // src/identity.js exports the same names, so one wrong import hands the v2
    // client a v1 identity. Its commitments would be v1's, and recoverFromShares
    // here rebuilds the v2 salt, which would not open them.
    const v1 = v1NewIdentity();
    expect(() => commitmentsOf(P, v1)).toThrow(/not a v2 identity: idSalt/);
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    expect(() => L.enrol(v1)).toThrow(/not a v2 identity/);
    expect(L.ledger.enrolled.size()).toBe(0n);
    // A salt that is not derived at all, and a v2 idSalt with a v1 card.
    const v2 = newIdentity();
    expect(() => commitmentsOf(P, { ...v2, idSalt: rand32() })).toThrow(/not a v2 identity: idSalt/);
    expect(() => commitmentsOf(P, { ...v2, vetoSalt: v1.vetoSalt, vetoSecret: v1.vetoSecret })).toThrow(/not a v2 identity: vetoSalt/);
    expect(() => commitmentsOf(P, v2)).not.toThrow();
  });

  it('unlock refuses a v1 card as the new card, before any transaction', () => {
    const L = createLantern2Sim({ rt, mod: Lantern2 });
    const owner = newIdentity();
    const root = L.enrol(owner);
    L.lock(owner, root);
    const card = hex(L.ledger.vetoCommits.lookup(root));
    expect(() => L.unlock(owner, root, { newCard: v1NewIdentity() })).toThrow(/not a v2 identity: vetoSalt/);
    expect(L.ledger.locked.lookup(root)).toBe(true);
    expect(hex(L.ledger.vetoCommits.lookup(root))).toBe(card);
    L.unlock(owner, root, { newCard: newIdentity() });
    expect(L.ledger.locked.lookup(root)).toBe(false);
    expect(hex(L.ledger.vetoCommits.lookup(root))).not.toBe(card);
  });
});
