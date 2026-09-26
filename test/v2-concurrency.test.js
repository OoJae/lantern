// v1's test/concurrency.test.js, ported to v2 (docs/v2.md §7), plus the races
// v2's new rules create. The method is v1's: build a proof against a snapshot
// of the state, let something else land, then REPLAY the proof's public
// transcript against the new state exactly as a node would. v1's rule holds:
// the hot paths (approve, finalize, veto) bind no read that a concurrent honest
// action can flip. Where v2 deliberately binds one (a second open, the gate
// while a lock lands, a lock while a finalize lands, the period's first
// check-in), the conflict is proved here, and so is the retry.
import { describe, it, expect } from 'vitest';
import * as rt from '@midnight-ntwrk/compact-runtime';
import {
  world, asGuardian, openAs, openAndApprove, toUnlock, loadLineage, periodOf, ephSkFor,
  snapshot, proveAgainst, replay, land, pureCircuits, bytes32, fieldOf, EPH_A, EPH_B, hex, NO_RESERVATION,
} from './v2-fixtures.js';

const READ_MISMATCH = (expected, actual) =>
  new RegExp(`mismatch between expected \\(<\\[${expected}\\]: b\\d+>\\) and actual \\(<\\[${actual}\\]: b\\d+>\\) read`);
const ANY_READ_MISMATCH = /mismatch between expected .* and actual .* read/;
// A transcript cell names `rid` when its first atom DECODES to it: the aligned
// atom drops a Bytes<32>'s trailing zero bytes. A missing cell never matches,
// not even an all-zero rid.
const isRid = (rid) => (cell) => cell?.value?.[0] !== undefined
  && Buffer.from(new rt.CompactTypeBytes(32).fromValue([cell.value[0]])).equals(Buffer.from(rid));
// The successor the simulator's default private state opens (finalizeRecovery proves it).
const NEW_ID = () => pureCircuits.idCommitOf(fieldOf(70), bytes32(71));
const NEW_VETO = () => pureCircuits.vetoCommitOf(fieldOf(80), bytes32(81));

describe('v2 read-commitment contention (Spike B)', () => {
  it('two guardians approving from the same state do not invalidate each other', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    const S0 = snapshot(sim);
    asGuardian(sim, guardians[0]);
    const a = proveAgainst(sim, S0, 'approveRecovery', id, rid);
    asGuardian(sim, guardians[1]);
    const b = proveAgainst(sim, S0, 'approveRecovery', id, rid);
    const S1 = a.context.currentQueryContext.state;
    expect(() => replay(sim, S1, b)).not.toThrow();
  });

  it('detects a real conflict: the same guardian twice is rejected on replay', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    const S0 = snapshot(sim);
    asGuardian(sim, guardians[0]);
    const a = proveAgainst(sim, S0, 'approveRecovery', id, rid);
    const b = proveAgainst(sim, S0, 'approveRecovery', id, rid);
    expect(() => replay(sim, a.context.currentQueryContext.state, b)).toThrow();
  });

  it('a guardian-set rotation mid-flight invalidates a pending approval', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    asGuardian(sim, guardians[0]);
    const pending = proveAgainst(sim, snapshot(sim), 'approveRecovery', id, rid);
    sim.call('rotateGuardianSet', id, bytes32(777));
    expect(() => replay(sim, snapshot(sim), pending)).toThrow();
  });
});

