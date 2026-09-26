// Recovery kits: what an owner prints, in words, so that a person with no wallet and no crypto can
// hold a part of a Lantern identity.
//
// THE VETO CARD carries the veto secret as 24 checksummed words (src/words.js), and three check words.
// The veto salt is not on it: it is derived from the secret (src/identity.js, D4). The check words are a
// hash of the secret, so a device the card is typed into can show them, and the owner compares them
// with the printed ones before acting.
//
// A GUARDIAN KIT carries everything one guardian needs:
//   - the guardian secret and the leaf salt, which open their guardian leaf (approveRecovery);
//   - their Shamir share of the identity secret: its x-index as a number, its y as 24 words;
//   - the identity commitment and the guardian context their leaf was minted under;
//   - the network and the Lantern contract it is enrolled on, and the threshold and guardian count;
//   - a version tag, and three check words over all of it.
// Parse refuses a kit whose words or check words do not agree, and names what is wrong: a word not on
// the list, a section whose checksum fails, a share index or network changed after printing, or a kit
// for another identity, contract, network or guardian set than the one expected, or for an identity
// that has since been recovered (its share rebuilds a retired secret).
//
// WHEN A KIT STOPS WORKING. After a recovery the successor identity has a new secret and a new veto
// commitment (finalizeRecovery), so every kit's share and the old veto card are dead; the guardian
// leaves survive (the context is untouched), but the owner deals new kits. After the owner replaces the
// guardians (rotateGuardianSet, the whole set at once), every old leaf is dead too. The old shares are
// not, until a recovery retires the secret, so old kits must be destroyed (SECURITY.md §6.17).
//
// THE GUARDIAN CONTEXT a kit names is the one its leaf is minted under: guardianCtx[idRoots[idCommit]]
// on the ledger. It is the identity commitment itself only for an identity never recovered or rotated.
// finalizeRecovery carries the root forward, so a successor's guardians approve under the ROOT's
// context (or the one the last rotateGuardianSet set), never under the successor's own commitment.
// dealKits therefore takes the context from the caller, with no default.
//
// AFTER A RECOVERY the default is SECURITY.md §8: rotate the guardian set first (rotateGuardianSet,
// with the new veto card), then deal kits with fresh guardian secrets and leaf salts under the new
// context, and add each guardian. Until that rotation every copy of the old guardian secrets and leaf
// salts still approves recoveries of the successor: the old kits, and anything the lost device or the
// dealing device kept (§6.9, §6.16). dealKits's `credentials` option, which keeps each guardian's
// secret and salt so that only the shares change, keeps every one of those copies live with them. It
// is only for an owner sure that no copy exists outside the guardians' own kits, which after the loss
// of a device no owner can be; it is not the path after a recovery. Fresh kits dealt
// without a rotation need their leaves added, and the old leaves can still approve beside them.
//
// ONE DEAL AT A TIME. A kit does not record which deal it came from. Two deals of one identity under
// one context, n and t (a lost kit reprinted, say) make kits that collectShares accepts together and
// that rebuild a wrong secret. rebuildFromKits checks the rebuilt secret against the identity
// commitment, and names a kit from another deal when a working set remains without it.
//
// The check words detect a change or a slip; they are not a signature. Anyone holding a kit can make a
// consistent one, and nothing here claims otherwise.
//
// Representations are the ones the rest of src/ uses and nothing else: a field element (the identity and
// veto secrets, a share's y) as be32 bytes (src/identity.js); a share as { x, y } bigints
// (src/shamir.js); the guardian secret and leaf salt as the 32 bytes the contract's Bytes<32> takes.
//
// Runtime-free and portable, as every file in src/ but bindings/ must be. The identity commitment comes
// from the contract's own pure circuit, computed by the caller and passed in.
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { bytesToWords, wordsToBytes, hashWords, readWords, WordsError } from './words.js';
import { be32, vetoSaltOf, idSaltOf } from './identity.js';
import { R } from './field.js';
import { split, reconstruct } from './shamir.js';

export const VETO_CARD_VERSION = 'lantern-veto-card/1';
export const GUARDIAN_KIT_VERSION = 'lantern-guardian-kit/1';
export const CHECK_WORDS = 3;
// Midnight's networks, and "practice": a kit made to try the format, for no contract at all.
export const NETWORKS = Object.freeze(['practice', 'undeployed', 'preview', 'preprod', 'mainnet']);
// The widest guardian set a kit describes: src/shamir.js's own bound, and what keeps canonical()'s
// one-byte threshold, count and share fields from wrapping (256 would encode as 0, and two kits would
// share check words). Raising it needs a new GUARDIAN_KIT_VERSION with a wider encoding.
export const MAX_GUARDIANS = 255;

