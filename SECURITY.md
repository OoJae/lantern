# Security Model

**Scope.** The contracts in `contracts/src/`, and the client code in `src/`: the
field and Shamir layer, identity derivation (`src/identity.js`), the leak scanner
(`src/leakscan.js`), the canonical host snapshot (`src/host/snapshot.js`) and the
attack engine. Also the browser demo (`web/`, an instance of adversary B1), the
local-chain runner (`devnet/`) and the fee-sponsor role (B2). Every claim below names the file, circuit or test that establishes
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

Lantern makes a lost Midnight private-state secret recoverable by a hidden k-of-n
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
| Holding only your identity secret — a stolen laptop or malware — cannot mint guardians, evict yours, veto, or stop your recovery. Guardians who pooled their shares cannot mint, evict or veto either, but they can open and approve a recovery of their own, which your veto card stops | **Held** | `addGuardian` and `rotateGuardianSet` also require the veto secret; `vetoRecovery` requires only it. §4.3, §4.5 |
| Guardian *identities* stay private | **Held** — and demonstrated | salted `persistentCommit` leaves; `npm run attack` |
| Guardians survive a recovery, so an identity can be recovered again | **Held** | stable `idRoot`; leaves bind a guardian context, not the rotating commitment |
| A downstream contract keeps working across a key loss | **Held, in-contract** | `hostGatedAction` reads `retiredIdentities` directly |
| An *independently deployed* contract keeps working | **Held, but strictly less sound** | `requireCurrentOwnerAttested` proves the caller holds the current identity secret, against a committee-signed canonical snapshot — but it accepts a retired owner's secret until a snapshot built after the recovery seals, for at most 24 h after the latest seal. §4.4 |
| The rules of a deployed instance cannot change | **Held on the recorded local deployment** — not a property of the source | the run that deployed it replaced its maintenance authority with an empty committee. While that chain runs, `npm run devnet:verify` re-checks this and that every on-chain verifier key matches a fresh compile; offline, `test/record.test.js` checks the committed records (`deployments/`). Any other deployer can keep the key: check before you trust an instance |
| Nothing trusts the fee payer | **Held** | no circuit uses the caller's coin key or any token operation; every check is a commitment opening or a signature. `test/authentication.test.js` |
| Guardian *count* and *threshold* stay private | **Not held** | `thresholds` is public; `n` is recoverable from transaction history |
| t colluding guardians cannot take the identity | **Not held.** Nothing here claims otherwise. Until your recovery finalizes they can also act as you | §4.3 |

**The one-line version:** Lantern turns *"your private state is gone forever"*
into *"your private state can be restored, correctly, by people you chose — and if
they turn on you, you get 72 hours of public notice and a veto they cannot hold."*
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
For the owner's own identity that is harmless. As evidence to a third party that
*t* independent people agreed, it is worth nothing, and no on-chain construction
in this design can change that.

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
| **Length-typed domain separation** | every `*Preimage` struct | each domain uses a distinct `Bytes<N>`, and N is part of the type alignment, so two preimages of different shape cannot collide. Struct *field names* contribute nothing — only shape does | a wrong N is a compile error, which is the good failure mode |
| **`export pure circuit`** | 9 derivations incl. `idCommitOf`, `guardianLeafOf`, `recoveryIdOf`, `ephemeralPkOf` | the client calls *the same compiled code* as the circuit. Client/circuit drift is not mitigated, it is impossible | CI must prove they never acquire a proving key — `.github/workflows/compile.yml` does |
| **`HistoricMerkleTree` past-root acceptance** | `guardians.checkRoot` in `approveRecovery` | concurrent approvals stay valid against different historic roots | the chosen root is disclosed — a freshness fingerprint, §5 |
| **Leaf-binding assert *before* `checkRoot`** | `approveRecovery`, `proveSuccession`, `hostGatedAction` | without it, *any* valid path passes for *any* leaf: an easy assert to leave out | one commitment per circuit |
| **Nullifiers** | approvals, vetoes, gate actions, committee votes | one-shot semantics; approval nullifiers bind the *secret*, so extra leaves cannot inflate a quorum | each is a permanent public write |
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

