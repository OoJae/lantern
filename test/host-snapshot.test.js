// The canonical live-set tree (D6): the ONLY root a committee should sign.
import { describe, it, expect } from 'vitest';
import * as rt from '@midnight-ntwrk/compact-runtime';
import { pureCircuits as hostPure } from '../contracts/managed-host/contract/index.js';
import { pureCircuits, bytes32, fieldOf } from './simulator.js';
import { world, succeed, EPH_A } from './fixtures.js';
import { HostSim } from './host-fixtures.js';
import { canonicalSnapshot, liveOwnerPairs } from '../src/host/snapshot.js';

const hex = (u) => Buffer.from(u).toString('hex');
const snapshotOf = (ledger) => canonicalSnapshot(rt, hostPure.ownerLeafOf, ledger);

/** Two identities, A and B; A has recovered once, so A's genesis commitment is retired. */
function lanternWorld() {
  const { sim, id: A, guardians } = world({ n: 2 });
  const bSecret = fieldOf(4100), bSalt = bytes32(4101), bVeto = fieldOf(4102), bVetoSalt = bytes32(4103);
  const B = pureCircuits.idCommitOf(bSecret, bSalt);
  const saved = { ...sim.ps };
  Object.assign(sim.ps, { identitySecret: bSecret, idSalt: bSalt, vetoSecret: bVeto, vetoSalt: bVetoSalt });
  sim.call('enrollIdentity', B, pureCircuits.vetoCommitOf(bVeto, bVetoSalt), 2n);
  Object.assign(sim.ps, saved);
  const a1 = succeed(sim, A, guardians, 1, EPH_A);
  return { sim, A, A1: a1.newId, B, keys: { A1: [a1.secret, a1.salt], B: [bSecret, bSalt], A: [saved.identitySecret, saved.idSalt] } };
}

/** Seal `root` as epoch 0 with a real 2-of-3 committee. */
function sealed(root) {
  const h = new HostSim();
  h.call('openEpoch', 0n, root);
  h.vote(0, 0, root);
  h.vote(1, 0, root);
  h.call('sealEpoch', 0n, root);
  return h;
}

describe('canonical live-set snapshot', () => {
  it('holds exactly the live owners: the successor and B, never the retired commitment', () => {
    const { sim, A, A1, B } = lanternWorld();
    const pairs = liveOwnerPairs(sim.ledger).map((p) => `${hex(p.root)}:${hex(p.current)}`).sort();
    expect(pairs).toEqual([`${hex(A)}:${hex(A1)}`, `${hex(B)}:${hex(B)}`].sort());
    const snap = snapshotOf(sim.ledger);
    expect(snap.entries).toHaveLength(2);
    expect(() => snap.pathFor(A, A)).toThrow(/not a live owner pair/);
  });

  it('does not depend on the order the ledger is enumerated in', () => {
    const { sim } = lanternWorld();
    const L = sim.ledger;
    const reversed = {
      enrolled: [...L.enrolled].reverse(),
      retiredIdentities: L.retiredIdentities,
      idRoots: L.idRoots,
    };
    expect(snapshotOf(reversed).root).toBe(snapshotOf(L).root);
  });

  it('once sealed, admits each live owner, holding their own secret, through the attested gate', () => {
    const { sim, A, A1, B, keys } = lanternWorld();
    const snap = snapshotOf(sim.ledger);
    const h = sealed(snap.root);
    for (const [root, current, [secret, salt]] of [[A, A1, keys.A1], [B, B, keys.B]]) {
      Object.assign(h.ps, { snapshotPath: snap.pathFor(root, current), identitySecret: secret, idSalt: salt });
      expect(() => h.gate(0n, root, current)).not.toThrow();
    }
  });

  it('refuses the retired owner, even with their secret and a genuine path from a tree that still holds them', () => {
    const { sim, A, keys } = lanternWorld();
    const snap = snapshotOf(sim.ledger);
    const h = sealed(snap.root);
    // An append-only log would still contain (A, A). Build that tree and try its path.
    const stale = canonicalSnapshot(rt, hostPure.ownerLeafOf, {
      enrolled: [...sim.ledger.enrolled],
      retiredIdentities: { member: () => false },
      idRoots: sim.ledger.idRoots,
    });
    Object.assign(h.ps, { snapshotPath: stale.pathFor(A, A), identitySecret: keys.A[0], idSalt: keys.A[1] });
    expect(() => h.gate(0n, A, A)).toThrow(/not in the attested snapshot/);
  });
});
