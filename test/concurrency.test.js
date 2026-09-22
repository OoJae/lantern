import { describe, it, expect } from 'vitest';
import * as rt from '@midnight-ntwrk/compact-runtime';
import { world, asGuardian, EPH_A } from './fixtures.js';
import { bytes32 } from './simulator.js';

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
