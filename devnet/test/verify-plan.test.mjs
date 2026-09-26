// devnet:verify reads each ledger in the block of the record's last transaction on it. A step whose
// finalization was not reported in time is recorded with a note and no block; if it is the
// contract's last, the read must not land on the step before it (which would fail a genuine record).
// Checked on the committed Preprod record, altered in memory only.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lastBlock, unidentifiedSteps, unrecordedLastStep } from '../src/verify-plan.mjs';

const record = JSON.parse(readFileSync(new URL('../../deployments/preprod.json', import.meta.url), 'utf8'));
const NOTE = { note: 'finalization not reported within 180 s; the ledger shows the change' };
const lastOn = (r, key) => r.steps.filter((s) => (s.contract ?? 'lantern') === key && s.outcome === 'accepted').at(-1);
/** The record with `key`'s last accepted step recorded as the executor's timeout path does. */
function timedOut(key) {
  const r = structuredClone(record);
  lastOn(r, key).tx = { ...NOTE };
  return r;
}

describe('devnet:verify: where each ledger is read', () => {
  it('reads the committed record at the block of its last transaction on each contract', () => {
    for (const [key, meta] of Object.entries(record.contracts)) {
      assert.equal(lastBlock(record, key, meta), lastOn(record, key).tx.blockHeight, key);
      assert.equal(unrecordedLastStep(record, key), null, key);
    }
    assert.deepEqual(unidentifiedSteps(record), []);
  });

  it('knows when the last step\'s block was not recorded, rather than reading the block before it', () => {
    for (const [key, meta] of Object.entries(record.contracts)) {
      const r = timedOut(key);
      const step = lastOn(r, key);
      assert.equal(unrecordedLastStep(r, key), step, key);
      assert.ok(lastBlock(r, key, meta) < lastOn(record, key).tx.blockHeight, 'the recorded blocks alone end earlier');
      assert.deepEqual(unidentifiedSteps(r).map((s) => s.id), [step.id]);
    }
  });

  it('still reads at a block when a later step on the same contract has one', () => {
    const r = structuredClone(record);
    const mine = r.steps.filter((s) => (s.contract ?? 'lantern') === 'lantern' && s.outcome === 'accepted');
    mine.at(-2).tx = { ...NOTE };
    assert.equal(unrecordedLastStep(r, 'lantern'), null);
    assert.equal(lastBlock(r, 'lantern', r.contracts.lantern), mine.at(-1).tx.blockHeight);
  });

  it('is what verify.mjs uses', () => {
    const src = readFileSync(new URL('../src/verify.mjs', import.meta.url), 'utf8');
    assert.match(src, /const blind = unrecordedLastStep\(record, key\);/);
    assert.match(src, /const then = blind \? state : await pdp\.queryContractState\(meta\.address, \{ type: 'blockHeight', blockHeight: at \}\);/);
    assert.doesNotMatch(src, /const lastBlock = /);
  });
});
