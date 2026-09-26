// Lantern v2's four rules, as its run names them (devnet/src/v2-story.mjs RULES): the headings of its
// card on /live. A module of its own so web/e2e/live.spec.js can check them against the run's.
export const V2_RULES = Object.freeze({
  1: 'Enrolment with a chosen delay',
  2: 'Guardian-gated, rate-limited opens',
  3: 'The emergency lock',
  4: 'Private check-ins',
});
