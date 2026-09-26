// Off-chain simulator for Lantern v2 (contracts/v2/lantern2.compact): v1's
// test/simulator.js, pointed at the v2 module. It runs the REAL generated
// circuit logic, every refusal included, with no node and no proof server.
import {
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, pureCircuits } from '../contracts/managed-lantern2/contract/index.js';

const COIN_PK = '0'.repeat(64);
export { pureCircuits };

/** Deterministic 32-byte value, so tests are reproducible. Same as v1's. */
export const bytes32 = (seed) => {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = (seed * 31 + i * 7) & 0xff;
  return b;
};

/** Deterministic field element well below r. Same as v1's. */
export const fieldOf = (seed) => BigInt(seed) * 0x9e3779b97f4a7c15n + 12345n;

export const DEFAULT_NOW = 1_700_000_000;

export const defaultPrivateState = () => ({
  guardianSecret: bytes32(1),
  leafSalt: bytes32(2),
  guardianPath: undefined,
  lineagePath: undefined,
  identitySecret: fieldOf(50),
  idSalt: bytes32(51),
  vetoSecret: fieldOf(60),
  vetoSalt: bytes32(61),
  claimedNow: undefined, // undefined => tell the truth (use the block time)
  ephemeralSk: undefined,
});

export class Lantern2Sim {
  constructor(privateState = {}, now = DEFAULT_NOW) {
    this.address = sampleContractAddress();
    this.now = now;
    this.ps = { ...defaultPrivateState(), ...privateState };

    // Witnesses read live from `this.ps`, so a test can swap them mid-flight to
    // simulate a forged private state -- an attacker lying to their own prover.
    const self = this;
    const w = (k) => (ctx) => [ctx.privateState, self.ps[k]];
    this.contract = new Contract({
      guardianSecret: w('guardianSecret'),
      leafSalt: w('leafSalt'),
      guardianPath: w('guardianPath'),
      lineagePath: w('lineagePath'),
      ephemeralSk: w('ephemeralSk'),
      identitySecret: w('identitySecret'),
      idSalt: w('idSalt'),
      vetoSecret: w('vetoSecret'),
      vetoSalt: w('vetoSalt'),
      claimedNow: (ctx) => [ctx.privateState, BigInt(self.ps.claimedNow ?? self.now)],
    });

    const ctor = this.contract.initialState(createConstructorContext(this.ps, COIN_PK));
    this.zswap = ctor.currentZswapLocalState;
    this.privateState = ctor.currentPrivateState;
    this.ctx = createCircuitContext(
      this.address, this.zswap, ctor.currentContractState,
      this.privateState, undefined, undefined, this.now,
    );
  }

  #syncBlock() {
    const q = this.ctx.currentQueryContext;
    q.block = { ...q.block, secondsSinceEpoch: BigInt(this.now) };
  }

  setTime(t) { this.now = Number(t); this.#syncBlock(); return this; }
  advance(dt) { return this.setTime(this.now + Number(dt)); }

  /** Public (hostile-readable) ledger view. */
  get ledger() { return ledger(this.ctx.currentQueryContext.state); }

  call(name, ...args) {
    this.#syncBlock();
    const res = this.contract.impureCircuits[name](this.ctx, ...args);
    this.ctx = res.context;
    this.lastProofData = res.proofData;
    return res.result;
  }

  get publicTranscript() { return this.lastProofData?.publicTranscript ?? []; }

  findPath(leaf) { return this.ledger.guardians.findPathForLeaf(leaf); }
}