const VETO_CHECK_DOMAIN = 'lantern:veto-card:check:v1';
const KIT_CHECK_DOMAIN = 'lantern:guardian-kit:check:v1';

/** A refusal with a reason a person can act on. `code` is stable for tests and UIs; `field` names the part. */
export class KitError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = 'KitError';
    this.code = code;
    if (field !== undefined) this.field = field;
  }
}

// ---- small representations ------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const hexOf = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const bytesOfHex = (h) => Uint8Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
const bigOf = (b) => b.reduce((acc, x) => (acc << 8n) | BigInt(x), 0n);
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// 32 bytes, from bytes or hex (with or without 0x), as lower-case hex. `what` names it in the refusal.
function hex32(v, what, field) {
  if (v instanceof Uint8Array) {
    if (v.length !== 32) throw new KitError('format', `${what} must be 32 bytes`, field);
    return hexOf(v);
  }
  const h = typeof v === 'string' ? v.trim().toLowerCase().replace(/^0x/, '') : '';
  if (!HEX64.test(h)) throw new KitError('format', `${what} must be 64 hexadecimal characters`, field);
  return h;
}

function bytes32(v, what, field) {
  if (!(v instanceof Uint8Array) || v.length !== 32) throw new KitError('format', `${what} must be 32 bytes`, field);
  return v;
}

function fieldElement(v, what, field) {
  if (typeof v !== 'bigint' || v < 0n || v >= R) throw new KitError('format', `${what} must be a field element`, field);
  return v;
}

function count(v, what, field, lo, hi) {
  const n = typeof v === 'bigint' ? Number(v) : v;
  if (!Number.isInteger(n) || n < lo || n > hi) throw new KitError('format', `${what} must be a whole number from ${lo} to ${hi}`, field);
  return n;
}

// 24 words back to 32 bytes, with the refusal naming the section (and the word) that failed.
function section(input, name, field) {
  const { words, unknown } = readWords(input ?? []);
  if (unknown.length) {
    const { at, word } = unknown[0];
    throw new KitError('unknown-word', `${name}, word ${at}: “${word}” is not on the word list`, field);
  }
  if (words.length !== 24) throw new KitError('word-count', `${name}: ${words.length} word${words.length === 1 ? '' : 's'}, where there must be 24`, field);
  try {
    return wordsToBytes(words);
  } catch (e) {
    if (e instanceof WordsError && e.code === 'checksum') {
      throw new KitError('checksum', `${name}: the words do not check out; one is wrong, or two are swapped`, field);
    }
    throw e;
  }
}

function checkWordsOf(input, name) {
  const { words, unknown } = readWords(input ?? []);
  if (unknown.length) throw new KitError('unknown-word', `${name}, check word ${unknown[0].at}: “${unknown[0].word}” is not on the word list`, 'check');
  if (words.length !== CHECK_WORDS) throw new KitError('word-count', `${name}: ${words.length} check word${words.length === 1 ? '' : 's'}, where there must be ${CHECK_WORDS}`, 'check');
  return words;
}

const sameWords = (a, b) => a.length === b.length && a.every((w, i) => w === b[i]);

// ---- the veto card --------------------------------------------------------------------------------

/** The three check words of a veto secret: what a device shows once the card's words are typed in. */
export const vetoCheckWords = (vetoSecret) =>
  hashWords(VETO_CHECK_DOMAIN, be32(fieldElement(vetoSecret, 'The veto secret', 'vetoSecret')), CHECK_WORDS);

/** A veto card for a veto secret (a field element, as newIdentity makes it). */
export function buildVetoCard(vetoSecret) {
  fieldElement(vetoSecret, 'The veto secret', 'vetoSecret');
  return Object.freeze({
    version: VETO_CARD_VERSION,
    words: Object.freeze(bytesToWords(be32(vetoSecret))),
    check: Object.freeze(vetoCheckWords(vetoSecret)),
  });
}

/** The card as plain text: the version tag, then the words, then the check words. */
export function vetoCardText(card) {
  return [`Version: ${card.version}`, `Words: ${card.words.join(' ')}`, `Check: ${card.check.join(' ')}`].join('\n');
}

/**
 * A veto card back to its secret and salt. Takes a card object, its text, or just the words typed in:
 * 24 words alone, or 27 (the 24 and then the check words). Check words, when given, must agree.
 * Returns { vetoSecret, vetoSalt, words, check, checked }: `checked` says whether check words were given.
 */