describe('v2 read-commitment contention: finalizeRecovery', () => {
  const provedFinalize = () => {
    const { sim, id, guardians } = world({ n: 3, threshold: 2 });
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid, 1);
    const pending = proveAgainst(sim, snapshot(sim), 'finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    return { sim, id, guardians, rid, pending };
  };

  it('a finalize proved at quorum still applies after a later approval lands', () => {
    // The approval window (7 days) outlasts the 72 h delay, so a third approval can still land.
    const { sim, id, guardians, rid, pending } = provedFinalize();
    asGuardian(sim, guardians[2]);
    sim.call('approveRecovery', id, rid);
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(3n);
    const S1 = snapshot(sim);
    expect(() => replay(sim, S1, pending)).not.toThrow();

    const tr = pending.proofData.publicTranscript;
    const q = tr.findIndex((op, k) => op?.idx?.path?.length === 3 && isRid(rid)(op.idx.path[2]?.value) && tr[k + 2] === 'lt');
    expect(q).toBeGreaterThan(-1);
    const u64 = (n) => ({ value: [new Uint8Array([Number(n)])], alignment: [{ tag: 'atom', value: { tag: 'bytes', length: 8 } }] });
    const readVariant = [...tr.slice(0, q + 1), { popeq: { cached: true, result: u64(2n) } }, ...tr.slice(q + 4)];
    expect(() => replay(sim, S1, pending, readVariant)).toThrow(READ_MISMATCH('02', '03'));
  });

  it('detects a real conflict: a veto that lands first invalidates the pending finalize', () => {
    const { sim, rid, pending } = provedFinalize();
    sim.call('vetoRecovery', rid, NO_RESERVATION);
    expect(sim.ledger.killed.member(rid)).toBe(true);
    const S1 = snapshot(sim);
    expect(() => replay(sim, S1, pending)).toThrow(READ_MISMATCH('-', '01'));
    const tr = pending.proofData.publicTranscript;
    const members = tr.flatMap((op, k) => (op?.popeq && tr[k - 1] === 'member' && isRid(rid)(tr[k - 2]?.push?.value?.content) ? [k] : []));
    expect(members.length).toBe(2);
    const flipped = tr.map((op, j) => (j === members[1] ? { popeq: { ...op.popeq, result: tr[members[0]].popeq.result } } : op));
    expect(() => replay(sim, S1, pending, flipped)).not.toThrow();
  });
});

describe('v2 contention: the veto stays write-only on rate-limit state', () => {
  it('a veto proved before an approval lands still applies', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const rid = openAndApprove(sim, id, guardians, 1);
    const pending = proveAgainst(sim, snapshot(sim), 'vetoRecovery', rid, NO_RESERVATION);
    asGuardian(sim, guardians[1]);
    sim.call('approveRecovery', id, rid);
    expect(() => land(sim, pending)).not.toThrow();
    expect(sim.ledger.killed.member(rid)).toBe(true);
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(1n);
  });

  it('a veto proved before the finalize lands is refused: the finalize made it moot', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    const pending = proveAgainst(sim, snapshot(sim), 'vetoRecovery', rid, NO_RESERVATION);
    sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    expect(() => replay(sim, snapshot(sim), pending)).toThrow(ANY_READ_MISMATCH);
    expect(sim.ledger.vetoCounts.lookup(id).read()).toBe(0n);
  });
});

// docs/v2.md §3.9 case 14: one live recovery holds under a race.
describe('v2 contention: two opens raced from one state', () => {
  it('the second open is refused on replay, and a re-proved one is refused as live', () => {
    const { sim, id, guardians } = world();
    const S0 = snapshot(sim);
    asGuardian(sim, guardians[0]);
    const a = proveAgainst(sim, S0, 'openRecovery', id, EPH_A, periodOf(sim.now));
    asGuardian(sim, guardians[1]);
    const b = proveAgainst(sim, S0, 'openRecovery', id, EPH_B, periodOf(sim.now));
    land(sim, a);
    const ridA = pureCircuits.recoveryIdOf(id, EPH_A);
    expect(hex(sim.ledger.liveRecovery.lookup(id))).toBe(hex(ridA));
    // The slot read flips from absent to present: a read mismatch, not gas or a harness error.
    expect(() => replay(sim, snapshot(sim), b)).toThrow(ANY_READ_MISMATCH);
    expect(sim.ledger.recoveries.member(pureCircuits.recoveryIdOf(id, EPH_B))).toBe(false);
    expect(() => openAs(sim, guardians[1], id, EPH_B)).toThrow(/already live/);
  });
});

