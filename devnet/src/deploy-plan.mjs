// How split-deploy.mjs divides a contract's verifier keys between its deploy and the maintenance
// updates that follow it. Dependency-free, so devnet/test checks it without a chain.

/**
 * @param ops         the contract's circuits, in the order to place them (sorted, for a stable plan)
 * @param deployCost  (subset) => the share of a block a deploy carrying `subset`'s keys uses
 * @param insertCost  (subset) => the share of a block one maintenance update inserting `subset` uses
 * @param budget      the largest share any one transaction may use
 * @returns { inDeploy, batches }: the deploy's keys, then each maintenance update's, every one
 *          within budget, every circuit exactly once, in `ops` order
 */
export function planDeploy(ops, { deployCost, insertCost, budget }) {
  if (deployCost([]) > budget) throw new Error('planDeploy: even a deploy with no verifier keys is over budget');
  let n = 0;
  while (n < ops.length && deployCost(ops.slice(0, n + 1)) <= budget) n++;
  const batches = [];
  let batch = [];
  for (const op of ops.slice(n)) {
    if (insertCost([op]) > budget) throw new Error(`planDeploy: ${op}'s key alone is over budget`);
    if (batch.length && insertCost([...batch, op]) > budget) { batches.push(batch); batch = []; }
    batch.push(op);
  }
  if (batch.length) batches.push(batch);
  return { inDeploy: ops.slice(0, n), batches };
}