export function parseVetoCard(input) {
  let words;
  let check;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    if (input.version !== VETO_CARD_VERSION) throw versionError(input.version, VETO_CARD_VERSION);
    words = input.words;
    check = input.check;
  } else {
    const text = Array.isArray(input) ? input.join(' ') : String(input ?? '');
    const labelled = labelledSections(text, VETO_LABELS, 'words');
    if (labelled) {
      if (labelled.version !== undefined && labelled.version !== VETO_CARD_VERSION) throw versionError(labelled.version, VETO_CARD_VERSION);
      words = labelled.words;
      check = labelled.check;
    } else {
      words = text;
    }
    // 27 words and no "Check:" label: the card's words, then its check words, typed in one run.
    const all = readWords(words ?? '').words;
    if (check === undefined && all.length === 24 + CHECK_WORDS) { words = all.slice(0, 24); check = all.slice(24); }
  }
  const bytes = section(words ?? [], 'The veto card', 'words');
  const vetoSecret = bigOf(bytes);
  if (vetoSecret >= R) throw new KitError('not-a-secret', 'The veto card: these words do not make a veto secret', 'words');
  const expected = vetoCheckWords(vetoSecret);
  let checked = false;
  if (check !== undefined && check !== null && !(Array.isArray(check) && check.length === 0)) {
    const given = checkWordsOf(check, 'The veto card');
    if (!sameWords(given, expected)) {
      throw new KitError('check', 'The veto card: the check words do not match its words. A word was copied wrong, or the card was changed.', 'check');
    }
    checked = true;
  }
  return { vetoSecret, vetoSalt: vetoSaltOf(vetoSecret), words: bytesToWords(bytes), check: expected, checked };
}

// ---- the guardian kit ------------------------------------------------------------------------------

// One byte of canonical(): a value that does not fit is refused rather than wrapped, whatever bound
// the caller checked.
function byte(v, field) {
  if (!Number.isInteger(v) || v < 0 || v > 255) throw new KitError('format', `${v} does not fit the kit's one-byte ${field}`, field);
  return v;
}

