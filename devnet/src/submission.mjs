// Transaction submission over ONE persistent connection to the node, for public networks.
//
// The wallet SDK's default submission service (wallet-sdk 1.2.0, wallet-sdk-node-client 1.1.3)
// disconnects right after loading the node's metadata and reconnects for each submission. Over
// a public network's latency a submission can start while that first socket is still closing,
// and fails with "disconnected from wss://…: 1000:: Normal Closure" -- every time, on Preprod. A
// local node closes instantly, so the local runs never met it, and they keep the default.
// Same call, same events; one socket.
import { ApiPromise, WsProvider } from '@polkadot/api';

const TIMEOUT_MS = 10 * 60_000;
const CLOSE_MS = 5_000;

/** Settle within `ms` whatever `p` does: close() must never keep the process open. */
const bounded = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise((r) => setTimeout(r, ms).unref())]);

export function persistentSubmissionService(relayURL) {
  let provider = null;
  let apiP = null;
  // A failed connection is not kept: the next submission tries again.
  const api = () => (apiP ??= ApiPromise.create({ provider: (provider = new WsProvider(relayURL.toString())), noInitWarn: true })
    .catch((e) => { apiP = null; throw e; }));
  return {
    async submitTransaction(tx, waitFor = 'InBlock') {
      const bytes = tx.serialize();
      return new Promise((resolve, reject) => {
        let unsub = null;
        let done = false;
        const stop = (u) => { try { u?.(); } catch { /* already closed */ } };
        const finish = (settle, value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          stop(unsub);
          settle(value);
        };
        // The clock starts before the connection: a node that never answers is a timeout too.
        const timer = setTimeout(() => finish(reject, new Error(`no ${waitFor} status from the node after ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS);
        Promise.resolve().then(api).then((node) => {
          if (done) return undefined;
          return node.tx.midnight.sendMnTransaction(`0x${Buffer.from(bytes).toString('hex')}`).send((result) => {
            const s = result.status;
            const base = { tx: bytes, txHash: result.txHash.toString() };
            const height = () => BigInt(result.blockNumber?.toString() ?? '0');
            if (s.isInvalid || s.isDropped || s.isUsurped || s.isFinalityTimeout) finish(reject, new Error(`the node reports the transaction ${s.type}`));
            else if (waitFor === 'Submitted' && (s.isReady || s.isBroadcast || s.isFuture)) finish(resolve, { _tag: 'Submitted', ...base });
            else if (s.isInBlock && waitFor !== 'Finalized') finish(resolve, { _tag: 'InBlock', ...base, blockHash: s.asInBlock.toString(), blockHeight: height() });
            else if (s.isFinalized) finish(resolve, { _tag: 'Finalized', ...base, blockHash: s.asFinalized.toString(), blockHeight: height() });
          });
        }).then((u) => { if (!u) return; unsub = u; if (done) stop(u); }).catch((e) => finish(reject, e));
      });
    },
    async close() {
      const [p, a] = [provider, apiP];
      provider = null;
      apiP = null;
      if (!p) return;
      // Both at once, each bounded: an API that never connected must not hold up the provider.
      await Promise.all([bounded(a.then((x) => x.disconnect()), CLOSE_MS), bounded(p.disconnect(), CLOSE_MS)]);
    },
  };
}
