// How the story's chain executor (executor.mjs) records one accepted call, kept apart from the chain
// so devnet/test can check it: the same record whether midnight-js reported the finalization, or the
// executor's timeout fired and the transaction was then found by its id. A step with a transaction
// always says who paid for it and, when the sponsor did, the sponsor's evidence, which is what the
// record tests (test/record.test.js) and devnet:verify count. Dependency-free.

/**
 * Write a call's transaction, payer, sponsorship and timings into its record step `rec`.
 * @param rec       the record step, written in place
 * @param tx        the transaction as freeze.mjs's txOf gives it ({ txId, txHash, blockHeight, status }),
 *                  or null when finalization was not reported and the lookup found nothing
 * @param note      why finalization was not reported (the timeout), or null
 * @param payer     who paid, in the record's words (executor.mjs payerOf)
 * @param evidence  the sponsor's evidence when the sponsor paid (walletlessDevice's onEvidence), or null
 * @param timings   the call's phases (executor.mjs phases())
 * @param circuit   the circuit called
 * @param proved    the circuits proved so far in this run, updated: the run's first call is `cold`, and
 *                  each circuit's first call `firstOfCircuit`
 * Throws when the transaction did not succeed entirely: the story stops there, on either path.
 */
export function recordCall(rec, { tx, note = null, payer, evidence = null, timings, circuit, proved }) {
  rec.tx = note ? { ...(tx ?? {}), note } : tx;
  // Someone paid on either path: a timed-out call is recorded only when the ledger shows its change.
  rec.payer = payer;
  if (evidence) rec.sponsorship = evidence;
  rec.timings = { ...timings, cold: proved.size === 0, firstOfCircuit: !proved.has(circuit) };
  proved.add(circuit);
  if (tx && tx.status !== 'SucceedEntirely') throw new Error(`transaction ${tx.txId} ended ${tx.status}`);
}
