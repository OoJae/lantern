// A headless wallet for the chain runner: the local chain by default, or Preprod with
// LANTERN_NETWORK=preprod. Adapted from the author's earlier OnePledge CLI wallet (itself after
// midnightntwrk/example-zkloan, Apache-2.0). A local run is one-shot and never uses a snapshot.
// On a public network a fresh wallet must replay the chain's whole history before it can pay,
// so saveSnapshot() keeps its synced state (owner-only, in devnet/.state) and the next run
// resumes from it; a snapshot saved for a different wallet is ignored.
import './ws.mjs'; // before the wallet SDK: see ws.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  HDWallet, Roles, WalletFacade, ShieldedWallet, DustWallet, UnshieldedWallet,
  createKeystore, InMemoryTransactionHistoryStorage, WalletEntrySchema,
  PublicKey as UnshieldedPublicKey,
} from '@midnight-ntwrk/wallet-sdk';
import { network, isPublic } from './config.mjs';
import { persistentSubmissionService } from './submission.mjs';

// The indexer client uses the global WebSocket. Node >= 22 ships a native one; OnePledge
// found it drops RPC submissions on Preprod, so the ws package is installed explicitly.
// (On a public network ws.mjs has already set it, earlier, for the node client too.)
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

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Which wallet a snapshot belongs to: a hash of its unshielded address. */
const addressHashOf = (keys) => sha256(keys.unshieldedKeystore.getBech32Address().asString());

/** A snapshot saved before snapshots named their wallet still carries the address in its unshielded state. */
const snapshotAddressHash = (snap) => {
  if (snap.addressSha256) return snap.addressSha256;
  try { return sha256(JSON.parse(snap.unshielded).publicKey.address); } catch { return null; }
};

/**
 * @param seedHex       the wallet's seed. On a public network it is required, and never the
 *                      local chain's genesis seed: each role has its own (devnet/src/wallets.mjs).
 * @param snapshotFile  optional. A fresh wallet on a public network scans the chain's whole
 *                      history before it can pay; a snapshot saved by saveSnapshot() lets a
 *                      later run resume from where that sync ended. Local runs never use one.
 */
export async function startWallet(seedHex = GENESIS_SEED, { snapshotFile } = {}) {
  if (isPublic && (!seedHex || seedHex === GENESIS_SEED)) {
    throw new Error(`${network.networkId}: a wallet here needs its own seed (devnet/src/wallets.mjs), never the local chain's genesis seed`);
  }
  const keys = deriveKeys(seedHex);
  let snap = snapshotFile && existsSync(snapshotFile) ? JSON.parse(readFileSync(snapshotFile, 'utf8')) : null;
  if (snap && snapshotAddressHash(snap) !== addressHashOf(keys)) {
    console.log(`wallet: ignoring ${path.basename(snapshotFile)}: it was saved for a different wallet. Syncing from the start.`);
    snap = null;
  }
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
    shielded: () => (snap ? ShieldedWallet(shieldedConfig).restore(snap.shielded)
      : ShieldedWallet(shieldedConfig).startWithSecretKeys(keys.shieldedSecretKeys)),
    unshielded: () => (snap ? UnshieldedWallet(unshieldedConfig).restore(snap.unshielded)
      : UnshieldedWallet(unshieldedConfig).startWithPublicKey(UnshieldedPublicKey.fromKeyStore(keys.unshieldedKeystore))),
    dust: () => (snap ? DustWallet(dustConfig).restore(snap.dust)
      : DustWallet(dustConfig).startWithSecretKey(keys.dustSecretKey, dustParams)),
    // On a public network, submit over one persistent node connection (see submission.mjs).
    ...(isPublic ? { submissionService: () => persistentSubmissionService(relayURL) } : {}),
  });
  await wallet.start(keys.shieldedSecretKeys, keys.dustSecretKey);
  return { wallet, ...keys };
}

export const unshieldedAddress = (ctx) => ctx.unshieldedKeystore.getBech32Address().asString();

/**
 * Save the synced state of all three sub-wallets (owner-only), for startWallet's snapshotFile.
 * Atomic: written to a temporary file, then renamed, so an interrupted save never leaves a
 * half-written snapshot. It names its wallet by a hash of the unshielded address.
 */
export async function saveSnapshot(ctx, file) {
  const [shielded, unshielded, dust] = await Promise.all([
    ctx.wallet.shielded.serializeState(), ctx.wallet.unshielded.serializeState(), ctx.wallet.dust.serializeState()]);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), addressSha256: addressHashOf(ctx), shielded, unshielded, dust }), { mode: 0o600 });
  renameSync(tmp, file);
}

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
