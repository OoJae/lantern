# Lantern: pitch deck source (draft)

The source for the 14-slide deck. The slide order is fixed by the plan (Step 7, Deck). Slides 12 and 13, the business slide and "Try it yourself", were added on 26 September with the research-led upgrades; the roadmap slide moved to 14.

**Conventions**

- **On the slide** is the only text a viewer reads. Each slide has at most about 35 words there, not counting the title or the labels inside the visual.
- **Visual** uses only Lantern's own material: the site, the brand kit (`web/public/brand-kit/`), the terminal output, the README's diagram and tables, and `docs/img/`. It uses no third-party logos, including Midnight's.
- **Look: Night watch** (`brand/README.md`). Backgrounds Night `#090A0F`, with Lacquer `#14151B` as the second tone and for cards and code; ink Hanji `#ECE4D2`; muted text, eyebrows and footers Ash `#948E83`, except on the cover, where they are Hanji, because Ash never sits over the 3D scene; hairlines Rib `#2C2D35`. Ember `#FF8A3D` only where the flame or the lock is: the pictograms' flames, the lit seal on slide 5, and "held" on slide 6 (the design that held). Never on links, labels or decoration. Type: Fraunces light for headings (at most one italic word each), Instrument Sans for text, Fragment Mono for code, links and the footer. 등불 appears only inside the lockup image, so the deck needs no Korean face. Accepted and refused are said in words, never by colour alone.
- **Speaker notes** go in the slide's notes field. **Sources** stay in this file only, so every number can be checked before export.
- **Spelling** is British, as in the README ("enrol", "enrolment", "licence", "authorisation"). "Finalize" keeps its z, as in the circuit name `finalizeRecovery` and in the README's prose.
- **Names:** all people in the story are fictional (Hana, Seo-yeon, Mum, Jihoon and Minji).
- **Preprod** claims only what the README and `deployments/` record. The whole story, all 74 steps with the recovery finalized, ran on Preprod on 25 September with the same 60-second flavour as the local chain (`deployments/preprod.json`; `LANTERN_NETWORK=preprod npm run devnet:verify` checks it with no wallet). The shipped contract, unchanged and frozen, has a real 72-hour recovery open there (`deployments/preprod-shipped.json`): Hana enrolled with three guardians, a recovery opened and approved, a finalize refused while locked. That recovery cannot finalize before 15:03 UTC on 27 September, three minutes after the deadline, so its finalize is not part of the submission. Lantern v2, a separate contract, is deployed on Preprod beside the shipped contract, not in its place: on 26 September it was deployed and frozen, and each v2 rule ran once (`deployments/preprod-v2.json`; `LANTERN_NETWORK=preprod npm run devnet:verify:v2` checks it with no wallet). No v2 recovery is finalized. Nothing is on mainnet. Nothing in the deck says otherwise.

---

## Slide 1: Lantern

**On the slide**

> Social recovery for Midnight private state
>
> **Lose the device. Keep the *identity*.**
>
> Lantern lets hidden guardians restore a lost Midnight identity secret, and proves it is the right one.
>
> lantern-midnight.vercel.app · github.com/OoJae/lantern · Midnight Korea Hackathon 2026

**Visual.** The landing page's hero, rebuilt as the cover. Full bleed behind it, the landing's 3D hanji lantern, captured from https://lantern-midnight.vercel.app/ at 1920×1080 (2×) with the page's text hidden, so only the lantern glows on Night at the right. Top left, the primary lockup from the brand kit (`web/public/brand-kit/lantern-lockup@2x.png`: mark, wordmark and 등불), its ink on the 128px margin. Then the eyebrow in Hanji, "Lose the device. Keep the *identity*." in Fraunces 300 at 120px, the sentence in Instrument Sans at 32px, and the two links in Fragment Mono. The links, the footer and the page number are Hanji too: Ash never sits over the 3D scene.

**Speaker notes.**
Lantern is social recovery for Midnight private state. On a Midnight DApp, your identity is a secret that lives on one device. Lantern lets people you chose, your guardians, restore that secret on a new device after a loss. Two things make it different. First, the guardians are hidden: the public record does not say who they are. Second, the recovery proves it is correct: the new device proves, in zero knowledge, that the secret it rebuilt is the one you enrolled, not just a value enough people agreed on. Every number in this deck comes from the repository. The demo runs in a browser, with nothing to install.

**Sources.** `README.md` (line 3, "In one minute"); `web/src/pages/Landing.jsx` (the hero).

---

## Slide 2: "You cannot recover a witness secret from the chain."

**On the slide**

