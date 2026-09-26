// /kit's one heavy import, loaded as the page opens (so it asks for nothing once it has): the
// contract's own pure circuits, for the commitments a kit names. The chunk is the runtime /demo loads.
// Everything else here is the repo's own src/: the same identity, Shamir and kit code `npm test` runs.
import '../polyfills.js';
import { rootBindings } from '../../../src/bindings/root.mjs';
import { newIdentity, commitmentsOf } from '../../../src/identity.js';
import { dealKits, parseVetoCard } from '../../../src/kit.js';

const pure = rootBindings.Lantern.pureCircuits;
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * A fresh identity and its kits, made with Web Crypto in this browser. The identity secret itself is
 * not returned: once dealt, it is on the kits and nowhere else.
 */
export function makeKits({ guardians, threshold }) {
  const identity = newIdentity();
  const { idCommit, vetoCommit } = commitmentsOf(pure, identity);
  // At enrolment the guardian context is the identity commitment itself (src/kit.js dealKits).
  const { vetoCard, kits } = dealKits({ identity, idCommit, ctx: idCommit, network: 'practice', contract: null, guardians, threshold });
  return { idCommit: hex(idCommit), vetoCommit: hex(vetoCommit), vetoCard, kits };
}

/**
 * Typed words against an identity's veto commitment, the way vetoRecovery checks a veto card: the
 * secret the words carry, with the salt derived from it, must open the commitment. Throws a KitError
 * (src/kit.js) when the words themselves are refused.
 */
export function checkVetoWords(typed, vetoCommit) {
  const card = parseVetoCard(typed);
  const opens = hex(pure.vetoCommitOf(card.vetoSecret, card.vetoSalt)) === vetoCommit;
  return { opens, check: card.check, checked: card.checked };
}

/** A new device's public key, as a phone opening a recovery would make one: for the six-word example. */
export function sampleDeviceKey() {
  return pure.ephemeralPkOf(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}
