// Lantern v2's committed chain records, checked offline on every `npm test`: the run on Preprod,
// beside the shipped contract (deployments/preprod-v2.json), and the run on a local chain
// (deployments/local-v2.json). `npm run devnet:verify:v2` (with LANTERN_NETWORK=preprod for
// Preprod) re-checks a record against the chain; this file checks what anyone can check without
// one: that each record is the v2 story this repo tells, step for step, with the circuit's own
// refusals, that its transactions are in block order, that the contract was deployed in two parts
// and frozen before the first step, and that its deploy and key insert name each of v2's 13
// circuits once. The devnet package's own test (devnet/test/v2-record.test.mjs) also replays the
// story in memory and compares where each record ends.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pureCircuits } from '../contracts/managed-lantern2/contract/index.js';
import { storyRng } from '../src/demo/rng.mjs';
import { createV2Story, REFUSALS, RULES, V2_DELAY } from '../devnet/src/v2-story.mjs';
import { problemsOf, recordedTxs, setupTxs, V2_CIRCUITS, V2_SOURCES } from '../devnet/src/v2-record.mjs';

const repo = new URL('../', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(`deployments/${f}`, repo), 'utf8'));
const sha256 = (f) => createHash('sha256').update(readFileSync(new URL(f, repo))).digest('hex');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// The four refusals, in the circuit's own words, written out here so that a change to the story's
// list shows up as a change to this file too.
const REFUSED = {
  '2.1': 'guardian not in tree',
  '2.5': 'cooling down after a veto',
  '3.2': 'identity is locked',
  '4.2': 'guardian already checked in this period',
};

// What the README and docs/v2.md cite from the Preprod run: the contract, and the blocks of its
// deploy, its key insert and its freeze. A devnet run rewrites deployments/*.json; this pins the
// committed one.
const PREPROD = {
  address: '6ed46d5d7dc667e5b212b155f376c4914a693dfd45b3d033ada69e3551971fa4',
  deploy: 2723818,
  insert: 2723822,
  freeze: 2723825,
};

const RECORDS = {
  'preprod-v2': { rec: load('preprod-v2.json'), network: /^preprod /, payer: 'the operator wallet' },
  'local-v2': { rec: load('local-v2.json'), network: /^undeployed /, payer: 'the genesis wallet' },
};

const story = createV2Story({ pure: pureCircuits, rng: storyRng('v2-record-test') });

