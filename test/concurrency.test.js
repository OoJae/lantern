import { describe, it, expect } from 'vitest';
import * as rt from '@midnight-ntwrk/compact-runtime';
import { world, asGuardian, openAndApprove, EPH_A, DELAY, SLACK } from './fixtures.js';
import { bytes32, fieldOf, pureCircuits } from './simulator.js';
import { HostSim, SNAP } from './host-fixtures.js';

/**
 * SPIKE B -- read-commitment contention.
 *
 * The question: does `Set.member(x)` bind a read-commitment to the WHOLE
 * collection, or only to x's own membership? If it were collection-scoped, two
 * guardians approving the same recovery concurrently would invalidate each
 * other -- which is precisely the failure this design claims to survive.
 *
 * The test: build two approval proofs against the SAME starting state, apply
 * the first, then replay the second's public transcript against the resulting
 * state. If the replay succeeds, the commitment is value-scoped and concurrent
 * approvals genuinely do not conflict.
 *
 * This is not documented anywhere in Midnight's docs, so it is answered here
 * empirically. The result is published either way.
 */
describe('read-commitment contention (Spike B)', () => {
  it('two guardians approving from the same state do not invalidate each other', () => {
    const { sim, id, guardians } = world();
    const rid = sim.call('openRecovery', id, EPH_A);

    // S0: the state both guardians prove against.
    const S0 = sim.ctx.currentQueryContext.state;
    const addr = sim.address;

    const proveApproval = (g) => {
      asGuardian(sim, g);
      const ctx = rt.createCircuitContext(
        addr, sim.zswap, S0, sim.privateState, undefined, undefined, sim.now,
      );
      ctx.currentQueryContext.block = {
        ...ctx.currentQueryContext.block, secondsSinceEpoch: BigInt(sim.now),
      };
      return sim.contract.impureCircuits.approveRecovery(ctx, id, rid);
    };

    const a = proveApproval(guardians[0]);
    const b = proveApproval(guardians[1]);

    // Both were proved against S0. Apply A, producing S1.
    const S1 = a.context.currentQueryContext.state;

    // Now replay B's transcript against S1, exactly as a node would.
    const qc = new rt.QueryContext(S1, addr);
    qc.block = { ...qc.block, secondsSinceEpoch: BigInt(sim.now) };

    const replay = () => qc.runTranscript(
      {
        gas: {
          readTime: 10n ** 12n,
          computeTime: 10n ** 12n,
          bytesWritten: 10n ** 9n,
          bytesDeleted: 10n ** 9n,
        },
        effects: b.context.currentQueryContext.effects,
        program: b.proofData.publicTranscript,
      },
      rt.CostModel.initialCostModel(),
    );

    expect(replay).not.toThrow();
  });

  // NEGATIVE CONTROL. Without this, the test above could be passing vacuously
  // because the harness cannot detect a conflict at all. The SAME guardian
  // approving twice produces the SAME nullifier, so the second replay MUST
  // fail -- proving the replay genuinely checks the committed reads.
  it('detects a real conflict: the same guardian twice is rejected on replay', () => {
    const { sim, id, guardians } = world();
    const rid = sim.call('openRecovery', id, EPH_A);
    const S0 = sim.ctx.currentQueryContext.state;
    const addr = sim.address;

    const proveApproval = (g) => {
      asGuardian(sim, g);
      const ctx = rt.createCircuitContext(
        addr, sim.zswap, S0, sim.privateState, undefined, undefined, sim.now,
      );
      ctx.currentQueryContext.block = {
        ...ctx.currentQueryContext.block, secondsSinceEpoch: BigInt(sim.now),
      };
      return sim.contract.impureCircuits.approveRecovery(ctx, id, rid);
    };

    const a = proveApproval(guardians[0]);
    const b = proveApproval(guardians[0]); // same guardian => same nullifier
    const S1 = a.context.currentQueryContext.state;

    const qc = new rt.QueryContext(S1, addr);
    qc.block = { ...qc.block, secondsSinceEpoch: BigInt(sim.now) };

    expect(() => qc.runTranscript(
      {
        gas: { readTime: 10n ** 12n, computeTime: 10n ** 12n, bytesWritten: 10n ** 9n, bytesDeleted: 10n ** 9n },
        effects: b.context.currentQueryContext.effects,
        program: b.proofData.publicTranscript,
      },
      rt.CostModel.initialCostModel(),
    )).toThrow();
  });

  // approveRecovery now reads guardianCtx on the hot path. Spike B says that
  // read is value-scoped, so concurrent approvals still do not conflict -- but
  // a guardian-set rotation landing mid-flight MUST invalidate a pending
  // approval. That is correct behaviour, and proving it is a better story than
  // claiming it cannot happen.
  it('a guardian-set rotation mid-flight invalidates a pending approval', () => {
    const { sim, id, guardians } = world();
    const rid = sim.call('openRecovery', id, EPH_A);
    const S0 = sim.ctx.currentQueryContext.state;
    const addr = sim.address;

    asGuardian(sim, guardians[0]);
    const ctx = rt.createCircuitContext(
      addr, sim.zswap, S0, sim.privateState, undefined, undefined, sim.now,
    );
    ctx.currentQueryContext.block = {
      ...ctx.currentQueryContext.block, secondsSinceEpoch: BigInt(sim.now),
    };
    const pending = sim.contract.impureCircuits.approveRecovery(ctx, id, rid);

    // The owner rotates the guardian set before the approval lands.
    sim.call('rotateGuardianSet', id, bytes32(777));
    const S1 = sim.ctx.currentQueryContext.state;

    const qc = new rt.QueryContext(S1, addr);
    qc.block = { ...qc.block, secondsSinceEpoch: BigInt(sim.now) };
    expect(() => qc.runTranscript(
      {
        gas: { readTime: 10n ** 12n, computeTime: 10n ** 12n, bytesWritten: 10n ** 9n, bytesDeleted: 10n ** 9n },
        effects: pending.context.currentQueryContext.effects,
        program: pending.proofData.publicTranscript,
      },
      rt.CostModel.initialCostModel(),
    )).toThrow();
  });
});

