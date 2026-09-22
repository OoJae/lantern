// The sponsor's policy, on transaction-shaped objects: no chain needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPolicy, SPONSORED_CIRCUITS } from '../src/policy.mjs';

const LANTERN = 'aa'.repeat(32);
const call = (entryPoint, address = LANTERN) => ({ address, entryPoint: new TextEncoder().encode(entryPoint), communicationCommitment: 'c' });
const txOf = ({ actions = [call('finalizeRecovery')], intents = 1, dust = undefined, offer = undefined, unshielded = undefined } = {}) => ({
  rewards: undefined, guaranteedOffer: offer, fallibleOffer: undefined,
  intents: new Map(Array.from({ length: intents }, (_, i) => [i + 1,
    { actions, dustActions: dust, guaranteedUnshieldedOffer: unshielded, fallibleUnshieldedOffer: undefined }])),
});
const opts = { addresses: [LANTERN], fee: 10n, maxFee: 100n };

test('pays for one call into an owner-secret circuit of a served contract', () => {
  for (const c of SPONSORED_CIRCUITS) {
    const v = checkPolicy(txOf({ actions: [call(c)] }), opts);
    assert.equal(v.ok, true, c);
    assert.deepEqual(v.call, { address: LANTERN, entryPoint: c });
  }
});

test('never pays for an open: that would make the liveness oracle free', () => {
  const v = checkPolicy(txOf({ actions: [call('openRecovery')] }), opts);
  assert.equal(v.ok, false);
  assert.match(v.reasons.join(), /openRecovery is not a sponsored circuit/);
});

test('refuses anything but exactly one call, to a served contract, within the fee cap', () => {
  const cases = [
    [txOf({ intents: 2 }), /2 intents/],
    [txOf({ actions: [call('finalizeRecovery'), call('vetoRecovery')] }), /2 actions/],
    [txOf({ actions: [{ address: LANTERN }] }), /not a contract call/],
    [txOf({ actions: [call('finalizeRecovery', 'bb'.repeat(32))] }), /does not serve/],
    [txOf({ dust: { spends: [1], registrations: [] } }), /already moves DUST/],
    [txOf({ offer: {} }), /shielded offer/],
    [txOf({ unshielded: {} }), /unshielded offer/],
  ];
  for (const [tx, why] of cases) {
    const v = checkPolicy(tx, opts);
    assert.equal(v.ok, false);
    assert.match(v.reasons.join('; '), why);
  }
  assert.match(checkPolicy(txOf(), { ...opts, fee: 101n }).reasons.join(), /exceeds the cap/);
});
