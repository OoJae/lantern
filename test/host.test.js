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
const xy = (m) => [rt.jubjubPointX(m.pk), rt.jubjubPointY(m.pk)];

/**
 * An independently deployed host. It cannot call Lantern and cannot read
 * Lantern's ledger -- everything it knows arrives as a committee-signed root.
 * The committee is installed atomically by the constructor: there is no admin.
 */
class HostSim {
  constructor({ quorum = 2, members = [member(1), member(2), member(3)], now = NOW } = {}) {
    this.members = members;
    this.addr = rt.sampleContractAddress();
    this.now = now;
    this.ps = { claimedNow: undefined, snapshotPath: undefined };
    const self = this;
    this.contract = new Host({
      claimedNow: (ctx) => [ctx.privateState, BigInt(self.ps.claimedNow ?? self.now)],
      snapshotPath: (ctx) => [ctx.privateState, self.ps.snapshotPath],
      getSchnorrReduction: (ctx, ch) => [ctx.privateState, [ch / TWO_248, ch % TWO_248]],
    });
    const ctor = this.contract.initialState(
      rt.createConstructorContext(this.ps, COIN), TAG, BigInt(quorum),
      ...xy(members[0]), ...xy(members[1]), ...xy(members[2]));
    this.zswap = ctor.currentZswapLocalState;
    this.privateState = ctor.currentPrivateState;
    this.ctx = rt.createCircuitContext(this.addr, this.zswap,
      ctor.currentContractState, this.privateState, undefined, undefined, now);
  }
  #sync() {
    const q = this.ctx.currentQueryContext;
    q.block = { ...q.block, secondsSinceEpoch: BigInt(this.now) };
  }
  advance(dt) { this.now += dt; this.#sync(); return this; }
  get ledger() { return hostLedger(this.ctx.currentQueryContext.state); }
  get gen() { return this.ledger.committeeGen; }
  call(name, ...args) {
    this.#sync();
    const r = this.contract.impureCircuits[name](this.ctx, ...args);
    this.ctx = r.context;
    return r.result;
  }
  /** Member `i` votes for (epoch, root) with a real signature. */
  vote(i, epoch, root, signer = this.members[i]) {
    const sig = signJubjubDigest(signer.sk, hostPure.attestDigest(TAG, this.gen, BigInt(epoch), root));
    this.call('attestVote', BigInt(epoch), root, BigInt(i), signer.pk, sig);
  }
  /** Member `i` votes to replace `target`'s key with `newM`'s. */
  rotVote(i, target, newM, signer = this.members[i]) {
    const [nx, ny] = xy(newM);
    const sig = signJubjubDigest(signer.sk, hostPure.rotateDigest(TAG, this.gen, BigInt(target), nx, ny));
    this.call('rotateVote', BigInt(target), nx, ny, BigInt(i), signer.pk, sig);
  }
  snapshotRoot() { return this.ledger.snapshot.root().field; }
}

/** Stand up a host with epoch 0 attested over one ownership pair. */
function attestedHost(opts = {}) {
  const h = new HostSim(opts);
  const leaf = h.call('appendSnapshotLeaf', ROOT, HEAD);
  const root = h.snapshotRoot();
  h.call('openEpoch', 0n, root);
  h.vote(0, 0, root);
  h.vote(1, 0, root);
  h.call('sealEpoch', 0n, root);
  return { h, leaf, root };
}

describe('committee attestation (real in-circuit Jubjub Schnorr)', () => {
  it('reaches quorum and seals an epoch', () => {
    const { h, root } = attestedHost();
    expect(h.ledger.attestedRoots.lookup(0n)).toBe(root);
    expect(h.ledger.latestEpoch).toBe(1n);
  });

  it('rejects a key that is not the one in the claimed slot', () => {
    const h = new HostSim();
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.snapshotRoot();
    h.call('openEpoch', 0n, root);
    expect(() => h.vote(0, 0, root, member(99))).toThrow(/does not match this committee slot/);
  });

  it('rejects a signature over a DIFFERENT root', () => {
    const h = new HostSim();
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.snapshotRoot();
    h.call('openEpoch', 0n, root);
    const sig = signJubjubDigest(h.members[0].sk, hostPure.attestDigest(TAG, h.gen, 0n, root + 1n));
    expect(() => h.call('attestVote', 0n, root, 0n, h.members[0].pk, sig)).toThrow();
  });

  it('enforces one vote per slot per epoch, even across competing roots', () => {
    const h = new HostSim();
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.snapshotRoot();
    h.call('openEpoch', 0n, root);
    h.call('openEpoch', 0n, root + 1n);
    h.vote(0, 0, root);
    expect(() => h.vote(0, 0, root + 1n)).toThrow(/already voted this epoch/);
  });

  it('refuses to seal below quorum', () => {
    const h = new HostSim();
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.snapshotRoot();
    h.call('openEpoch', 0n, root);
    h.vote(0, 0, root);
    expect(() => h.call('sealEpoch', 0n, root)).toThrow(/quorum not reached/);
  });
});

// ---------------------------------------------------------------------------
// REGRESSIONS for the defects found in threat-model review.
// ---------------------------------------------------------------------------
describe('regression: a junk-root proposal cannot block an epoch', () => {
  // Previously openEpoch pinned ONE root per epoch, first come first served.
  // An attacker pre-opened the epoch with junk, the committee could not reopen
  // it, and was forced to skip -- leaving a gap.
  it('the committee seals the real root despite a squatted junk proposal', () => {
    const h = new HostSim();
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.snapshotRoot();
    h.call('openEpoch', 0n, 12345n);          // attacker squats epoch 0
    h.call('openEpoch', 0n, root);            // committee opens the real one
    h.vote(0, 0, root);
    h.vote(1, 0, root);
    expect(() => h.call('sealEpoch', 0n, root)).not.toThrow();
    expect(h.ledger.attestedRoots.lookup(0n)).toBe(root);
  });

  it('the junk proposal can never reach quorum on its own', () => {
    const h = new HostSim();
    h.call('openEpoch', 0n, 12345n);
    expect(() => h.call('sealEpoch', 0n, 12345n)).toThrow(/quorum not reached/);
  });
});

