import { describe, it, expect } from 'vitest';
import * as rt from '@midnight-ntwrk/compact-runtime';
import {
  seedBytesToJubjubSecretScalar, deriveJubjubPublicKey,
  signJubjubDigest, TWO_248,
} from '@midnight-ntwrk/midnight-did-jubjub-schnorr';
import { Contract as Host, ledger as hostLedger, pureCircuits as hostPure }
  from '../contracts/managed-host/contract/index.js';
import { bytes32, fieldOf } from './simulator.js';

const COIN = '0'.repeat(64);
const TAG = fieldOf(4242);
const NOW = 1_700_000_000;
const ROOT = bytes32(10);
const HEAD = bytes32(11);

/** A committee member: a Jubjub keypair derived from a seed. */
function member(i) {
  const sk = seedBytesToJubjubSecretScalar(new Uint8Array(32).fill(i));
  return { sk, pk: deriveJubjubPublicKey(sk) };
}

/**
 * An independently deployed host. It cannot call Lantern and cannot read
 * Lantern's ledger -- everything it knows arrives as a committee-signed root.
 */
class HostSim {
  constructor({ slots = 3, quorum = 2, now = NOW } = {}) {
    this.addr = rt.sampleContractAddress();
    this.now = now;
    this.ps = { claimedNow: undefined, snapshotPath: undefined };
    const self = this;
    this.contract = new Host({
      claimedNow: (ctx) => [ctx.privateState, BigInt(self.ps.claimedNow ?? self.now)],
      snapshotPath: (ctx) => [ctx.privateState, self.ps.snapshotPath],
      // The reduction the Foundation's schnorr module requires: split the
      // challenge so the circuit can re-verify the reduction itself.
      getSchnorrReduction: (ctx, ch) => [ctx.privateState, [ch / TWO_248, ch % TWO_248]],
    });
    const ctor = this.contract.initialState(
      rt.createConstructorContext(this.ps, COIN), TAG, BigInt(slots), BigInt(quorum));
    this.zswap = ctor.currentZswapLocalState;
    this.privateState = ctor.currentPrivateState;
    this.ctx = rt.createCircuitContext(this.addr, this.zswap,
      ctor.currentContractState, this.privateState, undefined, undefined, now);
  }
  #sync() {
    const q = this.ctx.currentQueryContext;
    q.block = { ...q.block, secondsSinceEpoch: BigInt(this.now) };
  }
  setTime(t) { this.now = t; this.#sync(); return this; }
  advance(dt) { return this.setTime(this.now + dt); }
  get ledger() { return hostLedger(this.ctx.currentQueryContext.state); }
  call(name, ...args) {
    this.#sync();
    const r = this.contract.impureCircuits[name](this.ctx, ...args);
    this.ctx = r.context;
    return r.result;
  }
  /** The digest a committee member signs for this epoch. */
  digest(epoch, root) {
    const gen = this.ledger.committeeGen;
    return hostPure.attestDigest(TAG, gen, BigInt(epoch), root);
  }
}

/** Stand up a host with a committee and one attested epoch. */
function attestedHost(opts = {}) {
  const h = new HostSim(opts);
  const members = [member(1), member(2), member(3)];
  members.forEach((m, i) =>
    h.call('addCommitteeSlot', BigInt(i), rt.jubjubPointX(m.pk), rt.jubjubPointY(m.pk)));

  // A relayer appends the ownership pair, then reads the resulting root.
  const leaf = h.call('appendSnapshotLeaf', ROOT, HEAD);
  const root = h.ledger.snapshot.root().field;

  h.call('openEpoch', 0n, root);
  for (const i of [0, 1]) {
    const sig = signJubjubDigest(members[i].sk, h.digest(0, root));
    h.call('attestVote', 0n, BigInt(i), members[i].pk, sig);
  }
  h.call('sealEpoch', 0n);
  return { h, members, leaf, root };
}

