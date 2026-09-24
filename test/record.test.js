// The committed local-chain records, checked offline. `npm run devnet:verify`
// re-checks a record against the chain that produced it, but only while that
// chain runs. This file checks what anyone can check without it: that each
// record is internally consistent and is exactly the story this repo tells.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rootBindings } from '../src/bindings/root.mjs';
import { createStory } from '../src/demo/story.mjs';
import { storyRng } from '../src/demo/rng.mjs';
import { isQuickStep } from '../src/demo/quick.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../deployments/${f}`, import.meta.url), 'utf8'));
const RECORDS = { full: load('local-devnet.json'), quick: load('local-devnet-quick.json') };
const BENCH = load('bench-shipped-finalize.json');

const CIRCUITS = [
  'addGuardian', 'approveRecovery', 'enrollIdentity', 'finalizeRecovery', 'hostGatedAction', 'openRecovery',
  'proveHeadOwnership', 'proveSuccession', 'rotateGuardianSet', 'vetoRecovery',
  'attestVote', 'openEpoch', 'openRotation', 'requireCurrentOwnerAttested', 'rotateVote', 'sealEpoch', 'sealRotation',
];

const storyIds = (quick) => {
  const story = createStory({ pure: rootBindings.Lantern.pureCircuits, rng: storyRng('record-test') });
  return (quick ? story.steps.filter(isQuickStep) : story.steps).map((s) => s.id);
};

for (const [mode, rec] of Object.entries(RECORDS)) {
  describe(`deployments/${mode === 'full' ? 'local-devnet' : 'local-devnet-quick'}.json`, () => {
    const calls = rec.steps.filter((s) => s.kind === 'call');
    const withTx = rec.steps.filter((s) => s.tx?.txId);

    it('is exactly the story this repo tells, step for step', () => {
      expect(rec.steps.map((s) => s.id)).toEqual(storyIds(mode === 'quick'));
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
    });

    it('both contracts froze their maintenance authority in the same run', () => {
      for (const c of Object.values(rec.contracts)) {
        expect(c.maintenanceAuthority.committee).toBe(0);
        expect(c.maintenanceAuthority.threshold).toBeGreaterThanOrEqual(1);
        expect(c.maintenanceAuthority.frozenBy.status).toBe('SucceedEntirely');
      }
    });

    it('ran the devnet flavour: one constant, 72 h to 60 s', () => {
      expect(rec.flavour.recoveryDelaySeconds).toBe(60);
      expect(rec.flavour.shipped).toBe(259200);
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

    if (mode === 'full') {
      it('proved every one of the 17 circuits of both contracts on chain', () => {
        const proved = new Set(withTx.map((s) => s.circuit));
        expect(CIRCUITS.filter((c) => !proved.has(c))).toEqual([]);
      });
    }
  });
}

describe('deployments/bench-shipped-finalize.json', () => {
  it('proved the SHIPPED 72 h finalizeRecovery, with its negative control, and says where', () => {
    expect(BENCH.circuit).toBe('finalizeRecovery');
    expect(BENCH.timelockSeconds).toBe(259200);
    expect(BENCH.negativeControl).toMatch(/71 h .* refused .*timelock has not elapsed/);
    expect(BENCH.proveSeconds.length).toBeGreaterThanOrEqual(1);
    expect(BENCH.machine.cpuModel).toBeTruthy();
  });
});
