// The story's in-memory executor: the real generated circuits against an
// in-memory ledger. No wallet, no chain, no proofs -- and every refusal is
// the circuit's own assert. Used by the tests, the terminal and the browser.
import { lanternWitnesses } from '../witnesses.js';
import { createLanternSim } from '../lantern-sim.js';
import { scanProofData } from '../leakscan.js';

/** @param bindings { rt, Lantern } -- from src/bindings/root.mjs, or the browser's copy */
export function simExecutor({ rt, Lantern }, { now = 1_790_000_000 } = {}) {
  let reads = [];
  let sim = null;
  const witnesses = lanternWitnesses({
    pure: Lantern.pureCircuits,
    // An honest prover claims the current block time.
    clock: () => BigInt(sim.now),
    onRead: (field, value) => reads.push([field, value]),
  });
  sim = createLanternSim({ rt, mod: Lantern, witnesses, now });

  return {
    name: 'in-memory ledger',
    pure: Lantern.pureCircuits,
    ledger: () => sim.ledger,
    get now() { return sim.now; },
    async call(ps, circuit, args) {
      reads = [];
      return sim.callAs(ps, circuit, ...args);
    },
    async advance(seconds) { sim.advance(seconds); },
    /**
     * Every secret the last accepted circuit read, scanned for in its proof
     * data. `private` is the positive control: the scanner saw the value. A
     * clean step has every secret private and none public.
     */
    scanLast() {
      const secrets = Object.fromEntries(reads);
      const report = scanProofData(sim.lastProofData, secrets);
      const fields = Object.keys(report);
      return {
        fields,
        clean: fields.every((f) => report[f].private && !report[f].public),
        report,
      };
    },
  };
}
