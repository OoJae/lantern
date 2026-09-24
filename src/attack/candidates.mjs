// The attacker's only knowledge: a list of people plausibly close to the victim.
//
// This is not guesswork. On an EVM chain it is every address that has ever
// transacted with the victim -- typically a few hundred -- plus their ENS and
// social graph. For a Korean audience it is a phone contact list.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const ADDRESS_BOOK = Object.freeze([
  'seo-yeon.example', 'jihoon.example', 'mum@example.com', 'dad@example.com',
  'minji.example', 'hyunwoo.example', 'soo-ah@example.org', 'dong-hyun.example',
  'eun-ji@example.org', 'jae-won.example', 'ha-eun.example', 'min-seo@example.org',
  'ji-ho.example', 'yu-na.example', 'seung-min@example.org', 'da-eun.example',
  'tae-yang.example', 'bo-ra@example.org', 'woo-jin.example', 'na-rae.example',
  'sister@example.com', 'brother@example.com', 'grandma@example.com', 'uncle@example.com',
  'aunt@example.com', 'cousin@example.com', 'best-friend.example', 'roommate.example',
  'coworker-1@corp.example', 'coworker-2@corp.example', 'manager@corp.example', 'mentor.example',
  'neighbour@example.org', 'landlord@example.org', 'lawyer@firm.example', 'accountant@firm.example',
  'college-friend.example', 'school-friend.example', 'gym-buddy.example', 'church-friend.example',
  'partner.example', 'ex-partner.example', 'godparent@example.com', 'tutor@example.org',
  'doctor@clinic.example', 'pastor@church.example', 'teammate-1.example', 'teammate-2.example',
  'alice.example', 'bob.example', 'carol.example', 'dave.example',
  'erin.example', 'frank.example', 'grace.example', 'heidi.example',
  'ivan.example', 'judy.example', 'mallory.example', 'niaj.example',
  'olivia.example', 'peggy.example', 'rupert.example', 'sybil.example',
]);

// The victim's real guardians. Held by the harness to SCORE results; never
// given to the attacker.
export const TRUE_GUARDIANS = Object.freeze(['seo-yeon.example', 'mum@example.com', 'jihoon.example']);

// A guardian's PUBLIC identifier: derived from who they are. This is what the
// vulnerable designs put in the leaf, and what the shipped design does not.
export const guardianIdOf = (name) => sha256(utf8ToBytes(name));

/** SHA-256 over the concatenation of strings (UTF-8) and byte arrays. */
export const sha = (...parts) => sha256(concatBytes(...parts.map((p) => (typeof p === 'string' ? utf8ToBytes(p) : p))));

export const hex = (u) => bytesToHex(u);
export const short = (u) => { const h = hex(u); return `${h.slice(0, 4)}…${h.slice(-2)}`; };
