// Reads a contract's public state, as the indexer sends it, with the contract's own generated reader:
// the same runtime and the same compiled modules /demo runs (src/bindings/root.mjs), so this chunk
// shares its code with /demo's. Loaded by /live only, after its first paint.
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

/** The independent host's public state: its counts and its keys. */
export async function decodeHost(stateHex) {
  const cs = rt.ContractState.deserialize(bytesOf(stateHex));
  return { kind: 'host', counts: hostRecord(Host.ledger(cs.data)), ...(await common(cs)) };
}
