// JSON-RPC to a Midnight node, and patience with it. A public node sits behind a gateway: one
// answer in thousands may be a 502 page, a reset socket or a rate-limit error. A read of the chain
// is asked again; nothing here ever submits. Dependency-free, so devnet/test checks it without a
// chain (config.mjs's nodeRpc and chain.mjs are built on it).

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One JSON-RPC call. Throws, naming the method, on a timeout, a non-2xx answer, a body that is not JSON, or an RPC error. */
export async function jsonRpc(url, method, params = [], { timeoutMs = 30_000 } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  let body;
  try { body = await res.json(); } catch { throw new Error(`${method}: the answer was not JSON`); }
  if (body?.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body?.result;
}

/** The timestamp pallet's `Now` (milliseconds, u64 little-endian), in seconds. */
export function timestampSeconds(raw) {
  if (typeof raw !== 'string' || !/^0x[0-9a-f]{16}$/i.test(raw)) throw new Error(`not a block timestamp: ${String(raw).slice(0, 40)}`);
  return Math.floor(Number(Buffer.from(raw.slice(2), 'hex').readBigUInt64LE(0)) / 1000);
}

/** `read()`, asked again after 5, 10, 15 s when it throws; the last failure is thrown. */
export async function retrying(read, { tries = 4, waitMs = (i) => 5_000 * i, sleep = defaultSleep, say = console.log } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await read();
    } catch (e) {
      if (i >= tries) throw e;
      say(`  the node did not answer (${e.message}); asking again in ${Math.round(waitMs(i) / 1000)} s`);
      await sleep(waitMs(i));
    }
  }
}

/**
 * Wait until `readNow()` (the chain's block time, in seconds) reaches `target`. Returns seconds
 * waited. A failed read is a skipped tick, not the end of the wait; only `maxFails` failures in a
 * row (5 minutes, by default) give up, so a dead endpoint cannot make it wait for ever.
 */
export async function waitUntil(readNow, target, { onTick = () => {}, sleep = defaultSleep, say = console.log, maxFails = 20, retryMs = 15_000, clock = Date.now } = {}) {
  const t0 = clock();
  let fails = 0;
  for (;;) {
    let now;
    try {
      now = await readNow();
      fails = 0;
    } catch (e) {
      if (++fails >= maxFails) throw e;
      say(`  the node did not answer (${e.message}); asking again in ${Math.round(retryMs / 1000)} s`);
      await sleep(retryMs);
      continue;
    }
    if (now >= target) return Math.round((clock() - t0) / 1000);
    onTick(target - now);
    await sleep(Math.min(15_000, Math.max(2_000, (target - now) * 250)));
  }
}
