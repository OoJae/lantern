// Builds the Lantern v2 target world for the attack, and returns what a chain
// observer has: the public ledger and v2's public derivation code. The same
// three people as v1's targets are guardians, each with 32 bytes of FRESH
// entropy as secret and salt, delivered out of band -- never a function of the
// name. One opens a recovery, two approve, all three check in.
//
// Runtime-free: the runtime and the compiled v2 module are passed in. Only the
// test imports them; test/portable.test.js keeps src/ free of both.
import { createContractSim } from '../contract-sim.js';
import { observerView } from '../attack/view.mjs';
import { TRUE_GUARDIANS } from '../attack/candidates.mjs';
import { randomFieldElement } from '../field.js';
import { lantern2Witnesses } from './witnesses.js';
import { periodOf } from './timeline.js';

const rand32 = () => globalThis.crypto.getRandomValues(new Uint8Array(32));

export function buildV2Target({ rt, mod, now = 1_700_000_000, withSim = false }) {
  const P = mod.pureCircuits;
  let sim = null;
  sim = createContractSim({ rt, mod, witnesses: lantern2Witnesses({ pure: P, clock: () => sim.now }), now });

  const owner = { name: 'owner', identitySecret: randomFieldElement(), idSalt: rand32(), vetoSecret: randomFieldElement(), vetoSalt: rand32() };
  const idCommit = P.idCommitOf(owner.identitySecret, owner.idSalt);
  sim.callAs(owner, 'enrollIdentity', idCommit, P.vetoCommitOf(owner.vetoSecret, owner.vetoSalt), 2n, 259_200n);

  const secrets = TRUE_GUARDIANS.map((name) => ({ name, secret: rand32(), salt: rand32() }));
  for (const g of secrets) {
    g.leaf = sim.callAs({ ...owner, guardianSecret: g.secret, leafSalt: g.salt }, 'addGuardian', idCommit);
  }
  const as = (g) => ({ name: g.name, guardianSecret: g.secret, leafSalt: g.salt, leaf: g.leaf });
  const period = periodOf(sim.now);
  const rid = sim.callAs(as(secrets[0]), 'openRecovery', idCommit, rand32(), period);
  for (const g of secrets.slice(0, 2)) sim.callAs(as(g), 'approveRecovery', idCommit, rid);
  for (const g of secrets) sim.callAs(as(g), 'checkIn', idCommit, period);

  return {
    view: observerView('v2', 'lantern v2', 'commit(secret‖ctx, salt)',
      { idCommit, idRoot: idCommit, rids: [rid], periods: [period] }, sim.ledger, P),
    truth: { guardians: TRUE_GUARDIANS.length, votes: 2, opens: 1, checkIns: TRUE_GUARDIANS.length },
    // For the negative control ONLY. Never passed to the attacker.
    secretsForNegativeControl: secrets,
    ...(withSim ? { sim } : {}),
  };
}