**Cannot.** Learn *which* guardian approved: `approveRecovery` discloses a
historic root and a nullifier, and the transcript tests assert the guardian's
secret, salt and path siblings are absent. Link one guardian's approvals across
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

It also sits on an open upstream hazard: `midnight-js` issues **#1234** and
**#1169** document silent private-state corruption, and the veto secret lives in
that state, unshared and unrecoverable.

**Cannot.** Reopen a successor commitment already on chain, forge approvals
without guardian secrets, shorten the timelock, or make the chain lie about the
current head.

**The only real mitigations are off-chain:** reproducible front-end builds, a
published bundle hash (`web/scripts/check-bundle.mjs` prints one), and the ability
to run the client locally.

### 4.2b B2 — the fee sponsor

A funded wallet that pays DUST for someone else's transaction. The recovering phone
needs one: by definition it has lost everything, including any wallet. Built and
run: every `npm run devnet` run sponsors the phone (`devnet/src/{sponsor,device,policy}.mjs`),
and its record carries the evidence per transaction.

*Confidentiality: **Held** on chain; metadata **Lost** · Integrity: **Held** · Availability: **Degraded***

**Can.** Refuse to pay. Learn metadata: which device asked, when, and for which
circuit — a sponsor asked to pay for a `finalizeRecovery` knows a recovery is
finishing, which sharpens the liveness oracle (§5).

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
   local-chain runs one proof server serves every role; they are separated only by
   which wallet pays.)*
2. **No veto path depends only on a guardian acting as sponsor.** The veto card
   works with any sponsor, or with the owner's own wallet.
3. **A hosted sponsor never pays for opens** except under a per-identity rate limit.
   `devnet/src/policy.mjs` refuses them outright: paying for opens would give
   anyone free use of the liveness oracle. A guardian pays for the open instead.

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

**Cannot.**
- Act **silently** — every approval is a permanent public nullifier.
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
- **Survive eviction.** `rotateGuardianSet` kills every in-flight recovery,
  *including one that already reached quorum* —
  `test/succession.test.js › a quorum reached before the rotation can no longer finalise`.
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
staleness, plus however long the committee takes from building a snapshot to sealing it.

**What the gate proves, since the review.** The caller holds the secret behind a
commitment that a quorum attested, in the latest sealed epoch and inside the
staleness window, as the current owner of the root: `requireCurrentOwnerAttested`
opens the identity commitment with the shared `identity.compact` module and writes
a nullifier bound to this host's tag, one per action. Measured: k=14, 9,242 rows.
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
and on a real local chain in `deployments/local-devnet.json`, story steps 9.6–9.13: the
old secret passes against epoch 1 after the recovery, then fails once epoch 2 seals.
Epochs sealed before a committee rotation stay valid; after the committee rotation
(steps 10.6–10.9) the leaked key's vote is refused (step 10.14).

**Can.** At quorum, sign a root naming an attacker as the current owner of any
identity root. Or stop signing, which bricks the gate once the window lapses.

**Cannot.**
- **Forge a signature** — `attestVote` runs the Foundation's in-circuit Jubjub
  Schnorr verifier and binds each key to its slot.
- **Forge undetectably** — the canonical root is recomputable from Lantern's
  public ledger by anyone (`src/host/snapshot.js`), so signing any other root is
  publicly falsifiable.
- **Act without a quorum** — there is no admin *in the contract logic*. The
  committee is installed atomically by the constructor, and after deployment
  *only a quorum* can change a key (`openRotation` / `rotateVote` /
  `sealRotation`). The ledger-level maintenance authority is separate: see its
  row in §3, and freeze it.
