// The few facts about the chain that midnight-js does not surface: block time and height.
import { nodeRpc } from './config.mjs';

// twox128("Timestamp") ++ twox128("Now"): the timestamp pallet's storage key.
const TIMESTAMP_NOW = '0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb';

/** The latest block's timestamp, in seconds. */
export async function tipTime() {
  const raw = await nodeRpc('state_getStorage', [TIMESTAMP_NOW]);
  return Math.floor(Number(Buffer.from(raw.slice(2), 'hex').readBigUInt64LE(0)) / 1000);
}

export async function tipHeight() {
  return parseInt((await nodeRpc('chain_getHeader')).number, 16);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until the chain's block time reaches `target` (seconds). Returns seconds waited. */
export async function waitForChainTime(target, onTick = () => {}) {
  const t0 = Date.now();
  for (;;) {
    const now = await tipTime();
    if (now >= target) return Math.round((Date.now() - t0) / 1000);
    onTick(target - now);
    await sleep(Math.min(15_000, Math.max(2_000, (target - now) * 250)));
  }
}
