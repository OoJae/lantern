// Witness implementations for Lantern, shared by every executor: the in-memory
// simulator, the browser demo and the local-chain runner.
//
// Each witness is a pure function of the WitnessContext. Secrets come from the
// calling persona's private state; Merkle paths are looked up in the ledger
// view the runtime hands the witness, so the same code works against an
// in-memory ledger and against real chain state. A persona that lacks a value
// gets a clear error instead of an undefined reaching the circuit.
//
// Runtime-free: the contract's pure circuits and the clock are passed in.

const SECRET_FIELDS = ['identitySecret', 'idSalt', 'vetoSecret', 'vetoSalt', 'guardianSecret', 'leafSalt', 'ephemeralSk'];

function need(ps, field) {
  const v = ps?.[field];
  if (v === undefined || v === null) throw new Error(`${ps?.name ?? 'this persona'} does not hold ${field}`);
  return v;
}

/**
 * @param pure     the Lantern module's pureCircuits (for the lineage leaf)
 * @param clock    () => bigint seconds: the time the prover claims (claimedNow)
 * @param onRead   optional (field, value) hook, called for every secret a
 *                 circuit reads -- the story's leak scan uses it to know
 *                 exactly which secrets to look for in that proof
 */
export function lanternWitnesses({ pure, clock, onRead = () => {} }) {
  const secret = (field) => (ctx) => {
    const v = need(ctx.privateState, field);
    onRead(field, v);
    return [ctx.privateState, v];
  };
  const w = Object.fromEntries(SECRET_FIELDS.map((f) => [f, secret(f)]));

  w.guardianPath = (ctx) => {
    const leaf = need(ctx.privateState, 'leaf');
    const path = ctx.ledger.guardians.findPathForLeaf(leaf);
    if (!path) throw new Error(`${ctx.privateState.name}'s guardian leaf is not in the tree`);
    return [ctx.privateState, path];
  };
  w.lineagePath = (ctx) => {
    const { root, member } = need(ctx.privateState, 'lineage');
    const path = ctx.ledger.lineage.findPathForLeaf(pure.lineageLeafOf(root, member));
    if (!path) throw new Error(`${ctx.privateState.name}'s commitment is not in the lineage tree`);
    return [ctx.privateState, path];
  };
  w.claimedNow = (ctx) => [ctx.privateState, BigInt(clock())];
  return w;
}
