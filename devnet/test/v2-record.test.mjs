// The v2 runner's record (devnet/src/v2-record.mjs) and its deploy plan (deploy-plan.mjs), checked
// without a chain: a record built from the story run in memory, with made-up transactions, passes
// its own consistency checks and fails them when altered; the deploy plan places every key once,
// within budget; and each committed v2 record (deployments/local-v2.json, preprod-v2.json), when
// there is one, is consistent, was compiled from the sources committed here, is the story this repo
// tells, and ends where that story ends in memory.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { buildV2Record, problemsOf, recordedTxs, setupTxs, v2RecordName, checkInPeriodOf, V2_CIRCUITS, V2_SOURCES } from '../src/v2-record.mjs';
import { planDeploy } from '../src/deploy-plan.mjs';
import { lastBlock, unrecordedLastStep, unidentifiedSteps } from '../src/verify-plan.mjs';
import { runV2Story, v2Summary, identityState, V2_DELAY } from '../src/v2-story.mjs';
import { inMemory, pure } from './v2-memory.mjs';

const repo = new URL('../../', import.meta.url);
const sha256 = (f) => createHash('sha256').update(readFileSync(new URL(f, repo))).digest('hex');
const SOURCES = Object.fromEntries(V2_SOURCES.map((f) => [f, sha256(f)]));
const NETWORK = { name: 'undeployed', networkId: 'undeployed' };

async function builtRecord() {
  const { sim, x, story } = inMemory('v2-record-test', { chainLike: true });
  const records = await runV2Story(story, x);
  const contract = {
    ...x.contract,
    operationsAtDeploy: V2_CIRCUITS.slice(0, 8),
    verifierKeysInsertedBy: [{ operations: V2_CIRCUITS.slice(8), txId: 'ef'.repeat(33), txHash: 'ef'.repeat(32), blockHeight: 98, status: 'SucceedEntirely' }],
  };
  const period = checkInPeriodOf(records);
  return buildV2Record({ network: NETWORK, isPublic: false, contract, records, finalLedger: v2Summary(sim.ledger),
    finalIdentity: identityState(sim.ledger, pure, story.world.id, period), startedAt: Date.now() - 60_000,
    compiler: { compact: '0.31.1', language: '0.23.0', runtime: '0.16.0' }, sources: SOURCES, delaySeconds: V2_DELAY, walletName: 'the genesis wallet' });
}

