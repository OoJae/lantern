// Witness implementations for the independently deployed host (host.compact),
// shared by every executor. Runtime-free, like src/witnesses.js.

const TWO_248 = 2n ** 248n;

function need(ps, field) {
  const v = ps?.[field];
  if (v === undefined || v === null) throw new Error(`${ps?.name ?? 'this persona'} does not hold ${field}`);
  return v;
}

/**
 * @param clock   () => bigint seconds: the time the prover claims (claimedNow)
 * @param onRead  optional (field, value) hook for the leak scan
 */
export function hostWitnesses({ clock, onRead = () => {} }) {
  const secret = (field) => (ctx) => {
    const v = need(ctx.privateState, field);
    onRead(field, v);
    return [ctx.privateState, v];
  };
  return {
    identitySecret: secret('identitySecret'),
    idSalt: secret('idSalt'),
    // The Merkle path to the caller's ownership leaf in the committee's canonical tree,
    // which the caller fetched off chain (src/host/snapshot.js) -- the host keeps no tree.
    snapshotPath: (ctx) => [ctx.privateState, need(ctx.privateState, 'snapshotPath')],
    claimedNow: (ctx) => [ctx.privateState, BigInt(clock())],
    // The Foundation Schnorr module's reduction hint: pure arithmetic, no secret.
    getSchnorrReduction: (ctx, challenge) => [ctx.privateState, [challenge / TWO_248, challenge % TWO_248]],
  };
}
