// The few facts about the chain that midnight-js does not surface: block time and height.
// Each is a read, so a failed answer is asked again (rpc.mjs): one bad reply from a public node
// must not end a run that has waited hours for a timelock.
import { nodeRpc } from './config.mjs';
import { retrying, timestampSeconds, waitUntil } from './rpc.mjs';

// twox128("Timestamp") ++ twox128("Now"): the timestamp pallet's storage key.
const TIMESTAMP_NOW = '0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb';

const readTipTime = async () => timestampSeconds(await nodeRpc('state_getStorage', [TIMESTAMP_NOW]));

/** The latest block's timestamp, in seconds. */
export const tipTime = () => retrying(readTipTime);

export const tipHeight = () => retrying(async () => parseInt((await nodeRpc('chain_getHeader')).number, 16));

/** Wait until the chain's block time reaches `target` (seconds). Returns seconds waited. */
export const waitForChainTime = (target, onTick = () => {}) => waitUntil(readTipTime, target, { onTick });