describe('a v2 record', () => {
  it('built from a complete run is consistent', async () => {
    const r = await builtRecord();
    assert.deepEqual(problemsOf(r), []);
    assert.equal(r.summary.accepted, 12);
    assert.equal(r.summary.refused, 4);
    assert.equal(r.summary.transactions, 12 + 3); // + the deploy, one key insert and the freeze
    assert.equal(recordedTxs(r).length, r.summary.transactions);
    assert.deepEqual(r.summary.circuitsProved, ['addGuardian', 'approveRecovery', 'checkIn', 'enrollIdentity', 'hostGatedAction',
      'lockIdentity', 'openRecovery', 'unlockIdentity', 'vetoRecovery']);
    assert.equal(r.delay.chosenSeconds, 86_400);
    assert.equal(r.finalIdentity.checkIns.count, 1);
  });

  it('names what went wrong when altered', async () => {
    const r = await builtRecord();
    const alter = (f) => { const c = structuredClone(r); f(c); return problemsOf(c).join('; '); };
    assert.match(alter((c) => { c.steps[4].ok = false; }), /step 2\.1 did not go as expected/);
    assert.match(alter((c) => { c.steps[4].tx = { txId: 'aa' }; }), /step 2\.1 was refused, yet names a transaction/);
    assert.match(alter((c) => { delete c.steps[5].tx; }), /step 2\.2 was accepted without a finalized transaction/);
    assert.match(alter((c) => { c.summary.accepted += 1; }), /summary\.accepted/);
    assert.match(alter((c) => { c.contracts.lantern2.maintenanceAuthority.committee = 1; }), /not recorded frozen/);
    assert.match(alter((c) => { c.contracts.lantern2.maintenanceAuthority.frozenBy.blockHeight = 10_000; }), /in that order, before the first step/);
    assert.match(alter((c) => { c.contracts.lantern2.verifierKeysInsertedBy[0].operations.pop(); }), /each of v2's 13 circuits exactly once/);
    assert.match(alter((c) => { c.steps[6].tx.blockHeight = 1; }), /not in block order/);
    assert.match(alter((c) => { c.finalIdentity.checkIns.period += 1; }), /check-in period/);
    assert.match(alter((c) => { c.source.sha256[V2_SOURCES[0]] = 'nope'; }), /sha256/);
  });

  it('is read by devnet:verify:v2 at the block of its last transaction', async () => {
    const r = await builtRecord();
    const meta = r.contracts.lantern2;
    assert.equal(lastBlock(r, 'lantern2', meta), r.steps.filter((s) => s.tx?.blockHeight).at(-1).tx.blockHeight);
    assert.equal(unrecordedLastStep(r, 'lantern2'), null);
    assert.deepEqual(unidentifiedSteps(r), []);
    assert.deepEqual(setupTxs(meta).map((t) => t.blockHeight), [98, 98, 99]);
  });

  it('is named for its network', () => {
    assert.equal(v2RecordName({ networkId: 'preprod', isPublic: true }), 'preprod-v2.json');
    assert.equal(v2RecordName({ networkId: 'undeployed', isPublic: false }), 'local-v2.json');
  });
});

describe('the deploy plan', () => {
  const OPS = V2_CIRCUITS;
  // Linear stand-ins for the measured costs (split-deploy.mjs): a deploy 0.075 + 0.05 per key, an
  // insert 0.03 + 0.055 per key, which is about what the ledger's initial parameters give v2.
  const deployCost = (s) => 0.075 + 0.05 * s.length;
  const insertCost = (s) => 0.03 + 0.055 * s.length;

  it('puts what fits in the deploy and the rest in as few updates as fit, each circuit once, in order', () => {
    const p = planDeploy(OPS, { deployCost, insertCost, budget: 0.5 });
    assert.deepEqual(p.inDeploy, OPS.slice(0, 8));
    assert.deepEqual(p.batches, [OPS.slice(8)]);
    assert.deepEqual([...p.inDeploy, ...p.batches.flat()], OPS);
    for (const b of p.batches) assert.ok(insertCost(b) <= 0.5);
    assert.ok(deployCost(p.inDeploy) <= 0.5);
  });

  it('splits the inserts when one would be over budget, and needs no insert when everything fits', () => {
    const p = planDeploy(OPS, { deployCost, insertCost, budget: 0.2 });
    assert.deepEqual([...p.inDeploy, ...p.batches.flat()], OPS);
    assert.ok(p.batches.length > 1);
    for (const b of p.batches) assert.ok(insertCost(b) <= 0.2);
    assert.deepEqual(planDeploy(OPS, { deployCost, insertCost, budget: 1 }), { inDeploy: OPS, batches: [] });
  });

  it('refuses a plan nothing could satisfy', () => {
    assert.throws(() => planDeploy(OPS, { deployCost: () => 0.9, insertCost, budget: 0.5 }), /no verifier keys is over budget/);
    assert.throws(() => planDeploy(OPS, { deployCost: (s) => (s.length ? 1 : 0.1), insertCost: () => 0.9, budget: 0.5 }), /alone is over budget/);
  });
});

// Each committed v2 record, when the run has written one.
for (const name of ['local-v2.json', 'preprod-v2.json']) {
  const file = new URL(`deployments/${name}`, repo);
  describe(`deployments/${name}`, { skip: !existsSync(file) && 'not recorded yet' }, () => {
    const rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    it('is consistent, and every step went as the story expects', () => {
      assert.deepEqual(problemsOf(rec), []);
    });
    it('was compiled from the sources committed here', () => {
      assert.deepEqual(rec.source.sha256, SOURCES);
    });
    it('is exactly the story this repo tells, step for step, with its refusals', () => {
      const story = inMemory('any').story;
      assert.deepEqual(rec.steps.map((s) => [s.id, s.circuit, s.expect]),
        story.steps.map((s) => [s.id, s.circuit, s.expect.accept ? 'accepted' : `refused: ${s.expect.refuse}`]));
    });
    it('ends where the story ends in memory, step for step', async () => {
      const { sim, x, story } = inMemory('any');
      const mem = await runV2Story(story, x);
      assert.deepEqual(rec.steps.map((s) => s.publicChange ?? null), mem.map((r) => r.publicChange ?? null));
      assert.deepEqual(rec.finalPublicRecord, v2Summary(sim.ledger));
      const f = rec.finalIdentity;
      assert.equal(f.idCommit, rec.steps[0].args[0]);
      assert.deepEqual([f.locked, f.vetoCount, f.recoveries.length, f.checkIns.count, f.delaySeconds], [false, 1, 2, 1, V2_DELAY]);
      assert.equal(f.liveRecovery, f.reservedRecovery);
      assert.equal(f.liveRecovery, rec.steps.find((s) => s.id === '2.6').result);
    });
    it('ran on the network its name says, with the pinned compiler', () => {
      assert.match(rec.network, name.startsWith('preprod') ? /^preprod / : /^undeployed /);
      assert.equal(rec.compiler.compact, '0.31.1');
      assert.equal(rec.toolchain.compact, '0.31.1');
      assert.equal(rec.delay.chosenSeconds, V2_DELAY);
    });
  });
}