for (const [name, { rec, network, payer }] of Object.entries(RECORDS)) {
  describe(`deployments/${name}.json`, () => {
    const calls = rec.steps.filter((s) => s.kind === 'call');
    const accepted = calls.filter((s) => s.outcome === 'accepted');
    const c = rec.contracts.lantern2;

    it('is the v2 story this repo tells, step for step: the same rule, circuit and expected outcome', () => {
      expect(rec.steps.map((s) => [s.id, s.rule, s.circuit, s.expect])).toEqual(
        story.steps.map((s) => [s.id, s.rule, s.circuit, s.expect.accept ? 'accepted' : `refused: ${s.expect.refuse}`]));
      expect(new Set(rec.steps.map((s) => s.rule))).toEqual(new Set(Object.keys(RULES).map(Number)));
    });

    it('every step went as expected: 12 accepted, and 4 refused by the circuit\'s own asserts', () => {
      expect(rec.steps).toHaveLength(16);
      for (const s of rec.steps) expect(s.ok, s.id).toBe(true);
      expect(calls).toHaveLength(16);
      expect(accepted).toHaveLength(12);
      const refused = Object.fromEntries(calls.filter((s) => s.outcome === 'refused').map((s) => [s.id, s.message]));
      expect(refused).toEqual(REFUSED);
      expect(refused).toEqual(REFUSALS);
      for (const s of calls) expect(s.expect, s.id).toBe(s.outcome === 'refused' ? `refused: ${s.message}` : 'accepted');
    });

    it('every accepted step is a finalized transaction; every refusal came before any transaction', () => {
      for (const s of calls) {
        if (s.outcome === 'accepted') {
          expect(s.tx.status, s.id).toBe('SucceedEntirely');
          expect(s.tx.txId, s.id).toMatch(/^[0-9a-f]{66}$/);
          expect(s.tx.txHash, s.id).toMatch(/^[0-9a-f]{64}$/);
          expect(s.payer, s.id).toBe(payer);
        } else {
          expect(s.tx, s.id).toBeUndefined();
          expect(s.timings, s.id).toBeUndefined();
        }
      }
      expect(rec.payer).toBe(`${payer} paid every transaction`);
    });

    it('was deployed in two parts, 8 verifier keys and then 5, and frozen, before the first step', () => {
      const [deploy, ...rest] = setupTxs(c);
      const freeze = rest.pop();
      expect(rest).toHaveLength(1);
      expect(c.operationsAtDeploy).toHaveLength(8);
      expect(c.verifierKeysInsertedBy).toHaveLength(1);
      expect(c.verifierKeysInsertedBy[0].operations).toHaveLength(5);
      expect(deploy.blockHeight).toBeLessThan(rest[0].blockHeight);
      expect(rest[0].blockHeight).toBeLessThan(freeze.blockHeight);
      expect(freeze.blockHeight).toBeLessThan(accepted[0].tx.blockHeight);
      for (const t of setupTxs(c)) {
        expect(t.status).toBe('SucceedEntirely');
        expect(t.txId).toMatch(/^[0-9a-f]{66}$/);
        expect(t.txHash).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(c.maintenanceAuthority.committee).toBe(0);
      expect(c.maintenanceAuthority.threshold).toBe(1);
    });

    it('names each of v2\'s 13 circuits exactly once, in the deploy or the key insert', () => {
      const placed = [...c.operationsAtDeploy, ...c.verifierKeysInsertedBy.flatMap((u) => u.operations)];
      expect(placed).toHaveLength(13);
      expect([...placed].sort()).toEqual(V2_CIRCUITS);
      expect(new Set(placed).size).toBe(13);
    });

    it('has every transaction in block order, each named once', () => {
      const txs = recordedTxs(rec);
      expect(txs).toHaveLength(15);
      const heights = txs.map((t) => t.blockHeight);
      for (let i = 1; i < heights.length; i++) expect(heights[i], `transaction ${i}`).toBeGreaterThan(heights[i - 1]);
      expect(new Set(txs.map((t) => t.txId)).size).toBe(15);
      expect(new Set(txs.map((t) => t.txHash)).size).toBe(15);
    });

    it('has a summary that recomputes from its steps, and no problem its own check can find', () => {
      const S = rec.summary;
      expect([S.steps, S.accepted, S.refused, S.transactions]).toEqual([16, 12, 4, 15]);
      expect(S.circuitsProved).toEqual([...new Set(accepted.map((s) => s.circuit))].sort());
      const totals = accepted.map((s) => s.timings.total);
      expect(S.callToFinalizedSeconds).toEqual({ min: Math.min(...totals), median: median(totals), max: Math.max(...totals) });
      expect(S.wallClockMinutes).toBeGreaterThan(0);
      expect(problemsOf(rec)).toEqual([]);
    });

    it('ran on the network its name says, from the sources committed here, and finalized no recovery', () => {
      expect(rec.mode).toBe('v2');
      expect(rec.network).toMatch(network);
      expect(rec.compiler.compact).toBe('0.31.1');
      expect(rec.source.sha256).toEqual(Object.fromEntries(V2_SOURCES.map((f) => [f, sha256(f)])));
      expect(rec.delay.chosenSeconds).toBe(V2_DELAY);
      expect(rec.delay.chosenSeconds).toBe(86_400);
      expect(calls.some((s) => s.circuit === 'finalizeRecovery')).toBe(false);
    });
  });
}

describe('the two v2 runs', () => {
  const pre = RECORDS['preprod-v2'].rec;
  const local = RECORDS['local-v2'].rec;

  it('the Preprod record is the one the README cites: its contract, deploy, key insert and freeze', () => {
    const c = pre.contracts.lantern2;
    expect(pre.explorer).toBe('https://preprod.midnightexplorer.com');
    expect([c.address, c.blockHeight, c.verifierKeysInsertedBy[0].blockHeight, c.maintenanceAuthority.frozenBy.blockHeight])
      .toEqual([PREPROD.address, PREPROD.deploy, PREPROD.insert, PREPROD.freeze]);
  });

  it('on Preprod and on the local chain, the same steps had the same outcomes', () => {
    const outcomes = (r) => r.steps.map((s) => [s.id, s.circuit, s.outcome, s.message ?? null]);
    expect(outcomes(pre)).toEqual(outcomes(local));
    expect(pre.contracts.lantern2.address).not.toBe(local.contracts.lantern2.address);
  });
});
