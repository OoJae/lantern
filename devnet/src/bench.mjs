#!/usr/bin/env node
// npm run devnet:bench
//
// Proves the SHIPPED finalizeRecovery -- the 72-hour timelock, not the devnet flavour's 60 s --
// on the local proof server, and times it. Prove-only: nothing is submitted.
//
// Why prove-only: a recovery on a real chain cannot be 72 hours old in a laptop session. So the
// state is built in the simulator with the shipped contract module, the recovery opened 73 hours
// ago; the shipped finalizeRecovery verifier key is attached; midnight-js builds the unproven
// transaction by running the circuit locally (against the laptop clock, which is past the lock);
// and the proof server proves it with the shipped prover key. A wrong witness or an unexpired
// lock would fail the local run before any proof. The chain runs record the devnet flavour's
// finalizeRecovery, whose verifier key is the only one that differs from the shipped build.
import './ws.mjs'; // before anything that loads the wallet SDK: see ws.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as L from '@midnight-ntwrk/ledger-v8';
import { createUnprovenCallTxFromInitialStates } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import * as rt from '@midnight-ntwrk/compact-runtime';
import { network, repoRoot } from './config.mjs';
import { SHIPPED_ZK } from './bindings.mjs';
import { compiledContract } from './providers.mjs';
import { lanternWitnesses } from '../../src/witnesses.js';
import { createContractSim } from '../../src/contract-sim.js';
import { newIdentity } from '../../src/identity.js';
import { storyRng } from '../../src/demo/rng.mjs';

const Shipped = await import(pathToFileURL(path.join(SHIPPED_ZK, 'contract', 'index.js')).href);
const pure = Shipped.pureCircuits;
const rng = storyRng();
const DELAY = Number(pure.recoveryDelaySeconds());
if (DELAY !== 259200) throw new Error(`expected the shipped 72 h timelock, found ${DELAY} s`);

// ---- the state: a recovery opened `ago` seconds ago, with a quorum ---------------------------
const now = Math.floor(Date.now() / 1000);
const cc = compiledContract('Lantern (shipped)', Shipped.Contract,
  lanternWitnesses({ pure, clock: () => BigInt(Math.floor(Date.now() / 1000) - 30) }), SHIPPED_ZK);
const zk = new NodeZkConfigProvider(SHIPPED_ZK);
const verifierKey = readFileSync(path.join(SHIPPED_ZK, 'keys', 'finalizeRecovery.verifier'));

async function finalizeAfter(ago) {
  const opened = now - ago;
  const owner = newIdentity(rng.field);
  const phoneSk = rng.bytes32();
  const g = [0, 1].map(() => ({ guardianSecret: rng.bytes32(), leafSalt: rng.bytes32() }));
  const sim = createContractSim({ rt, mod: Shipped, now: opened,
    witnesses: lanternWitnesses({ pure, clock: () => BigInt(opened) }) });
  const id = pure.idCommitOf(owner.identitySecret, owner.idSalt);
  const hana = { name: 'Hana', ...owner };
  sim.callAs(hana, 'enrollIdentity', id, pure.vetoCommitOf(owner.vetoSecret, owner.vetoSalt), 2n);
  const leaves = g.map((x) => sim.callAs({ ...hana, ...x }, 'addGuardian', id));
  const rid = sim.callAs({ name: 'Seo-yeon' }, 'openRecovery', id, pure.ephemeralPkOf(phoneSk));
  g.forEach((x, i) => sim.callAs({ name: `guardian ${i + 1}`, ...x, leaf: leaves[i] }, 'approveRecovery', id, rid));

  // compact-js runs the circuit against the RUNTIME's ContractState, the same WASM module the
  // simulator's state belongs to.
  const cs = new rt.ContractState();
  cs.data = sim.state;
  const op = new rt.ContractOperation();
  op.verifierKey = verifierKey;
  cs.setOperation('finalizeRecovery', op);
  const keys = L.ZswapSecretKeys.fromSeed(rng.bytes32());
  const successor = newIdentity(rng.field);
  return createUnprovenCallTxFromInitialStates(zk, {
    compiledContract: cc,
    circuitId: 'finalizeRecovery',
    contractAddress: rt.sampleContractAddress(),
    coinPublicKey: keys.coinPublicKey,
    initialContractState: cs,
    initialZswapChainState: new L.ZswapChainState(),
    ledgerParameters: L.LedgerParameters.initialParameters(),
    initialPrivateState: { name: 'Hana\'s new phone', ...owner, ephemeralSk: phoneSk },
    args: [rid, pure.idCommitOf(successor.identitySecret, successor.idSalt), pure.vetoCommitOf(successor.vetoSecret, successor.vetoSalt)],
  }, keys.encryptionPublicKey);
}

// Negative control: 71 hours is not enough. The local run refuses before anything is proved.
let refused = null;
try { await finalizeAfter(DELAY - 3600); } catch (e) { refused = String(e.message ?? e).match(/timelock has not elapsed/)?.[0] ?? String(e.message).slice(0, 120); }
if (refused !== 'timelock has not elapsed') throw new Error(`negative control failed: a 71 h old recovery was not refused (${refused})`);
console.log('\n  shipped finalizeRecovery, 71 h after the open: refused locally, "timelock has not elapsed" -- nothing to prove');

const t0 = Date.now();
const unproven = await finalizeAfter(DELAY + 3600);
const t1 = Date.now();
console.log('  shipped finalizeRecovery, 73 h after the open, quorum 2 of 2: the local run passes; proving it');

// ---- the proof -------------------------------------------------------------------------------
const proofs = [];
for (let i = 0; i < 3; i++) {
  const s = Date.now();
  await httpClientProofProvider(network.proofServer, zk).proveTx(unproven.private.unprovenTx);
  proofs.push(Math.round((Date.now() - s) / 100) / 10);
  console.log(`  proof ${i + 1}: ${proofs[i]} s${i === 0 ? ' (first after the build: may be cold)' : ''}`);
}
const out = {
  what: 'The SHIPPED finalizeRecovery (72 h timelock), proved on the local proof server. Prove-only: not submitted.',
  recordedAt: new Date().toISOString(),
  machine: { platform: `${os.platform()} ${os.arch()}`, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, node: process.version },
  proofServer: 'midnightntwrk/proof-server:8.1.0',
  circuit: 'finalizeRecovery', timelockSeconds: DELAY,
  recoveryOpenedHoursAgo: 73,
  negativeControl: 'the same finalize 71 h after the open was refused locally: timelock has not elapsed',
  executeAndBuildSeconds: Math.round((t1 - t0) / 100) / 10,
  proveSeconds: proofs,
  verifierKeySha256: Buffer.from(await crypto.subtle.digest('SHA-256', verifierKey)).toString('hex'),
};
mkdirSync(path.join(repoRoot, 'deployments'), { recursive: true });
writeFileSync(path.join(repoRoot, 'deployments', 'bench-shipped-finalize.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`  local run + transaction ${out.executeAndBuildSeconds} s · proofs ${proofs.join(', ')} s · deployments/bench-shipped-finalize.json\n`);
process.exit(0);
