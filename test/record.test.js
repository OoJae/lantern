// The committed chain records, checked offline. `npm run devnet:verify` re-checks
// a record against the chain that produced it: a local chain only while it runs,
// Preprod (with LANTERN_NETWORK=preprod) at any time. This file checks what anyone
// can check without a chain: that each record is internally consistent and is
// exactly the story this repo tells.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rootBindings } from '../src/bindings/root.mjs';
import { createStory } from '../src/demo/story.mjs';
import { storyRng } from '../src/demo/rng.mjs';
import { isQuickStep } from '../src/demo/quick.mjs';
import { flavour, FLAVOUR_DELAY_SECONDS } from '../devnet/flavour.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../deployments/${f}`, import.meta.url), 'utf8'));
// The story runs: the whole story and the core recovery on a local chain, and the whole story on Preprod.
const RECORDS = {
  'local-devnet': { rec: load('local-devnet.json'), quick: false },
  'local-devnet-quick': { rec: load('local-devnet-quick.json'), quick: true },
  preprod: { rec: load('preprod.json'), quick: false },
};
const BENCH = load('bench-shipped-finalize.json');
const FLAVOUR_LINE = flavour(readFileSync(new URL('../contracts/src/lantern.compact', import.meta.url), 'utf8')).changedLine;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const CIRCUITS = [
  'addGuardian', 'approveRecovery', 'enrollIdentity', 'finalizeRecovery', 'hostGatedAction', 'openRecovery',
  'proveHeadOwnership', 'proveSuccession', 'rotateGuardianSet', 'vetoRecovery',
  'attestVote', 'openEpoch', 'openRotation', 'requireCurrentOwnerAttested', 'rotateVote', 'sealEpoch', 'sealRotation',
];

const storyIds = (quick) => {
  const story = createStory({ pure: rootBindings.Lantern.pureCircuits, rng: storyRng('record-test') });
  return (quick ? story.steps.filter(isQuickStep) : story.steps).map((s) => s.id);
};

for (const [name, { rec, quick }] of Object.entries(RECORDS)) {
  describe(`deployments/${name}.json`, () => {
    const calls = rec.steps.filter((s) => s.kind === 'call');
    const withTx = rec.steps.filter((s) => s.tx?.txId);

    it('is exactly the story this repo tells, step for step', () => {
      expect(rec.steps.map((s) => s.id)).toEqual(storyIds(quick));
    });

    it('every step went as expected, and each outcome matches its expectation', () => {
      for (const s of rec.steps) expect(s.ok, s.id).toBe(true);
      for (const s of calls) {
        expect(s.expect, s.id).toBe(s.outcome === 'refused' ? `refused: ${s.message}` : s.outcome);
      }
    });

    it('every accepted call is a finalized transaction; every refusal happened before any transaction', () => {
      for (const s of calls) {
        if (s.outcome === 'accepted') {
          expect(s.tx?.status, s.id).toBe('SucceedEntirely');
          expect(s.tx.txId, s.id).toMatch(/^[0-9a-f]+$/);
          expect(s.tx.blockHeight, s.id).toBeGreaterThan(0);
        } else {
          expect(s.tx, s.id).toBeUndefined();
        }
      }
    });

    it('its summary recomputes from its steps', () => {
      expect(rec.summary.steps).toBe(rec.steps.length);
      expect(rec.summary.accepted).toBe(calls.filter((s) => s.outcome === 'accepted').length);
      expect(rec.summary.refused).toBe(calls.filter((s) => s.outcome === 'refused').length);
      expect(rec.summary.transactions).toBe(withTx.length + 4); // + two deploys + two freezes
      const proves = withTx.map((s) => s.timings.prove);
      expect(rec.summary.proveSeconds.min).toBe(Math.min(...proves));
      expect(rec.summary.proveSeconds.max).toBe(Math.max(...proves));
      expect(rec.summary.proveSeconds.median).toBe(median(proves));
      const totals = withTx.map((s) => s.timings.total);
      expect(rec.summary.callToFinalizedSeconds).toEqual({ min: Math.min(...totals), median: median(totals), max: Math.max(...totals) });
    });

    it('both contracts froze their maintenance authority in the same run', () => {
      for (const c of Object.values(rec.contracts)) {
        expect(c.maintenanceAuthority.committee).toBe(0);
        expect(c.maintenanceAuthority.threshold).toBeGreaterThanOrEqual(1);
        expect(c.maintenanceAuthority.frozenBy.status).toBe('SucceedEntirely');
      }
    });

    it('ran the devnet flavour: one constant, 72 h to 60 s, on the line the flavour changes', () => {
      expect(rec.flavour.recoveryDelaySeconds).toBe(60);
      expect(rec.flavour.recoveryDelaySeconds).toBe(FLAVOUR_DELAY_SECONDS);
      expect(rec.flavour.shipped).toBe(259200);
      expect(rec.flavour.line).toBe(FLAVOUR_LINE);
    });

    it('every sponsored transaction came from a device with no wallet, and only the sponsor spent DUST', () => {
      const sponsored = rec.steps.filter((s) => s.sponsorship);
      expect(sponsored.length).toBeGreaterThan(0);
      for (const s of sponsored) {
        expect(s.sponsorship.deviceWallet, s.id).toBe('none');
        expect(s.sponsorship.userIntentDustSpends, s.id).toBe(0);
        expect(s.sponsorship.sponsorDustSpends, s.id).toBeGreaterThanOrEqual(1);
      }
    });

    if (!quick) {
      it('proved every one of the 17 circuits of both contracts on chain', () => {
        const proved = new Set(withTx.map((s) => s.circuit));
        expect(CIRCUITS.filter((c) => !proved.has(c))).toEqual([]);
      });
    }
  });
}

