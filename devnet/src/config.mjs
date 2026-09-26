// Where the runner points. The local chain (network id 'undeployed') is the default; the
// public test network Preprod only when LANTERN_NETWORK=preprod is set explicitly. Mainnet is
// deliberately absent. Local values mirror midnightntwrk/example-zkloan; the Preprod values
// are Midnight's published endpoints (docs: guides/networks-and-environments). The proof
// server is always local: it sees every prover's witnesses.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { jsonRpc } from './rpc.mjs';

// fileURLToPath decodes %20; URL.pathname would not.
export const devnetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(devnetRoot, '..');
export const buildDir = path.join(devnetRoot, 'build');
export const stateDir = path.join(devnetRoot, '.state');

const port = (name, dflt) => process.env[name] ?? dflt;

const proofServer = `http://127.0.0.1:${port('LANTERN_PROOF_SERVER_PORT', 6300)}`;

const NETWORKS = {
  undeployed: {
    name: 'undeployed',
    networkId: 'undeployed',
    indexer: `http://127.0.0.1:${port('LANTERN_INDEXER_PORT', 8088)}/api/v4/graphql`,
    indexerWS: `ws://127.0.0.1:${port('LANTERN_INDEXER_PORT', 8088)}/api/v4/graphql/ws`,
    node: `http://127.0.0.1:${port('LANTERN_NODE_PORT', 9944)}`,
    proofServer,
  },
  preprod: {
    name: 'preprod',
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    proofServer,
    explorer: 'https://preprod.midnightexplorer.com',
  },
};

// Unset or empty: the local chain (run.sh treats an empty value the same way).
const chosen = process.env.LANTERN_NETWORK || 'undeployed';
if (!Object.hasOwn(NETWORKS, chosen)) {
  throw new Error(`LANTERN_NETWORK=${chosen}: use 'undeployed' (the default, a local chain) or 'preprod'`);
}
export const network = Object.freeze(NETWORKS[chosen]);
export const isPublic = network.networkId !== 'undeployed';

setNetworkId(network.networkId);

/** JSON-RPC to the node, for the few facts midnight-js does not expose (block time); 30 s timeout. */
export const nodeRpc = (method, params = []) => jsonRpc(network.node, method, params);
