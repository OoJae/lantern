// Reads a contract's public state, as the indexer sends it, with the contract's own generated reader:
// the same runtime and the same compiled modules /demo runs (src/bindings/root.mjs), so this chunk
// shares its code with /demo's; Lantern v2's module (contracts/managed-lantern2) is a chunk of its
// own, loaded when v2's state is read. Loaded by /live only, after its first paint.
//
// The state is bytes from the network: ContractState.deserialize parses it, and the generated
// ledger() reads it field by field, exactly as `node devnet/src/shipped.mjs status` does with
// midnight-js. What leaves this module is plain data (hex strings and numbers), never runtime objects.
import '../polyfills.js';
import { rootBindings } from '../../../src/bindings/root.mjs';
import { publicRecord, hostRecord } from '../../../src/demo/story.mjs';
import { hex } from '../lib/format.js';
import { isFrozen } from './status.js';

const { rt, Lantern, Host } = rootBindings;

const bytesOf = (h) => {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

async function sha256(u8) {
  const d = await crypto.subtle.digest('SHA-256', u8);
  return hex(new Uint8Array(d));
}

async function common(cs) {
  const ma = cs.maintenanceAuthority;
  const keys = {};
  for (const op of cs.operations()) {
    const name = String(op);
    const vk = cs.operation(op)?.verifierKey;
    keys[name] = vk ? await sha256(vk) : null;
  }
  const committee = ma.committee.length;
  const threshold = Number(ma.threshold);
  return { frozen: isFrozen(committee, threshold), committee, threshold, keys };
}

/** A Lantern contract's public state: its recoveries, its identities, its counts and its keys. */
export async function decodeLantern(stateHex) {
  const cs = rt.ContractState.deserialize(bytesOf(stateHex));
  const L = Lantern.ledger(cs.data);
  const identities = {};
  for (const c of L.enrolled) {
    const id = hex(c);
    identities[id] = {
      idCommit: id,
      idRoot: L.idRoots.member(c) ? hex(L.idRoots.lookup(c)) : null,
      threshold: L.thresholds.member(c) ? Number(L.thresholds.lookup(c)) : null,
      retired: L.retiredIdentities.member(c),
    };
  }
  const recoveries = [];
  for (const [rid, r] of L.recoveries) {
    recoveries.push({
      rid: hex(rid),
      idCommit: hex(r.idCommit),
      idRoot: hex(r.idRoot),
      ctx: hex(r.ctx),
      ephemeralPk: hex(r.ephemeralPk),
      openedAtLo: Number(r.openedAtLo) * 1000,
      openedAtHi: Number(r.openedAtHi) * 1000,
      approvals: L.approvals.member(rid) ? Number(L.approvals.lookup(rid).read()) : 0,
      killed: L.killed.member(rid),
      // finalizeRecovery refuses once the identity's guardian set has been replaced since the open
      ctxCurrent: L.guardianCtx.member(r.idRoot) && hex(L.guardianCtx.lookup(r.idRoot)) === hex(r.ctx),
    });
  }
  recoveries.sort((a, b) => a.openedAtHi - b.openedAtHi);
  return { kind: 'lantern', identities, recoveries, counts: publicRecord(L), ...(await common(cs)) };
}

// Lantern v2's compiled module, loaded only when v2's state is read: it is a chunk of its own, so a
// browser (or the dev server) that cannot load it loses v2's reader and nothing else.
let lantern2 = null;
const loadLantern2 = () => (lantern2 ??= import('../../../contracts/managed-lantern2/contract/index.js').catch((e) => { lantern2 = null; throw e; }));

// A ledger Set iterates its keys, and a Map its [key, value] pairs; a Map of Counters cannot be
// iterated, so its keys come from elsewhere. As devnet/src/v2-story.mjs reads them.
const keysOf = (it) => Array.from(it, (e) => (Array.isArray(e) ? e[0] : e));
const count = (it) => keysOf(it).length;
const isZero = (u) => u.every((b) => b === 0);

/** Every public count the v2 ledger holds: devnet/src/v2-story.mjs v2Summary, field for field. */
function v2Counts(L) {
  const roots = keysOf(L.idRoots).filter((k) => hex(L.idRoots.lookup(k)) === hex(k));
  let vetoCount = 0;
  let locked = 0;
  let reserved = 0;
  for (const root of roots) vetoCount += Number(L.vetoCounts.lookup(root).read());
  for (const [, v] of L.locked) if (v) locked++;
  for (const [, v] of L.reservedRecovery) if (!isZero(v)) reserved++;
  return {
    enrolled: count(L.enrolled), guardianLeaves: Number(L.guardians.firstFree()),
    recoveries: count(L.recoveries), approvals: count(L.approvedNullifiers), vetoes: count(L.vetoNullifiers),
    killed: count(L.killed), retired: count(L.retiredIdentities), lineage: Number(L.lineage.firstFree()),
    guardianSets: count(L.usedGuardianCtx), gateActions: Number(L.gateActions),
    opens: count(L.openNullifiers), vetoCount, reserved, locked, checkIns: count(L.checkInNullifiers),
  };
}

/** One identity's v2 state from the public ledger alone: devnet/src/v2-story.mjs identityState,
 *  field for field. Null when the identity is not enrolled. */
function v2Identity(L, pure, idCommit, period) {
  if (!L.idRoots.member(idCommit)) return null;
  const root = L.idRoots.lookup(idCommit);
  const ctx = L.guardianCtx.lookup(root);
  const key = pure.checkInKeyOf(root, ctx, BigInt(period));
  const recoveries = keysOf(L.recoveries).map((rid) => ({ rid, rec: L.recoveries.lookup(rid) }))
    .filter(({ rec }) => hex(rec.idRoot) === hex(root))
    .map(({ rid, rec }) => ({
      rid: hex(rid), device: hex(rec.ephemeralPk), approvals: Number(L.approvals.lookup(rid).read()),
      killed: L.killed.member(rid), openedAtHi: Number(rec.openedAtHi), unlockAt: Number(rec.unlockAt),
      approveBy: Number(rec.approveBy), expiresAt: Number(rec.expiresAt),
    }))
    .sort((a, b) => a.openedAtHi - b.openedAtHi || a.rid.localeCompare(b.rid));
  return {
    idCommit: hex(idCommit), root: hex(root),
    delaySeconds: Number(L.recoveryDelays.lookup(root)), threshold: Number(L.thresholds.lookup(idCommit)),
    locked: L.locked.lookup(root), vetoCommit: hex(L.vetoCommits.lookup(idCommit)),
    vetoCount: Number(L.vetoCounts.lookup(root).read()), lastVetoAt: Number(L.lastVetoAt.lookup(root)),
    liveRecovery: L.liveRecovery.member(root) ? hex(L.liveRecovery.lookup(root)) : null,
    reservedRecovery: L.reservedRecovery.member(root) && !isZero(L.reservedRecovery.lookup(root)) ? hex(L.reservedRecovery.lookup(root)) : null,
    recoveries,
    checkIns: { period: Number(period), count: L.checkIns.member(key) ? Number(L.checkIns.lookup(key).read()) : 0 },
  };
}

/**
 * Lantern v2's public state: its counts, one identity's state (the one its run enrolled, with the
 * check-in period the run used) and its keys.
 * @param {string} stateHex
 * @param {{ idCommit: string, period: number }} of
 */
export async function decodeLantern2(stateHex, of) {
  const { ledger, pureCircuits } = await loadLantern2();
  const cs = rt.ContractState.deserialize(bytesOf(stateHex));
  const L = ledger(cs.data);
  return { kind: 'lantern2', counts: v2Counts(L), identity: v2Identity(L, pureCircuits, bytesOf(of.idCommit), of.period), ...(await common(cs)) };
}

/** The independent host's public state: its counts and its keys. */
export async function decodeHost(stateHex) {
  const cs = rt.ContractState.deserialize(bytesOf(stateHex));
  return { kind: 'host', counts: hostRecord(Host.ledger(cs.data)), ...(await common(cs)) };
}