// Everything the check words cover, in one fixed order. Each variable-length part is length-prefixed,
// so no two different kits share an encoding.
function canonical(k) {
  const net = utf8ToBytes(k.network);
  const contract = k.contract === null ? new Uint8Array(0) : bytesOfHex(k.contract);
  const version = utf8ToBytes(GUARDIAN_KIT_VERSION);
  const parts = [
    Uint8Array.of(version.length), version,
    Uint8Array.of(net.length), net,
    Uint8Array.of(contract.length), contract,
    bytesOfHex(k.identity), bytesOfHex(k.context),
    Uint8Array.of(byte(k.threshold, 'threshold'), byte(k.guardians, 'guardians'), byte(k.share, 'share')),
    k.guardianSecret, k.leafSalt, be32(k.shareY),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const kitCheck = (k) => hashWords(KIT_CHECK_DOMAIN, canonical(k), CHECK_WORDS);

function network(v) {
  if (!NETWORKS.includes(v)) throw new KitError('format', `The network must be one of ${NETWORKS.join(', ')}`, 'network');
  return v;
}

// A practice kit names no contract; a kit for a real network always does.
function contractFor(net, v) {
  if (net === 'practice') {
    if (v !== null && v !== undefined && v !== '' && v !== 'none') throw new KitError('format', 'A practice kit names no contract', 'contract');
    return null;
  }
  return hex32(v, 'The contract address', 'contract');
}

// The shape every kit, built or parsed, is checked against: bounds that hold whatever the source.
function validated(k) {
  const net = network(k.network);
  const guardians = count(k.guardians, 'The number of guardians', 'guardians', 2, MAX_GUARDIANS);
  const threshold = count(k.threshold, 'The threshold', 'threshold', 2, MAX_GUARDIANS);
  if (threshold > guardians) throw new KitError('format', `The threshold (${threshold}) cannot be more than the number of guardians (${guardians})`, 'threshold');
  const share = count(k.share, 'The share number', 'share', 1, guardians);
  return {
    network: net,
    contract: contractFor(net, k.contract),
    identity: hex32(k.identity, 'The identity commitment', 'identity'),
    context: hex32(k.context, 'The guardian context', 'context'),
    threshold, guardians, share,
    guardianSecret: bytes32(k.guardianSecret, 'The guardian secret', 'guardianSecret'),
    leafSalt: bytes32(k.leafSalt, 'The leaf salt', 'leafSalt'),
    shareY: fieldElement(k.shareY, 'The share', 'shareWords'),
  };
}

/**
 * One guardian's kit.
 * @param {object} p
 * @param {string} p.network            one of NETWORKS
 * @param {string|Uint8Array|null} p.contract  the Lantern contract's address (null for practice)
 * @param {string|Uint8Array} p.idCommit       the identity commitment (idCommitOf, the contract's own circuit)
 * @param {string|Uint8Array} p.ctx            the guardian context the leaf is minted under:
 *                                             guardianCtx[idRoots[idCommit]] on the ledger. The identity
 *                                             commitment itself only for an identity never recovered or
 *                                             rotated; for a successor, the root's context.
 * @param {number} p.threshold, p.guardians   t and n
 * @param {{x: bigint, y: bigint}} p.share     this guardian's share, as src/shamir.js deals it
 * @param {Uint8Array} p.guardianSecret, p.leafSalt  32 bytes each
 */
export function buildGuardianKit({ network: net, contract, idCommit, ctx, threshold, guardians, share, guardianSecret, leafSalt }) {
  if (!share || typeof share.x !== 'bigint' || typeof share.y !== 'bigint') throw new KitError('format', 'The share must be { x, y } as src/shamir.js deals it', 'share');
  const k = validated({ network: net, contract, identity: idCommit, context: ctx, threshold, guardians,
    share: share.x, guardianSecret, leafSalt, shareY: share.y });
  return Object.freeze({
    version: GUARDIAN_KIT_VERSION,
    network: k.network,
    contract: k.contract,
    identity: k.identity,
    context: k.context,
    threshold: k.threshold,
    guardians: k.guardians,
    share: k.share,
    words: Object.freeze({
      guardianSecret: Object.freeze(bytesToWords(k.guardianSecret)),
      leafSalt: Object.freeze(bytesToWords(k.leafSalt)),
      share: Object.freeze(bytesToWords(be32(k.shareY))),
    }),
    check: Object.freeze(kitCheck(k)),
  });
}

// The kit's text: one labelled line each, in this order. Parse reads it back, and tolerates what a
// person typing it adds: numbering, capitals, line breaks inside a section, four-letter words.
const KIT_LABELS = [
  ['version', 'Version'], ['network', 'Network'], ['contract', 'Contract'], ['identity', 'Identity'],
  ['context', 'Context'], ['share', 'Share'], ['guardians', 'Guardians'], ['threshold', 'Threshold'],
  ['guardianSecret', 'Guardian secret'], ['leafSalt', 'Leaf salt'], ['shareWords', 'Share words'], ['check', 'Check'],
];
const VETO_LABELS = [['version', 'Version'], ['words', 'Words'], ['check', 'Check']];

/** The kit as plain text, which parseGuardianKit reads back. */
export function guardianKitText(kit) {
  const v = {
    version: kit.version, network: kit.network, contract: kit.contract ?? 'none', identity: kit.identity,
    context: kit.context, share: kit.share, guardians: kit.guardians, threshold: kit.threshold,
    guardianSecret: kit.words.guardianSecret.join(' '), leafSalt: kit.words.leafSalt.join(' '),
    shareWords: kit.words.share.join(' '), check: kit.check.join(' '),
  };
  return KIT_LABELS.map(([k, label]) => `${label}: ${v[k]}`).join('\n');
}

// Reads "Label: value" lines, a value running on over unlabelled lines. A first line that is only a
// version tag counts as the version. Unlabelled lines before any label belong to `rest`, if given (the
// veto card's words, typed without "Words:"); without `rest`, text that opens with no label is null.
function labelledSections(text, labels, rest) {
  const byLabel = new Map(labels.map(([k, label]) => [label.toLowerCase(), k]));
  const out = {};
  let current = null;
  let any = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/);
    const key = m && byLabel.get(m[1].trim().toLowerCase());
    if (key) {
      if (key in out) throw new KitError('format', `“${m[1].trim()}” appears twice`, key);
      out[key] = m[2].trim();
      current = key;
      any = true;
    } else if (/^lantern-[a-z-]+\/\d+$/i.test(line) && !any) {
      out.version = line.toLowerCase();
      any = true;
    } else if (current) {
      out[current] = `${out[current]} ${line}`.trim();
    } else if (rest) {
      out[rest] = line;
      current = rest;
      any = true;
    } else if (any) {
      throw new KitError('format', `A line that belongs to no section: “${line.slice(0, 40)}”`);
    } else {
      return null;
    }
  }
  return any ? out : null;
}

