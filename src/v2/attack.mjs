// The guardian-naming attack, against Lantern v2 (docs/v2-spec.md §10). The same
// attacker as src/attack/attack.mjs: an address book of people close to the
// victim, every careless derivation of a guardian secret from a name, and the
// real names as KNOWN PLAINTEXT. v2 publishes two new sets a guardian's secret
// feeds -- openNullifiers and checkInNullifiers -- so the attack probes those
// too. It consumes only a frozen observer view: the public ledger and v2's
// public derivation code.
import { runAttack } from '../attack/attack.mjs';
import { ADDRESS_BOOK, guardianIdOf, sha } from '../attack/candidates.mjs';

/**
 * @param view  a frozen observer view of a v2 target; publicParams holds
 *              { idCommit, idRoot, rids, periods }
 * @param opts  { knownNames, oracleSecrets } exactly as runAttack takes them
 */
export function runAttackV2(view, { knownNames = [], oracleSecrets = null, book = ADDRESS_BOOK } = {}) {
  const t0 = performance.now();
  // Part 1: v1's strategy for the shipped contract, unchanged. It already reads
  // ctx from the ledger and uses the view's own guardianLeafOf and
  // approvalNullifierOf, which are v2's here.
  const base = runAttack({ ...view, id: '3' }, { knownNames, oracleSecrets });

  // Part 2: the same candidate secrets against v2's new nullifier sets.
  const { idCommit, idRoot, periods } = view.publicParams;
  const ctx = view.ledger.guardianCtx.lookup(idRoot);
  const P = view.pureCircuits;
  const candidates = [
    ...book.map((n) => ({ name: n, secret: guardianIdOf(n) })),
    ...book.map((n) => ({ name: n, secret: sha('guardian:', n) })),
    ...knownNames.map((n) => ({ name: n, secret: sha(ctx, guardianIdOf(n)) })),
  ];
  const named = new Set(base.named);
  const families = [...base.families];
  const probe = (label, cands, test) => {
    let hits = 0;
    for (const c of cands) for (const p of periods) if (test(c.secret, p)) { named.add(c.name); hits++; }
    families.push({ name: label, probes: cands.length * periods.length, hits });
    return hits;
  };
  const checkIns = probe('check-in nullifier  H(secret, ctx, period)', candidates,
    (s, p) => view.ledger.checkInNullifiers.member(P.checkInNullifierOf(s, ctx, p)));
  const opens = probe('open nullifier      H(secret, head, period)', candidates,
    (s, p) => view.ledger.openNullifiers.member(P.openNullifierOf(s, idCommit, p)));
  let oracleCheckIns = 0, oracleOpens = 0;
  if (oracleSecrets) {
    // NEGATIVE CONTROL ONLY, as in v1: the real secrets must hit, or a zero above means nothing.
    oracleCheckIns = probe('ORACLE (control)   check-ins of the real secrets', oracleSecrets,
      (s, p) => view.ledger.checkInNullifiers.member(P.checkInNullifierOf(s, ctx, p)));
    oracleOpens = probe('ORACLE (control)   opens of the real secrets', oracleSecrets,
      (s, p) => view.ledger.openNullifiers.member(P.openNullifierOf(s, idCommit, p)));
  }
  const probes = families.reduce((a, f) => a + f.probes, 0);
  return {
    id: view.id, named, votes: base.votes,
    checkIns: checkIns + oracleCheckIns, opens: opens + oracleOpens,
    families, probes, ms: performance.now() - t0,
  };
}