> "You cannot recover a witness secret from the chain."
> (Midnight's security guide)
>
> The secret a contract checks lives in one device's private state. Lose the device, lose the identity and everything that gates on it.

**Visual.** A statement slide on Lacquer: the eyebrow "The gap", the quote in Fraunces 300 at 120px, the attribution and the URL (docs.midnight.network/guides/security-best-practices) beneath it in Fragment Mono, and the two sentences in Ash at 44px. No screenshot.

**Speaker notes.**
On Midnight, a contract never sees your secret. Its public ledger holds a commitment, and the circuit checks, in zero knowledge, that you hold the secret behind it. That secret is a witness, and it lives in your device's private state. Midnight's own security guide says it plainly: "You cannot recover a witness secret from the chain." Midnight's bulletin-board tutorial shows what that means for a DApp. A post's owner is a commitment to a key that lives only in the poster's private state, and taking the post down requires that key. Lose the key, and nobody can ever take the post down. Any DApp built on that pattern has the same gap.

**Sources.** `README.md` ("In one minute", "The pattern Midnight teaches"); `web/src/pages/Landing.jsx` ("No recovery by default"); `src/demo/story.mjs` (beat 2 caption).

---

## Slide 3: A seed restores keys, not state

**On the slide**

> Derive the secret from the wallet seed, and the seed is the only copy.
> - Lose it, and the identity is gone.
> - Leak it, and a thief holds it silently, with nothing to rotate it away.

**Visual.** A table on Night, banded in Lacquer, with the seed column in Ash and Lantern's column in Hanji, both drawn from the README:

| | Derived from the seed | Lantern |
|---|---|---|
| Backup | the seed, the only copy | one share per guardian; any *t* rebuild it, fewer reveal nothing |
| Lost | gone | *t* guardians restore it on a new device |
| Stolen | the thief keeps it, unseen | 72 hours of public notice, a veto, then the old secret is retired |

**Speaker notes.**
A wallet seed restores keys. It does not restore a DApp's private state. You could derive the identity secret from the seed, but that makes the seed the only copy, so nothing is recovered: the single point of failure has just moved. A leak is worse. Whoever holds the seed holds the identity, silently, and nothing can rotate the identity away from them. Midnight's guide asks builders to "Decide your recovery model before you deploy: multiple authorized keys, a recovery circuit gated on a separate secret, or a threshold of guardians." Lantern builds the threshold of guardians. It adds a separate veto secret, which on its own can only cancel a recovery, and which is also required to add or evict guardians. When a recovery finalizes, the old commitment is retired, and DApps refuse the old secret: at once where they read Lantern's ledger, and at an independent DApp once its committee seals a snapshot built after the recovery.

**Sources.** `README.md` ("Why not derive the secret from the wallet seed?", "Security in one table", "In one minute"); `test/shamir.test.js` ("reveals nothing from t-1 shares").

---

## Slide 4: How it works

**On the slide**

> 1. Enrol a secret and a separate veto secret.
> 2. Deal one share per hidden guardian.
> 3. Guardians approve one new device.
> 4. 72 hours' public notice; the veto card can cancel.
> 5. The device proves the secret is right.

**Visual.** A five-step horizontal flow: five Lacquer cards, each with a brand-kit pictogram (`web/public/brand-kit/pictograms/`, drawn to PNG at 280px), the step number in Fragment Mono and the step in Hanji. 1 `01-seal` (a lit lantern above its seal), 2 `02-three-lights` (three shares going to three lanterns), 3 `04-return` (two lights coming back), 4 `05-window` (the recovery ring part way round, and the veto card), 5 `06-lock` (the lantern lit again over its lit seal). Beneath the cards, the line about commitments and nullifiers in Ash.

**Speaker notes.**
Here is the story from the demo. Hana enrols with a threshold of 2. Off chain, she gives one Shamir share each to Seo-yeon, Mum and Jihoon. On chain, each guardian is only a salted commitment in a Merkle tree, and adding one needs the veto secret. The threshold and the number of guardians are public; who the guardians are is not. Then her laptop is lost. Anyone may open a recovery for her new phone's public key, since the phone has no secret to authenticate with. Seo-yeon and Mum check the phone's fingerprint with Hana over the phone, then approve with zero-knowledge membership proofs. Each approval leaves an opaque nullifier and adds one to a public count, so the record shows how many approved but not who. Next come 72 hours of public notice, and then the phone finalizes. The phone holds no wallet: a sponsor pays its fees, and no circuit trusts the fee payer.

**Sources.** `README.md` ("How it works", "Sponsorship"); `src/demo/story.mjs` (beats 0–4); `test/authentication.test.js`.

---

## Slide 5: What `finalizeRecovery` proves

**On the slide**

> One call. It is accepted only if:
> not vetoed · not already retired · guardian set unchanged since the open · the approved device · 72 hours passed · quorum met · **the rebuilt secret opens the enrolment commitment**

**Visual.** On Lacquer: the six conditions as outlined pills; then the brand kit's lit seal (`lantern-seal-lit.svg`, drawn to PNG), the lock and the slide's one Ember element, beside "…and the rebuilt secret opens the enrolment commitment." in Fraunces 300 at 72px; then the last of the seven asserts in `contracts/src/lantern.compact` (lines 380–414), in Fragment Mono on Night:

```
assert(idCommitOf(identitySecret(), idSalt()) == idCommit,
       "reconstructed secret does not open idCommit");
```

**Speaker notes.**
This slide is the core of Lantern. A conventional guardian scheme proves that enough signatures arrived. It cannot tell a correct recovery from a quorum that agreed to install a value nobody ever held. `finalizeRecovery` proves that the prover holds a secret and a salt that open the identity commitment, which was frozen into the recovery when it opened. The commitment is binding, so a preimage is the preimage. `test/shamir.test.js` shows the negative case ten times: one fabricated share rebuilds a different secret, and the circuit refuses it. The comparison feeds an assert, not the ledger, so no bit of the secret reaches the chain, whether the call succeeds or fails. It has two honest limits. It proves the correct value, not where the value came from. And it proves that *t* guardian tokens were presented, not that *t* people consented. Quorum is a comparison on a counter that only goes up, so a later approval cannot invalidate a finalize proof. The circuit is k = 14, 8,561 rows. The shipped 72-hour version proves in 0.8 to 0.9 seconds warm. Four of these checks, the device, the timelock, the quorum and the commitment opening, each have a button in the "Try to break it" panel on the next slide.

**Sources.** `contracts/src/lantern.compact` (`finalizeRecovery`, lines 371–429); `SECURITY.md` §2; `README.md` ("The primitives, by file", the circuits table, the bench line); `test/concurrency.test.js`; `deployments/bench-shipped-finalize.json`.

---

## Slide 6: Try to find the guardians, then try to break it

**On the slide**

> `npm run attack`: the whole public ledger, plus 64 of the owner's contacts.
> Three designs give up every guardian. Lantern: 0 of 3.
>
> Your turn: lantern-midnight.vercel.app/demo#break. Six attacks and one honest control, each answered by the contract in its own words.

**Visual.** On the left, the attack table (the output of `npm run attack`, or `/attacks`), banded in Lacquer, with "broken" in Ash and "held" in Ember, as `/attacks` marks the design that held:

| # | target | probes | guardians named | votes linked | verdict |
|---|---|---:|---:|---:|---|
| 1 | PublicGuardians | 0 | 3 / 3 | 2 / 2 | broken |
| 2a | lantern-v0, unsalted leaf | 64 | 3 / 3 | 2 / 2 | broken |
| 2b | lantern-v0, derived salt | 512 | 3 / 3 | 2 / 2 | broken |
| 3 | lantern (shipped) | 268 | 0 / 3 | 0 / 2 | held |

On the right, a fresh capture (25 September 2026) of the "Tamper with a share" card on https://lantern-midnight.vercel.app/demo#break, taken at a 680px-wide viewport so the card fills one column, after "Flip the byte and finalize" has run on byte 0 of Mum's share. It shows `finalizeRecovery refused: "reconstructed secret does not open idCommit"`, with its one-sentence reason and "Public record: unchanged."

**Speaker notes.**
The attack is also a test. It exits non-zero if a vulnerable design is not fully broken, or if Lantern is. Design 1 keeps guardian identifiers in the clear, which is the common EVM pattern of guardian addresses in contract storage; the attacker reads them straight off the ledger. Designs 2a and 2b are Lantern's own first draft. The unsalted hash falls to 64 probes, one per contact. The commitment with a salt derived from public data costs the attacker a factor of eight, and nothing more. The shipped contract puts 32 bytes of per-guardian entropy in each leaf. Given the real names, the attacker makes 268 probes and names none. The lesson: a commitment hides exactly the entropy in its preimage that is not already on chain. In fairness, the threshold and the number of guardians are public.
The story on `/demo` follows a script. The "Try to break it" panel lets you choose the attack instead. You can flip a chosen byte of Mum's or Seo-yeon's share, finalize from a phone the guardians never approved, finalize at 71 hours, veto with a guessed card, approve twice, or finalize with one approval. There is also an honest control, which is accepted. Every refusal is the contract's own message, followed by one sentence on why. The panel runs the compiled circuits in your browser against an in-memory ledger, with no chain and no proofs. It shows only a 4-byte fingerprint of each share, and a browser test steps through every byte of both shares to check that nothing more appears.

**Sources.** `README.md` ("The attack", the table between `facts:attack` markers); `web/src/pages/Attacks.jsx`; `web/src/components/BreakIt.jsx` (the attacks and why-sentences); `web/e2e/break.spec.js`; commit `c3185b6`.

---

## Slide 7: The stolen laptop and the veto card

**On the slide**

> Jihoon, a guardian, phishes Mum's share. Now he holds what the lost laptop held.
> **Refused:** mint a guardian, evict the guardians, veto, finalize Hana's recovery.
> **Accepted:** Hana's veto card kills his own recovery.
>
> Limit, said plainly: *t* guardians who pool their real shares can take the identity. The owner gets 72 hours of notice and a veto they cannot hold.

**Visual.** On Lacquer, the text on the left and, on the right, a fresh capture (25 September 2026) of https://lantern-midnight.vercel.app/demo?beat=7 after "Play this beat", taken at an 820px-wide viewport: steps 7.6, 7.7 and 7.8 refused ("not the device the guardians approved", "rotating the guardian set requires the veto secret", "veto secret does not open this identity's veto commitment"), 7.9 accepted (Hana's veto) and 7.10 refused ("recovery vetoed"), each with its local-chain record line. The mint refusal, 7.3, is in the slide's text, not the capture. The committed `docs/img/demo-beat7.png` is the old design and is not used.

**Speaker notes.**
This is beat 7 of the story. Jihoon's own share plus Mum's phished share rebuild Hana's identity secret, which is exactly what a thief with the lost laptop would hold. Here is what it buys him. Until Hana's recovery finalizes, he can act as her at DApps. That is the honest cost of any recovery scheme. He can open a recovery for his own device and approve it with his real guardian token. But he cannot mint the second token he needs, because adding a guardian needs the veto secret. He cannot finalize Hana's recovery, because his is not the device the guardians approved. He cannot evict the guardians to kill her recovery, and he cannot veto it. Hana sees a recovery she did not start, and kills it with her veto card. Each of these four refusals closes a defect we found in our own review. Two of them: adding a guardian was once gated on the identity secret alone, which let a thief mint a quorum and take the identity. Rotating the set was too, which let a thief kill the owner's recovery and evict the guardians: a permanent lockout. There is one limit: *t* guardians who pool their real shares can take the identity. What the owner gets is 72 hours of notice and a veto they cannot hold.

**Sources.** `src/demo/story.mjs` (steps 7.1–7.11); `SECURITY.md` §4.5 and §7; `README.md` ("Core features", "Limitations"); `deployments/local-devnet.json` (steps 7.7, 7.9, 7.10).

---

## Slide 8: DApps keep working

**On the slide**

> A DApp stores one value: the identity root.
> - **In-contract gate:** the old secret fails at once.
> - **Independent DApp:** a committee-signed snapshot. The old secret passes for at most 24 hours after the latest seal.

**Visual.** Two Lacquer cards, drawn from the story, with the brand kit's `07-apps` pictogram (two windows joined to one knot on the ledger line) at the top right. The in-contract card: `hostGatedAction` → 9.1 refused, "not the current owner of this identity root" → 9.2 Hana's phone accepted → "The old secret fails at once." The independent card: `requireCurrentOwnerAttested` against epoch 1 → 9.6 old secret accepted → epoch 2 seals → 9.12 refused ("ownership leaf is not in the attested snapshot") → 9.14 phone accepted → "The old secret passes for at most 24 hours after the latest seal." Labels ("Old secret:", "Hana's new phone:") in Ash, outcomes in Hanji.

**Speaker notes.**
A DApp gates on "the current owner of identity root R". It stores the root, which survives a recovery, so it never updates anything. If the DApp's circuits sit in the same contract as Lantern's ledger, it uses the shared predicate in `ownergate.compact`, as `hostGatedAction` does. That gate reads the retired set directly, so the old secret is refused the moment the recovery finalizes. An independently deployed contract cannot read Lantern's ledger, and cross-contract calls fail to compile on compiler 0.31. It trusts a three-member committee instead. The committee rebuilds the list of current owners from Lantern's public ledger and signs its root, and each signature is a Jubjub Schnorr check inside the circuit. A Merkle root proves membership, never non-membership. So the retired secret still passes against an older snapshot until one built after the recovery seals, and never more than 24 hours after the latest seal. The in-contract gate is strictly more sound. Both ship on purpose: the gap between them is the result. If a committee key leaks, a quorum replaces it, and the leaked key's next vote is refused.

**Sources.** `README.md` ("Who it is for": Builders; "Security in one table"; "Limitations"); `SECURITY.md` §4.4; `contracts/src/ownergate.compact`, `contracts/src/host.compact`; `src/demo/story.mjs` (steps 9.1–9.14, 10.5–10.14); `test/host.test.js`.

---

## Slide 9: Real proofs, local and public

**On the slide**

> **Local chain, the whole story:** 74 steps: 45 accepted, 15 refused, 14 off chain. 49 transactions, 8 paid by a sponsor for a phone with no wallet. Proofs 0.2 / 0.7 / 2.1 s · a 60-second lock.
> **Midnight Preprod, the whole story:** the same 74 steps, the recovery finalized. 49 transactions, 8 paid by a sponsor for a phone with no wallet. Proofs 0.2 / 0.9 / 2.5 s · the same 60-second lock.
> **Midnight Preprod, the shipped contract:** unchanged and frozen, with its real 72-hour lock. A recovery is open. It cannot finalize before 27 Sept, 15:03 UTC, after the deadline. `bfd4fa7780902551…` on the Preprod explorer.
> **Lantern v2 on Preprod:** a separate contract beside the shipped one. Each v2 rule run once: 12 steps accepted, 4 refused. 15 transactions.
> **Check it, no wallet:** `LANTERN_NETWORK=preprod npm run devnet:verify` · `LANTERN_NETWORK=preprod node devnet/src/shipped.mjs verify` · `LANTERN_NETWORK=preprod npm run devnet:verify:v2` · Each checks: verifier keys against a fresh compile · the freeze · every transaction at its block → "The record matches the chain."

**Visual.** Three Night cards on Lacquer, one per run, each with an eyebrow (Local chain, Midnight Preprod, Midnight Preprod) and a Fraunces title (The whole story, The whole story, The shipped contract), two lines of fact in Hanji and one of meta in Ash. Beneath them, one line in Hanji for Lantern v2 on Preprod, then a terminal strip in Fragment Mono: the three verify commands, then a summary marked as one in Ash ("Each checks:"), with no ✓ marks, since no command prints those lines; only the closing quote, "The record matches the chain.", is what each prints. The full outputs are in the README (the whole story's `devnet:verify` and Lantern v2's `devnet:verify:v2`, both captured on 26 September) and from `devnet/src/shipped.mjs verify`. Use no screenshot of the explorer: it is third-party material.

**Speaker notes.**
`npm run devnet` runs the same story as `npm run story`, on a single-node local Midnight chain. Every accepted step is a proved, balanced and finalized transaction, and the run writes its record only if every step goes as expected. The run recorded on 22 September has 74 steps: 45 accepted, 15 refused and 14 off chain. It made 49 transactions, including two deploys and two freezes, and a sponsor paid for 8 of them on behalf of a device with no wallet. Proofs took 0.2 seconds at minimum, 0.7 at the median and 2.1 at most. One caveat: this build changes one line, for a 60-second timelock instead of 72 hours. The shipped 72-hour finalize is proved separately: 2 seconds cold, then 0.8 to 0.9. The same finalize at 71 hours is refused.
Then the public network. On 25 September the same command ran the whole story on Midnight Preprod, a public test network, with the same 60-second flavour: 74 steps, 45 accepted, 15 refused and 14 off chain, in 49 transactions, 8 of them paid by a sponsor for a phone with no wallet, and the recovery finalized. Proofs took 0.2, 0.9 and 2.5 seconds at minimum, median and most. Each contract's maintenance authority was replaced with an empty committee, so no one can change its rules, and every verifier key on the chain is byte-identical to a fresh compile: 10 of 10, and 7 of 7.
The shipped `contracts/src/lantern.compact`, unchanged, with its real 72-hour lock, is on Preprod too, frozen, and all 10 of its verifier keys match a fresh compile. On 24 September, Hana enrolled and added three guardians, Seo-yeon opened a recovery for Hana's new phone, and Seo-yeon and Mum approved it: seven transactions after the deploy and the freeze, each with a real proof. The phone then tried to finalize, and the circuit's own assert refused it locally, before any transaction: "timelock has not elapsed". The lock ends at 15:03 UTC on 27 September, three minutes after the hackathon's deadline, so that finalize is not part of this submission.
Lantern v2 is on Preprod too, as a separate contract beside the shipped one, never in its place. On 26 September it was deployed in two parts, because the node refuses a deploy carrying all 13 verifier keys as exceeding the block limits: 8 in the deploy and 5 in one update, and then frozen. Then each v2 rule ran once: 16 steps, 12 accepted and 4 refused by the circuit's own asserts, in 15 transactions. Its delay is v2's minimum, 24 hours, and nothing waits it out, so no v2 recovery is finalized.
Anyone can check all three with no wallet. After `npm ci && npm ci --prefix devnet && bash devnet/compile.sh`, on Node 24 or later with compact 0.31.1, run `LANTERN_NETWORK=preprod npm run devnet:verify` for the whole story, `LANTERN_NETWORK=preprod node devnet/src/shipped.mjs verify` for the shipped contract, and `LANTERN_NETWORK=preprod npm run devnet:verify:v2` for Lantern v2. Each checks the contracts against a fresh compile of the source, the freeze, and every recorded transaction at its block.
Preprod also showed three things the local chain never did. A fresh wallet replays the network's whole DUST history before it can pay a fee: about 1.56 million events, which took about six and a half hours. And the SDK's default submission service failed every time we tried it, so on a public network Lantern sends each transaction over one persistent connection. Last, on the whole story's first attempt the node refused a fresh DUST spend as outside its time window, error 171. The same bytes are valid a block or two later, so Lantern now sends them again on that error alone; the recorded run never needed it.

**Sources.** `deployments/local-devnet.json` (`summary`, `contracts.*.maintenanceAuthority`, `flavour`); `deployments/bench-shipped-finalize.json`; `deployments/preprod.json` (the whole story on Preprod: `recordedAt`, `summary`, `contracts`, `flavour`); `deployments/preprod-shipped.json` (`contract`, `steps`, `recovery`, and `finalize`, which is null); `deployments/preprod-v2.json` (`recordedAt`, `summary`, `delay`, `contracts.lantern2`: `operationsAtDeploy`, `verifierKeysInsertedBy`, `maintenanceAuthority`); `devnet/src/split-deploy.mjs` (why the deploy came in two parts); `README.md` ("What is real, and where", "Measured", "On Midnight's public test network": "The whole story", "The shipped contract, with its real 72-hour lock", "What it took" and "Lantern v2 on Preprod"); `devnet/src/shipped.mjs` (the `verify` mode); `SECURITY.md` §1 (the "rules cannot change" row) and §6.10; `docs/spikes.md` (S4, S5, S6); `test/record.test.js`; the contracts on the explorer, https://preprod.midnightexplorer.com/contracts/bac79cd962f547ac070802a221f9f7260bffa4724e6180ef3c874eadabb85101, https://preprod.midnightexplorer.com/contracts/a53b489179903e1b40a8078b59649af9b113a4d9d7da0d8f293e97314b59b68d and https://preprod.midnightexplorer.com/contracts/bfd4fa7780902551422b932e7acf8b61fc077dba21afb1be3df1090a25b352c9 and https://preprod.midnightexplorer.com/contracts/6ed46d5d7dc667e5b212b155f376c4914a693dfd45b3d033ada69e3551971fa4.

---

## Slide 10: Tests, and 21 defects found and fixed

**On the slide**

> **560** unit tests in under a minute, 293 for shipped Lantern and 267 for Lantern v2, with no toolchain and no Docker. CI recompiles the contracts and runs them on Node 20, 22 and 24.
> **Browser tests in Chromium, WebKit and Firefox**, with accessibility checks, and a check that the demo makes no network request after it loads.
> **21 defects found in our own review.** Each was reproduced, then fixed; 20 have a regression test named after them.

**Visual.** Night background. On the left, "560" large in Fraunces light, its line in Ash beneath; lower down, "Browser tests in Chromium, WebKit and Firefox" in Fraunces with its line in Ash, and no count (the number is changing). On the right, "21 defects found in our own review", then three Lacquer cards with Rib hairlines, each with the defect in Hanji and its consequence in Ash, from the README's "Found and fixed in review": rotation gated on the identity secret alone (a permanent lockout); privacy tests searching big-endian while the runtime stores little-endian (tests that could never fail); the attested host gate reading no identity witness (a membership check, not an authorisation). No Ember on this slide.

**Speaker notes.**
`npm test` runs 560 Vitest tests in 32 files, 293 for shipped Lantern and 267 for Lantern v2, in under a minute, with no Compact toolchain and no Docker, because the generated contract modules are committed. CI recompiles them from source on every push, fails on any difference, and runs the suite on Node 20, 22 and 24. The suite includes a leak scanner with a positive control, and tests of the committed chain records, local and Preprod. In the browser, Playwright tests run in CI in Chromium, at desktop size and as an emulated Pixel 7, and before release in WebKit, as an emulated iPhone 15, and in Firefox. A set of them covers the "Try to break it" panel. They include accessibility checks, and one test fails if the demo makes any network request after it loads. We threat-modelled our own code and found 21 real defects. Here are three. Rotation was gated on the identity secret alone, which allowed a permanent lockout, and our own earlier fix had made that possible. The privacy tests searched for secrets big-endian while the runtime stores them little-endian, so those tests could never fail. And the attested host gate read no identity witness, which made it a membership check rather than an authorisation. All 21 are listed in SECURITY.md §7.

**Sources.** `README.md` ("Measured": 560 tests in 32 files; shipped Lantern's 293 in 18, kit 46, lantern 33, succession 33, record 32, adversarial 28, host 26, words 21, devnet 10, identity 10, shamir 9, leakscan 8, story 8, concurrency 6, portable 6, authentication 5, limits 5, host-snapshot 4, device 3; Lantern v2's 267 in 14; "Quickstart"; "For reviewers"; "Found and fixed in review"); `SECURITY.md` §7; `test/leakscan.test.js` (the positive control); `web/playwright.config.js` (the Chromium projects); `web/playwright.cross.config.js` (WebKit, iPhone 15, Firefox); `web/e2e/network.spec.js`; `web/e2e/helpers.js` (axe checks). The deck states no browser-test count, on purpose: it is changing.

---

## Slide 11: Who it is for, and why now

**On the slide**

> **Users:** anyone a DApp knows only by a commitment: a credential holder, a DAO member, a pseudonymous account. Losing a phone should not end that identity.
> **Builders:** store one root, get recovery. A wallet adds enrolment and share dealing; DApps gate on the identity root. Midnight's bulletin-board tutorial pattern could gate on a Lantern root instead.
> **Korea:** the amended PIPA took effect on 11 September 2026. *Our reading, not legal advice:* a public guardian list is personal information about named people. Lantern never publishes it.

**Visual.** Lacquer background, with three Night cards on Rib hairlines: Users, Builders, Korea, each headed in Fraunces light. At the foot of the Korea card, the source footnote in Ash: "IAPP: 'a penalty ceiling of 10% of total turnover'. Hunton: fines 'of up to 10% of a company's total revenue in certain high-severity data breach cases'." No logos. No Ember on this slide.

**Speaker notes.**
**Users** are anyone a private DApp knows only by a commitment: a credential holder, a DAO member or a pseudonymous account. Losing a phone should not end that identity, and protecting it should not mean publishing who you trust.
**Builders:** a DApp that gates on "the current owner of identity root R" gets recovery without writing any, and stores one value. Midnight's bulletin-board tutorial pattern could gate on a Lantern root in the same way. The adoption path is this: a wallet or identity app adds enrolment and share dealing, and DApps gate on the root. Each deployment freezes its maintenance authority, which anyone can check before trusting it.
**Korea:** South Korea's amended Personal Information Protection Act was promulgated on 10 March 2026 and took effect on 11 September 2026. The IAPP reports that it "introduces a penalty ceiling of 10% of total turnover" and "places personal supervisory liability on the CEO". Hunton describes fines "of up to 10% of a company's total revenue in certain high-severity data breach cases", subject to transition rules. Our reading, and this is not legal advice: a public list of who can recover whose identity is personal information about named people and their relationships. A guardian design that stores it in the clear publishes it to everyone, permanently. Lantern keeps it off the public record by construction, and `npm run attack` checks that it does.

**Sources.** `README.md` ("Who it is for, and why now": Users, Builders, The pattern Midnight teaches, Adoption path, Korea, with the IAPP and Hunton links and quotes).

---

## Slide 12: Who integrates it, and the ask

**On the slide**

> **Integrators:** Midnight Passport, a recovery profile beside C14's paper keys · wallets and identity apps: enrolment, share dealing, kits in words · DApps: gate on one identity root; recovery comes free · Korean services: no public list of who guards whom.
> **Distribution:** an SDK, to be packaged from the repo's client code; Apache-2.0. Hosted: a sponsor that pays the walletless phone's DUST, and a watcher that alerts the owner.
> **The ask:** a C14 pilot with Passport · wallet and DApp partners · help with an external audit.

**Visual.** Night background. On the left, under the eyebrow "Integrators" in Ash, four rows divided by Rib hairlines, each a name in Fraunces light at 44px (Hanji) over one line in Ash at 32px; the rows share the column's height, so the last hairline meets the foot of the right column. On the right, two Lacquer cards with Rib borders. "Distribution" is titled in Fraunces at 44px with its text in Hanji. "The ask" fills the rest of the column: its title, then the three asks as rows in Fraunces light at 44px, divided by Rib hairlines like the integrator rows, so the card holds no empty space. No images and no Ember on this slide.

**Speaker notes.**
Who integrates Lantern, and how it reaches them.
First, Midnight Passport. In 2026/07 the Passport team chose stateless guardians with paper keys for total-loss recovery, component C14. Lantern is a different point in the same space: a guardian set enforced on chain that stays hidden, public notice and a veto no guardian holds, and a recovery the circuit proves correct. We set out the comparison on Passport's issue 20 as prior art, not as a request to reopen their decision. The natural fit is a second recovery profile inside Passport. One thing must come first: a gate that is safe to hand to a remote prover, which is on our roadmap.
Second, wallets and identity apps. They add enrolment, share dealing and kits in words.
Third, any DApp that gates on an identity root. It stores one value and gets recovery without writing any.
Fourth, Korean services. The amended Personal Information Protection Act took effect on 11 September 2026. Our reading, not legal advice: a public list of who can recover whose identity is personal information about named people, and Lantern never publishes one.
Distribution. An SDK for wallets and identity apps, open under Apache-2.0, built from the client code already in the repository and not yet packaged. Beside it, two hosted services for teams that would rather not run their own: a sponsor, which pays the DUST for a recovering phone that holds no wallet, and a watcher, which alerts an owner when a recovery opens for their identity. The contracts and the SDK stay open; the hosted services are the business. A hidden professional guardian, a service that holds one share and approves only after its own check, extends it, and needs no contract change.
The ask. A pilot with the Passport team, as a C14 recovery profile. A wallet and a DApp as design partners on Preprod. And help with an external audit, the last item on our roadmap.

**Sources.** `README.md` ("Who it is for, and why now": Adoption path; Who integrates, and how it reaches them; Korea; "Midnight's own direction"; "Roadmap" items 4 and 7); `docs/v2.md` §14.3 (the hidden professional guardian, and the Passport profile with the delegation-safe gate it needs first); `docs/upstream/passport-c14-prior-art.md`; `devnet/src/sponsor.mjs` (the sponsor in the recorded runs).

---

## Slide 13: Try it yourself

**On the slide**

> **/live · On Preprod:** the shipped recovery, read from the chain. Every recorded transaction, checked. Watch an identity.
> **/rehearse · Rehearse a recovery:** choose three to five guardians, lose the device, refuse the phishing call, and see it through.
> **/kit · Recovery kits:** practice kits: a veto card and guardian kits in words, and six fingerprint words to compare aloud.
>
> Nothing to install. /live reads Preprod's public indexer; /rehearse and /kit run in your browser, with no network and no proofs.

**Visual.** Lacquer background, three Night cards with Rib borders, one per page. Each card: the path in Fragment Mono (Ash), the page's own title in Fraunces light at 44px (the titles the pages use: "On Preprod", "Rehearse a recovery", "Recovery kits"), two to four lines in Hanji, then along the card's foot a brand-kit pictogram at 112px on the left (`05-window` for /live, `04-return` for /rehearse, `02-three-lights` for /kit; their flames are the slide's only Ember) and a QR code at 200px on the right, the size slide 14 uses, so each scans from the back of a room. The QR codes are generated locally for https://lantern-midnight.vercel.app/live, /rehearse and /kit, in Night on Hanji like slide 14's. The honesty line runs beneath the cards in Ash. The page's route is `/live`, but the page and the slide call it "On Preprod".

**Speaker notes.**
Three pages, each built so a judge can touch something real in under a minute.
On Preprod reads Midnight's public indexer from your browser. It shows the shipped contract's recovery with its 2 of 2 approvals, and when it can finalize: 15:03 UTC on 27 September, three minutes after the deadline, with a countdown until then and the finalize once it lands. It lays out every call as a timeline, with block, time and circuit. It also shows Lantern v2, a separate contract, with each of its 16 steps. On a click it checks, in your browser, that every transaction in our three Preprod records is on the chain at its recorded block, and that each contract's rules are frozen and its verifier keys' SHA-256 hashes match a compile of this repository. The full checks, which also compile the contracts afresh, are the verify commands from the evidence slide.
Watch an identity answers the first thing people expect of a recovery system: an alert. Paste an identity commitment, which is public anyway, and the page lists every recovery opened for it, with the new device's fingerprint in words, and, while the tab is open, tells you when a new one appears. With no tab open, npm run watch does the same from a terminal or a server, and can send each alert to a webhook. A 72-hour veto only helps an owner who hears about the recovery.
Rehearse a recovery puts you in Hana's place. Choose three to five guardians and a threshold, deal their kits, lose the device, and take the recovery to the end. Then a stranger who knows who your guardians are opens a recovery for his own phone, and calls each of them from a number they do not know, reading out his own phone's six words. Those words match his phone, so they cannot catch him. The rule does: approve only on a call you placed to a number you already know. The words then make sure each approval goes to the phone the owner is holding. It runs the same compiled circuits as the demo, in your browser, with no network and no proofs.
Recovery kits are practice kits, made in your browser. The owner keeps the printable veto card. Each guardian keeps a kit in words, with a plain script: approve only after the owner reads you the six words, in person or on a call you placed, in a voice you know, and never read your words to someone who calls you. The fingerprint is six words, 66 bits. The story's hex fingerprint is 32 bits, few enough that someone could grind a device key to match it.

**Sources.** `README.md` ("For reviewers": "Try it yourself"); `web/src/pages/Live.jsx`, `web/src/pages/Rehearse.jsx`, `web/src/pages/Kit.jsx` (the pages and their titles); `web/src/live/Check.jsx` (what the browser check looks up); `web/src/rehearse/engine.js` (`MIN_GUARDIANS`, `MAX_GUARDIANS`, and `phish`: the caller and his own words); `web/src/kit/copy.js` (`GUARDIAN_SCRIPT`); `src/words.js` (`fingerprintWords`: six words, 66 bits; `bytesToWords`: 24 checksummed words); `deployments/preprod.json`, `deployments/preprod-shipped.json` and `deployments/preprod-v2.json` (the records the browser check reads; `recovery.approvals`, `recovery.finalizeNoEarlierThan`; `summary.steps`); `web/src/live/V2.jsx` (the Lantern v2 section); `docs/v2.md` ("Where these come from": alerts ranked first, a practice recovery fourth, a device check in words sixth).

---

## Slide 14: Roadmap, limits and links

**On the slide**

> **Next:** Lantern v2, on Preprod beside the shipped contract, for real users: rate-limited opens, an emergency lock, a chosen delay, guardian check-ins · rebuild the secret in a disposable worker · real users on Preprod, after the shipped 72-hour finalize · an external audit.
> **Limits:** *t* colluding guardians can take the identity · the threshold and guardian count are public · nothing is audited; nothing is on mainnet.
> **Try it:** lantern-midnight.vercel.app/demo#break · github.com/OoJae/lantern

**Visual.** Night background, three Lacquer cards on Rib hairlines: **Next** (four of the README's seven roadmap items, the first summarised as Lantern v2 in `docs/v2.md`; all seven are in the notes), **Limits** (three lines), **Try it** (the two links in Fragment Mono, the site's host on a line of its own so no address breaks at a hyphen, with the two QR codes generated locally, for the demo and the repo, labelled in Ash). Beneath the cards, in Ash: "All names in the story are fictional." No Ember on this slide.

**Speaker notes.**
The roadmap, in order:
1. Rate-limit `openRecovery`: only a current guardian can open, one recovery per identity at a time, with a cooldown that doubles after each veto. Today, one fee buys one more recovery the owner must veto. That is the largest gap between Lantern and a production system. It leads Lantern v2, with an emergency lock held by the veto card, a delay chosen at enrolment, which makes a private inheritance profile possible, and private guardian check-ins. v2 is a separate contract, contracts/v2/lantern2.compact, built and tested in this repository, set out in docs/v2.md, and deployed on Preprod beside the shipped contract, not in its place, where each of its rules has run once; all 13 of its circuits fit k ≤ 14. The shipped contract on Preprod stays frozen and unchanged.
2. Rebuild the secret in a disposable worker, so it cannot linger in memory.
3. Make the committee size a constructor parameter.
4. Build a gate that is safe to delegate.
5. Use cross-contract calls when Midnight ships them, which would remove the 24-hour window.
6. Finish on Preprod. The shipped contract's recovery can finalize from 15:03 UTC on 27 September, after the deadline, and the On Preprod page shows whether it has. Then put the enrolment flow in front of real users. The whole story has already run there, with the 60-second flavour, and so has each rule of Lantern v2.
7. An external audit.
The limits, said plainly. *t* colluding guardians can take the identity. The threshold and the number of guardians are public. Opening a recovery is permissionless, so an open recovery tells the world an owner may have lost a key; Lantern v2 rate-limits it, in a separate contract on Preprod beside the shipped one, not in its place. The whole story, finalize included, has run on a single-node local chain and on Preprod, both with the 60-second flavour; the shipped contract, unchanged, has run on Preprod up to its 72-hour lock, which ends after the deadline; and Lantern v2 has run each rule there with its 24-hour minimum delay, so no v2 recovery has been finalized. The browser demo makes no proofs; the proofs are in the chain runs, local and on Preprod. Nothing is on mainnet, and nothing is audited. Everything here is in the repo. The demo needs no install, and after `npm ci`, `npm test` runs the 560 tests in under a minute. All people in the story are fictional.

**Sources.** `README.md` ("Roadmap" items 1 and 6, "Limitations", the links table, "On Midnight's public test network": "The whole story" and "The shipped contract, with its real 72-hour lock"); `SECURITY.md` §6 and §9; `deployments/preprod.json` (`summary`, `flavour`); `deployments/preprod-shipped.json` (`recovery.finalizeNoEarlierThan`); `deployments/preprod-v2.json` (`summary`, `delay`); `docs/v2.md` (the four changes, and the status line).

---

## Every number in the deck, and where it comes from

| Number | Slide | Source |
|---|---|---|
| 72 hours (timelock); refused at 71 hours | 4, 5, 6, 7, 9, 13, 14 | `contracts/src/lantern.compact` (`finalizeRecovery`); `deployments/bench-shipped-finalize.json` (`timelockSeconds` 259200, `negativeControl`) |
| 7 checks in `finalizeRecovery` | 5 | `contracts/src/lantern.compact` lines 380–414 |
| k = 14, 8,561 rows | 5 | `README.md` circuits table |
| 0.8–0.9 s warm, 2 s cold (shipped finalize) | 5, 9 | `deployments/bench-shipped-finalize.json` (`proveSeconds` [2, 0.8, 0.9]) |
| Negative case shown ten times | 5 | `SECURITY.md` §2 (`test/shamir.test.js`) |
| 64 contacts; probes 0 / 64 / 512 / 268; 3 of 3 named vs 0 of 3; 2 of 2 votes linked vs 0 of 2 | 6 | `README.md` attack table |
| 32 bytes of per-guardian entropy; a factor of eight | 6 | `README.md` ("The attack") |
| Six attacks and one honest control; 4-byte fingerprint | 6 | `web/src/components/BreakIt.jsx` (`TRIES`); `web/e2e/break.spec.js`; commit `c3185b6` |
| 24 hours after the latest seal; a three-member committee | 8 | `SECURITY.md` §4.4; `src/demo/story.mjs` (step 0.8) |
| 74 steps: 45 accepted, 15 refused, 14 off chain (local chain and Preprod) | 9 | `deployments/local-devnet.json` (`summary`); `deployments/preprod.json` (`summary`: 74, 45, 15); `README.md` chain table and "On Midnight's public test network" |
| 49 transactions (2 deploys, 2 freezes); 8 paid by a sponsor for a phone with no wallet (local chain and Preprod) | 9 | `README.md` chain table and "The whole story" (Preprod); `deployments/preprod.json` (`summary.transactions` 49) |
| Local proofs 0.2 / 0.7 / 2.1 s; call to finalized median 18.6 s | 9 | `deployments/local-devnet.json` (`summary`) |
| Preprod whole story, 25 September: proofs 0.2 / 0.9 / 2.5 s; recovery finalized | 9 | `deployments/preprod.json` (`recordedAt` 2026-09-25, `summary.proveSeconds`); `README.md` ("The whole story") |
| Verifier keys 10 of 10 and 7 of 7 | 9 | `README.md` (captured `devnet:verify` output) |
| 60-second timelock, one line changed (local chain and the Preprod whole story) | 9, 14 | `deployments/local-devnet.json` and `deployments/preprod.json` (`flavour`: line 120, `recoveryDelaySeconds` 60); `SECURITY.md` §6.10 |
| Preprod: the shipped contract, unchanged; maintenance authority frozen (committee 0, threshold 1); verifier keys 10 of 10 | 9 | `deployments/preprod-shipped.json` (`contract`); `README.md` ("On Midnight's public test network") |
| Preprod: 24 September; three guardians; seven accepted transactions; 2 of 2 approvals; finalize refused, "timelock has not elapsed" | 9, 13 | `deployments/preprod-shipped.json` (`openedAt`, `steps` 1–8, `recovery.approvals`) |
| Preprod finalize no earlier than 27 September, 15:03 UTC; three minutes after the deadline (15:00 UTC) | 9, 13, 14 | `deployments/preprod-shipped.json` (`recovery.finalizeNoEarlierThan`); `README.md` ("On Midnight's public test network") |
| About 1.56 million DUST events; about six and a half hours | 9 | `README.md` ("What it took") |
| 560 unit tests in 32 files: 293 for shipped Lantern in 18, 267 for Lantern v2 in 14; under a minute; Node 20, 22 and 24 | 10, 14 | `README.md` ("Measured", "Quickstart", "For reviewers") |
| Browser tests in Chromium, WebKit and Firefox (no count stated, on purpose) | 10 | `web/playwright.config.js`; `web/playwright.cross.config.js`; `README.md` ("Measured") |
| 21 defects; 20 with a named regression test | 10 | `SECURITY.md` §7; `README.md` ("Found and fixed in review") |
| PIPA: promulgated 10 March 2026, in force 11 September 2026; 10% | 11, 12 | `README.md` ("Korea", quoting the IAPP and Hunton) |
| Roadmap: seven items | 14 | `README.md` ("Roadmap") |
| v2: four contract changes, built and tested, deployed on Preprod beside the shipped contract (not in its place); guardian-only opens, one recovery per identity at a time; a cooldown that doubles after each veto; 13 circuits at k ≤ 14 | 14 | `docs/v2.md` (§3 to §6, §14, and the status line); `README.md` ("Roadmap" item 1) |
| Lantern v2 on Preprod, 26 September: 16 steps, 12 accepted, 4 refused; 15 transactions; 13 verifier keys, 8 in the deploy and 5 in one update, then the freeze; a 24-hour delay, no v2 recovery finalized | 9, 14 | `deployments/preprod-v2.json` (`recordedAt`, `summary`, `delay`, `contracts.lantern2`); `README.md` ("Lantern v2 on Preprod") |
| Three to five guardians (the rehearsal) | 13 | `web/src/rehearse/engine.js` (`MIN_GUARDIANS` 3, `MAX_GUARDIANS` 5) at the exported commit |
| Six words, 66 bits (fingerprint); 32 bits (the story's 8-hex fingerprint) | 13 | `src/words.js` (`FINGERPRINT_WORDS`, and the file's header comment) |
| Four integrator groups; two hosted services; three asks | 12 | `README.md` ("Who it is for, and why now": Who integrates, and how it reaches them) |

## Before export

1. **Preprod.** Slides 9, 13 and 14 state Preprod as `README.md` and `deployments/` record it at commit `0a72f9a`: the whole story ran there on 25 September, recovery finalized, with the 60-second flavour (`deployments/preprod.json`); the shipped contract, unchanged, has a real 72-hour recovery open (`deployments/preprod-shipped.json`). Lantern v2 is on Preprod beside the shipped contract since 26 September (`deployments/preprod-v2.json`, commit `9f58779`). Run `LANTERN_NETWORK=preprod npm run devnet:verify`, `LANTERN_NETWORK=preprod node devnet/src/shipped.mjs verify` and `LANTERN_NETWORK=preprod npm run devnet:verify:v2` in a clean copy before export. The shipped recovery cannot finalize before 15:03 UTC on 27 September, after the deadline, so the deck never claims that finalize; if a later public commit records it, update slides 9 and 14 from that record only. Slide 13 says only that the page shows the countdown and, once the finalize lands, the finalize itself, so it holds either way.
2. **Browser-test count.** The deck states no count, on purpose: the number was changing when the deck was refreshed. It says only "browser tests in Chromium, WebKit and Firefox". If a count is added later, take it from `README.md` at the exported commit, and count tests, not runs (each project multiplies the runs).
3. **Images** (uploaded to the deck's asset store): the cover uses the landing's lantern, captured from https://lantern-midnight.vercel.app, and the lockup from `web/public/brand-kit/`; slide 4 uses the pictograms 01, 02, 04, 05 and 06 from the kit; slide 5 the lit seal; slide 6 the "Try to break it" panel after the tamper attempt (`/demo#break`); slide 7 beat 7 of `/demo` with its refusals; slide 8 pictogram 07; slide 13 pictograms 05, 04 and 02, and three QR codes for https://lantern-midnight.vercel.app/live, /rehearse and /kit, generated locally with segno 1.6.6 (error correction M, Night on Hanji, as on slide 14). Slide 12 has no images. The site captures were taken with Playwright from the deployed site on 25 September. If the site changes before export, retake them the same way. No third-party logos, and no explorer screenshots.
4. **The new pages.** Slide 13 describes `/live`, `/rehearse` and `/kit` as their feature specs describe them; they were built in parallel on 26 September and reach the deployed site only with the next approved redeploy. Before export, open each on https://lantern-midnight.vercel.app, check its title and what the card says it does, scan each QR code, and change the card to match the page, never the other way round.
5. **After the finalize, before Seoul (2 October).** The shipped recovery can finalize from 15:03 UTC on 27 September. Slide 13's card and notes and slide 14's roadmap line are worded to hold before and after it. Once a public commit records the finalize, update slide 9 from that record only, and check slide 13 against what On Preprod then shows.
6. **Counts.** Slide 10's unit-test count and slide 14's notes come from `README.md` at the exported commit, which takes them from `npx vitest run`; other tracks were still adding tests when this was written.