// docs/v2.md §4.6 case 9: the lock wins, and no stale lock reaches a successor.
describe('v2 contention: the lock', () => {
  it('a gate action proved before a lock lands is refused on replay', () => {
    const { sim, id, idRoot } = world();
    loadLineage(sim, idRoot, id);
    const pending = proveAgainst(sim, snapshot(sim), 'hostGatedAction', idRoot, id, bytes32(1));
    sim.call('lockIdentity', id);
    expect(() => replay(sim, snapshot(sim), pending)).toThrow(READ_MISMATCH('-', '01'));
    expect(sim.ledger.gateActions).toBe(0n);
  });

  it('a lock proved before a finalize lands is refused on replay', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    const pending = proveAgainst(sim, snapshot(sim), 'lockIdentity', id);
    sim.call('finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    expect(() => replay(sim, snapshot(sim), pending)).toThrow(ANY_READ_MISMATCH);
    expect(sim.ledger.locked.lookup(id)).toBe(false);
  });

  it('a finalize proved before a lock lands still applies, and clears that lock', () => {
    const { sim, id, guardians } = world();
    const rid = openAndApprove(sim, id, guardians, 2);
    toUnlock(sim, rid);
    const pending = proveAgainst(sim, snapshot(sim), 'finalizeRecovery', rid, NEW_ID(), NEW_VETO());
    sim.call('lockIdentity', id);
    expect(sim.ledger.locked.lookup(id)).toBe(true);
    expect(() => land(sim, pending)).not.toThrow();
    expect(sim.ledger.retiredIdentities.member(id)).toBe(true);
    expect(sim.ledger.locked.lookup(id)).toBe(false);
  });
});

// docs/v2.md §6.4 case 9: only a period's FIRST check-in can conflict.
describe('v2 contention: check-ins', () => {
  it("two guardians' first check-ins of a period: the second is refused on replay and succeeds re-proved", () => {
    const { sim, id, guardians } = world();
    const p = periodOf(sim.now);
    const S0 = snapshot(sim);
    asGuardian(sim, guardians[0]);
    const a = proveAgainst(sim, S0, 'checkIn', id, p);
    asGuardian(sim, guardians[1]);
    const b = proveAgainst(sim, S0, 'checkIn', id, p);
    land(sim, a);
    expect(() => replay(sim, snapshot(sim), b)).toThrow(READ_MISMATCH('-', '01'));
    asGuardian(sim, guardians[1]);
    expect(() => sim.call('checkIn', id, p)).not.toThrow();
    const key = pureCircuits.checkInKeyOf(id, id, p);
    expect(sim.ledger.checkIns.lookup(key).read()).toBe(2n);
  });

  it('two later check-ins proved from one state both apply: increments do not conflict', () => {
    const { sim, id, guardians } = world({ n: 3 });
    const p = periodOf(sim.now);
    asGuardian(sim, guardians[0]);
    sim.call('checkIn', id, p);
    const S0 = snapshot(sim);
    asGuardian(sim, guardians[1]);
    const a = proveAgainst(sim, S0, 'checkIn', id, p);
    asGuardian(sim, guardians[2]);
    const b = proveAgainst(sim, S0, 'checkIn', id, p);
    land(sim, a);
    expect(() => land(sim, b)).not.toThrow();
    expect(sim.ledger.checkIns.lookup(pureCircuits.checkInKeyOf(id, id, p)).read()).toBe(3n);
  });
});

// The helper the file relies on: a pending proof's landing is exactly a replay.
describe('v2 concurrency harness', () => {
  it('landing a proof equals calling the circuit', () => {
    const { sim, id, guardians } = world();
    const rid = openAs(sim, guardians[0], id, EPH_A);
    asGuardian(sim, guardians[1]);
    land(sim, proveAgainst(sim, snapshot(sim), 'approveRecovery', id, rid));
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(1n);
    sim.ps.ephemeralSk = ephSkFor(EPH_A);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/already approved/);
  });
});
