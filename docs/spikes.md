# Spikes

Before building the browser demo, the local-chain runner, sponsorship and two contract
changes, each assumption they depend on was tested on its own. Every spike below was run
on 2026-09-22 on an Apple-silicon MacBook (10 cores, Docker with 8 GB), Node 26.0.0,
compact 0.31.1, compact-runtime 0.16.0, onchain-runtime-v3 3.0.0, midnight-js 4.1.1,
wallet-sdk 1.2.0, and the images `midnight-node:1.0.0`, `indexer-standalone:4.3.3` and
`proof-server:8.1.0`.

| # | Question | Result | Evidence |
|---|---|---|---|
| S1 | Does a browser page run a real Lantern circuit, using the runtime from the repo root, under the production CSP? | **Pass** | `web/` declares no Midnight package. The production build emits exactly one `.wasm` (1.3 MB). Under `connect-src 'self'` + `'wasm-unsafe-eval'` the page computed `idCommitOf` byte-identical to Node (`eae6f9…ccde`), ran `enrollIdentity`, and refused a forged identity secret with the contract's own message. The only network requests were the page, its script and its wasm. |
| S2 | Does the local chain and the genesis wallet work on Node 26, and does the indexer stay up? | **Pass** | Genesis seed `0…01` syncs in under 1 s holding NIGHT and DUST, with no registration needed; seeds `0…02` and `0…03` are funded too. Transactions submit on Node 26 when `globalThis.WebSocket` is the `ws` package. Block time is in milliseconds, with 0.76 s skew from the wall clock. With `RECONNECT_MAX_DELAY: '24h'`, the indexer ran past 8 minutes with 0 restarts and no errors. |
| S3 | Does `host.compact` deploy with `Field` constructor arguments and accept a committee vote carrying a `JubjubPoint` and a Schnorr signature? | **Pass** | Deployed with 8 constructor arguments; `openEpoch`, two `attestVote`s (in-circuit Jubjub Schnorr verification, real proofs) and `sealEpoch` all finalized, and `attestedRoots[0]` equals the root. 17–19 s per call, measured from call to finalized. |
| S4 | Can a device with **no wallet** prove and bind a transaction, and have a sponsor pay the DUST? | **Pass** | The device used throwaway zswap keys: never synced, never funded. It bound its call (5,148 bytes) and handed the hex over. The sponsor deserialized it, ran `balanceFinalizedTransaction(…, ['dust'])` and submitted. Result `SucceedEntirely`. The device's intent held 1 contract call and 0 DUST spends; the sponsor's separate intent held 1 DUST spend and no call. |
| S5 | Can a deployment's maintenance authority be frozen? | **Pass** | `deployContract` installs a 1-of-1 authority, the deployer's key, which can replace verifier keys. One maintenance update replaced it with an **empty committee, threshold 1**, which no set of signatures can satisfy. Afterwards the old key's attempt to replace the authority, and its attempt to remove a verifier key, were both refused at submission. |
| S6 | Is key generation deterministic? | **Pass** | Recompiling `lantern.compact` reproduced all 10 verifier keys, all 10 prover keys and every `.zkir` byte-for-byte. A deployment can therefore be checked by comparing verifier keys. |
| S7 | Does an off-chain Merkle tree reproduce the contract's own tree? | **Pass** | `StateBoundedMerkleTree(20)` with `update(i, leaf)` (the tree hashes the leaf itself) matches the contract's root and path exactly. A sorted tree built only off-chain, once its root was attested, admitted an off-chain path through `requireCurrentOwnerAttested`; a path for a leaf outside it was refused. |
| S8 | Does requiring the veto secret in `rotateGuardianSet` keep it within k ≤ 14? | **Pass** | k=13 / 5,091 rows → **k=14 / 9,591 rows**. |
| S9 | Does authenticating the caller in the host gate keep it within k ≤ 14? | **Pass** | `requireCurrentOwnerAttested` k=13 / 4,034 rows → **k=14 / 9,242 rows** (identity-commitment opening plus a host-scoped Poseidon nullifier, with the shared `identity` module imported). |

## What each result decided

- **S1** — `web/` stays a standalone package that resolves the runtime and the compiled
  contracts from the repo root, so the browser runs exactly the modules `npm test` does.
- **S2** — the devnet runs on current Node (≥ 24); no pinned older Node is needed.
- **S3** — the host contract's beats run on chain, not only in the simulator.
- **S4** — the recovering phone and the veto card hold no wallet at all. A guardian or
  sponsor pays; nothing in Lantern trusts the fee payer.
- **S5** — every devnet deployment freezes its maintenance authority, so the deployed rules
  cannot change.
- **S6** — `devnet:verify` compares on-chain verifier keys with a fresh compile.
- **S7** — the host's on-chain snapshot can be removed; the committee signs a canonical
  tree anyone can rebuild off-chain.
- **S8, S9** — both contract changes fit the k ≤ 14 budget every other circuit meets.
