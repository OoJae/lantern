// A fee sponsor: a funded wallet that pays DUST for someone else's transaction.
//
// The device proves and binds its own transaction and hands over the hex. Binding fixes
// every contract call, so the sponsor can add a fee-paying intent but cannot change what the
// device's call does -- and nothing in Lantern trusts the fee payer (test/authentication.test.js).
// The policy decides only whether the sponsor is willing to pay.
import * as L from '@midnight-ntwrk/ledger-v8';
import { checkPolicy } from './policy.mjs';

const spendsIn = (tx) => [...(tx.intents?.values() ?? [])]
  .reduce((n, i) => n + (i.dustActions?.spends.length ?? 0), 0);

export function createSponsor({ wallet, addresses, maxFee = 10n ** 16n, log = () => {} }) {
  const params = L.LedgerParameters.initialParameters();
  return {
    /** Check, balance with DUST only, sign, finalize, submit. Returns the merged tx and evidence. */
    async sponsor(hex) {
      const tx = L.Transaction.deserialize('signature', 'proof', 'binding', Buffer.from(hex, 'hex'));
      const verdict = checkPolicy(tx, { addresses, fee: tx.fees(params), maxFee });
      if (!verdict.ok) throw new Error(`the sponsor refused to pay: ${verdict.reasons.join('; ')}`);
      const t0 = Date.now();
      const recipe = await wallet.wallet.balanceFinalizedTransaction(tx,
        { shieldedSecretKeys: wallet.shieldedSecretKeys, dustSecretKey: wallet.dustSecretKey },
        { ttl: new Date(Date.now() + 30 * 60 * 1000), tokenKindsToBalance: ['dust'] });
      const signed = await wallet.wallet.signRecipe(recipe, (d) => wallet.unshieldedKeystore.signData(d));
      const merged = await wallet.wallet.finalizeRecipe(signed);
      const t1 = Date.now();
      const txId = await wallet.wallet.submitTransaction(merged);
      const t2 = Date.now();
      const evidence = {
        circuit: verdict.call.entryPoint,
        deviceWallet: 'none',
        fee: verdict.fee.toString(),
        userIntentDustSpends: spendsIn(tx),
        sponsorDustSpends: spendsIn(merged) - spendsIn(tx),
        sponsorBalanceSeconds: Math.round((t1 - t0) / 100) / 10,
        sponsorSubmitSeconds: Math.round((t2 - t1) / 100) / 10,
      };
      log(`    sponsor paid for ${evidence.circuit}: fee ${evidence.fee}, its own intent spent ${evidence.sponsorDustSpends} DUST output(s), the device's spent ${evidence.userIntentDustSpends}`);
      return { merged, txId, evidence };
    },
  };
}
