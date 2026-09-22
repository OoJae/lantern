// The attestation committee: three Jubjub signing keys, as the independent host
// sees them. Runtime-bound (the Foundation's Schnorr library and the runtime's
// point accessors), so both are passed in.
export function createCommittee({ rt, schnorr }, seeds) {
  const make = (seed) => {
    const sk = schnorr.seedBytesToJubjubSecretScalar(seed);
    return { sk, pk: schnorr.deriveJubjubPublicKey(sk) };
  };
  const members = seeds.map(make);
  const xy = (m) => [rt.jubjubPointX(m.pk), rt.jubjubPointY(m.pk)];
  return {
    get size() { return members.length; },
    pk: (i) => members[i].pk,
    xy: (i) => xy(members[i]),
    /** Every slot's coordinates, in constructor order. */
    ctorArgs: () => members.flatMap(xy),
    sign: (i, digest) => schnorr.signJubjubDigest(members[i].sk, digest),
    /** Slot i's key as it is now, kept even after the slot is rotated (a leaked key). */
    signer(i) { const m = members[i]; return { pk: m.pk, sign: (d) => schnorr.signJubjubDigest(m.sk, d) }; },
    /** A replacement key, not yet installed: the quorum votes for its coordinates. */
    candidate(seed) { const m = make(seed); return { xy: xy(m), install: (slot) => { members[slot] = m; } }; },
  };
}
