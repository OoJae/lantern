# Prior art for C14: Lantern, a hidden on-chain guardian set with a separate veto credential

Status: external prior art, 2026/09. Inputs: Lantern at commit [`5ef4825`][repo-sha]; the [C14 canvas][c14-oq] on `main` at `55aa287`; the recovery MIP draft in [#165][pr165] at head `71cbaa9`.

This is not a proposal to reopen the 2026/07 decision. It records prior art the maintainers may find useful for the open questions on the canvas: parameters and policy, including time-locked self-recovery; guardian-request authentication; recovery of the encryption secret; and cryptographer review. One disclosure first: every Lantern owner and guardian gate takes its secret as a witness, which is the construction #165 rejects under REC-11 (see Limits).

## What Lantern is

Lantern is a pair of Compact contracts (compact 0.31.1, ZKIR v2, ledger 8; [SECURITY.md:8][s-ver], [README.md:192][r-zkir]) in which a t-of-n guardian quorum restores a lost identity secret. The owner Shamir-shares a `Field`-typed secret off chain; on chain, each guardian is only a salted commitment in a `HistoricMerkleTree`. Anyone may open a recovery for a new device's key, the guardians approve with membership proofs, and after 72 hours the device finalises by proving that the rebuilt secret opens the enrolment commitment. Until then a separate veto secret, the veto card, held by no guardian, can cancel ([README.md:26][r-how]).

## What the circuit proves

`finalizeRecovery` asserts, in one proof:

- **The right value.** The witnessed secret and salt open the identity commitment frozen at open ([lantern.compact:413][lc-open]); a tampered share yields no proof ([test/shamir.test.js:108][t-tamper]). Provenance is not proved: nothing shows the value came from shares ([SECURITY.md:89][s-prov]).
- **The timelock, from the later bound.** `openRecovery` stores both bounds of a claimed time bracketed by block-time predicates ([lantern.compact:295][lc-bracket]); finalisation waits 72 hours from the later one ([lantern.compact:400][lc-lock]), so never less than 72 hours after the opening block.
- **The approved device.** The recovery identifier binds the identity commitment and the device's ephemeral public key ([lantern.compact:77][lc-rid]), and finalisation requires the matching secret ([lantern.compact:395][lc-device]).
- **Nullifiers and quorum.** Each approval writes a nullifier over the guardian secret, identity commitment, and recovery identifier ([lantern.compact:82][lc-nulof], [341][lc-nul]), after a leaf-binding assert placed before `checkRoot` ([lantern.compact:333][lc-bind]). Quorum is `lessThan` on an increment-only counter ([lantern.compact:407][lc-quorum]), so a later approval cannot invalidate a finalisation proof. A guardian-set rotation kills an open recovery ([lantern.compact:387][lc-ctx]).

## What stays hidden, and what does not

Hidden: who the guardians are. Each leaf commits to a guardian secret under a salt ([lantern.compact:70][lc-leaf]); an approval discloses a historic root and a nullifier, and adds one to a public count ([lantern.compact:146][lc-count]). Public: the threshold ([lantern.compact:127][lc-thr]), the guardian count through `addGuardian` history ([SECURITY.md:176][s-kn]), and the succession graph ([SECURITY.md:417][s-graph]). An approval is one of n within a known set, narrowed by timing ([SECURITY.md:423][s-anon]). The largest privacy cost is a liveness oracle: opening is permissionless, and whether a veto follows shows whether the owner is watching ([SECURITY.md:408][s-oracle]).

## The veto secret

The veto secret is generated independently and never Shamir-shared ([lantern.compact:181][lc-vetowit]); it alone suffices for `vetoRecovery` ([lantern.compact:351][lc-veto]). `addGuardian` and `rotateGuardianSet` require it as well as the identity secret ([lantern.compact:241][lc-add], [271][lc-rot]). Before these asserts were added, we reproduced that a stolen device could mint its own quorum, or rotate the set to kill a recovery that had reached quorum ([SECURITY.md:540][s-d-rot], [544][s-d-add]).

## The attested host and its 24-hour window

A separately deployed contract on 0.31.x cannot call Lantern or read its ledger ([host.compact:7][hc-xcc]), so `host.compact` gates on a committee-signed snapshot. A snapshot proves membership, not "not retired": a retired owner's secret passes until a newer epoch seals, at most 24 hours after the older epoch sealed ([host.compact:296][hc-stale], [SECURITY.md:327][s-window]). The in-contract gate reads `retiredIdentities` directly and has no such window ([lantern.compact:495][lc-gate]).

## Evidence: the local chain, Preprod, and the attack

The full story ran on a single-node local chain: 74 steps, 45 accepted and 15 refused, in 49 transactions ([local-devnet.json:2337][d-summary], [3][d-net]), with one contract line changed, the timelock, cut to 60 seconds ([local-devnet.json:23][d-flavour]). A guardian who phished a second share is refused at `addGuardian`, `rotateGuardianSet`, and `vetoRecovery`, and when finalising the owner's recovery from his own device (steps [7.3][d73], [7.7][d77], [7.8][d78], [7.6][d76]). A tampered share is refused ([8.9][d89]). The retired secret passes the attested host until the next epoch seals, then fails ([9.6][d96], [9.12][d912], [9.13][d913]). `npm run attack`, given the public ledger and 64 contacts including the real guardians, names every guardian of three vulnerable designs and none of Lantern's ([README.md:314][r-attack]). There are also 196 unit tests ([README.md:190][r-tests]) and a [hosted demo][demo] that runs the compiled circuits in the browser, without proofs ([README.md:108][r-demo]), with a "Try to break it" panel. On Preprod, a public test network, the shipped `lantern.compact` is [deployed][p-explorer] unchanged, with its real 72-hour timelock, its maintenance authority frozen, and all 10 verifier keys identical to a fresh compile ([preprod-shipped.json:17][p-contract]); in seven transactions an owner enrolled and added three guardians, one guardian opened a recovery for a new phone, and two approved; a finalisation attempted under the lock was then refused, "timelock has not elapsed", before any transaction ([preprod-shipped.json:39][p-steps]). The record stops there, since the lock forbids finalisation before 2026/09/27 15:03 UTC ([preprod-shipped.json:147][p-lock]), and anyone can re-check it without a wallet with `LANTERN_NETWORK=preprod node devnet/src/shipped.mjs verify` after a fresh compile ([README.md:286][r-preprod]).

## Limits

1. **Delegated proving.** Every Lantern owner and guardian gate takes its secret as a witness ([lantern.compact:171][lc-wit]), so a remote prover learns it: the construction #165 rejects because "a preimage gate hands `s` to whoever produces the proof". By our reading of the circuit, not tested, a delegated prover of `finalizeRecovery` learns the identity secret, its salt, and the ephemeral secret, and could finalise to a successor it controls. All our runs, including Preprod, used a local proof server ([SECURITY.md:597][s-prover], [README.md:111][r-where]). A signature gate for owners and guardians is on the roadmap only ([README.md:384][r-roadmap]); Lantern's only signature gates today are the host committee's votes, an in-circuit Jubjub Schnorr check ([host.compact:193][hc-schnorr]). Locally, the shipped `finalizeRecovery` proved in 0.8 to 0.9 s after a 2 s cold first proof, with proof server 8.1.0 on the recorded machine, an Apple M5 ([bench-shipped-finalize.json:4][d-bench], [README.md:231][r-bench]).
2. **The veto in total loss.** The veto remains available in total loss only if the veto card is kept apart from the device. By default it shares the identity secret's encrypted store ([SECURITY.md:469][s-vetostore]). A stolen card can cancel every recovery ([lantern.compact:351][lc-veto]); a lost one blocks vetoing, adding, and rotating until a recovery issues a new one ([SECURITY.md:479][s-vetocost]).
3. **Collusion.** t guardians who pool their shares take the identity; the chain gives detection, delay, and the veto, not prevention ([SECURITY.md:293][s-collude]).
4. **Attrition.** `openRecovery` is not rate-limited, so each fee buys one more recovery the owner must veto ([SECURITY.md:459][s-attrition]).
5. **Scope.** Concurrent approvals were shown not to conflict by transcript replay on compact-runtime 0.16.0, with a negative control, not on a node ([test/concurrency.test.js:7][t-conc], [74][t-conc-neg]). Nothing is audited ([SECURITY.md:14][s-audit]). Ledger 9 is untested.

## Relation to the open questions on the canvas

These are data points, not recommendations.

- **Parameters and policy.** Lantern enforces t ≥ 2 but not t ≤ n, since n is zero at enrolment ([lantern.compact:207][lc-t2], [SECURITY.md:450][s-thr]). It has no guardian-free self-recovery: the veto card can cancel a recovery and gate guardian changes, but cannot recover on its own. Replacement is set-level: one rotation evicts every guardian without disclosing a leaf; removing one guardian costs n transactions ([SECURITY.md:443][s-rotation]).
- **Guardian-request authentication.** Guardians confirm the ephemeral key's fingerprint with the owner out of band ([README.md:35][r-flow], [SECURITY.md:565][s-guardians]), and only that key's holder can redeem their approvals. This resembles the successor co-signature in #165, but Lantern derives the key in the circuit, so a prover learns that secret too.
- **Recovery of the encryption secret.** Lantern has no viewing capability to recover. One pattern may help: the salt is derived from the secret, so t shares are the complete recovery kit ([SECURITY.md:118][s-salt]).
- **Encoding.** The secret is typed `Field` and shared over the same scalar field, so the shares rebuild exactly the value the opening checks ([lantern.compact:175][lc-field], [test/shamir.test.js:10][t-field]).
- **Cryptographer review.** Our own review found 21 defects, 20 with a named regression test ([SECURITY.md:519][s-defects]). Several are integration errors, such as a recovery identifier that did not bind the identity and an ephemeral key stored but never checked; the list may serve as a checklist.

Every Lantern citation above is pinned to commit `5ef4825`.

[s-ver]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L8
[repo-sha]: https://github.com/OoJae/lantern/tree/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1
[c14-oq]: https://github.com/midnightntwrk/passport/blob/55aa2876edadc5aa873b6693d563d04342e99a88/docs/plans/components/C14-total-loss-recovery-flow.md?plain=1#L56-L82
[pr165]: https://github.com/midnightntwrk/passport/pull/165
[demo]: https://lantern-midnight.vercel.app/demo
[r-zkir]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L192
[r-how]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L26
[r-attack]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L314-L322
[r-tests]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L190
[r-demo]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L108
[r-roadmap]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L384
[lc-open]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L413-L414
[lc-bracket]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L295-L312
[lc-lock]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L400-L401
[lc-rid]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L77-L80
[lc-device]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L395-L396
[lc-nulof]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L82-L85
[lc-nul]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L341-L343
[lc-bind]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L333-L339
[lc-quorum]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L407-L408
[lc-ctx]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L387-L388
[lc-leaf]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L70-L73
[lc-thr]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L127
[lc-count]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L146
[lc-vetowit]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L181-L183
[lc-veto]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L351-L366
[lc-add]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L241-L242
[lc-rot]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L271-L272
[lc-wit]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L171-L191
[lc-t2]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L207
[lc-field]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L175-L178
[hc-xcc]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/host.compact#L7-L10
[hc-stale]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/host.compact#L296-L301
[s-prov]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L89-L93
[s-kn]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L176-L179
[s-graph]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L417-L421
[s-anon]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L423-L427
[s-oracle]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L408-L415
[s-d-rot]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L540
[s-d-add]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L544
[s-window]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L327-L335
[s-prover]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L597-L598
[s-vetostore]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L469-L472
[s-vetocost]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L479-L483
[s-collude]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L293-L296
[s-attrition]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L459-L462
[s-audit]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L14
[s-thr]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L450-L454
[s-rotation]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L443-L448
[s-guardians]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L565-L567
[s-salt]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L118-L121
[s-defects]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/SECURITY.md?plain=1#L519-L547
[d-summary]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L2337-L2341
[d-net]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L3
[d-flavour]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L23-L28
[d73]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L794
[d76]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L881
[d77]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L898
[d78]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L914
[d89]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L1244
[d96]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L1482
[d912]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L1700
[d913]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/local-devnet.json#L1719
[d-bench]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/bench-shipped-finalize.json#L4-L20
[t-tamper]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/test/shamir.test.js#L108-L120
[t-field]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/test/shamir.test.js#L10-L13
[t-conc]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/test/concurrency.test.js#L7-L22
[t-conc-neg]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/test/concurrency.test.js#L74
[r-bench]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L231
[r-flow]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L35
[lc-gate]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/lantern.compact#L495-L499
[hc-schnorr]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/contracts/src/host.compact#L193-L206
[p-explorer]: https://preprod.midnightexplorer.com/contracts/bfd4fa7780902551422b932e7acf8b61fc077dba21afb1be3df1090a25b352c9
[p-contract]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/preprod-shipped.json#L17-L38
[p-steps]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/preprod-shipped.json#L39-L146
[p-lock]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/deployments/preprod-shipped.json#L147-L155
[r-preprod]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L286-L291
[r-where]: https://github.com/OoJae/lantern/blob/5ef4825301d7b1c63e0ec0f0612eab0756b4e8f1/README.md?plain=1#L111
