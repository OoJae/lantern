// How the story's executor (devnet/src/executor.mjs) records a call, checked without a chain: a call
// whose finalization was not reported within its timeout, but whose transaction was then found, is
// recorded as a reported one is (who paid, the sponsor's evidence, the timing flags), so a record
// holding one still passes test/record.test.js and still counts in devnet:verify.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordCall } from '../src/call-record.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../../deployments/${f}`, import.meta.url), 'utf8'));
const NOTE = 'finalization not reported within 180 s; the ledger shows the change';
const SPONSOR = 'the sponsor (the device holds no wallet)';
const TX = { txId: 'ab'.repeat(32), txHash: 'cd'.repeat(32), blockHeight: 1234, status: 'SucceedEntirely' };
const EVIDENCE = { circuit: 'finalizeRecovery', deviceWallet: 'none', fee: '1', userIntentDustSpends: 0, sponsorDustSpends: 1 };
const TIMINGS = { execute: 1, prove: 2, balance: 3, submit: 4, finalize: 180, total: 190 };
const without = (s, ...keys) => Object.fromEntries(Object.entries(s).filter(([k]) => !keys.includes(k)));

// test/record.test.js's rules on a Preprod record, as it states them.
function recordRules(P, L) {
  const paid = P.steps.filter((s) => s.tx?.txId);
  for (const s of P.steps.filter((x) => x.kind === 'call' && x.outcome === 'accepted')) {
    assert.equal(s.tx?.status, 'SucceedEntirely', s.id);
    assert.match(s.tx.txId, /^[0-9a-f]+$/, s.id);
    assert.ok(s.tx.blockHeight > 0, s.id);
  }
  for (const s of paid) {
    const payer = s.sponsorship ? SPONSOR : s.id === '3.2' ? "Seo-yeon's own wallet" : 'the operator wallet';
    assert.equal(s.payer, payer, s.id);
  }
  const shape = (r) => r.steps.map((s) => [s.id, s.kind, s.actor, s.circuit, s.outcome, s.message, Boolean(s.sponsorship)]);
  assert.deepEqual(shape(P), shape(L));
  assert.deepEqual(paid.filter((s) => s.sponsorship).map((s) => s.sponsorship.circuit), paid.filter((s) => s.sponsorship).map((s) => s.circuit));
}

describe('the executor: how a call is recorded', () => {
  it('records a reported call: its transaction, who paid, the sponsor\'s evidence, and the timing flags', () => {
    const rec = {};
    recordCall(rec, { tx: TX, payer: SPONSOR, evidence: EVIDENCE, timings: TIMINGS, circuit: 'finalizeRecovery', proved: new Set() });
    assert.deepEqual(rec, { tx: TX, payer: SPONSOR, sponsorship: EVIDENCE, timings: { ...TIMINGS, cold: true, firstOfCircuit: true } });
  });

  it('records a timed-out call whose transaction was found as it records a reported one, with the note', () => {
    const reported = {};
    const timedOut = {};
    recordCall(reported, { tx: TX, payer: SPONSOR, evidence: EVIDENCE, timings: TIMINGS, circuit: 'finalizeRecovery', proved: new Set() });
    recordCall(timedOut, { tx: TX, note: NOTE, payer: SPONSOR, evidence: EVIDENCE, timings: TIMINGS, circuit: 'finalizeRecovery', proved: new Set() });
    assert.deepEqual(timedOut, { ...reported, tx: { ...TX, note: NOTE } });
    // An operator-paid one says so too.
    const op = {};
    recordCall(op, { tx: TX, note: NOTE, payer: 'the operator wallet', timings: TIMINGS, circuit: 'enrollIdentity', proved: new Set() });
    assert.deepEqual([op.payer, 'sponsorship' in op], ['the operator wallet', false]);
  });

  it('records a timed-out call whose transaction was not found with its note and payer, and no transaction id', () => {
    const rec = {};
    recordCall(rec, { tx: null, note: NOTE, payer: 'the operator wallet', timings: TIMINGS, circuit: 'enrollIdentity', proved: new Set() });
    assert.deepEqual([rec.tx, rec.payer], [{ note: NOTE }, 'the operator wallet']);
  });

  it('marks the run\'s first call cold and each circuit\'s first call, on either path', () => {
    const proved = new Set();
    const flags = [];
    for (const [circuit, note] of [['enrollIdentity', null], ['openRecovery', NOTE], ['openRecovery', null], ['enrollIdentity', NOTE]]) {
      const rec = {};
      recordCall(rec, { tx: TX, note, payer: 'the operator wallet', timings: TIMINGS, circuit, proved });
      flags.push([rec.timings.cold, rec.timings.firstOfCircuit]);
    }
    assert.deepEqual(flags, [[true, true], [false, true], [false, false], [false, false]]);
  });

  it('stops the story on a transaction that did not succeed entirely, found after a timeout or reported', () => {
    for (const note of [null, NOTE]) {
      assert.throws(() => recordCall({}, { tx: { ...TX, status: 'SucceedPartially' }, note, payer: 'x', timings: TIMINGS, circuit: 'c', proved: new Set() }),
        /ended SucceedPartially/);
    }
  });

  it('keeps a Preprod record passing its tests when a call, sponsored or not, timed out and was then found', () => {
    const P = load('preprod.json');
    const L = load('local-devnet.json');
    recordRules(P, L); // as committed
    const paid = P.steps.filter((s) => s.tx?.txId);
    const sponsored = paid.find((s) => s.sponsorship);
    const operator = paid.find((s) => !s.sponsorship && s.id !== '3.2');
    assert.ok(sponsored && operator);
    for (const step of [sponsored, operator]) {
      // The step as the timeout branch writes it: the found transaction, the note, and what it knew of who paid.
      const rec = without(step, 'tx', 'payer', 'sponsorship', 'timings');
      recordCall(rec, {
        tx: without(step.tx, 'note'), note: NOTE, payer: step.payer, evidence: step.sponsorship ?? null,
        timings: without(step.timings, 'cold', 'firstOfCircuit'), circuit: step.circuit, proved: new Set(),
      });
      recordRules({ ...P, steps: P.steps.map((s) => (s === step ? rec : s)) }, L);
    }
  });

  it('is how executor.mjs records every call it makes, on both paths', () => {
    const src = readFileSync(new URL('../src/executor.mjs', import.meta.url), 'utf8');
    assert.match(src, /recordCall\(rec, \{ tx: found \? txOf\(found\) : null, note, payer, evidence, timings: phases\(timing\), circuit, proved \}\);\n\s*return null;/);
    assert.match(src, /recordCall\(rec, \{ tx: txOf\(r\.public\), payer, evidence, timings: phases\(timing\), circuit, proved \}\);/);
    assert.doesNotMatch(src, /rec\.(tx|payer|sponsorship|timings) =/, 'no other path writes the record');
  });
});
