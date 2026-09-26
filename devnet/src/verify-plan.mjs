// Where devnet:verify reads each contract's ledger to compare it with the record, and which of the
// record's steps it cannot look up. Dependency-free, so devnet/test checks it on the committed records.
//
// The indexer answers a block only when this contract has an action in exactly that block (null
// otherwise), with the state after that action. So the read is at the block of the record's last
// transaction on the contract. A step whose finalization was not reported in time is recorded with a
// note (executor.mjs) and, unless its transaction was found afterwards, no block: when it is the
// contract's last step, that block is unknown, and today's state is all there is to compare.

const on = (key) => (s) => (s.contract ?? 'lantern') === key;

/** The block of the record's last transaction on a contract: its deploy, its freeze or a step. */
export const lastBlock = (record, key, meta) => Math.max(meta.blockHeight, meta.maintenanceAuthority.frozenBy.blockHeight,
  ...record.steps.filter((s) => on(key)(s) && s.tx?.blockHeight).map((s) => s.tx.blockHeight));

/** The contract's last accepted step, if its block was not recorded; otherwise null. */
export function unrecordedLastStep(record, key) {
  const last = record.steps.filter((s) => on(key)(s) && s.outcome === 'accepted').at(-1);
  return last && !last.tx?.blockHeight ? last : null;
}

/** Accepted steps recorded without a transaction id: they cannot be looked up on the chain. */
export const unidentifiedSteps = (record) => record.steps.filter((s) => s.outcome === 'accepted' && !s.tx?.txId);
