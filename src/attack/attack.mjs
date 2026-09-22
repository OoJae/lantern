// One attacker, one strategy per target. Every strategy consumes ONLY a frozen
// observer view: the public ledger plus that contract's public derivation code.
import { createHash } from 'node:crypto';
import { ADDRESS_BOOK, guardianIdOf, hex } from './candidates.mjs';

const ZERO = new Uint8Array(32);
const slotBytes = (i) => { const b = new Uint8Array(32); b[31] = i; return b; };
const sha = (...parts) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(typeof p === 'string' ? Buffer.from(p) : Buffer.from(p));
  return new Uint8Array(h.digest());
};
const inTree = (tree, leaf) => tree.findPathForLeaf(leaf) !== undefined;

/** Count how many named guardians' votes are computable from public data. */
function linkVotes(view, named, nullifierOf) {
  let votes = 0;
  for (const name of named) {
    for (const rid of view.publicParams.rids) {
      if (view.ledger.approvedNullifiers.member(nullifierOf(name, rid))) votes++;
    }
  }
  return votes;
}

const STRATEGIES = {
  // Read it straight out of the ledger. The address book is used only to put
  // names to identifiers that are already public.
  '1'(view, { book }) {
    const byId = new Map(book.map((n) => [hex(guardianIdOf(n)), n]));
    const named = new Set();
    for (const [, e] of view.ledger.guardianList) {
      const n = byId.get(hex(e.guardian));
      if (n) named.add(n);
    }
    let votes = 0;
    for (const [, v] of view.ledger.voteList) if (byId.has(hex(v.guardian))) votes++;
    return { named, votes, families: [{ name: 'read guardianList / voteList', probes: 0, hits: named.size }] };
  },

  // One hash per candidate. The tree is a membership oracle over it.
  '2a'(view, { book }) {
    const { owner } = view.publicParams;
    const named = new Set();
    for (const n of book) {
      if (inTree(view.ledger.guardians, view.pureCircuits.unsaltedLeafOf(guardianIdOf(n), owner))) named.add(n);
    }
    const votes = linkVotes(view, named,
      (n, rid) => view.pureCircuits.approvalNullifierOf(guardianIdOf(n), owner, rid));
    return { named, votes, families: [{ name: 'H(domain, id(name), owner)', probes: book.length, hits: named.size }] };
  },

  // Salting with public randomness multiplies the work by the slot range --
  // and by nothing else.
  '2b'(view, { book }) {
    const { owner, slots } = view.publicParams;
    const named = new Set();
    for (const n of book) {
      for (let s = 0; s < slots; s++) {
        if (inTree(view.ledger.guardians,
          view.pureCircuits.saltedLeafOf(guardianIdOf(n), owner, slotBytes(s)))) { named.add(n); break; }
      }
    }
    const votes = linkVotes(view, named,
      (n, rid) => view.pureCircuits.approvalNullifierOf(guardianIdOf(n), owner, rid));
    return { named, votes,
      families: [{ name: 'commit(id(name), owner; H(owner, slot))', probes: book.length * slots, hits: named.size }] };
  },

  // The shipped contract. Every careless-implementor derivation, plus the one
  // that matters: KNOWN PLAINTEXT -- the real names, already recovered from the
  // other targets, handed to the attacker outright.
  '3'(view, { book, knownNames = [], oracleSecrets = null }) {
    const { idRoot, idCommit } = view.publicParams;
    // ctx is PUBLIC. Read it live, exactly as an observer would.
    const ctx = view.ledger.guardianCtx.lookup(idRoot);
    const leafOf = (secret, salt) => view.pureCircuits.guardianLeafOf(secret, ctx, salt);
    const named = new Set();
    const families = [];
    const run = (name, cands, derive) => {
      let hits = 0;
      for (const c of cands) {
        if (inTree(view.ledger.guardians, derive(c))) { named.add(typeof c === 'string' ? c : c.name); hits++; }
      }
      families.push({ name, probes: cands.length, hits });
    };

    run('zero salt          commit(id, ctx; 0…0)', book, (n) => leafOf(guardianIdOf(n), ZERO));
    run('salt = identifier  commit(id, ctx; id)', book, (n) => leafOf(guardianIdOf(n), guardianIdOf(n)));
    run('salt = H(ctx‖id)   commit(id, ctx; H(ctx‖id))', book,
      (n) => leafOf(guardianIdOf(n), sha(ctx, guardianIdOf(n))));
    run('alt id encoding    commit(H(name), ctx; …)', book,
      (n) => leafOf(sha('guardian:', n), ZERO));

    // Every salt guess above, for every name the attacker already KNOWS is a
    // real guardian of this person.
    const kp = knownNames.flatMap((n) => [
      { name: n, s: guardianIdOf(n), t: ZERO },
      { name: n, s: guardianIdOf(n), t: guardianIdOf(n) },
      { name: n, s: guardianIdOf(n), t: sha(ctx, guardianIdOf(n)) },
      { name: n, s: sha('guardian:', n), t: ZERO },
    ]);
    run('KNOWN PLAINTEXT    the real names, from targets 1/2a/2b', kp, (c) => leafOf(c.s, c.t));

    // NEGATIVE CONTROL ONLY. Hand the same engine the real secret material.
    // If this does not hit, a zero above means the engine is miswired, not
    // that the target held.
    if (oracleSecrets) {
      run('ORACLE (control)   the real (secret, salt)', oracleSecrets, (g) => leafOf(g.secret, g.salt));
    }

    const votes = linkVotes(view, named,
      (n, rid) => view.pureCircuits.approvalNullifierOf(guardianIdOf(n), idCommit, rid));
    return { named, votes, families };
  },
};

/**
 * @param view a frozen observer view from buildTargets()
 * @returns {{ id, named: Set<string>, votes: number, probes: number, ms: number, families }}
 */
export function runAttack(view, opts = {}) {
  const strategy = STRATEGIES[view.id];
  if (!strategy) throw new Error(`no strategy for target ${view.id}`);
  const t0 = performance.now();
  const r = strategy(view, { book: ADDRESS_BOOK, ...opts });
  const ms = performance.now() - t0;
  const probes = r.families.reduce((a, f) => a + f.probes, 0);
  return { id: view.id, ...r, probes, ms };
}