function versionError(found, wanted) {
  if (found === VETO_CARD_VERSION) return new KitError('version', 'This is a veto card, not a guardian kit', 'version');
  if (found === GUARDIAN_KIT_VERSION) return new KitError('version', 'This is a guardian kit, not a veto card', 'version');
  if (typeof found === 'string' && found.startsWith(wanted.slice(0, wanted.indexOf('/') + 1))) {
    return new KitError('version', `This kit is version ${found.split('/')[1]}; this reader knows version ${wanted.split('/')[1]}`, 'version');
  }
  return new KitError('version', `Not a Lantern ${wanted.startsWith('lantern-veto') ? 'veto card' : 'guardian kit'}: no “${wanted}” tag`, 'version');
}

const SAME_AS_IDENTITY = /^same as (the )?identity\.?$/i;

/** What a printed kit shows for its guardian context: the hex, or "same as identity" at enrolment. */
export const contextLabel = (kit) => (kit.context === kit.identity ? 'same as identity' : kit.context);

const intOf = (v, what, field) => {
  if (typeof v === 'number' || typeof v === 'bigint') return v;
  const s = String(v ?? '').trim();
  if (!/^\d{1,3}$/.test(s)) throw new KitError('format', `${what} must be a whole number`, field);
  return Number(s);
};

/**
 * A guardian kit back to what it carries, or a refusal that says why.
 * @param input   a kit object (as buildGuardianKit makes it) or its text (guardianKitText, or typed)
 * @param expect  optional: { network, contract, idCommit, ctx, retired }. A kit for anything else is
 *                refused: the page, or the recovering device, says which identity it is collecting for.
 *                `retired` (identity commitments as hex or bytes, or a predicate over the kit's hex)
 *                names identities since recovered, so a kit made before a recovery is refused as that,
 *                and not as "a different identity".
 * @returns {{ network, contract, idCommit: Uint8Array, ctx: Uint8Array, threshold, guardians,
 *             share: { x: bigint, y: bigint }, guardianSecret: Uint8Array, leafSalt: Uint8Array, check }}
 */
export function parseGuardianKit(input, expect = {}) {
  let raw;
  if (input && typeof input === 'object') {
    raw = {
      version: input.version, network: input.network, contract: input.contract, identity: input.identity,
      context: input.context, share: input.share, guardians: input.guardians, threshold: input.threshold,
      guardianSecret: input.words?.guardianSecret, leafSalt: input.words?.leafSalt, shareWords: input.words?.share,
      check: input.check,
    };
  } else {
    raw = labelledSections(input ?? '', KIT_LABELS);
    if (!raw) throw new KitError('format', 'Not a guardian kit: no labelled sections (Network:, Identity:, …)');
  }
  if (raw.version !== GUARDIAN_KIT_VERSION) throw versionError(raw.version, GUARDIAN_KIT_VERSION);
  for (const [k, label] of KIT_LABELS) {
    if (raw[k] === undefined || raw[k] === '') throw new KitError('missing', `The kit has no ${label.toLowerCase()}`, k);
  }

  // The words first: a slip in them is the likeliest fault, and each section checks itself.
  const guardianSecret = section(raw.guardianSecret, 'Guardian secret', 'guardianSecret');
  const leafSalt = section(raw.leafSalt, 'Leaf salt', 'leafSalt');
  const shareY = bigOf(section(raw.shareWords, 'Share words', 'shareWords'));
  if (shareY >= R) throw new KitError('not-a-secret', 'Share words: these words do not make a share', 'shareWords');
  const check = checkWordsOf(raw.check, 'Check');

  const contract = typeof raw.contract === 'string' && raw.contract.trim().toLowerCase() === 'none' ? null : raw.contract;
  // At enrolment the guardian context is the identity commitment itself: a printed kit says so in words
  // rather than repeat 64 characters, and the check words still cover the value.
  const context = typeof raw.context === 'string' && SAME_AS_IDENTITY.test(raw.context.trim()) ? raw.identity : raw.context;
  const k = validated({
    network: typeof raw.network === 'string' ? raw.network.trim().toLowerCase() : raw.network,
    contract,
    identity: raw.identity, context,
    threshold: intOf(raw.threshold, 'The threshold', 'threshold'),
    guardians: intOf(raw.guardians, 'The number of guardians', 'guardians'),
    share: intOf(raw.share, 'The share number', 'share'),
    guardianSecret, leafSalt, shareY,
  });

  if (!sameWords(check, kitCheck(k))) throw diagnose(k, check);

  if (expect.network !== undefined && expect.network !== k.network) {
    throw new KitError('network', k.network === 'practice'
      ? `This is a practice kit; it cannot be used on ${expect.network}`
      : `This kit is for ${k.network}, not ${expect.network}`, 'network');
  }
  if (expect.contract !== undefined) {
    const want = expect.contract === null ? null : hex32(expect.contract, 'The expected contract', 'contract');
    if (want !== k.contract) throw new KitError('contract', 'This kit is for a different Lantern contract', 'contract');
  }
  if (expect.retired !== undefined && isRetired(expect.retired, k.identity)) {
    throw new KitError('retired', 'This kit was made before a recovery of this identity: its share rebuilds a secret that has been retired. After a recovery the owner makes new kits', 'identity');
  }
  if (expect.idCommit !== undefined && hex32(expect.idCommit, 'The expected identity', 'identity') !== k.identity) {
    throw new KitError('identity', 'This kit belongs to a different identity', 'identity');
  }
  if (expect.ctx !== undefined && hex32(expect.ctx, 'The expected guardian context', 'context') !== k.context) {
    throw new KitError('context', 'This kit was made for an earlier guardian set: the owner has replaced it, and it can no longer approve, but its share still rebuilds the owner\'s secret until a recovery: destroy it', 'context');
  }

  return {
    network: k.network,
    contract: k.contract,
    idCommit: bytesOfHex(k.identity),
    ctx: bytesOfHex(k.context),
    threshold: k.threshold,
    guardians: k.guardians,
    share: { x: BigInt(k.share), y: k.shareY },
    guardianSecret: k.guardianSecret,
    leafSalt: k.leafSalt,
    check,
  };
}

