// The fee sponsor (devnet/src/sponsor.mjs), checked without a chain: its policy runs on the real
// deserialized transaction, and a transaction it refuses never reaches the wallet (no balancing, no
// signature, no submission). policy.test.mjs checks the policy's rules; this checks that sponsor()
// applies them first. The paying path (balance, sign, finalize, submit) needs a proved contract call,
// so only the devnet and Preprod runs cover it.
//
// @midnight-ntwrk/ledger-v8 resolves from devnet/node_modules after `npm ci --prefix devnet`, and
// otherwise from the root's node_modules (the same 8.1.0, a root dependency), so CI's root-only
// install runs this too.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '@midnight-ntwrk/ledger-v8';
import { createSponsor } from '../src/sponsor.mjs';

// A bound transaction with no proofs in it, relabelled as proved so that it deserializes as the
// sponsor reads what a device sends ('signature', 'proof', 'binding'). The relabelling rewrites the
// type marker in ledger 8.1.0's serialization header: if a ledger upgrade breaks it, this fixture
// needs updating, which is not a fault in the sponsor.
const asProved = (tx) => Buffer.from(Buffer.from(tx.bind().serialize()).toString('latin1').replace('proof-preimage', 'proof'), 'latin1').toString('hex');

/** A wallet that records every property read on it, at any depth, and fails any call. */
function recordingWallet() {
  const calls = [];
  const trap = (where) => new Proxy(() => {}, {
    get: (_, k) => { calls.push(`${where}.${String(k)}`); return trap(`${where}.${String(k)}`); },
    apply: () => { calls.push(`${where}()`); throw new Error('the wallet was touched'); },
  });
  return { calls, wallet: trap('wallet') };
}
const SERVED = ['aa'.repeat(32)];
const refuses = async (tx, why) => {
  const { calls, wallet } = recordingWallet();
  await assert.rejects(createSponsor({ wallet, addresses: SERVED }).sponsor(asProved(tx)), why);
  assert.deepEqual(calls, [], 'the wallet was never touched');
};

describe('the sponsor: its policy comes before its wallet', () => {
  it('the fixture deserializes as a device\'s transaction does', () => {
    const tx = L.Transaction.deserialize('signature', 'proof', 'binding', Buffer.from(asProved(L.Transaction.fromParts('undeployed')), 'hex'));
    assert.equal(tx.intents?.size ?? 0, 0);
  });

  it('refuses a transaction with no intent before it touches the wallet', async () => {
    await refuses(L.Transaction.fromParts('undeployed'), /^Error: the sponsor refused to pay: has 0 intents, not 1/);
  });

  it('refuses an intent with no contract call before it touches the wallet', async () => {
    const intent = L.Intent.new(new Date(Date.now() + 60_000));
    await refuses(L.Transaction.fromParts('undeployed', undefined, undefined, intent), /^Error: the sponsor refused to pay: intent has 0 actions, not 1/);
  });

  it('the wallet fixture does record a touch', () => {
    const { calls, wallet } = recordingWallet();
    assert.throws(() => wallet.wallet.balanceFinalizedTransaction(), /touched/);
    assert.deepEqual(calls, ['wallet.wallet', 'wallet.wallet.balanceFinalizedTransaction', 'wallet.wallet.balanceFinalizedTransaction()']);
  });
});
