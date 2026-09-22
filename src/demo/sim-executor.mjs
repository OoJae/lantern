// The story's in-memory executor: the real generated circuits of Lantern and of
// the independently deployed host, against in-memory ledgers on one shared
// clock. No wallet, no chain, no proofs -- and every refusal is the circuit's
// own assert. Used by the tests, the terminal and the browser.
import { lanternWitnesses } from '../witnesses.js';
import { hostWitnesses } from '../host-witnesses.js';
import { createContractSim } from '../contract-sim.js';
import { createCommittee } from '../host/committee.js';
import { canonicalSnapshot } from '../host/snapshot.js';
import { scanProofData } from '../leakscan.js';

const seedOf = (n) => new Uint8Array(32).fill(n);

/** @param bindings { rt, schnorr, Lantern, Host } -- from src/bindings/root.mjs, or the browser's copy */
export function simExecutor({ rt, schnorr, Lantern, Host }, { now = 1_790_000_000, hostTag = 4242n } = {}) {
  let reads = [];
  let clock = now;
  let last = null;
  const onRead = (field, value) => reads.push([field, value]);
  // An honest prover claims the current block time.
  const claim = () => BigInt(clock);

  const committee = createCommittee({ rt, schnorr }, [seedOf(1), seedOf(2), seedOf(3)]);
  const sims = {
    lantern: createContractSim({ rt, mod: Lantern, now,
      witnesses: lanternWitnesses({ pure: Lantern.pureCircuits, clock: claim, onRead }) }),
    host: createContractSim({ rt, mod: Host, now, ctorArgs: [hostTag, 2n, ...committee.ctorArgs()],
      witnesses: hostWitnesses({ clock: claim, onRead }) }),
  };

  return {
    name: 'in-memory ledger',
    pure: Lantern.pureCircuits,
    hostPure: Host.pureCircuits,
    hostTag,
    committee,
    ledger: () => sims.lantern.ledger,
    hostLedger: () => sims.host.ledger,
    /** The canonical live-set tree the committee signs, rebuilt from Lantern's ledger. */
    snapshot: () => canonicalSnapshot(rt, Host.pureCircuits.ownerLeafOf, sims.lantern.ledger),
    get now() { return clock; },
    async call(ps, circuit, args, rec, contract = 'lantern') {
      reads = [];
      last = sims[contract];
      return last.callAs(ps, circuit, ...args);
    },
    async advance(seconds) {
      clock += seconds;
      for (const s of Object.values(sims)) s.setTime(clock);
    },
    /**
     * Every secret the last accepted circuit read, scanned for in its proof
     * data. `private` is the positive control: the scanner saw the value. A
     * clean step has every secret private and none public.
     */
    scanLast() {
      const secrets = Object.fromEntries(reads);
      const report = scanProofData(last.lastProofData, secrets);
      const fields = Object.keys(report);
      return { fields, clean: fields.every((f) => report[f].private && !report[f].public), report };
    },
  };
}
