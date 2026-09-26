// Witness implementations for Lantern v2: src/witnesses.js, which v1's ten
// witnesses come from unchanged, plus v2's two:
//   - a guard: the lineage path is looked up by lineageLeafOf, and v2's leaf is
//     under a different domain from v1's. Handing v1's pure circuits to a v2
//     contract would find no path at all, so the mismatch fails here, loudly,
//     instead;
//   - successorSecret and successorSalt (second review): the opening of the
//     successor finalizeRecovery proves. There, identitySecret is the secret
//     being RECOVERED, so the successor's opening is a separate pair. A device
//     persona holds both: { ephemeralSk, identitySecret, idSalt, successorSecret,
//     successorSalt } -- src/v2/sim.js fills the last two from the successor.
//
// Runtime-free: the contract's pure circuits and the clock are passed in.
import { lanternWitnesses } from '../witnesses.js';

const SUCCESSOR_FIELDS = ['successorSecret', 'successorSalt'];

export function lantern2Witnesses({ pure, clock, onRead = () => {} }) {
  if (typeof pure?.checkInKeyOf !== 'function') throw new Error('lantern2Witnesses needs Lantern v2 pure circuits');
  const w = lanternWitnesses({ pure, clock, onRead });
  for (const field of SUCCESSOR_FIELDS) {
    w[field] = (ctx) => {
      const v = ctx.privateState?.[field];
      if (v === undefined || v === null) throw new Error(`${ctx.privateState?.name ?? 'this persona'} does not hold ${field}`);
      onRead(field, v);
      return [ctx.privateState, v];
    };
  }
  return w;
}
