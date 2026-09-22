// What a fee sponsor checks before paying for someone else's transaction.
//
// The sponsor adds DUST and nothing else; it cannot alter a bound transaction, and any other
// wallet could submit the same one (SECURITY.md, adversary B2). So its policy only decides
// whether it is WILLING to pay. It pays for exactly one call to a Lantern contract, into a
// circuit that requires an owner secret -- the recovering phone's finalize, the veto card's
// veto, a host action, a rotation -- and never for an open: a hosted sponsor that paid for
// opens would give anyone free use of the liveness oracle.
export const SPONSORED_CIRCUITS = Object.freeze([
  'finalizeRecovery', 'vetoRecovery', 'hostGatedAction', 'proveHeadOwnership', 'rotateGuardianSet', 'addGuardian',
]);

const text = (v) => (typeof v === 'string' ? v : new TextDecoder().decode(v));
const size = (m) => (m ? (m instanceof Map ? m.size : 1) : 0);

/**
 * @param tx         a deserialized, bound transaction
 * @param addresses  contract addresses this sponsor serves
 * @param fee        the transaction's fee (tx.fees(params)), without the sponsor's balancing
 * @param maxFee     the most the sponsor will pay
 */
export function checkPolicy(tx, { addresses, fee, maxFee }) {
  const reasons = [];
  if (tx.rewards) reasons.push('claims rewards');
  if (size(tx.guaranteedOffer) || size(tx.fallibleOffer)) reasons.push('carries a shielded offer');
  const intents = tx.intents ? [...tx.intents.values()] : [];
  if (intents.length !== 1) reasons.push(`has ${intents.length} intents, not 1`);
  let call = null;
  for (const intent of intents) {
    if (intent.actions.length !== 1) reasons.push(`intent has ${intent.actions.length} actions, not 1`);
    const a = intent.actions[0];
    if (a && 'entryPoint' in a && 'communicationCommitment' in a) call = { address: a.address, entryPoint: text(a.entryPoint) };
    else if (a) reasons.push('the action is not a contract call');
    if (intent.dustActions && (intent.dustActions.spends.length || intent.dustActions.registrations.length)) {
      reasons.push('already moves DUST');
    }
    if (intent.guaranteedUnshieldedOffer || intent.fallibleUnshieldedOffer) reasons.push('carries an unshielded offer');
  }
  if (call && !addresses.includes(call.address)) reasons.push(`calls ${call.address}, which this sponsor does not serve`);
  if (call && !SPONSORED_CIRCUITS.includes(call.entryPoint)) reasons.push(`${call.entryPoint} is not a sponsored circuit`);
  if (fee > maxFee) reasons.push(`fee ${fee} exceeds the cap ${maxFee}`);
  return { ok: reasons.length === 0, reasons, call, fee };
}