// The whole story on Midnight's public test network. `LANTERN_NETWORK=preprod npm run
// devnet:verify` re-checks the record against Preprod itself, at any time; offline, it must be
// the local run's story, step for step, on Preprod, with the phone paying for nothing.
describe('deployments/preprod.json, beside the local run of the same story', () => {
  const P = RECORDS.preprod.rec;
  const L = RECORDS['local-devnet'].rec;

  it('ran on Preprod, both contracts deployed and frozen before the first step, every transaction in order', () => {
    expect(P.network).toMatch(/^preprod /);
    expect(P.mode).toBe('full+sponsored');
    const { lantern, host } = P.contracts;
    expect(lantern.name).toBe('Lantern (devnet flavour)');
    expect(host.name).toBe('LanternHost (unchanged)');
    for (const c of [lantern, host]) {
      expect(c.status, c.name).toBe('SucceedEntirely');
      expect(c.maintenanceAuthority, c.name).toMatchObject({ committee: 0, threshold: 1 });
    }
    const heights = [
      lantern.blockHeight, lantern.maintenanceAuthority.frozenBy.blockHeight,
      host.blockHeight, host.maintenanceAuthority.frozenBy.blockHeight,
      ...P.steps.filter((s) => s.tx?.txId).map((s) => s.tx.blockHeight),
    ];
    expect(heights).toHaveLength(P.summary.transactions);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });

  it('went as the local run went: each step, outcome, refusal and sponsored call, and both final ledgers', () => {
    const shape = (r) => r.steps.map((s) => [s.id, s.kind, s.actor, s.circuit, s.outcome, s.message, Boolean(s.sponsorship)]);
    expect(shape(P)).toEqual(shape(L));
    const counts = ({ steps, accepted, refused, transactions }) => ({ steps, accepted, refused, transactions });
    expect(counts(P.summary)).toEqual(counts(L.summary));
    expect(P.finalPublicRecord).toEqual(L.finalPublicRecord);
    expect(P.finalHostRecord).toEqual(L.finalHostRecord);
  });

  it('the phone paid for nothing: the sponsor paid its transactions, Seo-yeon the open, the operator the rest', () => {
    const paid = P.steps.filter((s) => s.tx?.txId);
    for (const s of paid) {
      const payer = s.sponsorship ? 'the sponsor (the device holds no wallet)'
        : s.id === '3.2' ? "Seo-yeon's own wallet" : 'the operator wallet';
      expect(s.payer, s.id).toBe(payer);
    }
    expect(P.steps.find((s) => s.id === '3.2')).toMatchObject({ actor: 'Seo-yeon', circuit: 'openRecovery' });
    expect(paid.filter((s) => s.sponsorship).map((s) => s.sponsorship.circuit)).toEqual(paid.filter((s) => s.sponsorship).map((s) => s.circuit));
  });
});

