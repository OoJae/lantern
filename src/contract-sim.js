// An in-memory contract that runs the real generated circuits: Lantern, or an
// independently deployed host. Every call is made AS a persona: that persona's
// private state is what the witnesses see, and nothing else.
//
// Runtime-free: the runtime and the contract module are passed in, so the
// browser, the tests and the terminal story can share it. Several sims share
// one clock by being set to the same time.

const COIN_PK = '0'.repeat(64);

export function createContractSim({ rt, mod, witnesses, now = 1_700_000_000, ctorArgs = [] }) {
  const contract = new mod.Contract(witnesses);
  const ctor = contract.initialState(rt.createConstructorContext({}, COIN_PK), ...ctorArgs);
  let clock = now;
  let ctx = rt.createCircuitContext(rt.sampleContractAddress(), ctor.currentZswapLocalState,
    ctor.currentContractState, {}, undefined, undefined, clock);
  let lastProofData = null;

  const syncBlock = () => {
    const q = ctx.currentQueryContext;
    q.block = { ...q.block, secondsSinceEpoch: BigInt(clock) };
  };

  return {
    get now() { return clock; },
    setTime(t) { clock = t; syncBlock(); },
    advance(dt) { clock += dt; syncBlock(); },
    get ledger() { return mod.ledger(ctx.currentQueryContext.state); },
    get pure() { return mod.pureCircuits; },
    get lastProofData() { return lastProofData; },
    /** Run `circuit` with `ps` as the private state. Throws the circuit's own message on refusal. */
    callAs(ps, circuit, ...args) {
      syncBlock();
      const r = contract.impureCircuits[circuit]({ ...ctx, currentPrivateState: ps }, ...args);
      ctx = r.context;
      lastProofData = r.proofData;
      return r.result;
    },
  };
}
