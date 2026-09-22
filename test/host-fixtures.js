// A simulated INDEPENDENTLY DEPLOYED host, with a real 3-member Jubjub
// committee. Shared by host.test.js and host-snapshot.test.js.
import * as rt from '@midnight-ntwrk/compact-runtime';
import {
  seedBytesToJubjubSecretScalar, deriveJubjubPublicKey,
  signJubjubDigest, TWO_248,
} from '@midnight-ntwrk/midnight-did-jubjub-schnorr';
import { Contract as Host, ledger as hostLedger, pureCircuits as hostPure }
  from '../contracts/managed-host/contract/index.js';
import { bytes32, fieldOf, pureCircuits as lanternPure } from './simulator.js';
import { canonicalSnapshot } from '../src/host/snapshot.js';

const COIN = '0'.repeat(64);
export const TAG = fieldOf(4242);
export const NOW = 1_700_000_000;
// The owner the host gates on: a real identity, since the gate now checks the
// caller's opening of the current commitment. ROOT is the identity root it has
// always stored; HEAD is the commitment currently heading it.
export const HEAD_SECRET = fieldOf(1100);
export const HEAD_SALT = bytes32(1101);
export const ROOT = bytes32(10);
export const HEAD = lanternPure.idCommitOf(HEAD_SECRET, HEAD_SALT);

/** The canonical tree a committee signs, for a list of (root, current) owner pairs. */
export function snapshotOf(pairs) {
  const hex = (u) => Buffer.from(u).toString('hex');
  const byCurrent = new Map(pairs.map((p) => [hex(p.current), p.root]));
  return canonicalSnapshot(rt, hostPure.ownerLeafOf, {
    enrolled: pairs.map((p) => p.current),
    retiredIdentities: { member: () => false },
    idRoots: { lookup: (c) => byCurrent.get(hex(c)) },
  });
}
export const SNAP = snapshotOf([{ root: ROOT, current: HEAD }]);

/** A committee member: a Jubjub keypair derived from a seed. */
export function member(i) {
  const sk = seedBytesToJubjubSecretScalar(new Uint8Array(32).fill(i));
  return { sk, pk: deriveJubjubPublicKey(sk) };
}
export const xy = (m) => [rt.jubjubPointX(m.pk), rt.jubjubPointY(m.pk)];

/**
 * An independently deployed host. It cannot call Lantern and cannot read
 * Lantern's ledger -- everything it knows arrives as a committee-signed root.
 * The committee is installed atomically by the constructor: there is no admin.
 */
export class HostSim {
  constructor({ quorum = 2, members = [member(1), member(2), member(3)], now = NOW } = {}) {
    this.members = members;
    this.addr = rt.sampleContractAddress();
    this.now = now;
    this.ps = { claimedNow: undefined, snapshotPath: SNAP.pathFor(ROOT, HEAD),
      identitySecret: HEAD_SECRET, idSalt: HEAD_SALT };
    const self = this;
    this.contract = new Host({
      claimedNow: (ctx) => [ctx.privateState, BigInt(self.ps.claimedNow ?? self.now)],
      snapshotPath: (ctx) => [ctx.privateState, self.ps.snapshotPath],
      identitySecret: (ctx) => [ctx.privateState, self.ps.identitySecret],
      idSalt: (ctx) => [ctx.privateState, self.ps.idSalt],
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
  /** The gate, with a fresh nonce per action unless one is given. */
  gate(epoch, root, current, nonce = bytes32(5000 + (this.#nonces++))) {
    return this.call('requireCurrentOwnerAttested', BigInt(epoch), root, current, nonce);
  }
  #nonces = 0;
}

/** Stand up a host with epoch 0 attested over the canonical tree of one owner pair. */
export function attestedHost(opts = {}, snap = SNAP) {
  const h = new HostSim(opts);
  const root = snap.root;
  h.call('openEpoch', 0n, root);
  h.vote(0, 0, root);
  h.vote(1, 0, root);
  h.call('sealEpoch', 0n, root);
  return { h, root, snap };
}
