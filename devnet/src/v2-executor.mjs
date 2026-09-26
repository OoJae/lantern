// Lantern v2's chain executor: the local chain by default, or Preprod with LANTERN_NETWORK=preprod.
// It deploys contracts/v2/lantern2.compact as compiled (devnet/build/lantern2): its 13 verifier
// keys do not fit one deploy, so the deploy carries what fits and one maintenance update inserts
// the rest (split-deploy.mjs). It then freezes the maintenance authority, and runs each circuit the v2 story (v2-story.mjs) calls as a real
// transaction: executed locally, proved by the local proof server, balanced with DUST from the
// paying wallet, submitted, finalized. A refusal is the circuit's own assert, raised locally
// before anything is proved: exactly what a real client would see, and nobody pays for it.
//
// v1's executor (executor.mjs) is the model: the same timings, the same record of each call
// (call-record.mjs), the same freeze (freeze.mjs). One contract, and one wallet pays for all.
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { providersFor, compiledContract } from './providers.mjs';
import { tipTime } from './chain.mjs';
import { freezeMaintenanceAuthority, txOf } from './freeze.mjs';
import { recordCall } from './call-record.mjs';
import { deployInParts } from './split-deploy.mjs';
import { timedProviders, phases } from './executor.mjs';
import { storyWitnesses, v2Summary } from './v2-story.mjs';
import { periodOf } from '../../src/v2/timeline.js';

const CALL_TIMEOUT_MS = 180_000;
const ACTOR = 'actor';

/**
 * @param Lantern2    the compiled v2 module (bindings.mjs loadLantern2)
 * @param zk          its build directory, with keys (bindings.mjs LANTERN2_ZK)
 * @param wallet      the paying wallet: the genesis wallet on the local chain, the operator wallet
 *                    on a public network (walletName says which). It deploys, freezes and pays for
 *                    every call
 * @param timeoutMs   how long to wait for midnight-js to report a call finalized before asking the
 *                    ledger itself (as executor.mjs does)
 */
export async function v2Executor({ Lantern2, zk, wallet, log = () => {}, walletName = 'the genesis wallet', name = 'local chain', timeoutMs = CALL_TIMEOUT_MS }) {
  const pure = Lantern2.pureCircuits;
  let timing = null;
  let claimed = 0n;
  const proved = new Set();
  const base = await providersFor(wallet, zk);
  const providers = timedProviders(base, () => timing);
  // An honest claimed time: no later than either clock, with margin for skew. Each circuit runs
  // locally against the laptop clock and on chain against the block time.
  const claimNow = async () => { claimed = BigInt(Math.min(Math.floor(Date.now() / 1000), await tipTime()) - 30); return claimed; };
  const cc = compiledContract('Lantern2', Lantern2.Contract, storyWitnesses({ pure, clock: () => claimed }), zk);

  // ---- deploy in parts, then freeze the maintenance authority ----------------------------------
  timing = { start: Date.now() };
  await claimNow();
  const parts = await deployInParts(providers, {
    compiledContract: cc, privateStateId: ACTOR, initialPrivateState: { name: 'deployer' }, zk, log: (m) => log(`Lantern v2 ${m}`),
  });
  timing.end = Date.now();
  const { address } = parts;
  // One total for the deploy and its key inserts: several transactions, so no single split of phases.
  const deploy = { address, ...parts.deploy, timings: { total: phases(timing).total }, operationsAtDeploy: parts.operationsAtDeploy, verifierKeysInsertedBy: parts.inserts };
  const authority = await freezeMaintenanceAuthority(providers, address, 'Lantern v2');
  log(`Lantern v2's maintenance authority frozen: committee ${authority.committee}, threshold ${authority.threshold} (block ${authority.frozenBy.blockHeight})`);
  // The handle every call goes through. findDeployedContract also checks that each of the 13 keys
  // on chain is the one this build holds.
  const deployed = await findDeployedContract(providers, { contractAddress: address, compiledContract: cc, privateStateId: ACTOR });

  const pdp = base.publicDataProvider;
  const ledger = async () => Lantern2.ledger((await pdp.queryContractState(address)).data);

  return {
    name,
    pure,
    contract: { name: 'Lantern v2', ...deploy, maintenanceAuthority: authority },
    ledger,
    /** The period the chain is in now, from a fresh honest claimed time: what openRecovery and checkIn take. */
    period: async () => periodOf(Number(await claimNow())),
    async call(ps, circuit, args, rec) {
      await base.privateStateProvider.setContractAddress?.(address);
      await base.privateStateProvider.set(ACTOR, ps);
      await claimNow();
      const before = JSON.stringify(v2Summary(await ledger()));
      timing = { start: Date.now() };
      const call = deployed.callTx[circuit](...args);
      let timer;
      const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
      const r = await Promise.race([call, timeout]).finally(() => clearTimeout(timer));
      timing.end = Date.now();
      if (r === 'timeout') {
        // midnight-js waits indefinitely for finalization. After the timeout, ask the ledger itself.
        const changed = JSON.stringify(v2Summary(await ledger())) !== before;
        if (!changed) throw new Error(`no finalization after ${timeoutMs / 1000} s and the ledger did not change`);
        const note = `finalization not reported within ${timeoutMs / 1000} s; the ledger shows the change`;
        let found = null;
        if (timing.txId) {
          let t2;
          const giveUp = new Promise((resolve) => { t2 = setTimeout(() => resolve(null), 30_000); });
          found = await Promise.race([pdp.watchForTxData(timing.txId), giveUp]).catch(() => null).finally(() => clearTimeout(t2));
        }
        recordCall(rec, { tx: found ? txOf(found) : null, note, payer: walletName, timings: phases(timing), circuit, proved });
        return null;
      }
      recordCall(rec, { tx: txOf(r.public), payer: walletName, timings: phases(timing), circuit, proved });
      return r.private?.result;
    },
  };
}
