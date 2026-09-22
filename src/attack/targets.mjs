// Builds the four target worlds and returns, for each, ONLY what a chain
// observer has: the public ledger and that contract's public derivation code.
//
// The structural guarantee: the attacker receives a frozen view with no
// simulator, no private state and no witness. So a target that HOLDS cannot be
// holding because the attacker was denied something a real observer has --
// and a target that BREAKS was broken from public data alone.
import { webcrypto } from 'node:crypto';
import * as PublicGuardians from '../../contracts/managed-public-guardians/contract/index.js';
import * as LanternV0 from '../../contracts/managed-lantern-v0/contract/index.js';
import * as Lantern from '../../contracts/managed/contract/index.js';
import { Sim } from './sim.mjs';
import { TRUE_GUARDIANS, guardianIdOf } from './candidates.mjs';

export const OWNER = new Uint8Array(32).fill(0xc4);       // the victim, as target 1/2 see them
export const RIDS = [new Uint8Array(32).fill(0x76)];       // recoveries opened -- rids are public args
export const SLOTS = 8;                                    // 2b's slot range

const slotBytes = (i) => { const b = new Uint8Array(32); b[31] = i; return b; };
const rand32 = () => webcrypto.getRandomValues(new Uint8Array(32));

// Deterministic but NOT a function of the guardian's name, so target 3's
// secrets can be reproduced for the negative control without being guessable.
function demoEntropy(label) {
  const b = new Uint8Array(32);
  const s = `lantern-demo-entropy:${label}`;
  for (let i = 0; i < 32; i++) b[i] = (s.charCodeAt(i % s.length) * (i + 7) + i * 131) & 0xff;
  return b;
}

const view = (id, label, scheme, publicParams, sim) => Object.freeze({
  id, label, scheme,
  publicParams: Object.freeze(publicParams),
  ledger: sim.ledger,
  pureCircuits: sim.mod.pureCircuits,
});

// --- 1 · the transparent baseline ------------------------------------------
function buildPublicGuardians() {
  const sim = new Sim(PublicGuardians, []);
  sim.call('enroll', OWNER, 2n);
  for (const n of TRUE_GUARDIANS) sim.call('addGuardian', OWNER, guardianIdOf(n));
  // Two of the three approve.
  for (const n of TRUE_GUARDIANS.slice(0, 2)) sim.call('approve', OWNER, guardianIdOf(n), RIDS[0]);
  return {
    view: view('1', 'PublicGuardians', 'identifiers stored in clear', { owner: OWNER, rids: RIDS }, sim),
    truth: { guardians: TRUE_GUARDIANS.length, votes: 2 },
  };
}

// --- 2a / 2b · lantern-v0, the two plausible first passes -------------------
function buildV0(mode) {
  const sim = new Sim(LanternV0, ['guardianId', 'guardianPath']);
  sim.call('enroll', OWNER, 2n);
  const leaves = TRUE_GUARDIANS.map((n, i) => {
    sim.ps.guardianId = guardianIdOf(n);
    return mode === 'unsalted'
      ? sim.call('addGuardianUnsalted', OWNER)
      : sim.call('addGuardianDerivedSalt', OWNER, slotBytes([3, 0, 5][i]));
  });
  sim.call('openRecovery', RIDS[0]);
  TRUE_GUARDIANS.slice(0, 2).forEach((n, i) => {
    sim.ps.guardianId = guardianIdOf(n);
    sim.ps.guardianPath = sim.ledger.guardians.findPathForLeaf(leaves[i]);
    if (mode === 'unsalted') sim.call('approveUnsalted', OWNER, RIDS[0]);
    else sim.call('approveDerivedSalt', OWNER, slotBytes([3, 0, 5][i]), RIDS[0]);
  });
  const id = mode === 'unsalted' ? '2a' : '2b';
  const label = mode === 'unsalted' ? 'lantern-v0 · unsalted leaf' : 'lantern-v0 · derived salt';
  const scheme = mode === 'unsalted' ? 'H(domain, id, owner)' : 'commit(…, H(owner, slot))';
  return {
    view: view(id, label, scheme, { owner: OWNER, rids: RIDS, slots: SLOTS }, sim),
    truth: { guardians: TRUE_GUARDIANS.length, votes: 2 },
    sim,
  };
}

// --- 3 · the shipped contract ----------------------------------------------
// The same three people are guardians. But each guardian's secret and salt are
// 32 bytes of entropy delivered out of band -- NOT a function of who they are.
function buildShipped() {
  const sim = new Sim(Lantern, [
    'guardianSecret', 'leafSalt', 'guardianPath', 'lineagePath',
    'identitySecret', 'idSalt', 'vetoSecret', 'vetoSalt', 'claimedNow',
  ]);
  const idSecret = 0x1234567890abcdefn * 99991n, idSalt = demoEntropy('idSalt');
  const idCommit = Lantern.pureCircuits.idCommitOf(idSecret, idSalt);
  Object.assign(sim.ps, { identitySecret: idSecret, idSalt });
  sim.call('enrollIdentity', idCommit,
    Lantern.pureCircuits.vetoCommitOf(0xfeedn, demoEntropy('vetoSalt')), 2n);

  const secrets = TRUE_GUARDIANS.map((n) => ({
    name: n, secret: demoEntropy(`secret:${n}`), salt: demoEntropy(`salt:${n}`),
  }));
  for (const g of secrets) {
    sim.ps.guardianSecret = g.secret; sim.ps.leafSalt = g.salt;
    g.leaf = sim.call('addGuardian', idCommit);
  }
  sim.ps.claimedNow = BigInt(sim.now);
  const rid = sim.call('openRecovery', idCommit, rand32());
  for (const g of secrets.slice(0, 2)) {
    sim.ps.guardianSecret = g.secret; sim.ps.leafSalt = g.salt;
    sim.ps.guardianPath = sim.ledger.guardians.findPathForLeaf(g.leaf);
    sim.call('approveRecovery', idCommit, rid);
  }
  return {
    view: view('3', 'lantern  (shipped)', 'commit(secret‖ctx, salt)',
      { idCommit, idRoot: idCommit, rids: [rid] }, sim),
    truth: { guardians: TRUE_GUARDIANS.length, votes: 2 },
    // For the negative control ONLY. Never passed to the attacker.
    secretsForNegativeControl: secrets,
    sim,
  };
}

/** Every target. `withSims` exists for tests that must inspect transcripts. */
export function buildTargets({ withSims = false } = {}) {
  const built = [buildPublicGuardians(), buildV0('unsalted'), buildV0('salted'), buildShipped()];
  return built.map((b) => withSims ? b : { view: b.view, truth: b.truth,
    secretsForNegativeControl: b.secretsForNegativeControl });
}