describe('regression: epochs seal strictly in order', () => {
  // With a gap, `!attestedRoots.member(epoch + 1)` would let an OLDER sealed
  // epoch pass the gate's "latest epoch" check.
  it('cannot skip an epoch', () => {
    const h = new HostSim();
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.snapshotRoot();
    h.call('openEpoch', 1n, root);
    h.vote(0, 1, root);
    h.vote(1, 1, root);
    expect(() => h.call('sealEpoch', 1n, root)).toThrow(/sealed in order/);
  });

  it('an older epoch stops being accepted once a newer one seals', () => {
    const { h, leaf, root } = attestedHost();
    h.call('openEpoch', 1n, root);
    h.vote(0, 1, root);
    h.vote(1, 1, root);
    h.call('sealEpoch', 1n, root);
    h.ps.snapshotPath = h.ledger.snapshot.findPathForLeaf(leaf);
    expect(() => h.call('requireCurrentOwnerAttested', 0n, ROOT, HEAD)).toThrow(/not the latest epoch/);
    expect(() => h.call('requireCurrentOwnerAttested', 1n, ROOT, HEAD)).not.toThrow();
  });
});

describe('regression: committee rotation needs a quorum', () => {
  // Previously rotateCommittee had ZERO asserts: anyone could bump the
  // generation faster than the committee could sign, so no epoch would ever
  // seal. And it replaced no key, so it revoked nothing.
  it('a single member cannot rotate a key', () => {
    const h = new HostSim();
    const newM = member(50);
    h.call('openRotation', 2n, ...xy(newM));
    h.rotVote(0, 2, newM);
    expect(() => h.call('sealRotation', 2n, ...xy(newM))).toThrow(/quorum not reached/);
  });

  it('a rotation nobody proposed cannot be sealed', () => {
    const h = new HostSim();
    expect(() => h.call('sealRotation', 2n, ...xy(member(50)))).toThrow(/not proposed/);
  });

  it('a quorum REPLACES the leaked key, which can then no longer vote', () => {
    const h = new HostSim();
    const leaked = h.members[2];
    const fresh = member(50);
    h.call('openRotation', 2n, ...xy(fresh));
    h.rotVote(0, 2, fresh);
    h.rotVote(1, 2, fresh);
    h.call('sealRotation', 2n, ...xy(fresh));
    expect(h.gen).toBe(1n);

    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.snapshotRoot();
    h.call('openEpoch', 0n, root);
    // The leaked key is gone from slot 2, even signing under the NEW generation.
    expect(() => h.vote(2, 0, root, leaked)).toThrow(/does not match this committee slot/);
    // The fresh key works.
    expect(() => h.vote(2, 0, root, fresh)).not.toThrow();
  });

  it('a rotation strands every vote cast under the old generation', () => {
    const h = new HostSim();
    h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.snapshotRoot();
    h.call('openEpoch', 0n, root);
    h.vote(0, 0, root);
    h.vote(1, 0, root);                        // quorum reached under gen 0...

    const fresh = member(50);
    h.call('openRotation', 2n, ...xy(fresh));
    h.rotVote(0, 2, fresh);
    h.rotVote(1, 2, fresh);
    h.call('sealRotation', 2n, ...xy(fresh)); // ...then the committee rotates.

    // The gen-0 proposal no longer exists under gen 1.
    expect(() => h.call('sealEpoch', 0n, root)).toThrow(/proposal not open/);
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
    expect(() => h.call('requireCurrentOwnerAttested', 0n, ROOT, bytes32(99))).toThrow(/does not bind/);
  });

  it('rejects a stale attestation once the window closes', () => {
    const { h, leaf } = attestedHost();
    h.ps.snapshotPath = h.ledger.snapshot.findPathForLeaf(leaf);
    h.advance(Number(hostPure.maxStalenessSeconds()) + 3600);
    expect(() => h.call('requireCurrentOwnerAttested', 0n, ROOT, HEAD)).toThrow(/stale/);
  });

  // Regression. The window used to start at the claimed time PLUS slack, so a
  // hostile sealer could stretch 24h to 24h 10m. It now starts at the claimed
  // time itself, which blockTimeGte guarantees is no later than the real seal.
  // At this instant the OLD code would still accept; the new code must not.
  it('a sealer cannot stretch the staleness window with its claimed time', () => {
    const h = new HostSim();
    const leaf = h.call('appendSnapshotLeaf', ROOT, HEAD);
    const root = h.snapshotRoot();
    h.call('openEpoch', 0n, root);
    h.vote(0, 0, root);
    h.vote(1, 0, root);
    h.ps.claimedNow = h.now - 500;          // earliest bracket the seal allows
    h.call('sealEpoch', 0n, root);
    h.ps.snapshotPath = h.ledger.snapshot.findPathForLeaf(leaf);
    h.advance(Number(hostPure.maxStalenessSeconds()) - 400);
    expect(() => h.call('requireCurrentOwnerAttested', 0n, ROOT, HEAD)).toThrow(/stale/);
  });

  it('rejects an unattested epoch', () => {
    const { h, leaf } = attestedHost();
    h.ps.snapshotPath = h.ledger.snapshot.findPathForLeaf(leaf);
    expect(() => h.call('requireCurrentOwnerAttested', 5n, ROOT, HEAD)).toThrow(/not attested/);
  });
});
