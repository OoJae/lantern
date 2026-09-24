// Freezing a deployment's maintenance authority (spike S5, docs/spikes.md).
//
// deployContract installs the deployer's key as a 1-of-1 maintenance authority, which could
// replace any verifier key: that is, change the contract's rules. One maintenance update
// replaces it with an empty committee and threshold 1, which no set of signatures can ever
// satisfy, so the deployed rules can never change.
import { submitTx } from '@midnight-ntwrk/midnight-js-contracts';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as L from '@midnight-ntwrk/ledger-v8';

/** A transaction's public identifiers, from a midnight-js FinalizedTxData. */
export const txOf = (pub) => ({ txId: pub.txId, txHash: pub.txHash, blockHeight: pub.blockHeight, status: pub.status });

/** Freeze `address`'s maintenance authority with the deployer's signing key; returns what the chain then holds. */
export async function freezeMaintenanceAuthority(providers, address, name = address) {
  const state = await providers.publicDataProvider.queryContractState(address);
  const signingKey = await providers.privateStateProvider.getSigningKey(address);
  const frozen = new L.ContractMaintenanceAuthority([], 1, state.maintenanceAuthority.counter + 1n);
  const update = new L.MaintenanceUpdate(address, [new L.ReplaceAuthority(frozen)], state.maintenanceAuthority.counter);
  const signed = update.addSignature(0n, L.signData(signingKey, update.dataToSign));
  const freezeTx = L.Transaction.fromParts(getNetworkId(), undefined, undefined,
    L.Intent.new(new Date(Date.now() + 3600_000)).addMaintenanceUpdate(signed));
  const fr = await submitTx(providers, { unprovenTx: freezeTx });
  if (fr.status !== 'SucceedEntirely') throw new Error(`freezing ${name}'s maintenance authority failed: ${fr.status}`);
  const after = (await providers.publicDataProvider.queryContractState(address)).maintenanceAuthority;
  return { committee: after.committee.length, threshold: after.threshold, counter: Number(after.counter), frozenBy: txOf(fr) };
}
