// Node error 171 is the ledger's OutOfDustValidityWindow: a DUST spend's creation time must lie
// between tblock minus the grace period and tblock. The wallet SDK (wallet-sdk-dust-wallet 1.x)
// stamps a spend with the newest indexed block's time and offers no way to set it. When the node
// the RPC reaches validates against an earlier time than that, a fresh spend looks as if it comes
// from the future and is refused (1010: Invalid Transaction: Custom error: 171). The same bytes
// are valid a block or two later, so they are resubmitted. A spend refused for being too old
// fails every attempt, and the last error is thrown.
export const OUT_OF_DUST_WINDOW = /\bCustom error: 171\b/;

export async function retryOutOfDustWindow(submitOnce, {
  attempts = 10,
  waitMs = 12_000, // two Preprod blocks
  onRetry = () => {},
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await submitOnce();
    } catch (e) {
      if (attempt >= attempts || !OUT_OF_DUST_WINDOW.test(String(e?.message ?? e))) throw e;
      onRetry(attempt, attempts);
      await sleep(waitMs);
    }
  }
}
