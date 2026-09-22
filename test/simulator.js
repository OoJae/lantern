// Off-chain simulator for the Lantern contract.
// Runs the REAL generated circuit logic -- including every assert rejection
// path -- with no node, no indexer, no proof server and no Docker.
import {
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../contracts/managed/contract/index.js';

const COIN_PK = '0'.repeat(64);

/** Deterministic 32-byte value, so tests are reproducible. */
export const bytes32 = (seed) => {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = (seed * 31 + i * 7) & 0xff;
  return b;
};

export class LanternSim {
  constructor(privateState = {}) {
    this.address = sampleContractAddress();
    // Witnesses read from `this.ps`, so a test can swap them mid-flight to
    // simulate a forged private state -- an attacker who lies to their own prover.
    const self = this;
    this.contract = new Contract({
      guardianSecret: (ctx) => [ctx.privateState, self.ps.guardianSecret],
      leafSalt: (ctx) => [ctx.privateState, self.ps.leafSalt],
      guardianPath: (ctx) => [ctx.privateState, self.ps.guardianPath],
    });
    this.ps = privateState;

    const { currentContractState, currentPrivateState, currentZswapLocalState } =
      this.contract.initialState(createConstructorContext(privateState, COIN_PK));

    this.state = currentContractState;
    this.ctx = createCircuitContext(
      this.address,
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  /** Public (hostile-readable) ledger view. */
  get ledger() {
    return ledger(this.ctx.currentQueryContext.state);
  }

  call(name, ...args) {
    const res = this.contract.impureCircuits[name](this.ctx, ...args);
    this.ctx = res.context;
    this.lastProofData = res.proofData;
    return res.result;
  }

  /** Everything this circuit run revealed on chain. Used for leakage assertions. */
  get publicTranscript() {
    return this.lastProofData?.publicTranscript ?? [];
  }

  findPath(leaf) {
    return this.ledger.guardians.findPathForLeaf(leaf);
  }
}
