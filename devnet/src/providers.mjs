// midnight-js providers for the chain runner: the local chain by default, or Preprod with
// LANTERN_NETWORK=preprod. Adapted from the author's earlier OnePledge CLI (after
// midnightntwrk/example-zkloan, Apache-2.0), with one deliberate change: private state lives in
// memory. Nothing in it needs to survive the process (the shipped Preprod run keeps what its
// second sitting needs in devnet/.state itself), and an in-memory store cannot hit
// midnight-js#1234 (the level store silently drops function-valued fields through superjson).
import * as Rx from 'rxjs';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { network } from './config.mjs';

/** PrivateStateProvider held in process memory, scoped per contract address. */
export function inMemoryPrivateStateProvider() {
  let address = null;
  const states = new Map();
  const keys = new Map();
  const scoped = (id) => {
    if (address === null) throw new Error('setContractAddress must be called before private state is used');
    return `${address}:${id}`;
  };
  const unsupported = (what) => async () => { throw new Error(`${what} is not supported by the in-memory store`); };
  return {
    setContractAddress(a) { address = a; },
    async set(id, state) { states.set(scoped(id), state); },
    async get(id) { return states.get(scoped(id)) ?? null; },
    async remove(id) { states.delete(scoped(id)); },
    async clear() { states.clear(); },
    async setSigningKey(a, k) { keys.set(a, k); },
    async getSigningKey(a) { return keys.get(a) ?? null; },
    async removeSigningKey(a) { keys.delete(a); },
    async clearSigningKeys() { keys.clear(); },
    exportPrivateStates: unsupported('exportPrivateStates'),
    importPrivateStates: unsupported('importPrivateStates'),
    exportSigningKeys: unsupported('exportSigningKeys'),
    importSigningKeys: unsupported('importSigningKeys'),
  };
}

/** Wallet + midnight provider: balances with the wallet's own DUST and submits. */
export async function walletProviderFor(ctx) {
  await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey: () => ctx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => ctx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx, ttl) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx) => ctx.wallet.submitTransaction(tx),
  };
}

export function compiledContract(name, ContractClass, witnesses, zkConfigPath) {
  return CompiledContract.make(name, ContractClass).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}

export async function providersFor(ctx, zkConfigPath, privateStateProvider = inMemoryPrivateStateProvider()) {
  const walletProvider = await walletProviderFor(ctx);
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  return {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(network.indexer, network.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(network.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}
