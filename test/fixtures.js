import { LanternSim, pureCircuits, bytes32, fieldOf, DEFAULT_NOW } from './simulator.js';

export const ID_SECRET = fieldOf(50);
export const ID_SALT = bytes32(51);
export const VETO_SECRET = fieldOf(60);
export const VETO_SALT = bytes32(61);
export const EPH_A = bytes32(20);
export const EPH_B = bytes32(21);

export const idCommit = () => pureCircuits.idCommitOf(ID_SECRET, ID_SALT);
export const vetoCommit = () => pureCircuits.vetoCommitOf(VETO_SECRET, VETO_SALT);
export const DELAY = Number(pureCircuits.recoveryDelaySeconds());
export const SLACK = Number(pureCircuits.openSlackSeconds());

/** Enrol an identity with `n` guardians at the given threshold. */
export function world({ n = 2, threshold = 2, now = DEFAULT_NOW } = {}) {
  const sim = new LanternSim({}, now);
  const id = idCommit();
  sim.call('enrollIdentity', id, vetoCommit(), BigInt(threshold));

  // The OWNER adds guardians, so identitySecret stays constant while each
  // guardian gets distinct secret material.
  const guardians = [];
  for (let i = 0; i < n; i++) {
    sim.ps.guardianSecret = bytes32(100 + i);
    sim.ps.leafSalt = bytes32(200 + i);
    const leaf = sim.call('addGuardian', id);
    guardians.push({ secret: bytes32(100 + i), salt: bytes32(200 + i), leaf });
  }
  return { sim, id, idRoot: id, guardians };
}

/** Act as guardian `g`: load their witness material and their Merkle path. */
export function asGuardian(sim, g) {
  sim.ps.guardianSecret = g.secret;
  sim.ps.leafSalt = g.salt;
  sim.ps.guardianPath = sim.findPath(g.leaf);
  return sim;
}

/** Open a recovery and collect `k` guardian approvals. */
export function openAndApprove(sim, id, guardians, k, eph = EPH_A) {
  const rid = sim.call('openRecovery', id, eph);
  for (let i = 0; i < k; i++) {
    asGuardian(sim, guardians[i]);
    sim.call('approveRecovery', id, rid);
  }
  return rid;
}

/**
 * Run one full recovery and rebind the sim to the SUCCESSOR's identity.
 * This is the helper the whole Phase 3 suite hangs off.
 */
export function succeed(sim, id, guardians, gen = 1, eph = EPH_A) {
  const secret = fieldOf(700 + gen), salt = bytes32(110 + gen);
  const vSecret = fieldOf(800 + gen), vSalt = bytes32(140 + gen);
  const newId = pureCircuits.idCommitOf(secret, salt);
  const rid = openAndApprove(sim, id, guardians, 2, eph);
  sim.advance(DELAY + SLACK + 1);
  sim.call('finalizeRecovery', rid, newId, pureCircuits.vetoCommitOf(vSecret, vSalt));
  // The new device holds the successor's material.
  sim.ps.identitySecret = secret; sim.ps.idSalt = salt;
  sim.ps.vetoSecret = vSecret;    sim.ps.vetoSalt = vSalt;
  return { newId, secret, salt, vSecret, vSalt };
}
