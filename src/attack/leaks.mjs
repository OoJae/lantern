// What the shipped contract STILL leaks. Every entry is measured live from the
// same frozen observer view the attacker uses -- nothing here is hypothetical.
//
// COVERAGE is exhaustive by construction: test/adversarial.test.js asserts that
// every field of the shipped ledger appears here, so adding a ledger field
// without classifying it fails CI.
import { short } from './candidates.mjs';

const count = (it) => { let n = 0; for (const _ of it) n++; return n; };

export const COVERAGE = {
  recoveries: {
    sev: 'HIGH', what: 'a recovery in flight is a public distress signal',
    why: 'openRecovery is permissionless and recoveries is enumerable. Anyone can assert, for 72h, '
       + 'that a named identity lost its key. The owner\'s only answer, a veto, is itself a public '
       + 'proof of life. This is the liveness oracle.',
    measure: (L) => `${count(L.recoveries)} open`,
  },
  approvals: {
    sev: 'HIGH', what: 'live quorum progress',
    why: 'approvals has no iterator, but every rid is enumerable from recoveries, so an observer '
       + 'watches a takeover fill in real time and knows how many more guardians it needs.',
    measure: (L) => {
      const [[rid, rec]] = [...L.recoveries];
      return `${L.approvals.lookup(rid).read()} of ${L.thresholds.lookup(rec.idCommit)}`;
    },
  },
  idRoots: {
    sev: 'HIGH', what: 'the succession graph is public',
    why: 'every commitment maps to its genesis root in the clear, so recovering does NOT yield a fresh '
       + 'pseudonym. TRADE-OFF, NOT OVERSIGHT: this linkage is exactly what lets a host survive rotation.',
    measure: (L) => `${count(L.idRoots)} commitment(s) mapped to roots`,
  },
  retiredIdentities: {
    sev: 'MED', what: 'a public register of everyone who has lost a key',
    why: 'enumerable and append-only. A fresh entry marks a recent, confirmed victim.',
    measure: (L) => `${count(L.retiredIdentities)} entr${count(L.retiredIdentities) === 1 ? 'y' : 'ies'}`,
  },
  killed: {
    sev: 'MED', what: 'which recoveries the owner vetoed',
    why: 'the other half of the liveness oracle: a veto proves the owner is alive and watching.',
    measure: (L) => `${count(L.killed)} vetoed`,
  },
  thresholds: {
    sev: 'MED', what: 'the threshold k, in the clear',
    why: 'hiding it would need a range proof against a committed k, because the quorum check compares '
       + 'a Counter against a ledger value.',
    measure: (L) => `k = ${[...L.thresholds][0][1]}`,
  },
  guardians: {
    sev: 'MED', what: 'guardian counts',
    why: 'firstFree() is only a GLOBAL count, which is a real merit. But addGuardian takes idCommit as a '
       + 'public argument, so transaction history attributes each insert to an identity anyway.',
    measure: (L) => `${L.guardians.firstFree()} leaves, global`,
  },
  enrolled: {
    sev: 'MED', what: 'every identity commitment, and the population',
    why: 'public by design; the linkability consequences are covered under idRoots.',
    measure: (L) => `${count(L.enrolled)} enrolled`,
  },
  guardianCtx: {
    sev: 'LOW', what: 'guardian-set rotations are public and timestamped',
    why: '"this identity replaced its guardians" is observable. WHO they were, before or after, is not.',
    measure: (L) => `${count(L.guardianCtx)} context(s)`,
  },
  usedGuardianCtx: {
    sev: 'LOW', what: 'a global count of guardian-set rotations',
    why: 'every context ever claimed is enumerable, so rotations can be counted system-wide.',
    measure: (L) => `${count(L.usedGuardianCtx)} used`,
  },
  vetoCommits: {
    sev: 'BENIGN', what: 'that a veto commitment exists',
    why: 'a hiding commitment over a Field secret plus an independent 32-byte salt.',
    measure: (L) => `${count(L.vetoCommits)} commitment(s)`,
  },
  approvedNullifiers: {
    sev: 'BENIGN', what: 'how many approvals, never whose',
    why: 'unlinkable across recoveries (rid in the preimage) and across identities (idCommit).',
    measure: (L) => `${count(L.approvedNullifiers)} opaque`,
  },
  vetoNullifiers: {
    sev: 'BENIGN', what: 'a global veto count',
    why: 'adds no linkage that killed does not already reveal.',
    measure: (L) => `${count(L.vetoNullifiers)} opaque`,
  },
  lineage: {
    sev: 'BENIGN', what: 'nothing new',
    why: 'a membership oracle over (idRoot, member) pairs that idRoots has already published. Benign '
       + 'BECAUSE idRoots gave it away -- it was never a privacy mechanism.',
    measure: (L) => `${L.lineage.firstFree()} leaves`,
  },
  gateActions: {
    sev: 'BENIGN', what: 'total gated actions at the reference host',
    why: 'a global counter.',
    measure: (L) => `${L.gateActions}`,
  },
  gateNullifiers: {
    sev: 'BENIGN', what: 'nothing, but moot',
    why: 'unlinkable across nonces -- yet hostGatedAction discloses currentIdCommit outright. The gate '
       + 'provides AUTHORIZATION privacy, not ACTION privacy.',
    measure: (L) => `${count(L.gateNullifiers)} opaque`,
  },
};

const ORDER = { HIGH: 0, MED: 1, LOW: 2, BENIGN: 3 };

/** Measure every leak against a frozen observer view of the shipped contract. */
export function leakReport(view) {
  return Object.entries(COVERAGE)
    .map(([field, c]) => ({ field, sev: c.sev, what: c.what, why: c.why, measured: c.measure(view.ledger) }))
    .sort((a, b) => ORDER[a.sev] - ORDER[b.sev]);
}