describe('deployments/bench-shipped-finalize.json', () => {
  it('proved the SHIPPED 72 h finalizeRecovery, with its negative control, and says where', () => {
    expect(BENCH.circuit).toBe('finalizeRecovery');
    expect(BENCH.timelockSeconds).toBe(259200);
    expect(BENCH.negativeControl).toMatch(/71 h .* refused .*timelock has not elapsed/);
    expect(BENCH.proveSeconds.length).toBeGreaterThanOrEqual(1);
    expect(BENCH.machine.cpuModel).toBeTruthy();
  });
});

// The shipped contract on Midnight's public test network. `LANTERN_NETWORK=preprod node
// devnet/src/shipped.mjs verify` re-checks the record against Preprod itself, at any time; this
// checks the record is internally sound, before the finalize and after it.
describe('deployments/preprod-shipped.json', () => {
  const P = load('preprod-shipped.json');
  const H = 3600 * 1000;
  const OPENED = ['enrollIdentity', 'addGuardian', 'addGuardian', 'addGuardian', 'openRecovery', 'approveRecovery', 'approveRecovery'];

  it('is the SHIPPED contract, unchanged, on Preprod, with its rules frozen', () => {
    expect(P.network).toMatch(/^preprod /);
    expect(P.timelockSeconds).toBe(259200);
    expect(P.contract.verifierKeys).toBe('10 of 10 identical to a fresh compile of contracts/src/lantern.compact');
    expect(P.contract.maintenanceAuthority).toMatchObject({ committee: 0, threshold: 1 });
    expect(P.contract.maintenanceAuthority.frozenBy.status).toBe('SucceedEntirely');
    expect(P.contract.status).toBe('SucceedEntirely');
  });

  it('enrolled, added three guardians, opened, and collected two approvals, each a finalized transaction', () => {
    const accepted = P.steps.filter((s) => s.outcome === 'accepted');
    // Once finalized, the finalize itself is the eighth.
    expect(accepted.map((s) => s.circuit)).toEqual(P.finalize ? [...OPENED, 'finalizeRecovery'] : OPENED);
    for (const s of accepted) expect(s.tx.status, s.id).toBe('SucceedEntirely');
    const heights = accepted.map((s) => s.tx.blockHeight);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(heights[0]).toBeGreaterThan(P.contract.maintenanceAuthority.frozenBy.blockHeight);
  });

  it('refused a finalize while the lock held, before any transaction', () => {
    const early = P.steps.find((s) => s.id === '8');
    expect(early).toMatchObject({ circuit: 'finalizeRecovery', outcome: 'refused', message: 'timelock has not elapsed' });
    expect(early.tx).toBeUndefined();
  });

  it('cannot finalize before 72 hours after the later bound recorded at the open', () => {
    const { openedAtLo, openedAtHi, finalizeNoEarlierThan } = P.recovery;
    expect(Date.parse(openedAtHi) - Date.parse(openedAtLo)).toBe(600 * 1000);
    expect(Date.parse(finalizeNoEarlierThan) - Date.parse(openedAtHi)).toBe(72 * H);
    if (P.finalize) {
      // A tampered share refused first, then the finalize: step 10 is the record's finalize.
      const tampered = P.steps.find((s) => s.id === '9');
      expect(tampered).toMatchObject({ circuit: 'finalizeRecovery', outcome: 'refused', message: 'reconstructed secret does not open idCommit' });
      expect(tampered.tx).toBeUndefined();
      expect(P.steps.find((s) => s.id === '10')?.tx).toEqual(P.finalize.tx);
      expect(P.finalize.tx.status).toBe('SucceedEntirely');
      expect(Date.parse(P.finalize.at)).toBeGreaterThanOrEqual(Date.parse(finalizeNoEarlierThan));
    }
  });

  it('says it finalized only once it has', () => {
    expect(/finalized/.test(P.what)).toBe(Boolean(P.finalize));
  });
});
