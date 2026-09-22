# Deliberately insecure contracts — do not deploy, do not copy

The two contracts in this directory are **broken on purpose**. They exist so
`npm run attack` has something real to break, and so the property that
`contracts/src/lantern.compact` provides can be *demonstrated* rather than
asserted.

**They are compiled. They are never deployed.** We are not putting an
intentionally enumerable guardian registry on a network where someone might
enrol real people in it.

| file | target | what goes wrong |
|---|---|---|
| `vulnerable-public-guardians.compact` | 1 | Guardian identifiers are written to public state verbatim — what every deployed EVM social-recovery wallet does. The attacker reads them straight out of the ledger with zero hash evaluations. |
| `vulnerable-lantern-v0.compact` | 2a | The leaf is `H(domain, guardianId, owner)`. The identifier is a witness and never appears on chain — but the attacker hashes every name in an address book and asks `findPathForLeaf` which ones are in the tree. |
| `vulnerable-lantern-v0.compact` | 2b | The leaf is a proper `persistentCommit` with a 32-byte salt — derived from public data, so a stateless client can recompute it. That salt costs the attacker a factor of eight and nothing more. |

## The one thing to take away

The Merkle logic in `vulnerable-lantern-v0.compact` is **correct**, including the
leaf-binding assert. The flaw is entirely in the **preimage**:

> A commitment hides exactly the entropy in its preimage that is not already on
> chain — and not one bit more.

The shipped contract puts 32 bytes of per-guardian entropy in the preimage that
is not a function of who the guardian is. So there is nothing an address book
can confirm, and even when the attacker is handed the real names, it finds none.

## Guardrails

- Both export `THIS_CONTRACT_IS_DELIBERATELY_INSECURE()`, which appears in the
  generated TypeScript types, so the warning reaches anyone reading only the
  `.d.ts`.
- `test/adversarial.test.js` asserts the attack **succeeds** against both. If
  someone "fixes" them, CI fails and points here.
- `npm run compile:shipped` builds the product without them.
