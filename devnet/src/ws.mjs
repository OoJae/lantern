// Import this FIRST. On a public network (LANTERN_NETWORK set, and not 'undeployed') the node
// client (@polkadot/x-ws) must use the `ws` package: it captures globalThis.WebSocket when it
// is loaded, and on Node >= 22 that is the built-in WebSocket, which the author's earlier
// OnePledge project found drops RPC submissions on Preprod. ESM evaluates imports in order, so
// this module must run before anything that loads the wallet SDK; assigning later is too late.
// A local run is left as it was before the Preprod work. This reads the environment directly
// because it runs before config.mjs.
import { WebSocket } from 'ws';

if ((process.env.LANTERN_NETWORK || 'undeployed') !== 'undeployed') globalThis.WebSocket = WebSocket;
