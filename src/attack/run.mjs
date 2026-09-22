// The four-target enumeration, as data. `npm run attack` prints it; the
// browser's /attacks page renders it. Same engine, same targets, same verdicts.
import { buildTargets } from './targets.mjs';
import { runAttack } from './attack.mjs';
import { leakReport } from './leaks.mjs';
import { ADDRESS_BOOK, TRUE_GUARDIANS } from './candidates.mjs';

export function runEnumeration() {
  const targets = buildTargets();
  const known = new Set();
  const results = targets.map((t) => {
    // Names recovered from earlier targets become KNOWN PLAINTEXT against later ones.
    const r = runAttack(t.view, { knownNames: [...known] });
    for (const n of r.named) known.add(n);
    const broken = r.named.size > 0;
    return { t, r, broken, verdict: broken ? 'BROKEN' : 'HELD' };
  });
  // Invariants: 1/2a/2b fully named, 3 not named at all.
  const failures = results.filter(({ t, r }) =>
    t.view.id === '3' ? r.named.size !== 0 : r.named.size !== t.truth.guardians);
  const shipped = results.find((x) => x.t.view.id === '3');
  return {
    addressBook: ADDRESS_BOOK.length,
    guardians: TRUE_GUARDIANS.length,
    results,
    shipped,
    leaks: leakReport(shipped.t.view),
    failures,
    ok: failures.length === 0,
  };
}
