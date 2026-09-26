// Deploying a contract whose verifier keys do not fit one transaction: Lantern v2.
//
// A deploy carries every circuit's verifier key. v2 has 13, and its deploy writes about 36 kB:
// 72% of a block's bytesWritten limit under the ledger's initial parameters, and the node refuses
// it once balanced ("1010: Invalid Transaction: Transaction would exhaust the block limits"; v1's
// ten keys, at 55%, pass). So the deploy carries as many keys as fit a budget, and one or more
// maintenance updates, signed by the deployer's key like the freeze (freeze.mjs), insert the
// rest: each the compiled key, byte for byte. Only then is the maintenance authority frozen, so
// once any circuit can be called the contract's rules are already fixed, and verify-v2.mjs checks
// every key on chain against a fresh compile. The deployed contract is the one a single deploy
// would have made; only how its keys arrived differs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as L from '@midnight-ntwrk/ledger-v8';
import { createUnprovenDeployTx, submitTx } from '@midnight-ntwrk/midnight-js-contracts';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { txOf } from './freeze.mjs';
import { planDeploy } from './deploy-plan.mjs';

/** The share of a block, in its fullest dimension, a single transaction here may use: v1's deploy used 0.545. */
export const BLOCK_BUDGET = 0.5;

const ttl = () => new Date(Date.now() + 3600_000);

/** The largest share of a block `tx` uses, in any dimension, under the ledger's initial parameters; Infinity if it cannot fit. */
export function blockShare(tx, params = L.LedgerParameters.initialParameters()) {
  try {
    return Math.max(...Object.values(params.normalizeFullness(tx.cost(params))).map(Number));
  } catch {
    return Infinity;
  }
}

const deployTx = (full, ops) => {
  const st = new L.ContractState();
  st.data = full.data;
  st.maintenanceAuthority = full.maintenanceAuthority;
  for (const op of ops) st.setOperation(op, full.operation(op));
  const deploy = new L.ContractDeploy(st);
  return { deploy, tx: L.Transaction.fromParts(getNetworkId(), undefined, undefined, L.Intent.new(ttl()).addDeploy(deploy)) };
};

const insertTx = (address, ops, keyOf, counter, signingKey) => {
  const inserts = ops.map((op) => new L.VerifierKeyInsert(op, new L.ContractOperationVersionedVerifierKey('v3', keyOf(op))));
  const update = new L.MaintenanceUpdate(address, inserts, counter);
  const signed = update.addSignature(0n, L.signData(signingKey, update.dataToSign));
  return L.Transaction.fromParts(getNetworkId(), undefined, undefined, L.Intent.new(ttl()).addMaintenanceUpdate(signed));
};

/**
 * Deploy `compiledContract` in parts: a deploy under BLOCK_BUDGET, then the remaining verifier
 * keys (read from `zk`/keys) in maintenance updates under the same budget. Stores the initial
 * private state under `privateStateId` and the deployer's signing key, as midnight-js's
 * deployContract does, so freeze.mjs and findDeployedContract work on it afterwards.
 * Returns { address, deploy, operationsAtDeploy, inserts: [{ operations, ...tx }] }.
 */
export async function deployInParts(providers, { compiledContract, privateStateId, initialPrivateState, args = [], zk, log = () => {}, budget = BLOCK_BUDGET }) {
  const data = await createUnprovenDeployTx(providers, { compiledContract, privateStateId, initialPrivateState, args });
  if (data.private.unprovenTx.guaranteedOffer || data.private.unprovenTx.fallibleOffer?.size) {
    throw new Error('deployInParts: this constructor makes coins, which a deploy rebuilt from its state would drop');
  }
  const full = L.ContractState.deserialize(data.public.initialContractState.serialize());
  const ops = full.operations().map(String).sort();
  const keyOf = (op) => readFileSync(path.join(zk, 'keys', `${op}.verifier`));
  // Every key read from the build must be the one the constructor's state holds.
  for (const op of ops) {
    if (Buffer.compare(Buffer.from(keyOf(op)), Buffer.from(full.operation(op).verifierKey)) !== 0) throw new Error(`deployInParts: ${op}'s key differs from ${zk}`);
  }
  const probe = L.sampleSigningKey();
  const { inDeploy, batches } = planDeploy(ops, {
    deployCost: (subset) => blockShare(deployTx(full, subset).tx),
    insertCost: (subset) => blockShare(insertTx(deployTx(full, []).deploy.address, subset, keyOf, 0n, probe)),
    budget,
  });

  const { deploy, tx } = deployTx(full, inDeploy);
  const fin = await submitTx(providers, { unprovenTx: tx });
  if (fin.status !== 'SucceedEntirely') throw new Error(`the deploy failed: ${fin.status}`);
  const address = deploy.address;
  providers.privateStateProvider.setContractAddress(address);
  await providers.privateStateProvider.set(privateStateId, data.private.initialPrivateState);
  await providers.privateStateProvider.setSigningKey(address, data.private.signingKey);
  log(`deployed at ${address} (block ${fin.blockHeight}) with ${inDeploy.length} of ${ops.length} verifier keys`);

  const inserts = [];
  for (const batch of batches) {
    const state = await providers.publicDataProvider.queryContractState(address);
    const fr = await submitTx(providers, { unprovenTx: insertTx(address, batch, keyOf, state.maintenanceAuthority.counter, data.private.signingKey) });
    if (fr.status !== 'SucceedEntirely') throw new Error(`inserting ${batch.join(', ')} failed: ${fr.status}`);
    inserts.push({ operations: batch, ...txOf(fr) });
    log(`inserted ${batch.length} more verifier key${batch.length === 1 ? '' : 's'} (block ${fr.blockHeight}): ${batch.join(', ')}`);
  }
  return { address, deploy: txOf(fin), operationsAtDeploy: inDeploy, inserts };
}
