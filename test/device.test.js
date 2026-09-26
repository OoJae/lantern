// devnet/src/device.mjs: the recovering phone holds no wallet. It hands each bound transaction to the
// sponsor, and "submits" only the transaction the sponsor merged and sent, never another one.
import { describe, it, expect } from 'vitest';
import { walletlessDevice } from '../devnet/src/device.mjs';

const bytes = (...xs) => Uint8Array.from(xs);
/** A proved, unbound transaction as the device sees it: binding gives the bytes the sponsor receives. */
const unbound = (b) => ({ bind: () => ({ serialize: () => b }) });
/** A sponsor that records what it was sent and answers with its merged, submitted transaction. */
function fakeSponsor(txId = 'tx-merged') {
  const sent = [];
  const merged = { identifiers: () => [txId, 'tx-other-part'] };
  return { sent, merged, txId, sponsor: async (hex) => { sent.push(hex); return { merged, txId, evidence: { hex } }; } };
}

describe('walletlessDevice', () => {
  it('has throwaway coin keys of its own, fresh for every device', () => {
    const a = walletlessDevice(fakeSponsor()).walletProvider;
    const b = walletlessDevice(fakeSponsor()).walletProvider;
    expect(a.getCoinPublicKey()).toBeTruthy();
    expect(a.getEncryptionPublicKey()).toBeTruthy();
    expect(a.getCoinPublicKey()).not.toEqual(b.getCoinPublicKey());
    expect(a.getEncryptionPublicKey()).not.toEqual(b.getEncryptionPublicKey());
  });

  it('pays nothing itself: it sends the bound transaction to the sponsor and reports the evidence', async () => {
    const sponsor = fakeSponsor();
    const evidence = [];
    const { walletProvider, midnightProvider } = walletlessDevice(sponsor, (e) => evidence.push(e));
    expect(midnightProvider).toBe(walletProvider);
    const out = await walletProvider.balanceTx(unbound(bytes(0xde, 0xad, 0x01)));
    expect(sponsor.sent).toEqual(['dead01']);
    expect(evidence).toEqual([{ hex: 'dead01' }]);
    expect(out).toBe(sponsor.merged);
  });

  it('confirms only the transaction the sponsor submitted, and only once', async () => {
    const sponsor = fakeSponsor('tx-1');
    const { walletProvider: w } = walletlessDevice(sponsor);
    await expect(w.submitTx(sponsor.merged)).rejects.toThrow(/different transaction/);
    await w.balanceTx(unbound(bytes(1)));
    await expect(w.submitTx({ identifiers: () => ['tx-2'] })).rejects.toThrow(/different transaction/);
    await expect(w.submitTx(sponsor.merged)).resolves.toBe('tx-1');
    await expect(w.submitTx(sponsor.merged)).rejects.toThrow(/different transaction/);
  });
});
