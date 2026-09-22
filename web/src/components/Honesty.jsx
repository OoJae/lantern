// The first thing on every page that runs circuits. It says exactly what this page is and is not.
export function Honesty() {
  return (
    <aside className="honesty" aria-label="What this page is">
      <p>
        <strong>Runs in your browser.</strong> Lantern’s real compiled circuits against an in-memory ledger:
        no wallet, no chain, no proofs. Every accept and every refusal is the contract’s own logic.
        Once it has loaded, this page makes no network requests — check DevTools, or build it yourself.
      </p>
      <p className="meta">Real proofs and real transactions on a local chain: <code>npm run devnet</code>.</p>
    </aside>
  );
}
