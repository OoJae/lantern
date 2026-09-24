// The core recovery, without the independent host's thread: the steps a
// `npm run devnet -- --quick` run takes. 7.1 is off the ledger (Jihoon rebuilds
// the secret), and beat 9 needs it: it is the old secret the DApp must refuse.
// Side-effect free, so the offline record test can use the same filter.
export const isQuickStep = (s) =>
  !s.host && (([0, 1, 2, 3, 4, 8, 9].includes(s.beat) && !['0.6', '0.7'].includes(s.id)) || s.id === '7.1');
