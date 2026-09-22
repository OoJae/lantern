// SPIKE S1: the real compiled circuit, in the browser, under the production CSP.
import './polyfills.js';
import { LanternSim, pureCircuits, bytes32, fieldOf } from '../../test/simulator.js';

const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
const out = {};
try {
  out.idCommit = hex(pureCircuits.idCommitOf(fieldOf(50), bytes32(51)));
  const sim = new LanternSim();
  sim.call('enrollIdentity', pureCircuits.idCommitOf(fieldOf(50), bytes32(51)),
    pureCircuits.vetoCommitOf(fieldOf(60), bytes32(61)), 2n);
  out.enrolled = sim.ledger.enrolled.member(pureCircuits.idCommitOf(fieldOf(50), bytes32(51)));
  sim.ps.identitySecret = fieldOf(999);
  try { sim.call('addGuardian', pureCircuits.idCommitOf(fieldOf(50), bytes32(51))); out.forged = 'ACCEPTED'; }
  catch (e) { out.forged = String(e.message); }
} catch (e) {
  out.error = String(e && e.stack || e);
}
document.getElementById('out').textContent = JSON.stringify(out);
