// Witness implementations for Lantern v2. v2 declares exactly v1's ten
// witnesses, so this is src/witnesses.js with one guard: the lineage path is
// looked up by lineageLeafOf, and v2's leaf is under a different domain from
// v1's. Handing v1's pure circuits to a v2 contract would find no path at all,
// so the mismatch fails here, loudly, instead.
//
// Runtime-free: the contract's pure circuits and the clock are passed in.
import { lanternWitnesses } from '../witnesses.js';

export function lantern2Witnesses({ pure, clock, onRead }) {
  if (typeof pure?.checkInKeyOf !== 'function') throw new Error('lantern2Witnesses needs Lantern v2 pure circuits');
  return lanternWitnesses({ pure, clock, onRead });
}
