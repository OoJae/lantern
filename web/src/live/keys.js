// The SHA-256 of each verifier key a compile of this repository produces (`npm run compile`, Compact
// 0.31.1: lantern.compact into contracts/managed/keys, host.compact into contracts/managed-host/keys).
// The keys themselves are not committed (.gitignore keeps only each compile's contract/ module), so
// the hashes are pinned here. The browser check hashes each key the chain holds and compares: a
// matching hash means the contract on chain checks proofs against exactly the circuits this
// repository compiles.
//
// Hashes, not the 2 KB keys, so the check fetches nothing from this site. CI's compile job recompiles
// and fails if any hash here differs from that compile, or if the set of circuits does; and
// web/e2e/live.spec.js checks them too wherever a compile is present. That the keys on chain match a
// fresh compile is what the terminal checks, with the compiler, one command per record:
// `LANTERN_NETWORK=preprod npm run devnet:verify` (the whole story, preprod.json) and
// `LANTERN_NETWORK=preprod node devnet/src/shipped.mjs verify` (preprod-shipped.json). This page does
// not run a compiler.
export const COMMITTED_KEYS = {
  lantern: {
    addGuardian: '3c2e8827b14ec8c6c091b9a26e4cfea5f494edd6989683c9ea3f3ea1d438140a',
    approveRecovery: '7f2f645e066d9547a7d35a001f1e75ee62d1bbd86aa927511d71a129b20437ab',
    enrollIdentity: '6533460b6c338247471a5e94ff51ebad97637d955e9cab2ee71c3f8155cea382',
    finalizeRecovery: 'f9baaa7dc6f4d73602e4d6a840132cc19b455b6025fffd46ccc343e853a2578d',
    hostGatedAction: '7125d9e4d38e175c8c0f7a0aa1e94fbbbe00f7f6d56f30c967b1c86a7eb8f5ce',
    openRecovery: '1a64ae5cf1da31b7c5618191b98d172e9f8788cba299da86f71b28cfbfb76030',
    proveHeadOwnership: '98cd34b14df3a9a14d970e58ade6d49982b79aa27b71e56bda080978c15d1a45',
    proveSuccession: '024d0f03e5ebc5d5d36aa9685ada3c1e1908c738d19f66377d35b058a70c3be2',
    rotateGuardianSet: '1c691c44f4c3e05109c8325bc22322cac5d21384e0aef3ec9db912a814bb94a5',
    vetoRecovery: 'a70c9d44c5af87a6eb17b076ee352945d37806f352029b3b39a8a86b985e33c9',
  },
  host: {
    attestVote: '7d67b6bd7ecdaed77c374b2802a2843467515bd59c036f924e357d82092c403e',
    openEpoch: '48bb252332caa94ca0c32197fd01c90f21b856c97a0d3e34a56db4b53ba97bdb',
    openRotation: 'd2e15669e99cd77ce98e65741293235e1cc520d4e1074bd1dbf87073a2534a91',
    requireCurrentOwnerAttested: '1a7ce45fc9ffc876b8e00fa71d72127cebb9f6268a08e522115f71dfffda877d',
    rotateVote: '125fd1ba57f65e020a70e1640b5d8965b44bc13cdc2679333b8568f8d42bacfa',
    sealEpoch: 'e50147d26c7806244f193ecef1154dc240a1e8521d009f390f5b74547c6afc66',
    sealRotation: '47a7fabfa5611e735767d2d47b56b967f678ad2732fc58c7195a98879fc387c9',
  },
};

// The one key the whole story's Lantern does NOT share with the compiled build, pinned rather than
// merely "different". That run changed line 120 (a 60-second timelock, so the story could wait it out),
// which only finalizeRecovery reads: its key is the 60-second build's, every other key the compiled
// one. To reproduce the hash: `bash devnet/compile.sh` (compact 0.31.1), then
// `shasum -a 256 devnet/build/lantern/keys/finalizeRecovery.verifier`. CI's compile job builds it and
// checks this pin (.github/workflows/compile.yml), as web/e2e/live.spec.js does wherever it is built.
export const FLAVOUR_KEYS = {
  shipped: {},
  story: {
    finalizeRecovery: {
      sha: 'ee46f10650772a8296eb3af86b2608d8dab22f658f8d314f5e2c072dbb7187a1',
      build: 'the 60-second build (devnet/compile.sh)',
    },
  },
  host: {},
};

/**
 * A contract's verifier keys on chain (circuit -> SHA-256, from live/decode.js) against what this
 * repository expects of it: the compiled key for every circuit, but the pinned one where FLAVOUR_KEYS
 * names one. No circuit missing, none extra.
 * @param {Record<string, string|null>} onChain
 * @param {'lantern'|'host'} kind
 * @param {string} key the contract's key in records.js (shipped, story, host)
 */
export function compareKeys(onChain, kind, key) {
  const committed = COMMITTED_KEYS[kind];
  const flavour = FLAVOUR_KEYS[key] ?? {};
  const names = Object.keys(committed);
  const same = names.filter((n) => !flavour[n] && onChain[n] === committed[n]);
  const pinned = names.filter((n) => flavour[n] && onChain[n] === flavour[n].sha);
  const wrong = names.filter((n) => onChain[n] !== (flavour[n]?.sha ?? committed[n]));
  const extra = Object.keys(onChain).filter((n) => !(n in committed));
  return { ok: !wrong.length && !extra.length, total: names.length, same, pinned, wrong, extra, flavour };
}