- **Keep a leaked key useful** — a rotation replaces the key *and* bumps the
  generation, and every signed digest and proposal id binds the generation, so one
  rotation voids every signature the old key made and strands every vote in flight.
  The committee is deliberately **not** `sealed`: a sealed committee would make a
  leaked key permanent — this project refuting its own thesis in one keyword.
- **Stretch the window** — it starts at the *earliest* possible seal time, so a
  lying sealer can only shorten acceptance.
- **Touch Lantern.** Nothing in `host.compact` can write to Lantern's ledger.

### 4.5 E — anyone holding the identity secret, but not the veto card

A thief with the lost laptop, malware on the owner's device, or *t* guardians who
pooled their shares, scored here for what the identity secret alone buys them; what
their *t* real tokens add is adversary C (§4.3). This is the adversary a recovery system exists for: the
identity secret is exactly what a lost device leaks.

*Confidentiality: **Lost** for that identity · Integrity: **Held** · Availability: **Held***

**Can.** Act as the owner at every host until the owner's recovery finalizes:
`hostGatedAction` and `proveHeadOwnership` accept the secret, because until then it
*is* the current owner's secret. That window is the honest cost of any recovery
scheme, and it closes the moment `finalizeRecovery` retires the commitment. Open
recoveries (anyone can, §5).

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

**Pooled shares are the one case that still takes the identity** — *t* guardians
colluding hold *t* real tokens, not minted ones. That is adversary C (§4.3), and
the answer there is the 72-hour window and the veto.

**A thief who has the veto card too** holds everything the owner holds. They can
block every recovery, but cannot take the identity without *t* guardians.

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
secret, so there is nothing to authenticate an open with.

**The succession graph is public.** `idRoots` maps every commitment to its genesis
root in the clear, so recovering does *not* yield a fresh pseudonym. **This is a
trade-off, not an oversight:** that linkage is exactly what lets a downstream
contract survive a key loss. You cannot have "the DApp keeps working" and "the
rotation is unobservable" in this construction.

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
   operation and the stronger privacy. Removing one guardian costs *n* transactions.

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
   Designed, not shipped — this is the largest gap between this and a production system.

5. **A reconstructed secret cannot be zeroised.** `reconstruct()` returns a
   JavaScript `BigInt`, which is immutable. The secret stays in the recovering
   device's heap until garbage collection and may reach swap or a heap snapshot.
   Mitigation: reconstruct in a short-lived worker, finalise, terminate it.

6. **The veto secret's independence is cryptographic, not physical.** No guardian
   quorum can ever learn it (§4.3). But by default it lives in the same encrypted
   store as the identity secret, so against *device* compromise the separation is
   nominal. Back it up on separate media to get physical independence.

7. **Veto versus finalize is decided by ordering.** `finalizeRecovery` checks
   `!killed.member(rid)`. A veto landing first wins; a finalize landing first makes
   the veto moot. Whoever can influence ordering in the final block can favour
   either side — though the real boundary is the 72-hour window, not the block.

8. **Rotating the guardian set, adding a guardian and vetoing all need the veto card.**
   This is what stops anyone holding a stolen identity secret from evicting your
   guardians, minting their own or vetoing your recovery (§4.5). The cost: an owner who
   has lost the veto card cannot veto a hostile recovery, add a guardian or evict the
   set until a recovery issues a new one. A recovery can: `finalizeRecovery` installs a fresh veto commitment.

9. **Guardian tokens outlive the recovery that follows them.** Leaves bind the
   identity *root's* guardian context, which a recovery deliberately keeps. So
   tokens minted by anyone who held both your identity secret and your veto card
   still count for the successor. Rotate the guardian set after any recovery that
   followed a compromise.

