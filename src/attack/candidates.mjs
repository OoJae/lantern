// The attacker's only knowledge: a list of people plausibly close to the victim.
//
// This is not guesswork. On an EVM chain it is every address that has ever
// transacted with the victim -- typically a few hundred -- plus their ENS and
// social graph. For a Korean audience it is a phone contact list.
import { createHash } from 'node:crypto';

export const ADDRESS_BOOK = Object.freeze([
  'seo-yeon.eth', 'jihoon.eth', 'mum@example.com', 'dad@example.com',
  'minji.eth', 'hyunwoo.eth', 'soo-ah@example.kr', 'dong-hyun.eth',
  'eun-ji@example.kr', 'jae-won.eth', 'ha-eun.eth', 'min-seo@example.kr',
  'ji-ho.eth', 'yu-na.eth', 'seung-min@example.kr', 'da-eun.eth',
  'tae-yang.eth', 'bo-ra@example.kr', 'woo-jin.eth', 'na-rae.eth',
  'sister@example.com', 'brother@example.com', 'grandma@example.com', 'uncle@example.com',
  'aunt@example.com', 'cousin@example.com', 'best-friend.eth', 'roommate.eth',
  'coworker-1@corp.kr', 'coworker-2@corp.kr', 'manager@corp.kr', 'mentor.eth',
  'neighbour@example.kr', 'landlord@example.kr', 'lawyer@firm.kr', 'accountant@firm.kr',
  'college-friend.eth', 'school-friend.eth', 'gym-buddy.eth', 'church-friend.eth',
  'partner.eth', 'ex-partner.eth', 'godparent@example.com', 'tutor@example.kr',
  'doctor@clinic.kr', 'pastor@church.kr', 'teammate-1.eth', 'teammate-2.eth',
  'alice.eth', 'bob.eth', 'carol.eth', 'dave.eth',
  'erin.eth', 'frank.eth', 'grace.eth', 'heidi.eth',
  'ivan.eth', 'judy.eth', 'mallory.eth', 'niaj.eth',
  'olivia.eth', 'peggy.eth', 'rupert.eth', 'sybil.eth',
]);

// The victim's real guardians. Held by the harness to SCORE results; never
// given to the attacker.
export const TRUE_GUARDIANS = Object.freeze(['seo-yeon.eth', 'mum@example.com', 'jihoon.eth']);

// A guardian's PUBLIC identifier: derived from who they are. This is what the
// vulnerable designs put in the leaf, and what the shipped design does not.
export const guardianIdOf = (name) => new Uint8Array(createHash('sha256').update(name).digest());

export const hex = (u) => Buffer.from(u).toString('hex');
export const short = (u) => { const h = hex(u); return `${h.slice(0, 4)}…${h.slice(-2)}`; };
