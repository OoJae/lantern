// The canonical live-set tree an attestation committee signs (D6).
//
// An independently deployed host cannot read Lantern's ledger, so it trusts a
// committee-signed Merkle root of "who currently owns what". That root must
// contain EXACTLY the live owners -- every commitment that is enrolled and not
// retired, paired with its genesis root -- and nothing else. An append-only
// on-chain log cannot be that tree: a retired owner's leaf stays in it forever.
// This builds it off-chain, deterministically, from Lantern's public ledger:
//
//   leaves  = ownerLeafOf(idRoots[C], C)  for C in enrolled, C not retired
//   order   = ascending by leaf bytes
//   tree    = a fresh depth-20 tree, leaves at indices 0..n-1
//
// Anyone can rebuild it and compare roots, so a committee that signs anything
// else is publicly falsifiable. Spike S7 (docs/spikes.md) checked that this
// construction reproduces the contract's own tree, root and path.
//
// Runtime-bound, so the runtime is passed in: src/ never imports it directly.

const compareBytes = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

/** Every live (root, current) pair in Lantern's public ledger. */
export function liveOwnerPairs(lanternLedger) {
  const pairs = [];
  for (const current of lanternLedger.enrolled) {
    if (lanternLedger.retiredIdentities.member(current)) continue;
    pairs.push({ root: lanternLedger.idRoots.lookup(current), current });
  }
  return pairs;
}

/**
 * @param rt           @midnight-ntwrk/compact-runtime
 * @param ownerLeafOf  the host contract's pure circuit
 * @param lanternLedger a Lantern ledger view (from `ledger(state)`)
 */
export function canonicalSnapshot(rt, ownerLeafOf, lanternLedger, { height = 20 } = {}) {
  const entries = liveOwnerPairs(lanternLedger)
    .map((p) => ({ ...p, leaf: ownerLeafOf(p.root, p.current) }))
    .sort((a, b) => compareBytes(a.leaf, b.leaf));
  if (entries.length > 2 ** height) throw new Error('more live owners than the tree can hold');

  const T = new rt.CompactTypeBytes(32);
  const aligned = (leaf) => ({ value: T.toValue(leaf), alignment: T.alignment() });
  let tree = new rt.StateBoundedMerkleTree(height);
  // update() takes the RAW leaf; the tree applies the leaf hash itself.
  entries.forEach((e, i) => { tree = tree.update(BigInt(i), aligned(e.leaf)); });
  tree = tree.rehash();
  const root = rt.CompactTypeMerkleTreeDigest.fromValue(tree.root().value).field;

  const indexOf = (leaf) => entries.findIndex((e) => compareBytes(e.leaf, leaf) === 0);
  return Object.freeze({
    root,
    entries: Object.freeze(entries.map((e) => Object.freeze(e))),
    /** The Merkle path a live owner hands the host gate. Throws for anyone else. */
    pathFor(root, current) {
      const leaf = ownerLeafOf(root, current);
      const i = indexOf(leaf);
      if (i < 0) throw new Error('not a live owner pair in this snapshot');
      return new rt.CompactTypeMerkleTreePath(height, T).fromValue(tree.pathForLeaf(BigInt(i), aligned(leaf)).value);
    },
  });
}