/**
 * The same question for finalizeRecovery. Its quorum check is a comparison,
 * `!approvals.lookup(rid).lessThan(t)`, never `read()`. The count only grows, so
 * the committed boolean cannot change: a finalize proved at quorum must still
 * apply after more approvals land. A veto landing first must still stop it.
 */
describe('read-commitment contention: finalizeRecovery and sealEpoch', () => {
  const gas = { readTime: 10n ** 12n, computeTime: 10n ** 12n, bytesWritten: 10n ** 9n, bytesDeleted: 10n ** 9n };
  const replay = (state, addr, now, pending, program = pending.proofData.publicTranscript) => {
    const qc = new rt.QueryContext(state, addr);
    qc.block = { ...qc.block, secondsSinceEpoch: BigInt(now) };
    return qc.runTranscript({ gas, effects: pending.context.currentQueryContext.effects, program }, rt.CostModel.initialCostModel());
  };
  // The runtime's message when a committed read no longer matches the state.
  const READ_MISMATCH = (expected, actual) => new RegExp(`mismatch between expected \\(<\\[${expected}\\]: b\\d+>\\) and actual \\(<\\[${actual}\\]: b\\d+>\\) read`);
  const isRid = (rid) => (cell) => Buffer.from(cell?.value?.[0] ?? []).equals(Buffer.from(rid));

  // A recovery at quorum (2 of 3), past its timelock, and a finalize proved against that state.
  const provedFinalize = () => {
    const { sim, id, guardians } = world({ n: 3, threshold: 2 });
    const rid = openAndApprove(sim, id, guardians, 2);
    sim.advance(DELAY + SLACK + 1);
    const S0 = sim.ctx.currentQueryContext.state;
    const ctx = rt.createCircuitContext(sim.address, sim.zswap, S0, sim.privateState, undefined, undefined, sim.now);
    ctx.currentQueryContext.block = { ...ctx.currentQueryContext.block, secondsSinceEpoch: BigInt(sim.now) };
    const pending = sim.contract.impureCircuits.finalizeRecovery(
      ctx, rid, pureCircuits.idCommitOf(fieldOf(701), bytes32(111)), pureCircuits.vetoCommitOf(fieldOf(801), bytes32(141)),
    );
    return { sim, id, guardians, rid, pending };
  };

  it('a finalize proved at quorum still applies after a later approval lands', () => {
    const { sim, id, guardians, rid, pending } = provedFinalize();
    asGuardian(sim, guardians[2]);
    sim.call('approveRecovery', id, rid);
    expect(sim.ledger.approvals.lookup(rid).read()).toBe(3n);
    const S1 = sim.ctx.currentQueryContext.state;
    expect(() => replay(S1, sim.address, sim.now, pending)).not.toThrow();

    // The committed quorum query IS a comparison: approvals[rid], push t, 'lt', popeq.
    const tr = pending.proofData.publicTranscript;
    const q = tr.findIndex((op, k) => op?.idx?.path?.length === 3 && isRid(rid)(op.idx.path[2]?.value) && tr[k + 2] === 'lt');
    expect(q).toBeGreaterThan(-1);
    // Counterfactual: the same finalize with read() in place of lessThan commits the exact count, 2, and breaks.
    const u64 = (n) => ({ value: [new Uint8Array([Number(n)])], alignment: [{ tag: 'atom', value: { tag: 'bytes', length: 8 } }] });
    const readVariant = [...tr.slice(0, q + 1), { popeq: { cached: true, result: u64(2n) } }, ...tr.slice(q + 4)];
    expect(() => replay(S1, sim.address, sim.now, pending, readVariant)).toThrow(READ_MISMATCH('02', '03'));
  });

  // NEGATIVE CONTROL: the replay does check what finalize read, and it fails for the right reason.
  it('detects a real conflict: a veto that lands first invalidates the pending finalize', () => {
    const { sim, rid, pending } = provedFinalize();
    sim.call('vetoRecovery', rid);
    expect(sim.ledger.killed.member(rid)).toBe(true);
    const S1 = sim.ctx.currentQueryContext.state;
    // A committed boolean read flipped from false to true: not gas, and not a harness error.
    expect(() => replay(S1, sim.address, sim.now, pending)).toThrow(READ_MISMATCH('-', '01'));
    // And it is the killed-set read: flip ONLY that committed result and the replay passes.
    const tr = pending.proofData.publicTranscript;
    const members = tr.flatMap((op, k) => (op?.popeq && tr[k - 1] === 'member' && isRid(rid)(tr[k - 2]?.push?.value?.content) ? [k] : []));
    expect(members.length).toBe(2); // recoveries.member(rid), true; then killed.member(rid), false
    const flipped = tr.map((op, j) => (j === members[1] ? { popeq: { ...op.popeq, result: tr[members[0]].popeq.result } } : op));
    expect(() => replay(S1, sim.address, sim.now, pending, flipped)).not.toThrow();
  });

  // The committee's seal compares its vote count the same way.
  it('a seal proved at quorum still applies after a later vote lands', () => {
    const h = new HostSim();
    h.call('openEpoch', 0n, SNAP.root);
    h.vote(0, 0, SNAP.root);
    h.vote(1, 0, SNAP.root);
    const S0 = h.ctx.currentQueryContext.state;
    const ctx = rt.createCircuitContext(h.addr, h.zswap, S0, h.privateState, undefined, undefined, h.now);
    ctx.currentQueryContext.block = { ...ctx.currentQueryContext.block, secondsSinceEpoch: BigInt(h.now) };
    const pending = h.contract.impureCircuits.sealEpoch(ctx, 0n, SNAP.root);
    h.vote(2, 0, SNAP.root);
    expect(() => replay(h.ctx.currentQueryContext.state, h.addr, h.now, pending)).not.toThrow();
  });
});
