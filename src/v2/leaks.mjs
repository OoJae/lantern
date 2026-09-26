// What Lantern v2 still leaks (docs/v2.md §9): v1's classification
// (src/attack/leaks.mjs), with the entries v2 changes rewritten and its eight
// new fields added. test/v2-adversarial.test.js asserts that every field of
// v2's ledger appears here, so adding one without classifying it fails CI.
// Every entry is MEASURED from the observer's view, never asserted.
import { COVERAGE as V1 } from '../attack/leaks.mjs';

const count = (it) => { let n = 0; for (const _ of it) n++; return n; };
const days = (s) => `${Math.round(Number(s) / 86_400)} d`;

export const COVERAGE = {
  ...V1,
  recoveries: {
    sev: 'HIGH', what: 'a recovery in flight is a public distress signal',
    why: 'recoveries is enumerable, so a recovery still announces, for the whole delay, that a named '
       + 'identity lost its key. v2 narrows who can raise it: only a current guardian can open, once per '
       + 'head per quarter each, with a doubling wait after every veto. The owner\'s veto is still a '
       + 'public proof of life. This is the liveness oracle, smaller than in v1.',
    measure: V1.recoveries.measure,
  },
  recoveryDelays: {
    sev: 'MED', what: "each identity's chosen recovery delay",
    why: 'public so that a watcher can show the unlock time. A 90-day delay marks an identity as using an '
       + 'inheritance setup; hiding it would need a committed delay and a range proof against block time.',
    measure: (L) => {
      const ds = [...L.recoveryDelays].map(([, d]) => days(d));
      return ds.length ? `${ds.length} delay(s): ${[...new Set(ds)].join(', ')}` : 'none';
    },
  },
  locked: {
    sev: 'MED', what: 'that an owner believes their secret is compromised',
    why: 'a lock also proves the owner holds the veto card and is alive: a proof of life, but a voluntary '
       + 'one. One bit per root; no secret or salt is in either transcript.',
    measure: (L) => `${[...L.locked].filter(([, v]) => v).length} of ${L.locked.size()} root(s) locked`,
  },
  checkIns: {
    sev: 'MED', what: "the guardians' engagement per quarter, never who",
    why: 'the count per (root, guardian set, quarter) is the point of a public health check, and it is '
       + 'also a target-selection hint: it shows which identities have inattentive guardians.',
    measure: (L) => `${L.checkIns.size()} (root, set, quarter) count(s)`,
  },
  liveRecovery: {
    sev: 'LOW', what: "which recovery holds each identity's slot",
    why: 'derivable in v1 terms from recoveries, killed and retiredIdentities, and transaction times. Now '
       + 'explicit, so the open can enforce one in flight per identity.',
    measure: (L) => `${L.liveRecovery.size()} slot(s) ever held`,
  },
  vetoCounts: {
    sev: 'LOW', what: 'how many vetoes each lineage has seen since its last rotation',
    why: 'derivable from killed and transaction times; it sets the cooldown.',
    measure: (L) => `${L.vetoCounts.size()} root(s)`,
  },
  lastVetoAt: {
    sev: 'LOW', what: 'when each lineage was last vetoed, to within the slack',
    why: 'derivable from the veto transaction\'s time.',
    measure: (L) => `${[...L.lastVetoAt].filter(([, t]) => t > 0n).length} root(s) ever vetoed`,
  },
  openNullifiers: {
    sev: 'LOW', what: 'how many opens, never whose',
    why: 'one per (guardian, head, quarter), unlinkable across quarters, heads and to approvals or check-ins '
       + '(its own domain and inputs). recoveries already counts the opens.',
    measure: (L) => `${L.openNullifiers.size()} opaque`,
  },
  checkInNullifiers: {
    sev: 'LOW', what: 'how many check-ins, never whose',
    why: 'one per (guardian secret, guardian set, quarter), unlinkable across quarters and sets, and to '
       + 'approvals and opens.',
    measure: (L) => `${L.checkInNullifiers.size()} opaque`,
  },
};

const ORDER = { HIGH: 0, MED: 1, LOW: 2, BENIGN: 3 };

/** Measure every leak against a frozen observer view of Lantern v2. */
export function leakReport(view) {
  return Object.entries(COVERAGE)
    .map(([field, c]) => ({ field, sev: c.sev, what: c.what, why: c.why, measured: c.measure(view.ledger) }))
    .sort((a, b) => ORDER[a.sev] - ORDER[b.sev]);
}
