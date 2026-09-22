// A headless wallet for the local chain. Adapted from onepledge's CLI wallet (itself after
// midnightntwrk/example-zkloan, Apache-2.0), minus the state snapshots: every devnet run
// is one-shot, so there is nothing to resume and no snapshot to corrupt.
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  HDWallet, Roles, WalletFacade, ShieldedWallet, DustWallet, UnshieldedWallet,
  createKeystore, InMemoryTransactionHistoryStorage, WalletEntrySchema,
  PublicKey as UnshieldedPublicKey,
} from '@midnight-ntwrk/wallet-sdk';
import { network } from './config.mjs';

// The indexer client uses the global WebSocket. Node >= 22 ships a native one; onepledge
// found it drops RPC submissions on Preprod, so the ws package is installed explicitly.
globalThis.WebSocket = WebSocket;

// The dev preset mints all NIGHT to this well-known seed. It exists only on this local chain.
export const GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

export function deriveKeys(seedHex) {
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('Failed to initialise HD wallet');
  const derived = hd.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Failed to derive wallet keys');
  hd.hdWallet.clear();
  return {
    shieldedSecretKeys: ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]),
    dustSecretKey: ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]),
    unshieldedKeystore: createKeystore(derived.keys[Roles.NightExternal], network.networkId),
  };
}

export async function startWallet(seedHex = GENESIS_SEED) {
  const keys = deriveKeys(seedHex);
  const relayURL = new URL(network.node.replace(/^http/, 'ws'));
  const indexerClientConnection = { indexerHttpUrl: network.indexer, indexerWsUrl: network.indexerWS };
  const history = () => new InMemoryTransactionHistoryStorage(WalletEntrySchema);

  const shieldedConfig = {
    networkId: network.networkId, indexerClientConnection,
    provingServerUrl: new URL(network.proofServer), relayURL, txHistoryStorage: history(),
  };
  const unshieldedConfig = { networkId: network.networkId, indexerClientConnection, txHistoryStorage: history() };
  const dustConfig = {
    networkId: network.networkId,
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    indexerClientConnection, provingServerUrl: new URL(network.proofServer), relayURL, txHistoryStorage: history(),
  };
  const dustParams = ledger.LedgerParameters.initialParameters().dust;

  const wallet = await WalletFacade.init({
    configuration: { ...shieldedConfig, ...unshieldedConfig, ...dustConfig },
    shielded: () => ShieldedWallet(shieldedConfig).startWithSecretKeys(keys.shieldedSecretKeys),
    unshielded: () => UnshieldedWallet(unshieldedConfig).startWithPublicKey(UnshieldedPublicKey.fromKeyStore(keys.unshieldedKeystore)),
    dust: () => DustWallet(dustConfig).startWithSecretKey(keys.dustSecretKey, dustParams),
  });
  await wallet.start(keys.shieldedSecretKeys, keys.dustSecretKey);
  return { wallet, ...keys };
}

export const unshieldedAddress = (ctx) => ctx.unshieldedKeystore.getBech32Address().asString();

export const balances = (state) => ({
  night: state.unshielded?.balances[ledger.nativeToken().raw] ?? 0n,
  dust: state.dust?.balance(new Date()) ?? 0n,
});

/** Register any unregistered NIGHT UTXOs so the wallet generates DUST for fees. */
export async function registerNightForDust(ctx) {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const unregistered = state.unshielded?.availableCoins.filter((c) => c.meta.registeredForDustGeneration === false) ?? [];
  if (unregistered.length === 0) return undefined;
  const recipe = await ctx.wallet.registerNightUtxosForDustGeneration(
    unregistered, ctx.unshieldedKeystore.getPublicKey(), (payload) => ctx.unshieldedKeystore.signData(payload));
  return ctx.wallet.submitTransaction(await ctx.wallet.finalizeRecipe(recipe));
}

/** Synced, with DUST to spend: registers NIGHT and waits for DUST when needed. */
export async function readyToPay(ctx, log = () => {}) {
  const state = await ctx.wallet.waitForSyncedState();
  const { night, dust } = balances(state);
  log(`NIGHT=${night} DUST=${dust}`);
  if (dust > 0n) return state;
  if (night === 0n) throw new Error('this wallet holds no NIGHT and no DUST');
  const txId = await registerNightForDust(ctx);
  log(txId ? `registered NIGHT for DUST generation (tx ${txId}); waiting for DUST` : 'waiting for DUST');
  return Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => balances(s).dust > 0n)));
}
