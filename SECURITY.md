# Security Model

**Scope.** The contracts in `contracts/src/`, and the client code in `src/`: the
field and Shamir layer, identity derivation (`src/identity.js`), the leak scanner
(`src/leakscan.js`), the canonical host snapshot (`src/host/snapshot.js`) and the
attack engine. Also the browser demo (`web/`, an instance of adversary B1), the
chain runner (`devnet/`, local and on Preprod) and the fee-sponsor role (B2). Every claim below names the file, circuit or test that establishes
it. Verified against compact 0.31.1 / compact-runtime 0.16.0.

**Out of scope, and not built here:** share transport between owner and
guardians, production wallet UX, and login. Where one of those layers would change
a conclusion, the conclusion says so.

**Nothing here is audited, and nothing is deployed to mainnet.**

> **Reading time.** §1 and §2 take three minutes and are the honest summary.
> §3 is the Midnight-specific engineering. §4 is the threat model. The rest is
> for anyone who wants to check the work.
>
> **Don't take the privacy claims on trust — run them:**
> `npm run attack` names every guardian of three vulnerable designs from public
> data alone, fails against this one, and prints what this one still leaks,
> measured from its ledger. It is also a test: it exits non-zero if either result changes.

---

## 1. The 60-second version

Lantern makes a lost Midnight private-state secret recoverable by a hidden t-of-n
guardian quorum, and proves in-circuit that the recovered secret is the *right*
secret. Here is exactly what that is worth.

| Property | Status | Enforced by |
|---|---|---|
| A recovery cannot install a wrong secret | **Held** | `finalizeRecovery` asserts `idCommitOf(identitySecret(), idSalt()) == idCommit` |
| A recovery cannot happen silently | **Held** | every approval writes a public nullifier; `recoveries` and `approvals` are publicly readable |
| A recovery cannot finalize early | **Held** | no earlier than 72h after the block that opened it: the timelock runs from the *later* of the two bounds recorded at open |
| A recovery is vetoable by a secret no guardian holds | **Held** | `vetoRecovery`, gated on `vetoSecret`, which is never Shamir-shared |
| Approvals go to the device the guardians were shown | **Held** | `finalizeRecovery` requires the ephemeral secret behind the approved public key |
| Evicting guardians stops their recovery — even one that already reached quorum | **Held** | the guardian context is frozen into the recovery at open and re-checked at finalize |
| Evicting guardians revokes their shares | **Not held.** Only a recovery retires the secret; until then *t* shares from one earlier deal still act as you at every host | `rotateGuardianSet` changes the guardian context, not the identity secret. §6.17 |
| Holding only your identity secret — a stolen laptop or malware — cannot mint guardians, evict yours, veto, or stop your recovery. Guardians who pooled their shares cannot mint, evict or veto either, but they can open and approve a recovery of their own, which your veto card stops | **Held**, if the device kept no guardian kits after dealing (§4.5) | `addGuardian` and `rotateGuardianSet` also require the veto secret; `vetoRecovery` requires only it. §4.3, §4.5 |
| Guardian *identities* stay private | **Held** — and demonstrated | salted `persistentCommit` leaves; `npm run attack` |
| Guardians survive a recovery, so an identity can be recovered again | **Held** | stable `idRoot`; leaves bind a guardian context, not the rotating commitment |
| A downstream contract keeps working across a key loss | **Held, in-contract** | `hostGatedAction` reads `retiredIdentities` directly |
| An *independently deployed* contract keeps working | **Held, but strictly less sound** | `requireCurrentOwnerAttested` proves the caller holds the current identity secret, against a committee-signed canonical snapshot — but it accepts a retired owner's secret until a snapshot built after the recovery seals, for at most 24 h after the latest seal. §4.4 |
| The rules of a deployed instance cannot change | **Held on the recorded deployments**, local and on Preprod — not a property of the source | each recorded run replaced its maintenance authority with an empty committee. `npm run devnet:verify` (against the local chain while it runs, or with `LANTERN_NETWORK=preprod` against Preprod at any time) and `LANTERN_NETWORK=preprod node devnet/src/shipped.mjs verify` (on Preprod, at any time) re-check this and that every verifier key on the chain matches a fresh compile; offline, `test/record.test.js` checks the committed records (`deployments/`). Any other deployer can keep the key: check before you trust an instance |
| Nothing trusts the fee payer | **Held** | no circuit uses the caller's coin key or any token operation; every check is a commitment opening or a signature. `test/authentication.test.js` |
| Guardian *count* and *threshold* stay private | **Not held** | `thresholds` is public; `n` is recoverable from transaction history |
| t colluding guardians cannot take the identity | **Not held.** Nothing here claims otherwise. Until your recovery finalizes they can also act as you | §4.3 |

**The one-line version:** Lantern turns *"your private state is gone forever"*
into *"your private state can be restored, correctly, by people you chose — and if
they turn on you, you get at least 72 hours of public notice from the moment a recovery
opens, and a veto they cannot hold."*
It does not turn it into *"your guardians cannot betray you."*

---

## 2. What the circuit proves — and what it does not

This is the section most likely to be quoted back at us, so it is written as
plainly as we can manage.

### What `finalizeRecovery` proves

That the prover holds a `Field` value `s` and a salt `t` such that

```
persistentCommit(IdPreimage { domain: "lantern:id:v1", secret: s }, t) == rec.idCommit
```

where `rec.idCommit` was frozen into the write-once recovery record by
`openRecovery`. Because `persistentCommit` is binding, *a* preimage is *the*
preimage. So the value about to become the basis of the rotated identity is the
value committed at enrolment — not merely a value enough parties agreed on.

That is the difference from a conventional guardian scheme, which proves that *k*
signatures arrived and cannot tell a correct recovery from a quorum that agreed to
install a value nobody ever held. `test/shamir.test.js` demonstrates the negative
case ten times: `t−1` real Shamir shares plus one fabricated share reconstruct a
different field element, and the chain rejects it with `does not open idCommit`.

Both operands of that comparison are witness-derived and it feeds an `assert`,
not a ledger operation, so it needs no `disclose()`. A failing assert produces no
proof at all. **Not one bit about the secret reaches the chain, on the success
path or the failure path.**

### What it does not prove

**That the secret was reconstructed from shares.** Reconstruction happens
off-chain in `src/shamir.js`. The circuit sees a `Field` on the witness tape and
cannot distinguish a secret reassembled from *t* shares from one that was never
lost, lifted from a backup, or extracted under coercion. *Provably correct* means
provably the correct **value**. It says nothing about provenance.

**That t humans consented.** It proves *t* distinct guardian **tokens** were
presented — *t* openings of *t* leaves, each writing a one-shot nullifier. Those
tokens are minted by the owner's own device in `addGuardian`, so at the moment of
dealing the owner holds everything needed to satisfy every guardian check at once.
That is harmless only while the owner alone holds them. Once a guardian is added, the
device must erase that guardian's secret, leaf salt and share. A device that keeps them
is a full quorum for whoever takes it (§4.5), and it can also compute every approval
nullifier, `approvalNullifierOf(secret, idCommit, rid)`, which shows which guardian
approved each recovery. As evidence to a third party that
*t* independent people agreed, it is worth nothing, and no on-chain construction
in this design can change that.

