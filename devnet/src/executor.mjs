// The story's chain executor: every circuit runs as a real transaction on the local chain --
// executed locally, proved by the proof server, balanced with DUST, submitted, finalized.
// It implements the same interface as src/demo/sim-executor.mjs, so it runs the same story
// with the same expectations. A refusal is the circuit's own assert, caught locally before
// anything is proved: exactly what a real client would see.
import { deployContract, findDeployedContract, submitTx } from '@midnight-ntwrk/midnight-js-contracts';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as L from '@midnight-ntwrk/ledger-v8';
import { lanternWitnesses } from '../../src/witnesses.js';
import { publicRecord, duration } from '../../src/demo/story.mjs';
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
 * @param wallet       the genesis wallet: deploys, and pays for every call not listed below
 * @param sponsorship  optional { sponsorWallet, guardianWallet }. With it, a persona holding
 *                     no wallet (`wallet: 'none'`, the recovering phone) is paid for by the
 *                     sponsor, and Seo-yeon's open is paid for by her own wallet.
 */
export async function devnetExecutor({ Lantern, wallet, zkPath, log = () => {}, sponsorship = null }) {
  let timing = null;
  let claimed = 0n;
  const proved = new Set();
  const base = await providersFor(wallet, zkPath);
  const providers = timedProviders(base, () => timing);
  const witnesses = lanternWitnesses({ pure: Lantern.pureCircuits, clock: () => claimed });
  const cc = compiledContract('Lantern', Lantern.Contract, witnesses, zkPath);

  // An honest claimed time: no later than either clock, with margin for skew. The circuit runs
  // locally against the laptop clock and on chain against the block time; both must accept it.
  const claimNow = async () => { claimed = BigInt(Math.min(Math.floor(Date.now() / 1000), await tipTime()) - 30); };

  // ---- deploy, then freeze the maintenance authority --------------------------------------
  timing = { start: Date.now() };
  await claimNow();
  const deployed = await deployContract(providers, {
    compiledContract: cc, privateStateId: ACTOR, initialPrivateState: { name: 'deployer' }, args: [],
  });
  timing.end = Date.now();
  const address = deployed.deployTxData.public.contractAddress;
  const deploy = { address, ...txOf(deployed.deployTxData.public), timings: phases(timing) };
  log(`deployed Lantern at ${address} (block ${deploy.blockHeight})`);

  // deployContract installs the deployer's key as a 1-of-1 maintenance authority, which could
  // replace any verifier key. Replace it with an empty committee: no signature can ever satisfy
  // it, so this deployment's rules can never change (spike S5).
  const state = await providers.publicDataProvider.queryContractState(address);
  const key = await providers.privateStateProvider.getSigningKey(address);
  const frozen = new L.ContractMaintenanceAuthority([], 1, state.maintenanceAuthority.counter + 1n);
  const update = new L.MaintenanceUpdate(address, [new L.ReplaceAuthority(frozen)], state.maintenanceAuthority.counter);
  const signed = update.addSignature(0n, L.signData(key, update.dataToSign));
  const freezeTx = L.Transaction.fromParts(getNetworkId(), undefined, undefined,
    L.Intent.new(new Date(Date.now() + 3600_000)).addMaintenanceUpdate(signed));
  const fr = await submitTx(providers, { unprovenTx: freezeTx });
  if (fr.status !== 'SucceedEntirely') throw new Error(`freezing the maintenance authority failed: ${fr.status}`);
  const after = (await providers.publicDataProvider.queryContractState(address)).maintenanceAuthority;
  const authority = { committee: after.committee.length, threshold: after.threshold, counter: Number(after.counter),
    frozenBy: txOf(fr) };
  log(`maintenance authority frozen: committee ${authority.committee}, threshold ${authority.threshold} (block ${fr.blockHeight})`);

  const ledger = async () => Lantern.ledger((await providers.publicDataProvider.queryContractState(address)).data);

  // Who pays. Every handle shares one private-state store, so any of them can act as any persona.
  const handles = { genesis: deployed };
  let evidence = null;
  if (sponsorship) {
    const found = (p) => findDeployedContract(p, { contractAddress: address, compiledContract: cc, privateStateId: ACTOR });
    const sponsor = createSponsor({ wallet: sponsorship.sponsorWallet, addresses: [address], log });
    const device = walletlessDevice(sponsor, (e) => { evidence = e; });
    handles.device = await found(timedProviders({ ...base, ...device }, () => timing));
    const guardianBase = await providersFor(sponsorship.guardianWallet, zkPath, base.privateStateProvider);
    handles.guardian = await found(timedProviders(guardianBase, () => timing));
  }
  const payerOf = (ps) => {
    if (ps.wallet === 'none' && handles.device) return ['device', 'the sponsor (the device holds no wallet)'];
    if (ps.wallet === 'seo-yeon' && handles.guardian) return ['guardian', 'Seo-yeon\'s own wallet'];
    return ['genesis', 'the genesis wallet'];
  };

  return {
    name: 'local chain',
    pure: Lantern.pureCircuits,
    address,
    deploy,
    authority,
    ledger,
    async call(ps, circuit, args, rec) {
      await providers.privateStateProvider.set(ACTOR, ps);
      await claimNow();
      const before = publicRecord(await ledger());
      const [handle, payer] = payerOf(ps);
      rec.payer = payer;
      evidence = null;
      timing = { start: Date.now() };
      const call = handles[handle].callTx[circuit](...args);
      let timer;
      const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), CALL_TIMEOUT_MS); });
      const r = await Promise.race([call, timeout]).finally(() => clearTimeout(timer));
      timing.end = Date.now();
      if (r === 'timeout') {
        // midnight-js waits indefinitely for finalization. After 180 s, ask the ledger itself.
        const changed = JSON.stringify(publicRecord(await ledger())) !== JSON.stringify(before);
        if (!changed) throw new Error(`no finalization after ${CALL_TIMEOUT_MS / 1000} s and the ledger did not change`);
        rec.tx = { note: `finalization not reported within ${CALL_TIMEOUT_MS / 1000} s; the ledger shows the change` };
        rec.timings = phases(timing);
        return null;
      }
      rec.tx = txOf(r.public);
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
