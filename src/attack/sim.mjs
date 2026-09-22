// A generic in-process contract runner for the adversarial demo. It exists so
// the demo can BUILD each target's world -- which needs witnesses and private
// state -- and then hand the attacker only the public ledger. The attacker
// never receives an instance of this class.
import {
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';

const COIN_PK = '0'.repeat(64);
export const DEMO_NOW = 1_700_000_000;

export class Sim {
  constructor(mod, witnessNames, { ctorArgs = [], now = DEMO_NOW } = {}) {
    this.mod = mod;
    this.now = now;
    this.ps = {};
    const self = this;
    const witnesses = {};
    for (const k of witnessNames) witnesses[k] = (ctx) => [ctx.privateState, self.ps[k]];
    this.contract = new mod.Contract(witnesses);
    const ctor = this.contract.initialState(createConstructorContext({}, COIN_PK), ...ctorArgs);
    this.zswap = ctor.currentZswapLocalState;
    this.ctx = createCircuitContext(sampleContractAddress(), this.zswap,
      ctor.currentContractState, ctor.currentPrivateState, undefined, undefined, now);
  }
  #sync() {
    const q = this.ctx.currentQueryContext;
    q.block = { ...q.block, secondsSinceEpoch: BigInt(this.now) };
  }
  call(name, ...args) {
    this.#sync();
    const r = this.contract.impureCircuits[name](this.ctx, ...args);
    this.ctx = r.context;
    this.lastProofData = r.proofData;
    return r.result;
  }
  get ledger() { return this.mod.ledger(this.ctx.currentQueryContext.state); }
}
