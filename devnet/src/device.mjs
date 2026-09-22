// A device with NO wallet: the recovering phone, or the veto card typed into it.
//
// By definition the phone that recovers an identity has lost everything, so it holds no
// NIGHT and no DUST and could not pay a fee if it wanted to. It proves locally, binds, and
// hands the bound transaction to a sponsor. Its zswap keys are throwaway: never synced,
// never funded, used only because a transaction needs a coin key to be well formed.
import * as L from '@midnight-ntwrk/ledger-v8';

export function walletlessDevice(sponsor, onEvidence = () => {}) {
  const keys = L.ZswapSecretKeys.fromSeed(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  let pending = null;
  const provider = {
    getCoinPublicKey: () => keys.coinPublicKey,
    getEncryptionPublicKey: () => keys.encryptionPublicKey,
    async balanceTx(tx) {
      const hex = Buffer.from(tx.bind().serialize()).toString('hex');
      pending = await sponsor.sponsor(hex);
      onEvidence(pending.evidence);
      return pending.merged;
    },
    // The sponsor already submitted the merged transaction. Anyone could have: it is bound.
    async submitTx(tx) {
      if (!pending || !tx.identifiers().includes(pending.txId)) throw new Error('the sponsor submitted a different transaction');
      const id = pending.txId;
      pending = null;
      return id;
    },
  };
  return { walletProvider: provider, midnightProvider: provider };
}