**v2, not shipped:** the same holds in [Lantern v2](docs/v2.md), and there it also
undoes the privacy of guardian check-ins toward the owner. A device that kept the
dealt secrets can recompute every guardian's check-in, open and approval
nullifiers, name who checked in, opened and approved, and forge check-ins. The
owner's client must erase each guardian's secret and salt once the kit is dealt
([docs/v2.md §6.2](docs/v2.md#62-what-becomes-public-and-what-does-not)); a
credential the owner never sees is designed there but not built.

**That the identity was actually lost.** `openRecovery` is permissionless by
necessity: the new device holds no secret yet, so there is nothing for it to
authenticate with. Anyone can assert, on chain, that any enrolled identity's owner
has lost their key. See the liveness oracle, §5.

**That anything is reversible.** `retiredIdentities.insert` is permanent. A
successful hostile recovery stays visible in `idRoots` and `lineage` forever.

### What each party holds

| Holder | Holds | Can rebuild |
|---|---|---|
| The owner's device | identity secret, veto secret, both salts | — |
| The owner's device, while dealing | also every guardian's secret and leaf salt, because `addGuardian` computes each leaf in the owner's circuit, and every share | a full quorum of tokens, until it erases them (§6.16) |
| The veto card (printed, or a second device) | veto secret | its salt, derived from it |
| Each guardian | one Shamir share of the identity secret; their own guardian secret and leaf salt | nothing alone |
| Any *t* guardians together | *t* shares | the identity secret **and its salt** — the salt is derived from the secret (`src/identity.js`), so the share set is the complete recovery kit. Never the veto secret |

The salts are `SHA-256("lantern:idsalt:v1" ‖ be32(secret))` and
`SHA-256("lantern:vetosalt:v1" ‖ be32(secret))`. Hiding is unaffected: both secrets
are uniform over the 255-bit scalar field. After every recovery the new owner deals
fresh shares of the new secret — the old shares rebuild a retired one.

### Why there is no in-circuit Lagrange interpolation

We measured it at roughly 1% of one Merkle path — cost was not the reason. For any
secret the prover already knows, valid-looking shares are one linear equation
away, so the constraint is satisfied by exactly the provers who already satisfy
the commitment opening. It would prove nothing while implying that it proves
something. We would rather ship the honest version of the smaller claim.

---

## 3. Where the security comes from: Midnight primitives, by file and circuit

Each primitive, where it is used, what it buys, and what it costs.

| Primitive | Used in | What it buys | What it costs |
|---|---|---|---|
| **witness / ledger split** | all of `lantern.compact` | identity secret, veto secret, guardian secrets, both salts and every Merkle path stay on the device | everything then depends on that device — §4.2 |
| **`disclose()` as the taint boundary** | wherever witness-derived data becomes public: ledger operations, return values, block-time checks | every private-to-public crossing is one greppable token; the leakage audit was built by grepping for it | `disclose()` on a circuit *argument* changes nothing — arguments are already public |
| **`persistentCommit` opening as correctness** | `idCommitOf`, `finalizeRecovery` | the project's core claim (§2) | ~2 SHA-256 blocks per preimage |
| **Domain strings in exact-length `Bytes<N>`** | every `*Preimage` struct | every hashed preimage (`persistentHash`, and the `*Preimage` structs given to `transientHash`) begins with its own `lantern:<name>:v1` string, and no domain string is a prefix of another, so two hashes from different domains always differ in their bytes. A `persistentCommit` preimage does not begin with it: `persistentCommit(v, r)` is `persistentHash(r ‖ v)` (compact-runtime 0.16.0), so the 32-byte salt comes first, and for a guardian leaf the dealer chooses it. Two commitments are still separated by their domain strings, both at byte 32. A commitment and a hash are separated by total length alone: the commitments are 77 bytes (identity), 79 (veto) and 115 (guardian leaf), the SHA-256 hashes 78 (`rid`), 114 (`approve`) and 82 (`vetonul`). A new SHA-256 derivation must keep those two sets of lengths apart. The domain field's length N separates nothing: several domains share one (`rid` and `eph` 14; `lineage`, `approve` and `vetonul` 18; `gate` and `veto` 15; `guardian` and `hostgate` 19), and `persistentHash` and `persistentCommit` hash the bytes without the type's alignment: `{Bytes<18>, Bytes<32>}` and `{Bytes<14>, Bytes<36>}` over the same 50 bytes hash the same. Struct *field names* contribute nothing. The frozen comments in `lantern.compact` and `identity.compact` that call the length a second separation overstate it (§9) | a domain string longer than its N is a compile error; the exact N keeps each preimage inside two SHA-256 blocks |
| **`export pure circuit`** | 9 derivations incl. `idCommitOf`, `guardianLeafOf`, `recoveryIdOf`, `ephemeralPkOf` | the client calls *the same compiled code* as the circuit. Client/circuit drift is not mitigated, it is impossible | CI must prove they never acquire a proving key — `.github/workflows/compile.yml` does |
| **`HistoricMerkleTree` past-root acceptance** | `guardians.checkRoot` in `approveRecovery` | concurrent approvals stay valid against different historic roots | the chosen root is disclosed — a freshness fingerprint, §5 |
| **Leaf-binding assert *before* `checkRoot`** | `approveRecovery`, `proveSuccession`, `hostGatedAction` | without it, *any* valid path passes for *any* leaf: an easy assert to leave out | one commitment per circuit |
| **Nullifiers** | approvals, vetoes, gate actions, committee votes | one-shot semantics; approval nullifiers bind the *secret*, so extra leaves cannot inflate a quorum. A gate nullifier binds the caller's identity secret and the nonce, not the identity root, so each recovery starts a fresh set: once per secret, not once per identity (§8) | each is a permanent public write |
| **`Set` non-membership in-circuit** | `!retiredIdentities.member(…)` | **headship.** "C is the current owner of R" is a *negative* claim, and no append-only structure can express it. This single primitive is why the in-contract gate is sound | only available to a contract that owns the ledger — §4.4 |
| **Increment-only `Counter` + `lessThan`** | quorum checks in `finalizeRecovery`, `sealEpoch`, `sealRotation` | quorum by *comparison*, never `read()`: the boolean is monotone, so a concurrent approval cannot invalidate a finalize proof | progress is still publicly readable |
| **Value-scoped read commitments** | proved in `test/concurrency.test.js` | two guardians proving against the same state do not invalidate each other | undocumented upstream — answered by experiment, with a negative control proving a real conflict *is* detected |
| **No readable clock** | `claimedNow()` bracketed by `blockTimeGte`/`blockTimeLt` | the asserts force `lo ≤ blockTime < lo + 600s`, so the recovery lock, run from `lo + 600s`, can never end earlier than 72h after the opening block. An honest prover gets the longest lock; a lying one can shorten it by at most the 10-minute slack. Attestation acceptance starts at `lo`, so a lying sealer can only *shorten* it | block-scale precision, not seconds |
| **In-circuit Jubjub Schnorr** | Foundation module `schnorr.compact`, used by `attestVote` / `rotateVote` | committee attestation is a real signature check. `attestVote`, which verifies one, is 2,520 rows in all | one signature per circuit, so cost is flat in quorum |
| **Compact modules as shared code** | `identity.compact`, `ownergate.compact` | both contracts import `identity.compact`, so they compute an identity commitment with the same code. `ownergate.compact` holds the "current owner" rule `hostGatedAction` applies, for any contract compiled against Lantern's ledger | a module cannot reach a ledger, so the host supplies the facts |
| **ContractMaintenanceAuthority** | every deployment | **a ledger-level admin outside the contract logic.** `deployContract` installs the deployer's key as a 1-of-1 authority that can insert and remove verifier keys — i.e. replace any circuit's rules | freeze it: one maintenance update replacing it with an empty committee, threshold 1, leaves no signature set that can ever change the contract (spike S5, `docs/spikes.md`). An unfrozen deployment is only as trustworthy as that key |

Measured cost: `npm run cost`. Every circuit is **ZKIR v2** — the deployable
ledger-8 path — and nothing exceeds **k=14**.

---

## 4. The adversaries, scored separately

Each is scored on confidentiality / integrity / availability: **Held**,
**Degraded**, or **Lost**. We have tried to be harsh.

### 4.1 A — the chain observer

A full node, the indexer, the generated TypeScript bindings. No keys, no shares.

*Confidentiality: **Degraded** · Integrity: **Held** · Availability: **Held***

**Can.** Every `Set` and `Map` in the ledger exposes `[Symbol.iterator]`, and every
Merkle tree exposes `findPathForLeaf`, a membership oracle. So A reconstructs the
**entire succession forest**: every identity that ever existed, its genesis root,
how many times it has been recovered, and which commitment is live. A reads each
identity's threshold `k` from `thresholds`, and each identity's guardian count `n`
by counting `addGuardian` transactions, whose `idCommit` argument is public.
**The k-of-n parameters are public. Only the guardians' identities are hidden.**

A also gets the **liveness oracle** — §5.

**Cannot.** Learn *which* guardian approved (a device that kept the dealing records can,
§2): `approveRecovery` discloses a
historic root and a nullifier, and the transcript test asserts the guardian's
secret, salt and leaf are absent, and every path sibling that is a real node hash, since
the leaf or a sibling would locate the guardian in the tree (`test/lantern.test.js ›
never leaks the guardian secret or salt on approval`); each is found in the private
transcript first. The lineage path's siblings are pinned the same way
(`test/succession.test.js › discloses the root it checks against, and no path sibling or
identity secret`). Link one guardian's approvals across
recoveries (the nullifier binds `rid`) or across identities (it binds `idCommit`).
Invert a guardian leaf — `npm run attack` tries 268 derivations including known
plaintext and names none. Learn any secret. Forge, delay, or deny anything.

### 4.2 B1 — the front-end or login operator

Whoever serves the client that generates secrets. Not built for production here —
but it would be dishonest to score only the parts we wrote. **The browser demo is an
instance of B1:** it generates every secret in the page.

*Confidentiality: **Lost** · Integrity: **Lost** · Availability: **Lost***

**Can.** Everything. Secrets are generated in the client and the Shamir split
happens in the client, so a malicious front-end exfiltrates them *before any
commitment exists* — before any circuit here has anything to say. It can serve a
client that computes a different `vetoCommit`, silently handing itself the veto.

It also sits on an open upstream hazard: `midnight-js` issue **#1169** reports
that, with the level private-state provider, a password rotation racing a write
can leave private state undecryptable, and the veto secret lives in that state,
unshared and unrecoverable. Keep the veto card outside it too.

**Cannot.** Reopen a successor commitment already on chain, forge approvals
without guardian secrets, shorten the timelock, or make the chain lie about the
current head.

**The only real mitigations are off-chain:** reproducible front-end builds, a
published bundle hash (`web/scripts/check-bundle.mjs` prints one), and the ability
to run the client locally.

**The site's other pages, scored the same way.**
- **`/kit` and `/rehearse` are B1 instances too.** They generate secrets in the page,
  from Web Crypto, and deal them in the page. Their kits are practice kits, for no
  enrolled identity; a real kit page would be exactly the front-end this section
  distrusts. Browser tests check that neither page makes a request once it has loaded
  (`web/e2e/kit.spec.js`, `web/e2e/rehearse.spec.js`), but a malicious build of either
  would not keep that promise.
- **The Content-Security-Policy allows one outside host.** `connect-src` names Preprod's
  public indexer (`https://` and `wss://indexer.preprod.midnight.network`) for `/live`.
  `web/vercel.json` sets one policy for every route, so the allowance holds on every
  page. The pages that promise no requests are held to it by browser tests, not by the
  policy.
- **`/live`'s check trusts the indexer it reads.** It looks up each recorded
  transaction, and each contract's state and verifier keys, through Preprod's public
  indexer, so a dishonest indexer could make it pass. `LANTERN_NETWORK=preprod npm run
  devnet:verify` reads the chain through the same public indexer and node; what it adds
  is a fresh compile of the contracts, not a second view of the chain. Only your own
  node and indexer remove that trust.
- **"Watch an identity" keeps what you watch.** The commitment stays in the browser's
  `localStorage`, and in the page's address after the `#` (`/live#id=…`), a part a
  browser never sends to the site's host. A commitment is public already (every
  enrolment writes it), but "this browser watches this identity" is not. The page never
  sends the commitment to the indexer either: it reads each contract's whole public state
  and looks for the commitment locally. A browser test checks every request and stream
  message for it. The terminal watcher, `npm run watch`, reads the same way and sends its
  alerts only to standard output and to a webhook you name; redirects are not followed, so
  a webhook that answers with one never passes the alert on. A Slack or Discord webhook
  URL is a secret: pass it as `LANTERN_WEBHOOK` or with `--webhook-file` (owner-only), not
  `--webhook`, which other users on the host can read with `ps`. The `--id` commitment is
  on the command line too: public on chain, but on a shared host it tells other users
  which identity you watch.

### 4.2b B2 — the fee sponsor

A funded wallet that pays DUST for someone else's transaction. The recovering phone
needs one: by definition it has lost everything, including any wallet. Built and
run: every `npm run devnet` run sponsors the phone (`devnet/src/{sponsor,device,policy}.mjs`),
and its record carries the evidence per transaction.

*Confidentiality: **Held** on chain; metadata **Lost** · Integrity: **Held** · Availability: **Degraded***

**Can.** Refuse to pay. Learn metadata: which device asked, when, and for which
circuit — a sponsor asked to pay for a `finalizeRecovery` knows a recovery is
finishing, which sharpens the liveness oracle (§5). Be drained of DUST by identities
enrolled for the purpose, if it pays without a quota (rule 4): that costs its
availability, not Lantern's integrity, and DUST regenerates from the sponsor's NIGHT.

**Cannot.**
- **Alter the transaction.** The device proves and binds it before the sponsor
  sees it; binding fixes every contract call, so the sponsor can only add its own
  fee-paying intent. Having refused, it cannot stop anyone else from paying for
  the same bound transaction.
- **Gain anything by paying.** No circuit authenticates by the fee payer
  (`test/authentication.test.js`). The sponsor trying to finalize for itself is
  refused — story step 8.10, *"not the device the guardians approved"*.

**Rules we follow, and that a production sponsor must:**
1. **A sponsor never proves for anyone.** A proof server sees the witnesses — the
   secrets. The device proves locally, or on a proof server it trusts. *(In our
   recorded runs, local and on Preprod, one local proof server serves every role;
   they are separated only by which wallet pays.)*
2. **No veto path depends only on a guardian acting as sponsor.** The veto card
   works with any sponsor, or with the owner's own wallet.
3. **A hosted sponsor never pays for opens** except under a per-identity rate limit.
   `devnet/src/policy.mjs` refuses them outright: paying for opens would give
   anyone free use of the liveness oracle. A guardian pays for the open instead.
4. **A hosted sponsor pays for owner-secret circuits only under a quota per identity
   root.** "Needs an owner secret" limits which circuits a sponsor pays for, not how
   often: enrolment is permissionless, so anyone can enrol an identity of their own, hold
   both its secrets, and ask without limit for `proveHeadOwnership` and
   `requireCurrentOwnerAttested`, which change nothing, `hostGatedAction`, which takes
   any fresh nonce, and `addGuardian` and `rotateGuardianSet`. `devnet/src/policy.mjs`
   checks the transaction's shape, circuit and fee, and nothing per identity: it serves
   only the recorded runs' own device. `finalizeRecovery` and `vetoRecovery` need no
   quota: each runs at most once per recovery, and each recovery needs an open that
   someone else paid for (a finalize also needs *t* approvals and 72 hours), so an attacker
   pays for every transaction of theirs the sponsor pays for. Read the identity from the call's public arguments, or let the host DApp pay for
   its own users.

### 4.3 C — t colluding guardians

The adversary the design is aimed at.

*Confidentiality: **Lost** · Integrity: **Lost** · Availability: **Degraded***

**Can.** Act as you at every host from the moment they pool their shares until
your recovery finalizes — they hold your identity secret (§4.5). And take the
identity. *t* shares reconstruct the secret, *t* tokens satisfy
`approveRecovery`, and the reconstructed secret opens `idCommit` — so
`finalizeRecovery` proves exactly what it is meant to prove and installs a
successor they control. No chain can prevent this: the decisive act, releasing a
share, happens off-chain between people. Any project claiming otherwise is
claiming to police conversations.

They can also **grind**: `openRecovery` is permissionless, so each fee buys
another recovery the owner must individually veto. §6.

**v2, not shipped:** never enrol one identity secret in both Lantern and
[Lantern v2](docs/v2.md#2-names-and-domain-separation). The derived salts
keep the two commitments unlinkable to observers, but the secret is the whole
opening in both, so *t* shares from **either** guardian set act as you in both
contracts: in v2 at the gate, until you lock, with no recovery, delay or veto.
Make the v2 identity fresh, with `newIdentity()` in `src/v2/identity.js`.

**Cannot.**
- Act **silently** — every approval is a permanent public nullifier. The open is the
  notice that counts: a recovery never expires, so once its lock is over its last
  approvals can land in the same block as its finalize, however old the open is (§6.14).
- Act **early** — no finalize lands earlier than 72 hours after the block that
  opened the recovery. A lying prover can shave at most the 10-minute slack off an
  honest prover's lock, never below 72 hours.
- **Evict the honest guardians, or kill your recovery by rotation.** Holding *t*
  shares gives them the identity secret, and a guardian-set rotation kills every
  recovery in flight — so rotation also requires the **veto secret**, which they never
  had. They can still race you with a recovery of their own: if it finalizes first it
  retires the commitment yours was opened for, so veto it within the 72 hours.
  `test/succession.test.js › colluders who pooled shares cannot stop the owner recovery finalizing`
  (once the owner vetoes theirs).
- **Veto.** `vetoSecret` is generated independently and never Shamir-shared, so
  guardians holding every share of the identity secret learn nothing about it. This
  was a real flaw in an earlier design, where veto and finalize proved the same
  predicate — a threshold attacker could have blocked every legitimate recovery
  forever. The fix is one of the three options Midnight's own
  `guides/security-best-practices` prescribes.
- **Keep a recovery alive through eviction.** `rotateGuardianSet` kills every in-flight recovery,
  *including one that already reached quorum* —
  `test/succession.test.js › a quorum reached before the rotation can no longer finalise`.
  Their shares do outlive it: until your next recovery finalizes, *t* shares from one
  deal still rebuild your live secret and act as you at every host (§6.17).
- **Hijack another device's approvals** — `finalizeRecovery` requires the
  ephemeral secret of the device the guardians approved.
- **Inflate a quorum** with extra leaves — the nullifier binds the secret, not the leaf.
- **Reach across identities** — `rid` binds `idCommit`. `test/lantern.test.js › cannot inflate another identity's approval count`.

**Summary.** The chain does not give *prevention*. It gives **detection, delay and
an independent kill switch**, unconditionally — which a purely social arrangement
does not. Choose *t* assuming *t* colluding guardians win, and that the chain will
tell you and give you three days.

### 4.4 D — a colluding attestation committee

A quorum of the committee in `contracts/src/host.compact`.

*Confidentiality: **Held** · Integrity: **Lost at the attested host only** · Availability: **Lost at the attested host***

**Read this first.** `host.compact` is an *independently deployed* contract that
cannot call Lantern — cross-contract calls error at the ZKIR stage on 0.31.x, and
one contract cannot read another's ledger. Its only option is a relayed,
committee-attested snapshot. And **a Merkle root proves membership, never
non-membership.** "Current owner" is a negative claim: a snapshot can only say who
the owners *were* when it was built. So `requireCurrentOwnerAttested` can accept a
**revoked** owner until a snapshot built after the recovery seals — never more than 24 hours after the latest seal — while
`hostGatedAction`, which reads `retiredIdentities` directly, cannot.
**The in-contract gate is strictly more sound.** Both ship, deliberately: the gap
between them *is* the architectural result. Use the attested host only if you
cannot compile against Lantern, and only for decisions that tolerate a day of
staleness, plus however long passes from building a snapshot to its seal, which anyone
can stretch if a voted snapshot is left unsealed (below).

**What the gate proves, since the review.** The caller holds the secret behind a
commitment that a quorum attested, in the latest sealed epoch and inside the
staleness window, as the current owner of the root: `requireCurrentOwnerAttested`
opens the identity commitment with the shared `identity.compact` module and writes
a nullifier bound to this host's tag, one per action for each identity secret
(`hostGatedAction` does the same without the tag; a recovery starts a fresh set, §8).
Measured: k=14, 9,242 rows.

**The tag is the only thing that separates one host from another.** The contract does
not bind its own address, and nothing checks that tags are unique. Two hosts deployed
with the same tag and a shared committee key accept each other's signatures: anyone
holding a quorum's votes for epoch N on one host can replay them on the other, use up
its members' votes for that epoch and seal the first host's root there, with a
staleness window that starts from the replayer's seal. The two hosts would also write
the same gate nullifier for the same secret and nonce, which links the owner's actions
across them; the comment in `host.compact` that says this never happens assumes
distinct tags. The recorded runs all use tag 4242, but each run has a fresh random
committee, so their votes cannot cross. Give every host its own random tag (§8).
The committee signs the **canonical live-set root** — exactly the enrolled,
non-retired owners, sorted, which `src/host/snapshot.js` rebuilds from Lantern's
public ledger — and the contract no longer keeps an on-chain ownership log, whose
append-only root kept every retired owner forever.

**The gap that remains, bounded.** After a recovery the retired owner's secret
still passes the gate against the older epoch until a newer epoch seals over the
new live set, and **never more than 24 hours after the older epoch sealed**. The
window runs from the seal, not from when the committee built the snapshot
(`openEpoch` then fixes its root on chain): if a recovery lands after the build and
before the seal, the retired secret can pass for up to 24 hours after that seal,
which is 24 hours plus the time from the recovery to the seal. A committee should
build, propose and seal in one sitting. Then it fails at both: *"not the latest
epoch"* and *"ownership leaf is not in the attested snapshot"*.
`test/host.test.js › accepts the retired secret against the older epoch until a newer one seals, then never again`,
and on real chains, local and on Preprod (`deployments/local-devnet.json`,
`deployments/preprod.json`), story steps 9.6–9.13: the
old secret passes against epoch 1 after the recovery, then fails once epoch 2 seals.
Epochs sealed before a committee rotation stay valid; after the committee rotation
(steps 10.6–10.9) the leaked key's vote is refused (step 10.14).

**Anyone can seal, and a proposal that reached quorum never expires.** `sealEpoch` and
`sealRotation` check no caller, no signature and no deadline: only that the proposal binds
the current generation and has reached quorum. Each slot votes once per generation and
epoch, so once a quorum has voted a root for epoch E, E can only ever seal with that root
at this generation, and epochs seal in order, so no later epoch can seal before it. If the
committee's seal does not land, anyone can seal that old snapshot whenever it suits them,
including the holder of a secret retired in between, and the 24-hour window then starts
at that late seal. So seal as soon as a proposal reaches quorum, and check that the seal
landed. If it did not, vote E+1 over a fresh snapshot (a vote does not wait for E to seal),
then seal E and E+1 back to back. A rotation that reached quorum can likewise be sealed by
anyone until the generation changes, so treat it as installed. To withdraw one, seal a
different rotation first, for a slot its voters have not voted on at this generation
(re-installing that slot's current key will do); anyone can still race it by sealing the
pending one.

**Can.** At quorum, sign a root naming an attacker as the current owner of any
identity root. Or stop signing, which bricks the gate once the window lapses. Stopping
takes fewer members than a quorum: at quorum 2, two of the three; at quorum 3, any one,
who can then never be rotated out (§8).

**Cannot.**
- **Forge a signature**, for keys whose secrets are actually secret — `attestVote` runs
  the Foundation's in-circuit Jubjub Schnorr verifier and binds each key to its slot.
  The constructor and `sealRotation` store any coordinates unchecked. The identity
  point (0, 1) is the public key of the scalar 0, so anyone can sign for a slot that
  holds it, and a key repeated across slots lets its one holder cast every one of those
  votes. Check the committee before trusting a host (§8).
- **Forge undetectably** — the canonical root is recomputable from Lantern's
  public ledger by anyone (`src/host/snapshot.js`), so signing any other root is
  publicly falsifiable.
- **Act without a quorum** of genuine, distinct keys — there is no admin *in the contract logic*. The
  committee is installed atomically by the constructor, and after deployment
  *only a quorum* can change a key (`openRotation` / `rotateVote` /
  `sealRotation`). The ledger-level maintenance authority is separate: see its
  row in §3, and freeze it.
- **Keep a leaked key useful** — a rotation replaces the key *and* bumps the
  generation, and every signed digest and proposal id binds the generation, so one
  rotation voids every signature the old key made and strands every vote in flight.
  The committee is deliberately **not** `sealed`: a sealed committee would make a
  leaked key permanent — this project refuting its own thesis in one keyword.
- **Stretch the window** past 24 hours from the seal — it starts at the *earliest*
  possible seal time, so a lying sealer can only shorten acceptance. A late seal of a
  voted snapshot moves the whole window later instead (above).
- **Touch Lantern.** Nothing in `host.compact` can write to Lantern's ledger.

### 4.5 E — anyone holding the identity secret, but not the veto card

A thief with the lost laptop, malware on the owner's device, or *t* guardians who
pooled their shares, scored here for what the identity secret alone buys them; what
their *t* real tokens add is adversary C (§4.3). This is the adversary a recovery system exists for: the
identity secret is exactly what a lost device leaks.

*Confidentiality: **Lost** for that identity · Integrity: **Held**, if the device erased every guardian kit after dealing · Availability: **Held***

**Can.** Act as the owner at every host until the owner's recovery finalizes:
`hostGatedAction` and `proveHeadOwnership` accept the secret, because until then it
*is* the current owner's secret. That window is the honest cost of any recovery
scheme, and it closes the moment `finalizeRecovery` retires the commitment. Open
recoveries (anyone can, §5). Lantern v2, built and tested but not deployed, adds an
emergency lock that lets the veto card close the window sooner at every DApp that
reads Lantern's ledger; an independently deployed DApp would also need a snapshot
that leaves locked identities out, which is not built ([`docs/v2.md` §4](docs/v2.md#4-emergency-lock)). The
shipped contract has no lock.

With guardian tokens the device kept after dealing (§2, §6.16), open, approve and
finalize a recovery of its own. `addGuardian` refuses this thief, but kept tokens need no
minting: that is adversary C with a full quorum, stopped only by the veto within 72
hours. Hence the Integrity score's condition, and §8's rule to erase every kit.

**Cannot.**
- **Mint guardians.** `addGuardian` requires the veto secret. Without that, the
  secret alone was enough to mint *t* tokens, self-approve a recovery for the
  thief's own device, and take the identity unless the owner vetoed within 72
  hours. `test/succession.test.js › a thief holding only the identity secret cannot mint a quorum and take the identity`.
- **Evict the guardians or kill the owner's recovery.** `rotateGuardianSet`
  requires the veto secret. Without that, one rotation killed the owner's recovery
  even after it reached quorum and evicted the guardians for good.
  `test/succession.test.js › the stolen-device lockout: the thief cannot kill a recovery that reached quorum`.
- **Veto.** `vetoRecovery` opens the veto commitment, not the identity commitment.
- **Redeem the owner's approvals.** They are bound to the new device's ephemeral key.

**Pooled shares, or tokens the device kept, still take the identity** — *t* guardians
colluding hold *t* real tokens, not minted ones, and so does a device that never erased
what it dealt. That is adversary C (§4.3), and the answer there is the 72-hour window
and the veto.

**A thief who has the veto card too** holds everything the owner holds, and no circuit
can tell them apart from the owner. Malware present while the owner dealt is this
adversary, since adding a guardian needs the card on the same device. They can veto
every recovery and evict the guardians with `rotateGuardianSet`, which also kills a
recovery that has already reached quorum. They can take the identity without any
guardian: `addGuardian` accepts the two secrets, so they mint *t* tokens of their own,
approve a recovery for their own device and finalize after 72 hours. Only a veto from
the owner's copy of the card stops that. Once the thief finalizes, the new identity
secret and the new veto card are theirs, and the owner's shares rebuild only a retired
secret. Rotating does not end it, because the thief can mint again under the new
context. So the card must be kept apart from the device (§6.6, §6.8), and tokens minted
this way outlive a recovery (§6.9).

---

## 5. Leakage

The measured version is `npm run attack`, which reads every field of the shipped
ledger and classifies it; a test fails CI if a field is ever added without
being classified. The full per-field reasoning lives in `src/attack/leaks.mjs`.
The three that matter most:

**The liveness oracle — the design's largest privacy cost.** `openRecovery` is
permissionless and `recoveries` is enumerable, so opening one is a public,
unauthenticated assertion that a named identity's owner lost their key. Whether a
veto arrives within 72 hours then answers a second question: *does the owner still
hold the veto secret, and are they watching?* A veto is a proof of life; silence is
evidence of its opposite. Repeat it and you have a presence monitor the target
cannot decline to answer. This is structural — the recovering device holds no
secret, so there is nothing to authenticate an open with. Staying silent to hide that
you are watching has a cost of its own: an open never expires (§6.14), so one you do not
veto stays ready for its approvals for good.

**The succession graph is public.** `idRoots` maps every commitment to its genesis
root in the clear, so recovering does *not* yield a fresh pseudonym. **This is a
trade-off, not an oversight:** that linkage is exactly what lets a downstream
contract survive a key loss. You cannot have "the DApp keeps working" and "the
rotation is unobservable" in this construction.

**A veto commitment depends only on the card.** Its salt is derived from the veto
secret (§2), so one card always publishes the same value in `vetoCommits`: the
commitment hides the card, but it is deterministic. Lantern's client makes a new card
for every identity and every successor. Never enrol a second identity with an existing
card, because equal values in `vetoCommits` link the two publicly. A successor is
already linked to its predecessor through `idRoots`, so keeping a card through a
recovery adds only the hint that the same person holds both vetoes.

**The anonymity set is smaller than "the tree".** `addGuardian` takes `idCommit` as
a public argument, so each leaf is attributable to its identity from transaction
history. An approval is therefore **1-of-n within a publicly known set of size n**,
narrowed further by the freshness of the disclosed historic root and by timing
after an `openRecovery`. We would rather write that than "anonymous".

**What is published, stated precisely.** The guardian *leaf* is public in every
design, this one included: it is `addGuardian`'s disclosed return value and it sits
in a public tree. What protects a guardian is not hiding the leaf but making its
**preimage** unguessable. `npm run attack` shows three designs that fail this and
one that does not — and the lesson is that *a commitment hides exactly the entropy
in its preimage that is not already on chain, and not one bit more.*

---

## 6. Known limitations

Properties of the code as it stands — each with its cause, its bound, and its
consequence.

1. **Guardian rotation is set-level only.** `rotateGuardianSet` evicts the whole
   set by rotating the context every leaf commits to. Removing *one* guardian
   without disclosing their leaf is not achievable on an append-only tree with
   0.31.1's primitives: a revocation list would publish the leaf, making that
   guardian's approvals linkable across every recovery. We chose the coarser
   operation and the stronger privacy. Removing one guardian's token costs *n*
   transactions: a rotation and *n*−1 re-adds. It does not remove their Shamir share,
   which a rotation leaves counting toward the live secret; removing that costs a whole
   recovery (§6.17).

2. **The threshold is fixed for the life of a lineage, and an unreachable one is a
   permanent lockout.** `enrollIdentity` can only require `t ≥ 2`: at enrolment
   `n` is zero, so it cannot check `t ≤ n`. **Enrolling with a threshold higher than
   the number of guardians you will ever add locks the identity permanently, and
   the contract will let you.** A client must enforce it.

3. **Off-chain share custody is unaddressed, and cannot be addressed on chain.**
   Two guardians emailing each other their shares is invisible to every circuit.

4. **`openRecovery` is an unrate-limited attrition surface.** No bond, no
   per-identity open counter, no escalating delay. One fee buys one more recovery
   the owner must veto within 72 hours; an owner offline for three days loses.
   Not shipped in this contract — this is the largest gap between this and a production system.
   Opens can also be used to hide one: anyone can open a recovery against any enrolled
   identity, and none expires (§6.14), so twenty decoys at zero approvals could push the
   one that can finalize off a list cut to the newest. `/live`'s watch therefore ranks by
   approvals and never leaves out an open recovery that has one, and says how many it did
   not draw; `npm run watch` lists every one. The answer to a flood is to rotate the
   guardian set, which cancels every open recovery at once, your own included, and needs
   the veto card; an attacker can then open again, one fee each.
   **v2, not shipped:** [`contracts/v2/lantern2.compact`](contracts/v2/lantern2.compact)
   closes it in a separate, undeployed contract ([`docs/v2.md` §3](docs/v2.md#3-rate-limited-opens)):
   only a current guardian can open, each at most once per head per quarter; one
   recovery may be in flight per identity; and after each veto the wait before the
   next open doubles, from 1 day to at most 32, except for the owner's next device,
   which a veto can reserve. It also adds an emergency lock, a delay chosen at
   enrolment (24 h to 90 days) and private guardian check-ins. Its design, its own
   limits and its measured cost are in [docs/v2.md](docs/v2.md); `npm run test:v2`
   runs its tests. The shipped contract on Preprod is frozen and unchanged. Apart
   from one note in §2 (the dealt guardian secrets), one in §4.3 (never reuse an
   identity secret across v1 and v2), one in §4.5 (the emergency lock), the ends of
   item 7 and of items 12 to 17 below, and two in §9 (the v1 tests' unnamed refusals,
   and the closing paragraph), nothing in this document's other sections describes v2.

5. **A reconstructed secret cannot be zeroised.** `reconstruct()` returns a
   JavaScript `BigInt`, which is immutable. The secret stays in the recovering
   device's heap until garbage collection and may reach swap or a heap snapshot.
   Mitigation: reconstruct in a short-lived worker, finalise, terminate it.

6. **The veto secret's independence is cryptographic, not physical.** No guardian
   quorum can ever learn it (§4.3). But by default it lives in the same encrypted
   store as the identity secret, so against *device* compromise the separation is
   nominal. Back it up on separate media to get physical independence.

7. **Veto versus finalize is decided by ordering.** `finalizeRecovery` checks
   `!killed.member(rid)`. A veto landing first wins. A finalize landing first cannot be
   undone, yet the contract still accepts a veto after it: `vetoRecovery` checks neither
   the finalize nor the retired identity, so it marks the finalized recovery `killed`
   too. So `killed` alone does not mean a recovery was stopped. Read `retiredIdentities`
   first, as `/live` and `npm run watch` do (`web/src/live/status.js`, `recoveryState`):
   on a retired identity, the one recovery that reached quorum is the one that finalized,
   whatever `killed` says. Whoever can influence ordering in the final block can favour
   either side — though the real boundary is the 72-hour window, not the block. The
   shipped contract cannot change. Lantern v2's `vetoRecovery` refuses a retired identity;
   a record of which recovery each finalize took is designed, not built
   ([docs/v2.md §14.3](docs/v2.md#143-designed-only-no-code-exists)).

8. **Rotating the guardian set, adding a guardian and vetoing all need the veto card.**
   This is what stops anyone holding a stolen identity secret from evicting your
   guardians, minting their own or vetoing your recovery (§4.5). The cost: an owner who
   has lost the veto card cannot veto a hostile recovery, add a guardian or evict the
   set until a recovery issues a new one. A recovery can: `finalizeRecovery` installs a fresh veto commitment.
   But only once *t* guardians have been added. Neither `enrollIdentity` nor
   `finalizeRecovery` checks that the veto commitment it stores can be opened, so if the
   card is lost, or does not open its commitment, before *t* guardians are added, that
   identity can never add a guardian and never be recovered. Its owner still holds the
   identity secret, so the way out is a fresh enrolment, which loses whatever was bound to
   the old root. If the same happens to a successor's card, the successor cannot rotate
   away the old leaves (§6.9), though they can still recover it. Lantern's client derives
   the commitment from the card it prints (`commitmentsOf` in `src/identity.js`), so this
   takes a lost card or a broken client; §8 says what to check.

9. **Guardian tokens outlive the recovery that follows them.** Leaves bind the
   identity *root's* guardian context, which a recovery deliberately keeps. So every
   guardian secret and leaf salt added so far still approves recoveries of the successor
   until a rotation: those in the guardians' kits, those in old kits thrown away, those a
   dealing device kept (§6.16), and those minted by anyone who held both your identity
   secret and your veto card. An old kit's share rebuilds only the retired secret, so the
   kit looks dead; its guardian secret and leaf salt are not. A re-deal that keeps each
   guardian's credentials (`dealKits`' `credentials` option) leaves the old kits live, and
   one with fresh credentials adds leaves beside the old ones. Rotate the guardian set
   after every recovery, then deal new kits (§8).

10. **The story runs, local and on Preprod, use a flavour with a 60-second timelock.**
    A 72-hour lock cannot be waited out in one run, so `npm run devnet`, with or without
    `LANTERN_NETWORK=preprod`, compiles
    `contracts/src/lantern.compact` with exactly one line changed
    (`devnet/flavour.mjs`; `test/devnet.test.js` fails if any other line differs), and
    `npm run devnet:verify` shows `finalizeRecovery` is the only circuit whose verifier key
    differs from the shipped build. The lock still runs from the later of the two
    open-time bounds, so in a story run a finalize waits about ten minutes, not one. The
    shipped 72-hour `finalizeRecovery` is proved by `npm run devnet:bench`, prove-only,
    with the shipped keys: 0.8–0.9 s warm (the first, cold proof took 2 s), and the same finalize 71 hours after an open is
    refused locally (`deployments/bench-shipped-finalize.json`). It is not submitted to
    a chain: a recovery cannot be 72 hours old in a laptop session. The shipped build
    itself is deployed on Preprod, where a recovery opened on 2026-09-24 cannot finalize
    before 2026-09-27 15:03 UTC (`deployments/preprod-shipped.json`).

11. **Three derivations rely on `transientHash`**: `lineageLeafOf`, `ephemeralPkOf`
   and `gateNullifierOf`. Its output is not guaranteed stable across toolchain
   upgrades. Every Merkle root in the contract already depends on it —
   `merkleTreePathRoot` uses it for all 20 levels — so this adds no exposure
   that was not already there, but in-flight recoveries would not survive such an
   upgrade.

12. **The trees are global and finite.** `guardians` and `lineage` are depth-20:
   1,048,576 leaves each, shared by every identity, and enrolment is
   permissionless. Exhausting one costs one transaction per leaf. The canonical
   host snapshot is depth-20 too, so it holds at most that many current owners.
   Once `lineage` is full, no enrolment and no `finalizeRecovery` can succeed, because
   each inserts a lineage leaf; once `guardians` is full, no one can add a guardian.
   About a million paid transactions would do either. The shipped contract is frozen,
   so this stays. v2 makes both trees 32 levels deep, at 372 rows per membership proof
   ([`docs/v2.md`](docs/v2.md#at-a-glance)).

13. **A pending enrolment or rotation can be blocked, though nothing is taken.** Every
   guardian context must be unused (`usedGuardianCtx`), and the caller chooses it: an
   enrolment's context is its own `idCommit`, a rotation's is its `newCtx` argument.
   Anyone who sees the transaction before it is included can enrol a throwaway
   identity and rotate it to that context first. The owner's transaction then fails
   with "context already used" and must be sent again with a new context or, for an
   enrolment, a new salt. The attacker can repeat this for as long as they pay a
   rotation's fee each time. v2 derives the context from the identity root, so no other
   root can produce it.

14. **A recovery never expires.** The 72 hours run from its open. `approveRecovery` has no
   time check and `finalizeRecovery` checks only a lower bound on block time, so once the
   lock is over, an open nobody vetoed can take its last approvals and finalize in one
   block, however old it is and however few approvals it has: the approvals give no extra
   notice. Veto every recovery you did not start, including one with no approvals; its
   count is not a warning. Veto your own abandoned recoveries too: one that reached quorum
   stays finalizable by whoever holds its device key and the identity secret, until a
   rotation or another finalize kills it. The shipped contract cannot change. **v2, not
   shipped:** Lantern v2 gives each recovery an approval deadline and an expiry
   ([docs/v2.md §3.3](docs/v2.md#33-the-timeline-of-one-recovery)).

15. **A finalize can take a pending commitment.** `finalizeRecovery`'s successor,
   `newIdCommit`, is an argument the circuit never opens (`contracts/src/lantern.compact`,
   at the `successor already enrolled` assert). So anyone holding a finalizable recovery of
   their own identity can finalize to a commitment someone else is about to use, and land
   first. That can be another device's pending `enrollIdentity`, which then fails with
   `identity already enrolled` (§6.13 reaches the same result more cheaply), or an honest
   recovery's pending successor, which then fails with `successor already enrolled`. This
   is denial of service only. Nothing is taken over, since the attacker's successor is a
   commitment it cannot open. Each attempt retires one attacker identity, with its own
   guardians and a recovery staged at least 72 hours earlier, though they can be staged in
   parallel. The victim retries with a fresh salt or a fresh successor, and the recovery
   itself stays finalizable. The shipped contract cannot change. **v2, not
   shipped:** Lantern v2's `finalizeRecovery` proves the successor's opening, so this is
   refused there ([docs/v2.md §3.10](docs/v2.md#310-hardening-after-the-adversarial-review)).

16. **The dealing device briefly holds a full quorum.** `addGuardian` computes each leaf
   inside the owner's circuit from the guardian's secret and leaf salt, so the device that
   deals, and any proof server it uses, holds every guardian's token beside both owner
   secrets. Kept after dealing, they are a full quorum for whoever later takes the device
   (§4.5; `test/succession.test.js › a thief holding the identity secret AND the veto card
   mints a quorum`), and with them anyone can tell which guardian approved each recovery (§2). No
   circuit can check that the device erased them; §8 says to. The shipped contract cannot
   change. **v2, not shipped:** Lantern v2 keeps the same dealing
   ([docs/v2.md §6.2](docs/v2.md#62-what-becomes-public-and-what-does-not)); a design that has
   the guardian make its own credential and hand the owner only a commitment to it is in
   [docs/v2.md §14.3](docs/v2.md#143-designed-only-no-code-exists), not built.

17. **Replacing the guardians does not replace the secret.** `rotateGuardianSet` changes
   the guardian context, not the identity secret, and no circuit but `finalizeRecovery`
   retires a commitment and installs a new one. So a rotation voids every old guardian's
   token and nobody's share: any *t* shares from one earlier deal still rebuild the live
   secret, and its salt with it (§2). That covers an evicted guardian's share, a phished
   one, and old kits that were kept or thrown away whole. With them anyone acts as you at
   every host (`hostGatedAction`, `proveHeadOwnership`) and can open recoveries, silently
   and with no time limit, until a recovery finalizes. They cannot approve with an old
   kit, add a guardian, rotate or veto, and shares from different deals do not combine:
   each deal draws fresh coefficients. To cut off a guardian you no longer trust, or one
   whose kit may have leaked: rotate at once, which voids their token and kills any
   recovery in flight; add the guardians you keep; recover to yourself onto a new secret
   with their approvals (open for your own device, *t* approvals, 72 hours, finalize);
   then, as after any recovery, deal kits of the new secret (§8). A guardian replaced only
   because they are unreachable needs no recovery, as long as their kit cannot reach
   anyone else. After any rotation without a recovery, every old kit must still be
   destroyed. The shipped contract cannot change. **v2, not shipped:** a rotation in
   Lantern v2 does not revoke a share either. Its emergency lock stops the secret at every
   DApp that reads Lantern's ledger while the owner recovers, and old shares cannot lift it
   ([docs/v2.md §4](docs/v2.md#4-emergency-lock), [§11](docs/v2.md#11-limits-and-follow-ups));
   a rekey that retires the secret without a recovery is designed only
   ([docs/v2.md §14.3](docs/v2.md#143-designed-only-no-code-exists)).

---

## 7. Found and fixed in review

We threat-modelled our own code and found real defects. Each was reproduced
before it was fixed. Twenty of the 21 have a regression test named after them; the
twenty-first was fixed by removing the feature.

| Defect | Consequence | Regression |
|---|---|---|
| Approval counter reset to zero on every call | the threshold could **never** be met | `lantern.test.js › counts approvals` |
| `recoveryId` keyed on the ephemeral key alone | a stranger could inflate **any** victim's approval count | `cannot inflate another identity's approval count` |
| `enrollIdentity` / `addGuardian` unauthenticated | anyone could inject guardians, or front-run enrolment and capture the veto | `rejects an enroller who does not hold the identity secret` |
| Veto and finalize proved the same predicate | a threshold attacker could veto every legitimate recovery forever | `cannot be performed with the identity secret` |
| Guardian leaves bound the rotating commitment | Lantern worked **exactly once** per identity | `lets the ORIGINAL guardians recover the SUCCESSOR identity` |
| A retired owner could still add guardians | once leaves bound a permanent root, a thief with the old secret could mint guardians **for the victim's new identity** | `a RETIRED owner cannot mint guardian leaves for the successor` |
| Rotation did not kill a recovery that had reached quorum | evicted guardians could still finalize a recovery that had reached quorum | `a quorum reached before the rotation can no longer finalise` |
| The ephemeral key was stored but never checked | anyone else with the secret could finalise with approvals given to a different device | `rejects a finaliser who is not the device the guardians approved` |
| `rotateCommittee` had no authorisation | anyone could stop every epoch from ever sealing | `regression: committee rotation needs a quorum` |
| …and it replaced no key | a leaked key could re-sign under the new generation, so it revoked nothing | `a quorum REPLACES the leaked key, which can then no longer vote` |
| Committee slots were front-runnable | an attacker could claim a slot at deployment | *removed: committee installed atomically by the constructor* |
| One root per epoch, first come first served | a squatted junk root forced a gap, letting an **older** epoch pass as latest | `regression: a junk-root proposal cannot block an epoch` |
| Staleness window started at claimed time + slack | a hostile sealer could stretch 24h to 24h 10m | `a sealer cannot stretch the staleness window with its claimed time` |
| Rotation was gated on the identity secret alone | whoever held it — a thief with the lost laptop, or guardians who pooled shares — could kill the owner's recovery after it reached quorum and evict the guardians: **permanent lockout**. Our own earlier fix (rotation kills in-flight recoveries) made it possible | `the stolen-device lockout: the thief cannot kill a recovery that reached quorum` |
| The idSalt could not be rebuilt from shares | shares alone could never finalize a recovery; a test hid it by handing the device the salt | `any 2 of 3 shares rebuild the secret AND the salt` |
| Privacy tests searched for Field secrets big-endian | the runtime stores them little-endian, so the tests **could never fail** | `test/leakscan.test.js` — every scan must find the secret privately first |
| The attack demo's shipped target derived guardian secrets from their names | target 3 held by luck: the attack happened not to try that formula | `two independent builds share no guardian leaf, secret or salt` |
| `addGuardian` was gated on the identity secret alone | a thief with the lost laptop could mint *t* guardian tokens, self-approve a recovery for their own device and take the identity, stopped only by a veto in time | `a thief holding only the identity secret cannot mint a quorum and take the identity` |
| The attested host gate read no identity witness | anyone passed it for any pair in the signed snapshot: a membership predicate, not an authorisation | `refuses a caller who does not hold the current identity secret` |
| The committee signed the root of an append-only on-chain log | a retired owner stayed in the signed tree forever | the log is gone; the committee signs `src/host/snapshot.js`'s canonical live set. `refuses the retired owner, even with their secret and a genuine path from a tree that still holds them` |
| The leak scanner missed byte secrets ending in zero bytes | the runtime stores them trimmed, so about one run in eight had a secret the scanner could see on neither side | `finds a byte secret that ends in zero bytes, which the runtime stores trimmed` |


---

## 8. Operational guidance

**Owners.** Keep `vetoSecret` on media that will survive losing your device (§6.6),
and apart from it: the veto card is what stops a thief with your device from
adding guardians, evicting yours or vetoing your recovery.
Choose *t* assuming *t* colluding guardians win, and never above the number of
guardians you will actually add (§6.2). Watch `recoveries`: one you did not start is
an attack in progress, and you have 72 hours from its open. **Veto it**, however old it
is and however few approvals it has, because a recovery never expires (§6.14); veto your
own abandoned ones too. If you suspect a
guardian, **rotate the guardian set** — that now kills any recovery already in
flight, reached quorum or not. Both need the veto card, so keep it somewhere a
thief who takes your device will not also find it. A rotation voids their token, not
their share: until a recovery retires the secret, their share and *t*−1 others from the
same deal (an old kit nobody destroyed, a phished one) still rebuild it and act as you at
every host. So if you no longer trust them, or their kit may have leaked, then recover to
yourself onto a new secret with the guardians you keep, and deal fresh kits of it (§6.17).
Replacing the guardians without a recovery leaves every share ever dealt able to rebuild
the secret. Re-dealing the same secret neutralises leaked shares only while fewer than
*t* of them leaked, because shares from different deals do not combine, and only once
every old kit is destroyed; with *t* or more leaked, or if you cannot tell how many,
recover to a new secret first. After a recovery, rotate the guardian set, then deal new
kits (below).

Add every guardian straight after enrolling, while the veto secret is still on the
device, and move the card off the device only after the last `addGuardian` succeeds:
neither `enrollIdentity` nor `finalizeRecovery` checks that the veto commitment it stores
can be opened, so a card lost or misprinted before *t* guardians are added leaves an
identity that can never be recovered (§6.8). Before enrolling, and before finalizing a
recovery, check that the card opens the commitment you are about to store (`vetoCommitOf`,
the contract's own pure circuit).

Deal on a device you trust: while it deals, it holds every guardian's token (§6.16).
Print kits without saving them (no print-to-PDF, no downloads), and once each guardian is
added, erase that guardian's secret, leaf salt and share from the device. A device that
keeps them is a full quorum for whoever takes it. Use one veto card per identity: never
enrol a second identity with a card you already use, because equal veto commitments link
the two (§5).

**Guardians.** Before approving, confirm out of band that the ephemeral public key
belongs to the person asking: your approval can only ever be redeemed by the holder
of that key's secret. Compare it as its six fingerprint words (`fingerprintWords` in
`src/words.js`: 66 bits, from the BIP-39 English word list through `@scure/bip39`, MIT),
not as the eight-character fingerprint the demo prints beside it: that is 32 bits, and
someone opening a competing recovery could grind a key to match it in about 4×10⁹ tries.
Hear the words in person, or on a call you placed to a number you already know, in a
voice you know; never read your kit's words to anyone who calls you. Your approval writes a permanent public nullifier, adds one to
the recovery's public count and discloses which historic guardian root you proved
against. None of it names you, but the root's age and the timing after the
`openRecovery` narrow who you could be (§5).

**After a recovery.** Whatever the cause, first rotate the guardian set with the new
veto card, then deal new kits. The old kits' shares rebuild only the retired secret, but
their guardian secrets and leaf salts still approve recoveries of the successor until the
rotation, and so does any copy the lost device kept (§6.9, §6.16). Deal the new kits with
fresh guardian secrets and leaf salts, under the root's current guardian context
(`guardianCtx[idRoots[newIdCommit]]`, which after the rotation is its new context), not
under the new identity commitment: `dealKits` takes that context as `ctx`, and a kit dealt
under any other has no leaf in the tree. `dealKits` refuses kept credentials that repeat a
guardian secret, since the contract counts one approval per guardian secret (§4.3), and a
veto salt not derived from the veto secret, since that card could never veto.

Deal each identity once per guardian context. Two deals of one identity under one
context, *n* and *t* (a lost kit reprinted, say), make shares that do not combine: collect
or destroy every old kit, or rotate. A recovering device rebuilds with `rebuildFromKits`
(`src/kit.js`), which checks the secret against the identity commitment before
`openRecovery` and names a kit from another deal.

**Host integrators.** Prefer the in-contract gate: import `ownergate.compact` and
`identity.compact` and call `ownershipHolds` with facts read from Lantern's own
ledger, as `hostGatedAction` does. Use `host.compact` only if you cannot compile against
Lantern, only for decisions that tolerate 24 hours of staleness plus the time from the
build to the seal, which anyone can stretch if a voted snapshot is left unsealed, and only
after reading §4.4. The contract checks none of the following, so check it yourself:
- **The committee.** Before trusting a host, and after every `sealRotation`, read
  `committee` from its ledger. Know who holds each of the three keys, and check that none
  is the identity point (0, 1), whose secret is 0, and that no two are equal. Deploy with
  quorum 2. At quorum 3 every seal and every rotation needs all three slots, so one slot
  that cannot or will not vote halts the host for good: a lost key, a member who stops
  signing, or coordinates off the prime-order subgroup. No epoch can seal, the gate
  refuses everyone 24 hours after the last seal, and the slot can never be rotated out,
  because its own vote is one of the three a rotation needs. At quorum 2 the same happens
  once two slots are lost. Seal each proposal as soon as it reaches quorum, and check that
  the seal landed: anyone can seal it later (§4.4).
- **The tag.** Deploy every host with its own random tag (a fresh 31-byte value, not a
  counter or 4242), and never give one committee key to two hosts, or a quorum's votes
  on one can be replayed on the other (§4.4).
- **Once per identity.** The reference gates, `hostGatedAction` and
  `requireCurrentOwnerAttested`, allow an action once per identity *secret*, not once per
  identity root. A recovery gives the root a new secret, so the same root can act on the
  same nonce again (`test/succession.test.js › is one-shot per identity secret, not per
  root`), and since the owner chooses the guardian leaves and can recover to
  themselves, that is about once per 72 hours. A DApp that needs once per identity (one
  vote per member) must write its own nullifier over the root and the action. That hides
  nothing the reference gates do not already reveal: both take the current commitment as
  a public argument, and the public `idRoots` map links it to the root. The trade-off: with a
  root-bound nullifier, someone holding a stolen secret can use up the owner's action
  before the owner's recovery finalizes.

---

## 9. Where our rigour stops

- `requireCurrentOwnerAttested` casts `(epoch + 1) as Uint<32>`. At epoch 2^32-1 that
  cast aborts, so the gate refuses that epoch and the host is spent (`test/host.test.js`
  writes that epoch into the ledger and shows the abort). `sealEpoch` refuses any epoch
  but the next, so reaching it takes 2^32 seals in order: about 490,000 years at one seal
  an hour.
- Guardian contexts should be sampled randomly. A *predictable* context can be
  burned by an adversary through one `rotateGuardianSet` on an identity they
  control, because contexts are globally unique; a random one can be burned too, by
  anyone who sees the pending transaction (§6.13).
- The committee size is fixed at three by the constructor's signature, and the
  constructor and `sealRotation` check neither the committee keys (the identity point,
  duplicates, points off the curve) nor that the host's tag is unique. §4.4 and §8 say
  what an integrator must check instead.
- The frozen header comments of `lantern.compact` and `identity.compact` say a distinct
  `Bytes<N>` length per domain is a second separation, so preimages of different shape
  can never collide. It is not: several domains share a length, and the persistent hashes
  ignore the type's shape (§3). The domain strings separate every pair of hashes and every
  pair of commitments; a commitment and a hash are separated by their total lengths, which
  differ today, and nothing but §3's rule keeps them apart in a future derivation. The
  files cannot change, so the comments stay until the next contract.
- The full story has run on a single-node local chain (`deployments/local-devnet.json`)
  and on Preprod, a public network with real latency (`deployments/preprod.json`), both
  as the 60-second flavour (§6.10). The shipped contract, unchanged, has run the core
  recovery on Preprod up to its 72-hour lock (`deployments/preprod-shipped.json`); its
  72-hour `finalizeRecovery` has been proved, but has not run on any chain.
  Reorganisations are not tested.
- The browser build is reproducible on one machine and in CI (two builds hash the
  same); across machines and operating systems it is not proven.
- Every role in the recorded runs, local and on Preprod, shares one local proof server,
  whose image `devnet/compose.yml` pins by digest, and which sees each prover's witnesses. That is a demo convenience, not the deployment model (§4.2b).
- Three of `contracts/src/lantern.compact`'s refusals have no v1 test that expects them
  by name: `guardian not in tree` (the tree-root check in `approveRecovery`); `not a
  known lineage root` and the gate's `descends` (no v1 test uses a forged lineage path);
  and `successor already enrolled`, which `test/lantern.test.js` accepts as an
  alternative to `already retired`, the refusal that test actually reaches. The checks
  are in the shipped contract, but v1's suite would still pass with any of them removed;
  tests that name them are future work. **v2, not shipped:** each equivalent check in
  `contracts/v2/lantern2.compact` has a test that fails when the check is disabled (the
  second review of v2, [docs/v2.md §14.2](docs/v2.md#142-built-tested-not-deployed)).
- The site's checks of Preprod, in the browser on `/live` and in the terminal, read the
  chain through Preprod's public indexer and trust its answers. We have not run either
  against a node and indexer of our own. The site's `connect-src` allows that indexer on
  every route, and `/kit` and `/rehearse` generate secrets in the page (§4.2).

**If this continued past the hackathon, we would fix, in order:** rate-limit
`openRecovery` (§6.4); reconstruct in a disposable worker (§6.5); make the committee
size a constructor parameter, and let the members who can still vote replace a slot
that cannot (§8).

The fixes that need a new contract are built and tested, not deployed, in Lantern v2
([`docs/v2.md`](docs/v2.md)): rate-limited opens (§6.4), an emergency lock that lets the
veto card stop a stolen identity secret acting as the owner at every DApp that reads
Lantern's ledger (§4.5), a recovery delay chosen at enrolment, and private guardian
check-ins; it also answers §6.12, §6.13, §6.14 and §6.15. The shipped contract on Preprod is
frozen and unchanged, and nothing in this document claims v2's properties for it.

---

## 10. Reporting a vulnerability

Report a vulnerability privately through GitHub's
[private vulnerability reporting](https://github.com/OoJae/lantern/security/advisories/new).
For anything that is not a vulnerability, open an issue.
