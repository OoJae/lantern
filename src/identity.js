// An owner's key material, and the one client convention Lantern depends on.
//
// DERIVED SALTS (D4). finalizeRecovery must open idCommit, which needs the
// identity secret AND its salt. Shamir shares only the secret, so if the salt
// were independent random bytes, the recovering device -- which by definition
// has lost everything -- could rebuild the secret from its guardians' shares
// and still be unable to finalize. Deriving the salt from the secret makes the
// share set the complete recovery kit:
//
//     idSalt   = SHA-256("lantern:idsalt:v1"   ‖ be32(identitySecret))
//     vetoSalt = SHA-256("lantern:vetosalt:v1" ‖ be32(vetoSecret))
//
// Hiding is unaffected: both secrets are uniform over the 255-bit scalar field,
// so the commitment's preimage already carries all the entropy the salt would.
//
// Runtime-free and portable. Commitments come from the contract's own pure
// circuits, passed in, so the client can never drift from the circuit.
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { R, randomFieldElement } from './field.js';
import { split, reconstruct } from './shamir.js';

const ID_SALT_DOMAIN = utf8ToBytes('lantern:idsalt:v1');
const VETO_SALT_DOMAIN = utf8ToBytes('lantern:vetosalt:v1');

/** A field element as 32 big-endian bytes. */
export function be32(x) {
  if (typeof x !== 'bigint' || x < 0n || x >= R) throw new Error('not a field element');
  const b = new Uint8Array(32);
  let v = x;
  for (let i = 31; i >= 0; i--, v >>= 8n) b[i] = Number(v & 0xffn);
  return b;
}

export const idSaltOf = (identitySecret) => sha256(concatBytes(ID_SALT_DOMAIN, be32(identitySecret)));
export const vetoSaltOf = (vetoSecret) => sha256(concatBytes(VETO_SALT_DOMAIN, be32(vetoSecret)));

/**
 * Fresh key material for a new identity. The identity secret is what the
 * guardians' shares will rebuild; the veto secret is independent and is never
 * shared -- it lives on a printed card or a second device.
 */
export function newIdentity(rng = randomFieldElement) {
  const identitySecret = rng();
  const vetoSecret = rng();
  if (identitySecret === vetoSecret) throw new Error('identity and veto secrets must be independent');
  return {
    identitySecret, idSalt: idSaltOf(identitySecret),
    vetoSecret, vetoSalt: vetoSaltOf(vetoSecret),
  };
}

/** idCommit and vetoCommit, computed by the contract's own pure circuits. */
export function commitmentsOf(pureCircuits, ident) {
  return {
    idCommit: pureCircuits.idCommitOf(ident.identitySecret, ident.idSalt),
    vetoCommit: pureCircuits.vetoCommitOf(ident.vetoSecret, ident.vetoSalt),
  };
}

/** Deal the identity secret to guardians: any `t` of `n` shares rebuild it. */
export const dealShares = (identitySecret, n, t, rng) => split(identitySecret, n, t, rng);

/**
 * What a recovering device rebuilds from `t` shares and nothing else: the
 * identity secret and its salt -- everything finalizeRecovery's opening needs.
 */
export function recoverFromShares(shares) {
  const identitySecret = reconstruct(shares);
  return { identitySecret, idSalt: idSaltOf(identitySecret) };
}
