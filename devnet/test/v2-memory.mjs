// Shared by the v2 runner's tests (not itself a test file): Lantern v2's chain story run in memory,
// against the committed compiled module (contracts/managed-lantern2), with no chain.
//
// The runtime is loaded from where the compiled module itself resolves it (the repo root's
// node_modules), so both share one copy even when devnet/node_modules holds another.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createContractSim } from '../../src/contract-sim.js';
import { storyRng } from '../../src/demo/rng.mjs';
import { periodOf } from '../../src/v2/timeline.js';
import { recordCall } from '../src/call-record.mjs';
import { createV2Story, storyWitnesses } from '../src/v2-story.mjs';

const MODULE = new URL('../../contracts/managed-lantern2/contract/index.js', import.meta.url);
export const rt = await import(pathToFileURL(createRequire(MODULE).resolve('@midnight-ntwrk/compact-runtime')).href);
export const mod = await import(MODULE.href);
export const pure = mod.pureCircuits;
export const NOW = 1_790_000_000; // 2026-09-20, inside period 227

/**
 * The story and an in-memory executor. With `chainLike`, each accepted call is also recorded as
 * the chain executor records it (call-record.mjs), with a made-up transaction one block after the
 * last: enough for a record's own consistency checks, never for devnet:verify.
 */
export function inMemory(seed = 'v2-story-test', { chainLike = false } = {}) {
  let sim = null;
  sim = createContractSim({ rt, mod, witnesses: storyWitnesses({ pure, clock: () => sim.now }), now: NOW });
  let block = 100;
  const proved = new Set();
  const hex = (n, len) => n.toString(16).padStart(len, '0');
  const x = {
    call: async (ps, circuit, args, rec) => {
      const result = sim.callAs(ps, circuit, ...args);
      if (chainLike) {
        block += 1;
        recordCall(rec, { tx: { txId: hex(block, 66), txHash: hex(block, 64), blockHeight: block, status: 'SucceedEntirely' },
          payer: 'the genesis wallet', timings: { execute: 0.1, prove: 2 + (block % 3), balance: 0.5, submit: 6, finalize: 1, total: 10 + (block % 5) },
          circuit, proved });
      }
      return result;
    },
    ledger: async () => sim.ledger,
    period: () => periodOf(sim.now),
    contract: {
      name: 'Lantern v2', address: 'ab'.repeat(32), txId: hex(98, 66), txHash: hex(98, 64), blockHeight: 98, status: 'SucceedEntirely',
      timings: { total: 20 },
      maintenanceAuthority: { committee: 0, threshold: 1, counter: 1, frozenBy: { txId: hex(99, 66), txHash: hex(99, 64), blockHeight: 99, status: 'SucceedEntirely' } },
    },
  };
  const story = createV2Story({ pure, rng: storyRng(seed) });
  return { sim, x, story };
}
