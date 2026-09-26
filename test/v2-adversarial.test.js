// v1's test/adversarial.test.js, ported to v2 (docs/v2.md §10): the attack
// that names every guardian of targets 1, 2a and 2b names none of v2's, even
// handed the real names, and links no vote, no open and no check-in. The
// negative controls prove the engine is wired to v2, and the leak report
// classifies every field of v2's ledger. The positive controls stay in v1's
// file: the vulnerable targets are unchanged.
import { describe, it, expect } from 'vitest';
import * as rt from '@midnight-ntwrk/compact-runtime';
import * as Lantern2 from '../contracts/managed-lantern2/contract/index.js';
import { buildTargets } from '../src/attack/targets.mjs';
import { runAttack } from '../src/attack/attack.mjs';
import { TRUE_GUARDIANS, hex } from '../src/attack/candidates.mjs';
import { buildV2Target } from '../src/v2/target.mjs';
import { runAttackV2 } from '../src/v2/attack.mjs';
import { COVERAGE, leakReport } from '../src/v2/leaks.mjs';
import { createLantern2Sim } from '../src/v2/sim.js';

const sameSet = (a, b) => a.size === b.length && b.every((x) => a.has(x));

// KNOWN PLAINTEXT, exactly as v1's enumeration gets it: the names recovered from
// the vulnerable targets 1, 2a and 2b.
const known = new Set();
for (const t of buildTargets().filter((x) => x.view.id !== '3')) {
  for (const n of runAttack(t.view, { knownNames: [...known] }).named) known.add(n);
}
const T = buildV2Target({ rt, mod: Lantern2 });
const R = runAttackV2(T.view, { knownNames: [...known] });

describe('v2: the attack FAILS against Lantern v2', () => {
  it('names zero guardians across every derivation family, v2\'s nullifier sets included', () => {
    expect(sameSet(known, [...TRUE_GUARDIANS])).toBe(true);   // the attacker really holds the names
    expect(R.named.size).toBe(0);
    for (const f of R.families) expect(f.hits, f.name).toBe(0);
    expect(R.families.map((f) => f.name).some((n) => n.startsWith('check-in'))).toBe(true);
    expect(R.families.map((f) => f.name).some((n) => n.startsWith('open'))).toBe(true);
  });

  it('even KNOWN PLAINTEXT -- the real names, recovered from targets 1/2a/2b -- scores zero', () => {
    const kp = R.families.find((f) => f.name.startsWith('KNOWN PLAINTEXT'));
    expect(kp.probes).toBeGreaterThan(0);
    expect(kp.hits).toBe(0);
  });

  it('links zero votes, zero opens and zero check-ins', () => {
    expect(R.votes).toBe(0);
    expect(R.opens).toBe(0);
    expect(R.checkIns).toBe(0);
    // Not for want of data: the target has 2 approvals, 1 open and 3 check-ins on the ledger.
    expect(T.view.ledger.approvedNullifiers.size()).toBe(2n);
    expect(T.view.ledger.openNullifiers.size()).toBe(1n);
    expect(T.view.ledger.checkInNullifiers.size()).toBe(3n);
  });

  it('the guardian context it hashes with is fully public, and it does not help', () => {
    expect(T.view.ledger.guardianCtx.lookup(T.view.publicParams.idRoot)).toBeInstanceOf(Uint8Array);
  });
});

describe('v2: negative control on the negative control', () => {
  it('handed ONE real secret, the same engine names exactly that guardian, its open and its check-in', () => {
    const one = T.secretsForNegativeControl.slice(0, 1);   // the guardian who opened
    const r = runAttackV2(T.view, { oracleSecrets: one });
    expect(r.named.size).toBe(1);
    expect(r.named.has(one[0].name)).toBe(true);
    expect(r.opens).toBe(1);
    expect(r.checkIns).toBe(1);
  });

  it('handed all three, it names all three and links all three check-ins -- so it is not capped', () => {
    const r = runAttackV2(T.view, { oracleSecrets: T.secretsForNegativeControl });
    expect(sameSet(r.named, [...TRUE_GUARDIANS])).toBe(true);
    expect(r.checkIns).toBe(3);
    expect(r.opens).toBe(1);
  });
});

