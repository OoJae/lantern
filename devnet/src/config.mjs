// The local chain's endpoints. Lantern's devnet runs only against network id
// 'undeployed' -- never a public network. Values mirror midnightntwrk/example-zkloan.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

// fileURLToPath decodes %20; URL.pathname would not.
export const devnetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(devnetRoot, '..');
export const buildDir = path.join(devnetRoot, 'build');
export const stateDir = path.join(devnetRoot, '.state');

const port = (name, dflt) => process.env[name] ?? dflt;

export const network = Object.freeze({
  name: 'undeployed',
  networkId: 'undeployed',
  indexer: `http://127.0.0.1:${port('LANTERN_INDEXER_PORT', 8088)}/api/v4/graphql`,
  indexerWS: `ws://127.0.0.1:${port('LANTERN_INDEXER_PORT', 8088)}/api/v4/graphql/ws`,
  node: `http://127.0.0.1:${port('LANTERN_NODE_PORT', 9944)}`,
  proofServer: `http://127.0.0.1:${port('LANTERN_PROOF_SERVER_PORT', 6300)}`,
});

setNetworkId(network.networkId);

/** JSON-RPC to the node, for the few facts midnight-js does not expose (block time). */
export async function nodeRpc(method, params = []) {
  const res = await fetch(network.node, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}