describe('committee attestation (real in-circuit Jubjub Schnorr)', () => {
  it('reaches quorum and seals an epoch', () => {
    const { h, root } = attestedHost();
    expect(h.ledger.attestedRoots.lookup(0n)).toBe(root);
    expect(h.ledger.attestVotes.lookup(0n).read()).toBe(2n);
  });

  it('rejects a signature from a key that is not in the claimed slot', () => {
    const h = new HostSim();
    const [a, b] = [member(1), member(2)];
    h.call('addCommitteeSlot', 0n, rt.jubjubPointX(a.pk), rt.jubjubPointY(a.pk));
    const leaf = h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.ledger.snapshot.root().field;
    h.call('openEpoch', 0n, root);
    const sig = signJubjubDigest(b.sk, h.digest(0, root));
    expect(() => h.call('attestVote', 0n, 0n, b.pk, sig))
      .toThrow(/does not match this committee slot/);
  });

  it('rejects a signature over a DIFFERENT root', () => {
    const h = new HostSim();
    const m = member(1);
    h.call('addCommitteeSlot', 0n, rt.jubjubPointX(m.pk), rt.jubjubPointY(m.pk));
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.ledger.snapshot.root().field;
    h.call('openEpoch', 0n, root);
    const sig = signJubjubDigest(m.sk, h.digest(0, root + 1n)); // signs the wrong root
    expect(() => h.call('attestVote', 0n, 0n, m.pk, sig)).toThrow();
  });

  it('enforces one vote per slot per epoch', () => {
    const h = new HostSim();
    const m = member(1);
    h.call('addCommitteeSlot', 0n, rt.jubjubPointX(m.pk), rt.jubjubPointY(m.pk));
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.ledger.snapshot.root().field;
    h.call('openEpoch', 0n, root);
    const sig = signJubjubDigest(m.sk, h.digest(0, root));
    h.call('attestVote', 0n, 0n, m.pk, sig);
    expect(() => h.call('attestVote', 0n, 0n, m.pk, sig))
      .toThrow(/already voted this epoch/);
  });

  it('refuses to seal below quorum', () => {
    const h = new HostSim();
    const m = member(1);
    h.call('addCommitteeSlot', 0n, rt.jubjubPointX(m.pk), rt.jubjubPointY(m.pk));
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.ledger.snapshot.root().field;
    h.call('openEpoch', 0n, root);
    h.call('attestVote', 0n, 0n, m.pk, signJubjubDigest(m.sk, h.digest(0, root)));
    expect(() => h.call('sealEpoch', 0n)).toThrow(/quorum not reached/);
  });

  // Rotating the generation invalidates every signature the old committee could
  // produce -- in one transaction, with no per-key revocation list.
  it('a generation bump invalidates signatures from the old generation', () => {
    const h = new HostSim();
    const m = member(1);
    h.call('addCommitteeSlot', 0n, rt.jubjubPointX(m.pk), rt.jubjubPointY(m.pk));
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.ledger.snapshot.root().field;
    h.call('openEpoch', 0n, root);
    const staleSig = signJubjubDigest(m.sk, h.digest(0, root)); // signed under gen 0

    h.call('rotateCommittee');
    expect(() => h.call('attestVote', 0n, 0n, m.pk, staleSig)).toThrow();
  });
});

describe('the attested gate', () => {
  it('accepts the current owner against the attested snapshot', () => {
    const { h, leaf } = attestedHost();
    h.ps.snapshotPath = h.ledger.snapshot.findPathForLeaf(leaf);
    expect(() => h.call('requireCurrentOwnerAttested', 0n, ROOT, HEAD)).not.toThrow();
    expect(h.ledger.gateActions).toBe(1n);
  });

  it('rejects a pair that is not in the attested snapshot', () => {
    const { h, leaf } = attestedHost();
    h.ps.snapshotPath = h.ledger.snapshot.findPathForLeaf(leaf);
    expect(() => h.call('requireCurrentOwnerAttested', 0n, ROOT, bytes32(99)))
      .toThrow(/does not bind/);
  });

  it('rejects a stale attestation once the window closes', () => {
    const { h, leaf } = attestedHost();
    h.ps.snapshotPath = h.ledger.snapshot.findPathForLeaf(leaf);
    h.advance(Number(hostPure.maxStalenessSeconds()) + 3600);
    expect(() => h.call('requireCurrentOwnerAttested', 0n, ROOT, HEAD))
      .toThrow(/stale/);
  });

  it('rejects an unattested epoch', () => {
    const { h, leaf } = attestedHost();
    h.ps.snapshotPath = h.ledger.snapshot.findPathForLeaf(leaf);
    expect(() => h.call('requireCurrentOwnerAttested', 5n, ROOT, HEAD))
      .toThrow(/not attested/);
  });
});
