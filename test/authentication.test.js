// "Nothing in Lantern trusts the fee payer."
//
// Sponsorship is only safe if no circuit authenticates by the wallet that pays
// for the transaction: a sponsor pays for the recovering phone's finalize, and
// must gain nothing by doing so. Every Lantern circuit authenticates by a
// commitment opening (identity, veto, guardian leaf, device key) or a Schnorr
// signature, never by the caller's coin key. This file proves it statically,
// over the contract sources AND the generated modules that actually run.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const SOURCES = readdirSync(join(root, 'contracts/src'))
  .filter((f) => f.endsWith('.compact'))
  .map((f) => ({ f, text: readFileSync(join(root, 'contracts/src', f), 'utf8') }));
const GENERATED = ['contracts/managed/contract/index.js', 'contracts/managed-host/contract/index.js']
  .map((f) => ({ f, text: readFileSync(join(root, f), 'utf8') }));

// Code only: a comment may still name a primitive to explain its absence.
const code = (text) => text.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

// Everything in Compact that identifies, pays or is paid by the caller's wallet.
const WALLET_BOUND = [
  'ownPublicKey', 'kernel.', 'mintShieldedToken', 'mintUnshieldedToken', 'sendShielded',
  'sendImmediateShielded', 'receiveShielded', 'sendUnshielded', 'receiveUnshielded',
  'mergeCoin', 'evolveNonce', 'shieldedBurnAddress', 'unshieldedBalance', 'nativeToken',
  'createZswapInput', 'createZswapOutput', 'ZswapCoinPublicKey', 'CoinInfo', 'QualifiedCoinInfo',
];

describe('nothing trusts the fee payer', () => {
  it('scans every shipped contract source', () => {
    expect(SOURCES.map((s) => s.f).sort())
      .toEqual(['host.compact', 'identity.compact', 'lantern.compact', 'ownergate.compact', 'schnorr.compact']);
  });

  it('no contract source uses a wallet-bound primitive', () => {
    const hits = [];
    for (const { f, text } of SOURCES) {
      for (const w of WALLET_BOUND) if (code(text).includes(w)) hits.push(`${f}: ${w}`);
    }
    expect(hits).toEqual([]);
  });

  it('the scan would catch one (positive control)', () => {
    const planted = 'export circuit bad(): [] { assert(ownPublicKey() == x, "owner"); }';
    expect(WALLET_BOUND.filter((w) => code(planted).includes(w))).toEqual(['ownPublicKey']);
  });

  for (const { f, text } of GENERATED) {
    it(`${f} touches the coin key only in constructor boilerplate`, () => {
      const lines = text.split('\n').filter((l) => /coinPublicKey|ownPublicKey|[Ss]hielded|[Kk]ernel/.test(l));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('constructorContext_0.initialZswapLocalState.coinPublicKey');
    });
  }
});