describe('v2 regression: the target\'s secrets are fresh entropy, not a function of the name', () => {
  it('two independent builds share no guardian leaf, secret or salt', () => {
    const a = buildV2Target({ rt, mod: Lantern2 }).secretsForNegativeControl;
    const b = buildV2Target({ rt, mod: Lantern2 }).secretsForNegativeControl;
    const hexes = (gs, k) => new Set(gs.map((g) => hex(g[k])));
    for (const k of ['leaf', 'secret', 'salt']) {
      const inA = hexes(a, k);
      expect([...hexes(b, k)].filter((h) => inA.has(h)), k).toEqual([]);
    }
  });
});

describe('v2 leak report', () => {
  it('classifies EVERY field of the v2 ledger', () => {
    const fields = Object.keys(T.view.ledger);
    expect(fields.length).toBe(24);
    expect(fields.filter((f) => !(f in COVERAGE))).toEqual([]);
    expect(Object.keys(COVERAGE).sort()).toEqual([...fields].sort());
  });

  it('every entry is measured, not asserted', () => {
    for (const r of leakReport(T.view)) {
      expect(r.measured, r.field).toBeTypeOf('string');
      expect(r.measured.length, r.field).toBeGreaterThan(0);
    }
  });

  it('a claimed measurement is independently reproducible from the ledger', () => {
    const L = T.view.ledger;
    const rep = leakReport(T.view);
    expect(rep.find((r) => r.field === 'recoveries').measured).toBe(`${[...L.recoveries].length} opened (ever)`);
    expect(rep.find((r) => r.field === 'checkIns').measured).toBe(`${L.checkIns.size()} (root, set, quarter) count(s)`);
    expect(rep.find((r) => r.field === 'recoveryDelays').measured).toBe('1 delay(s): 3 d');
    expect(rep.find((r) => r.field === 'locked').measured).toBe('0 of 1 root(s) locked');
  });

  it('reports quorum progress per recovery, and does not throw when there are none', () => {
    const L = T.view.ledger;
    const approvals = leakReport(T.view).find((r) => r.field === 'approvals');
    expect(approvals.measured.split(', ')).toHaveLength([...L.recoveries].length);
    expect(approvals.measured).toMatch(/: 2 of 2$/);
    const empty = createLantern2Sim({ rt, mod: Lantern2 }).ledger;
    expect(COVERAGE.approvals.measure(empty)).toBe('no recoveries');
    expect(COVERAGE.recoveries.measure(empty)).toBe('0 opened (ever)');
    for (const f of ['recoveryDelays', 'locked', 'checkIns', 'liveRecovery', 'vetoCounts', 'lastVetoAt',
      'openNullifiers', 'checkInNullifiers']) {
      expect(() => COVERAGE[f].measure(empty), f).not.toThrow();
    }
  });

  it('never calls a measurement "live": nothing in the report is a live feed', () => {
    for (const c of Object.values(COVERAGE)) expect(`${c.what} ${c.why}`).not.toMatch(/\blive\b/i);
  });

  it('ranks the liveness oracle among the highest-severity leaks, and says v2 narrowed it', () => {
    const rep = leakReport(T.view);
    expect(rep.filter((r) => r.sev === 'HIGH').map((r) => r.field)).toContain('recoveries');
    expect(rep.find((r) => r.field === 'recoveries').why).toMatch(/only a current guardian can open/);
    // The new public signals are classified, and none is BENIGN.
    for (const f of ['recoveryDelays', 'locked', 'checkIns']) expect(COVERAGE[f].sev, f).toBe('MED');
  });
});
