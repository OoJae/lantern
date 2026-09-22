// The story's chain executor: every circuit runs as a real transaction on the local chain --
// executed locally, proved by the proof server, balanced with DUST, submitted, finalized.
// It implements the same interface as src/demo/sim-executor.mjs, so it runs the same story
// with the same expectations, against both contracts: Lantern, and the independently
// deployed host with its committee. A refusal is the circuit's own assert, caught locally
// before anything is proved: exactly what a real client would see.
import { deployContract, findDeployedContract, submitTx } from '@midnight-ntwrk/midnight-js-contracts';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as L from '@midnight-ntwrk/ledger-v8';
import { lanternWitnesses } from '../../src/witnesses.js';
import { hostWitnesses } from '../../src/host-witnesses.js';
import { createCommittee } from '../../src/host/committee.js';
import { canonicalSnapshot } from '../../src/host/snapshot.js';
import { publicRecord, hostRecord, duration } from '../../src/demo/story.mjs';
import { providersFor, compiledContract } from './providers.mjs';
import { createSponsor } from './sponsor.mjs';
import { walletlessDevice } from './device.mjs';
import { tipTime, waitForChainTime } from './chain.mjs';

const CALL_TIMEOUT_MS = 180_000;
const ACTOR = 'actor';
const secs = (ms) => Math.round(ms / 100) / 10;

/** Wrap the providers so every phase of a transaction is timed. */
function timedProviders(base, current) {
  const mark = (k) => { const t = current(); if (t) t[k] = Date.now(); };
  const around = (start, end, fn) => async (...a) => { mark(start); try { return await fn(...a); } finally { mark(end); } };
  const walletProvider = {
    getCoinPublicKey: () => base.walletProvider.getCoinPublicKey(),
    getEncryptionPublicKey: () => base.walletProvider.getEncryptionPublicKey(),
    balanceTx: around('balanceStart', 'balanceEnd', (tx, ttl) => base.walletProvider.balanceTx(tx, ttl)),
  };
  return {
    ...base,
    proofProvider: { proveTx: around('proveStart', 'proveEnd', (tx, cfg) => base.proofProvider.proveTx(tx, cfg)) },
    walletProvider,
    midnightProvider: { submitTx: around('submitStart', 'submitEnd', (tx) => base.midnightProvider.submitTx(tx)) },
  };
}

function phases(t) {
  const d = (a, b) => (t[a] && t[b] ? secs(t[b] - t[a]) : null);
  return {
    execute: d('start', 'proveStart'), prove: d('proveStart', 'proveEnd'), balance: d('balanceStart', 'balanceEnd'),
    submit: d('submitStart', 'submitEnd'), finalize: d('submitEnd', 'end'), total: d('start', 'end'),
  };
}

/** A transaction's public identifiers, from a midnight-js FinalizedTxData. */
const txOf = (pub) => ({ txId: pub.txId, txHash: pub.txHash, blockHeight: pub.blockHeight, status: pub.status });

/**
 * @param bindings     devnet/src/bindings.mjs: { rt, schnorr, Lantern, Host }
 * @param wallet       the genesis wallet: deploys both contracts, and pays for every call
 *                     not listed below
 * @param sponsorship  optional { sponsorWallet, guardianWallet }. With it, a persona holding
 *                     no wallet (`wallet: 'none'`, the recovering phone) is paid for by the
 *                     sponsor, and Seo-yeon's open is paid for by her own wallet.
 */