function isRetired(retired, identity) {
  if (typeof retired === 'function') return Boolean(retired(identity));
  if (retired == null || typeof retired[Symbol.iterator] !== 'function') throw new KitError('format', 'The retired identities must be a list or a function', 'identity');
  for (const r of retired) if (hex32(r, 'A retired identity', 'identity') === identity) return true;
  return false;
}

// The check words disagree. Find the one change that explains it, if there is one: a share number or a
// network altered after printing is common enough, and dangerous enough, to name. Anything else is a
// change or a slip somewhere on the kit.
function diagnose(k, check) {
  for (let x = 1; x <= k.guardians; x++) {
    if (x !== k.share && sameWords(check, kitCheck({ ...k, share: x }))) {
      return new KitError('share-index', `The share words are share ${x}, but the kit says share ${k.share}`, 'share');
    }
  }
  // A practice kit names no contract and a real one always does, so only a swap within each kind fits.
  for (const net of NETWORKS) {
    if (net === k.network || (net === 'practice') !== (k.network === 'practice')) continue;
    if (sameWords(check, kitCheck({ ...k, network: net }))) {
      return new KitError('network', `This kit was made for ${net}, but it says ${k.network}`, 'network');
    }
  }
  return new KitError('check', 'The check words do not match the kit: something on it was copied wrong, or changed', 'check');
}

/**
 * The shares a recovering device rebuilds from, once every kit agrees: the same network, contract,
 * identity, guardian set and threshold; no share twice; and at least the threshold of them.
 * It cannot tell two deals of one identity apart (a kit records no deal), and shares from two deals
 * rebuild a wrong secret with no error. A recovering device therefore rebuilds with rebuildFromKits,
 * which checks the secret against the identity commitment, before it opens a recovery.
 * @param kits  parsed kits (parseGuardianKit's results)
 * @returns {{ shares: {x: bigint, y: bigint}[], threshold: number, idCommit: Uint8Array }}
 */
export function collectShares(kits) {
  if (!Array.isArray(kits) || kits.length === 0) throw new KitError('too-few', 'No kits given');
  const [first] = kits;
  for (const k of kits.slice(1)) {
    if (k.network !== first.network || k.contract !== first.contract) throw new KitError('mismatch', 'These kits are for different contracts or networks', 'contract');
    if (!sameBytes(k.idCommit, first.idCommit)) throw new KitError('mismatch', 'These kits belong to different identities', 'identity');
    if (!sameBytes(k.ctx, first.ctx)) throw new KitError('mismatch', 'These kits come from different guardian sets', 'context');
    if (k.threshold !== first.threshold || k.guardians !== first.guardians) throw new KitError('mismatch', 'These kits disagree on the threshold', 'threshold');
  }
  const seen = new Set();
  for (const k of kits) {
    if (seen.has(k.share.x)) throw new KitError('duplicate-share', `Share ${k.share.x} is here twice`, 'share');
    seen.add(k.share.x);
  }
  if (kits.length < first.threshold) {
    throw new KitError('too-few', `${kits.length} of ${first.threshold} shares: ${first.threshold - kits.length} more needed`, 'share');
  }
  return { shares: kits.map((k) => ({ x: k.share.x, y: k.share.y })), threshold: first.threshold, idCommit: first.idCommit };
}

