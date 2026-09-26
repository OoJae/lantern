// A v2 owner's key material. The same convention as src/identity.js (D4: each
// salt is derived from its secret, so the guardians' shares are the complete
// recovery kit), under v2's OWN domains:
//
//     idSalt   = SHA-256("lantern2:idsalt:v1"   ‖ be32(identitySecret))
//     vetoSalt = SHA-256("lantern2:vetosalt:v1" ‖ be32(vetoSecret))
//
// Why separate domains (docs/v2.md §2): idCommitOf and vetoCommitOf are SHARED
// with v1 on purpose, so the same secret and the same salt would publish the
// same idCommit in both ledgers and link them. Deriving v2's salts under their
// own domain gives the same secret a different idCommit in v2, unlinkable to
// OBSERVERS only. Reuse is still unsafe: t shares from either guardian set
// rebuild the secret, and so act as the owner in both contracts. Never enrol
// one identity secret in both; newIdentity() draws fresh ones.
//
// Portable: commitments come from the v2 contract's own pure circuits, passed in.
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { be32 } from '../identity.js';
import { randomFieldElement } from '../field.js';
import { split, reconstruct } from '../shamir.js';

export const ID_SALT_DOMAIN = 'lantern2:idsalt:v1';
export const VETO_SALT_DOMAIN = 'lantern2:vetosalt:v1';

export const idSaltOf = (identitySecret) => sha256(concatBytes(utf8ToBytes(ID_SALT_DOMAIN), be32(identitySecret)));
export const vetoSaltOf = (vetoSecret) => sha256(concatBytes(utf8ToBytes(VETO_SALT_DOMAIN), be32(vetoSecret)));

/** Fresh key material: an identity secret for the guardians, an independent veto card. */
export function newIdentity(rng = randomFieldElement) {
  const identitySecret = rng();
  const vetoSecret = rng();
  if (identitySecret === vetoSecret) throw new Error('identity and veto secrets must be independent');
  return {
    identitySecret, idSalt: idSaltOf(identitySecret),
    vetoSecret, vetoSalt: vetoSaltOf(vetoSecret),
  };
}

const sameBytes = (a, b) => a instanceof Uint8Array && b instanceof Uint8Array
  && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Throws unless the card's salt is derived under v2's domain. v1's
 * src/identity.js exports the same names, so a v1 card handed to the v2 client
 * by one wrong import would otherwise go through without an error.
 */
export function assertV2Card(card) {
  if (!sameBytes(card?.vetoSalt, vetoSaltOf(card?.vetoSecret))) {
    throw new Error(`not a v2 identity: vetoSalt must be derived under ${VETO_SALT_DOMAIN}`);
  }
  return card;
}

/**
 * Throws unless both salts are derived under v2's domains. A v1 identity would
 * publish its v1 commitments, linking the owner's two ledgers, and its shares
 * would not recover it: recoverFromShares rebuilds the v2 salt.
 */
export function assertV2Identity(ident) {
  if (!sameBytes(ident?.idSalt, idSaltOf(ident?.identitySecret))) {
    throw new Error(`not a v2 identity: idSalt must be derived under ${ID_SALT_DOMAIN} (a v1 identity would publish `
      + 'its v1 commitments, and its shares would not recover it)');
  }
  return assertV2Card(ident);
}

/**
 * idCommit and vetoCommit, computed by the v2 contract's own pure circuits.
 * Refuses v1's pure circuits and any identity whose salts are not v2's.
 */
export function commitmentsOf(pureCircuits, ident) {
  if (typeof pureCircuits.checkInKeyOf !== 'function') throw new Error('these are not Lantern v2 pure circuits');
  assertV2Identity(ident);
  return {
    idCommit: pureCircuits.idCommitOf(ident.identitySecret, ident.idSalt),
    vetoCommit: pureCircuits.vetoCommitOf(ident.vetoSecret, ident.vetoSalt),
  };
}

/** Deal the identity secret to guardians: any `t` of `n` shares rebuild it. */
export const dealShares = (identitySecret, n, t, rng) => split(identitySecret, n, t, rng);

/** What a recovering device rebuilds from `t` shares: the secret AND its v2 salt. */
export function recoverFromShares(shares) {
  const identitySecret = reconstruct(shares);
  return { identitySecret, idSalt: idSaltOf(identitySecret) };
}