export async function devnetExecutor({ bindings, zk, wallet, log = () => {}, sponsorship = null, hostTag = 4242n }) {
  const { rt, schnorr, Lantern, Host } = bindings;
  let timing = null;
  let claimed = 0n;
  const proved = new Set();
  const base = await providersFor(wallet, zk.lantern);
  // An honest claimed time: no later than either clock, with margin for skew. Each circuit
  // runs locally against the laptop clock and on chain against the block time.
  const claim = () => claimed;
  const claimNow = async () => { claimed = BigInt(Math.min(Math.floor(Date.now() / 1000), await tipTime()) - 30); };

  // A fresh committee every run: its signing keys exist only in this process.
  const committee = createCommittee({ rt, schnorr },
    [0, 1, 2].map(() => globalThis.crypto.getRandomValues(new Uint8Array(32))));
  const contracts = {
    lantern: { name: 'Lantern', zk: zk.lantern, args: [],
      cc: compiledContract('Lantern', Lantern.Contract, lanternWitnesses({ pure: Lantern.pureCircuits, clock: claim }), zk.lantern) },
    host: { name: 'LanternHost', zk: zk.host, args: [hostTag, 2n, ...committee.ctorArgs()],
      cc: compiledContract('LanternHost', Host.Contract, hostWitnesses({ clock: claim }), zk.host) },
  };

  // Each contract's circuits are proved with that contract's keys: one provider set per contract.
  const providerSets = {};
  const providersOf = async (c, walletBase) => {
    const p = await providersFor(walletBase, contracts[c].zk, base.privateStateProvider);
    return timedProviders(p, () => timing);
  };

  // ---- deploy each contract, then freeze its maintenance authority -----------------------
  for (const [key, c] of Object.entries(contracts)) {
    providerSets[key] = await providersOf(key, wallet);
    const providers = providerSets[key];
    timing = { start: Date.now() };
    await claimNow();
    const deployed = await deployContract(providers, {
      compiledContract: c.cc, privateStateId: ACTOR, initialPrivateState: { name: 'deployer' }, args: c.args,
    });
    timing.end = Date.now();
    c.address = deployed.deployTxData.public.contractAddress;
    c.handles = { genesis: deployed };
    c.deploy = { address: c.address, ...txOf(deployed.deployTxData.public), timings: phases(timing) };
    log(`deployed ${c.name} at ${c.address} (block ${c.deploy.blockHeight})`);

    // deployContract installs the deployer's key as a 1-of-1 maintenance authority, which
    // could replace any verifier key. Replace it with an empty committee: no signature can
    // ever satisfy it, so this deployment's rules can never change (spike S5).
    const state = await providers.publicDataProvider.queryContractState(c.address);
    const signingKey = await providers.privateStateProvider.getSigningKey(c.address);
    const frozen = new L.ContractMaintenanceAuthority([], 1, state.maintenanceAuthority.counter + 1n);
    const update = new L.MaintenanceUpdate(c.address, [new L.ReplaceAuthority(frozen)], state.maintenanceAuthority.counter);
    const signed = update.addSignature(0n, L.signData(signingKey, update.dataToSign));
    const freezeTx = L.Transaction.fromParts(getNetworkId(), undefined, undefined,
      L.Intent.new(new Date(Date.now() + 3600_000)).addMaintenanceUpdate(signed));
    const fr = await submitTx(providers, { unprovenTx: freezeTx });
    if (fr.status !== 'SucceedEntirely') throw new Error(`freezing ${c.name}'s maintenance authority failed: ${fr.status}`);
    const after = (await providers.publicDataProvider.queryContractState(c.address)).maintenanceAuthority;
    c.authority = { committee: after.committee.length, threshold: after.threshold, counter: Number(after.counter), frozenBy: txOf(fr) };
    log(`${c.name}'s maintenance authority frozen: committee ${c.authority.committee}, threshold ${c.authority.threshold} (block ${fr.blockHeight})`);
  }

  const pdp = base.publicDataProvider;
  const ledgerOf = async (key) => (key === 'host' ? Host : Lantern).ledger((await pdp.queryContractState(contracts[key].address)).data);

  // Who pays. Every handle shares one private-state store, so any of them can act as any persona.
  let evidence = null;
  if (sponsorship) {
    const sponsor = createSponsor({ wallet: sponsorship.sponsorWallet,
      addresses: [contracts.lantern.address, contracts.host.address], log });
    const device = walletlessDevice(sponsor, (e) => { evidence = e; });
    for (const [key, c] of Object.entries(contracts)) {
      const find = (p) => findDeployedContract(p, { contractAddress: c.address, compiledContract: c.cc, privateStateId: ACTOR });
      const p = await providersFor(wallet, c.zk, base.privateStateProvider);
      c.handles.device = await find(timedProviders({ ...p, ...device }, () => timing));
      c.handles.guardian = await find(await providersOf(key, sponsorship.guardianWallet));
    }
  }
  const payerOf = (ps, c) => {
    if (ps.wallet === 'none' && c.handles.device) return ['device', 'the sponsor (the device holds no wallet)'];
    if (ps.wallet === 'seo-yeon' && c.handles.guardian) return ['guardian', 'Seo-yeon\'s own wallet'];
    return ['genesis', 'the genesis wallet'];
  };

  return {
    name: 'local chain',
    pure: Lantern.pureCircuits,
    hostPure: Host.pureCircuits,
    hostTag,
    committee,
    contracts: Object.fromEntries(Object.entries(contracts).map(([k, c]) => [k, { name: c.name, ...c.deploy, maintenanceAuthority: c.authority }])),
    ledger: () => ledgerOf('lantern'),
    hostLedger: () => ledgerOf('host'),
    snapshot: async () => canonicalSnapshot(rt, Host.pureCircuits.ownerLeafOf, await ledgerOf('lantern')),
    async call(ps, circuit, args, rec, contract = 'lantern') {
      const c = contracts[contract];
      await base.privateStateProvider.setContractAddress?.(c.address);
      await base.privateStateProvider.set(ACTOR, ps);
      await claimNow();
      const summary = contract === 'host' ? hostRecord : publicRecord;
      const before = summary(await ledgerOf(contract));
      const [handle, payer] = payerOf(ps, c);
      evidence = null;
      timing = { start: Date.now() };
      const call = c.handles[handle].callTx[circuit](...args);
      let timer;
      const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), CALL_TIMEOUT_MS); });
      const r = await Promise.race([call, timeout]).finally(() => clearTimeout(timer));
      timing.end = Date.now();
      if (r === 'timeout') {
        // midnight-js waits indefinitely for finalization. After 180 s, ask the ledger itself.
        const changed = JSON.stringify(summary(await ledgerOf(contract))) !== JSON.stringify(before);
        if (!changed) throw new Error(`no finalization after ${CALL_TIMEOUT_MS / 1000} s and the ledger did not change`);
        rec.tx = { note: `finalization not reported within ${CALL_TIMEOUT_MS / 1000} s; the ledger shows the change` };
        rec.timings = phases(timing);
        return null;
      }
      rec.tx = txOf(r.public);
      rec.payer = payer;
      if (evidence) rec.sponsorship = evidence;
      rec.timings = phases(timing);
      rec.timings.cold = proved.size === 0;
      rec.timings.firstOfCircuit = !proved.has(circuit);
      proved.add(circuit);
      if (r.public.status !== 'SucceedEntirely') throw new Error(`transaction ${r.public.txId} ended ${r.public.status}`);
      return r.private?.result;
    },
    async advance(seconds, until) {
      const target = until ?? (await tipTime()) + seconds;
      log(`waiting for the chain to reach block time ${target}…`);
      let last = 0;
      const waited = await waitForChainTime(target, (left) => {
        if (Date.now() - last > 30_000) { last = Date.now(); log(`  ${duration(left)} of chain time to go`); }
      });
      return `waited ${duration(waited)} of real time for the chain's block time to pass the timelock`;
    },
  };
}