10. **The local-chain runs use a flavour with a 60-second timelock.** A 72-hour lock
    cannot be waited out on a laptop, so `npm run devnet` compiles
    `contracts/src/lantern.compact` with exactly one line changed
    (`devnet/flavour.mjs`; `test/devnet.test.js` fails if any other line differs), and
    `npm run devnet:verify` shows `finalizeRecovery` is the only circuit whose verifier key
    differs from the shipped build. The lock still runs from the later of the two
    open-time bounds, so on the devnet a finalize waits about ten minutes, not one. The
    shipped 72-hour `finalizeRecovery` is proved by `npm run devnet:bench`, prove-only,
    with the shipped keys: 0.8–0.9 s warm (the first, cold proof took 2 s), and the same finalize 71 hours after an open is
    refused locally (`deployments/bench-shipped-finalize.json`). It is not submitted to
    a chain: a recovery cannot be 72 hours old in a laptop session.

11. **Three derivations rely on `transientHash`**: `lineageLeafOf`, `ephemeralPkOf`
   and `gateNullifierOf`. Its output is not guaranteed stable across toolchain
   upgrades. Every Merkle root in the contract already depends on it —
   `merkleTreePathRoot` uses it for all 20 levels — so this adds no exposure
   that was not already there, but in-flight recoveries would not survive such an
   upgrade.

12. **The trees are global and finite.** `guardians` and `lineage` are depth-20:
   1,048,576 leaves each, shared by every identity, and enrolment is
   permissionless. Exhausting one costs one transaction per leaf. The canonical
   host snapshot is depth-20 too, so it holds at most that many live owners.

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
| Rotation did not kill a recovery that had reached quorum | evicting compromised guardians did not stop them | `a quorum reached before the rotation can no longer finalise` |
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
an attack in progress, and you have 72 hours. **Veto it**, and if you suspect a
guardian, **rotate the guardian set** — that now kills any recovery already in
flight, reached quorum or not. Both need the veto card, so keep it somewhere a
thief who takes your device will not also find it. After a recovery, deal fresh
shares for the new identity secret and rotate the guardian set.

**Guardians.** Before approving, confirm out of band that the ephemeral public key
belongs to the person asking: your approval can only ever be redeemed by the holder
of that key's secret. Your approval writes a permanent public nullifier, adds one to
the recovery's public count and discloses which historic guardian root you proved
against. None of it names you, but the root's age and the timing after the
`openRecovery` narrow who you could be (§5).

**After a recovery.** Deal fresh shares of the new identity secret — the old ones
rebuild a retired secret — and, if the loss was a compromise rather than an
accident, rotate the guardian set with the new veto card (§6.9).

**Host integrators.** Prefer the in-contract gate: import `ownergate.compact` and
`identity.compact` and call `ownershipHolds` with facts read from Lantern's own
ledger, as `hostGatedAction` does. Use `host.compact` only if you cannot compile against
Lantern, only for decisions that tolerate 24 hours of staleness plus the committee's
build-to-seal time, and only after reading §4.4.

---

## 9. Where our rigour stops

- `requireCurrentOwnerAttested` casts `(epoch + 1) as Uint<32>`. At the maximum
  epoch that cast may abort. We have not tested it and do not claim it.
- Guardian contexts should be sampled randomly. A *predictable* context can be
  burned by an adversary through one `rotateGuardianSet` on an identity they
  control, because contexts are globally unique.
- The committee size is fixed at three by the constructor's signature.
- The chain records come from a single-node local chain. Behaviour under real network
  latency, multiple nodes or reorganisations is not tested.
- The browser build is reproducible on one machine and in CI (two builds hash the
  same); across machines and operating systems it is not proven.
- Every role in the local-chain runs shares one proof server, which sees each
  prover's witnesses. That is a demo convenience, not the deployment model (§4.2b).

**If this continued past the hackathon, we would fix, in order:** rate-limit
`openRecovery` (§6.4); reconstruct in a disposable worker (§6.5); make the committee
size a constructor parameter.

**Reporting.** Open an issue, or contact the maintainer listed in the README.