// How many sets of kits rebuildFromKits tries before it gives up. It is every set of at least t kits
// when there are up to 8, and always all the kits together and every set with one left out, so one kit
// from another deal is set aside whenever the rest still reach the threshold.
export const MAX_KIT_SUBSETS = 256;

// The sets of `lo` or more of m indexes, largest first, each size in lexicographic order.
function* subsetsBySize(m, lo) {
  for (let size = m; size >= lo; size--) {
    const idx = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      yield idx.slice();
      let i = size - 1;
      while (i >= 0 && idx[i] === m - size + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
}

/**
 * What a recovering device rebuilds from its guardians' kits, checked before anything is opened: the
 * identity secret and its salt, and only if they open the kits' identity commitment. collectShares
 * cannot tell two deals of one identity apart, and their shares mixed rebuild a wrong secret that
 * finalizeRecovery would refuse only after the timelock. So a device runs this before openRecovery.
 *
 * It tries the kits together first, then smaller sets down to t of them (at most MAX_KIT_SUBSETS), and
 * keeps the largest set that opens the commitment. A secret that opens it is the identity's own (the
 * commitment binds it), so a kit from another deal does not stop a recovery the others can make: the
 * kits left out are named, and their guardians asked for their newest kit.
 * @param kits        parsed kits (parseGuardianKit's results), as collectShares takes them
 * @param idCommitOf  the contract's own pure circuit, (identitySecret, idSalt) => idCommit
 *                    (pureCircuits.idCommitOf), passed in so this file stays runtime-free
 * @returns {{ identitySecret: bigint, idSalt: Uint8Array, idCommit: Uint8Array, threshold: number,
 *             used: number[], stale: number[] }}  `used` and `stale` are share numbers: the kits the
 *             secret was rebuilt from, and the kits from another deal of this identity.
 */
export function rebuildFromKits(kits, idCommitOf) {
  if (typeof idCommitOf !== 'function') throw new KitError('format', 'Rebuilding needs the contract\'s idCommitOf circuit, to check the secret', 'identity');
  const { shares, threshold, idCommit } = collectShares(kits);
  const want = hexOf(idCommit);
  let tries = 0;
  for (const pick of subsetsBySize(shares.length, threshold)) {
    if (++tries > MAX_KIT_SUBSETS) {
      throw new KitError('mismatch', `These kits do not rebuild this identity together, and there are too many to try every set of ${threshold}: at least one comes from another deal of it. Ask each guardian for their newest kit`, 'share');
    }
    const identitySecret = reconstruct(pick.map((i) => shares[i]));
    const idSalt = idSaltOf(identitySecret);
    if (hex32(idCommitOf(identitySecret, idSalt), 'The identity commitment the circuit returned', 'identity') !== want) continue;
    const kept = new Set(pick);
    const shareNo = (i) => Number(shares[i].x);
    return {
      identitySecret, idSalt, idCommit, threshold,
      used: pick.map(shareNo),
      stale: shares.map((_, i) => i).filter((i) => !kept.has(i)).map(shareNo),
    };
  }
  throw new KitError('mismatch', shares.length > threshold
    ? `These kits do not rebuild this identity: no ${threshold} of them agree, so they come from different deals of it. Ask each guardian for their newest kit`
    : 'These kits do not rebuild this identity: at least one comes from another deal of it. Ask each guardian for their newest kit, or bring one more', 'share');
}

// ---- dealing ---------------------------------------------------------------------------------------

const randomBytes32 = () => globalThis.crypto.getRandomValues(new Uint8Array(32));

/**
 * Everything an owner prints, for an identity from newIdentity: one veto card, and one kit per guardian
 * with a fresh share and, unless `credentials` are given, a fresh guardian secret and leaf salt. A kit
 * with fresh credentials protects nothing until the owner adds that guardian (addGuardian) and so mints
 * its leaf.
 * @param {object} p
 * @param p.identity   newIdentity()'s result: both salts derived from their secrets (D4), or it is refused
 * @param p.idCommit   the identity commitment (the contract's idCommitOf)
 * @param p.ctx        required: the guardian context the leaves are minted under, guardianCtx[idRoots[idCommit]]
 *                     on the ledger. It equals idCommit only for an identity never recovered or rotated. For
 *                     a successor it is the root's context (or the one the last rotateGuardianSet set), never
 *                     the successor's own commitment.
 * @param p.network, p.contract, p.guardians (n), p.threshold (t)
 * @param p.credentials optional: n { guardianSecret, leafSalt } pairs, share i+1's guardian keeping pair i,
 *                     and no guardian secret twice (the contract counts one approval per secret). New shares
 *                     for leaves already in the tree: nothing to mint, and no second set of leaves. But it
 *                     keeps every copy of those secrets and salts live, the old kits and anything a lost or
 *                     dealing device kept (SECURITY.md §6.9, §6.16). After a recovery the default is §8:
 *                     rotate the guardian set, then deal with fresh credentials (leave this out).
 * @param p.fieldRng   () => field element, for the shares' coefficients (default: Web Crypto)
 * @param p.bytesRng   () => 32 bytes, for guardian secrets and leaf salts (default: Web Crypto)
 */
export function dealKits({ identity, idCommit, ctx, network: net, contract = null, guardians, threshold, credentials, fieldRng, bytesRng = randomBytes32 }) {
  if (ctx === undefined || ctx === null) {
    throw new KitError('format', 'The guardian context is required: guardianCtx[idRoots[idCommit]] on the ledger (the identity commitment only for an identity never recovered or rotated)', 'context');
  }
  const n = count(guardians, 'The number of guardians', 'guardians', 2, MAX_GUARDIANS);
  const t = count(threshold, 'The threshold', 'threshold', 2, MAX_GUARDIANS);
  if (t > n) throw new KitError('format', `The threshold (${t}) cannot be more than the number of guardians (${n})`, 'threshold');
  // Both salts must be the ones derived from their secrets (src/identity.js, D4): the shares rebuild only
  // the identity secret, and the veto card carries only the veto secret, so a device re-derives each salt.
  // With any other salt the shares could never finalize, and the card could never veto.
  fieldElement(identity?.identitySecret, 'The identity secret', 'identitySecret');
  if (!(identity.idSalt instanceof Uint8Array) || !sameBytes(identity.idSalt, idSaltOf(identity.identitySecret))) {
    throw new KitError('format', 'The identity salt is not the one derived from its secret', 'idSalt');
  }
  fieldElement(identity.vetoSecret, 'The veto secret', 'vetoSecret');
  if (!(identity.vetoSalt instanceof Uint8Array) || !sameBytes(identity.vetoSalt, vetoSaltOf(identity.vetoSecret))) {
    throw new KitError('format', 'The veto salt is not the one derived from its secret: a veto card carries only the secret, so this card could never veto', 'vetoSalt');
  }
  const kept = credentials === undefined ? null : keptCredentials(credentials, n);
  const shares = fieldRng ? split(identity.identitySecret, n, t, fieldRng) : split(identity.identitySecret, n, t);
  const kits = shares.map((share, i) => buildGuardianKit({
    network: net, contract, idCommit, ctx, threshold: t, guardians: n, share,
    ...(kept ? kept[i] : { guardianSecret: bytesRng(), leafSalt: bytesRng() }),
  }));
  return { vetoCard: buildVetoCard(identity.vetoSecret), kits };
}

// The guardians' own secrets and salts, kept for a new deal: one pair per share, each 32 bytes, and no
// guardian secret twice, whatever its salt. The contract counts one approval per guardian SECRET per
// recovery (approvalNullifierOf(secret, idCommit, rid) leaves the leaf salt out; SECURITY.md §4.3), so
// two kits with one secret are one guardian counted as two of n: only one of them can ever approve, and
// with t = n the identity could never be recovered.
function keptCredentials(credentials, n) {
  if (!Array.isArray(credentials) || credentials.length !== n) {
    throw new KitError('format', `The credentials must be one { guardianSecret, leafSalt } per guardian: ${n} of them`, 'guardians');
  }
  const seen = new Set();
  return credentials.map((c) => {
    const guardianSecret = bytes32(c?.guardianSecret, 'A kept guardian secret', 'guardianSecret');
    const leafSalt = bytes32(c?.leafSalt, 'A kept leaf salt', 'leafSalt');
    const key = hexOf(guardianSecret);
    if (seen.has(key)) {
      throw new KitError('format', 'Two guardians are given the same guardian secret: the contract counts one approval per guardian secret, whatever the leaf salt, so they would be one guardian', 'guardianSecret');
    }
    seen.add(key);
    return { guardianSecret, leafSalt };
  });
}
