// The v2 chain story (devnet/src/v2-story.mjs), run in memory before any chain sees it: the same
// steps, the same witnesses, against the committed compiled module (contracts/managed-lantern2).
// Every step must go as the story expects, every refusal must be the circuit's own assert, and the
// ledger must end where the rules say. No chain, no proofs, no devnet install.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { periodOf, cooldownOf, VETO_SLACK, APPROVAL_WINDOW, FINALIZE_WINDOW } from '../../src/v2/timeline.js';
import { runV2Story, runV2Step, v2Summary, identityState, messageOf, REFUSALS, V2_DELAY, RULES } from '../src/v2-story.mjs';
import { inMemory, pure, NOW } from './v2-memory.mjs';

describe('the v2 chain story, in memory', () => {
  it('every step goes exactly as the story expects', async () => {
    const { x, story } = inMemory();
    const records = await runV2Story(story, x);
    for (const r of records) assert.equal(r.ok, true, `${r.id}: expected ${r.expect}, got ${r.outcome} ${r.message ?? ''}`);
    assert.equal(records.length, 16);
    assert.equal(records.filter((r) => r.outcome === 'accepted').length, 12);
    assert.deepEqual(records.filter((r) => r.outcome === 'refused').map((r) => [r.id, r.message]), Object.entries(REFUSALS));
  });

  it('covers every rule, and every circuit a v2 owner, guardian or stranger needs short of a finalize', async () => {
    const { story } = inMemory();
    assert.deepEqual([...new Set(story.steps.map((s) => s.rule))], Object.keys(RULES).map(Number));
    const circuits = new Set(story.steps.map((s) => s.circuit));
    for (const c of ['enrollIdentity', 'addGuardian', 'openRecovery', 'approveRecovery', 'vetoRecovery', 'lockIdentity',
      'unlockIdentity', 'hostGatedAction', 'checkIn']) assert.ok(circuits.has(c), c);
  });

  it('ends where the rules say: one veto, the reserved recovery live, unlocked with a new card, one check-in', async () => {
    const { sim, x, story } = inMemory();
    await runV2Story(story, x);
    const w = story.world;
    const s = identityState(sim.ledger, pure, w.id, periodOf(sim.now));
    assert.equal(s.delaySeconds, V2_DELAY);
    assert.equal(s.threshold, 2);
    assert.equal(s.locked, false);
    assert.equal(s.vetoCount, 1);
    assert.equal(s.vetoCommit, Buffer.from(w.newVetoCommit).toString('hex'));
    assert.notEqual(s.vetoCommit, Buffer.from(w.vetoCommit).toString('hex'));
    assert.equal(s.liveRecovery, Buffer.from(w.rid2).toString('hex'));
    assert.equal(s.reservedRecovery, Buffer.from(w.reserved).toString('hex'));
    assert.equal(s.liveRecovery, s.reservedRecovery);
    assert.deepEqual(s.checkIns, { period: Number(periodOf(NOW)), count: 1 });
    // The vetoed recovery and the reserved one, each with its frozen timeline.
    assert.equal(s.recoveries.length, 2);
    const [vetoed, live] = [s.recoveries.find((r) => r.killed), s.recoveries.find((r) => !r.killed)];
    assert.equal(vetoed.approvals, 1);
    assert.equal(live.approvals, 0);
    for (const r of s.recoveries) {
      assert.equal(r.unlockAt, r.openedAtHi + V2_DELAY);
      assert.equal(r.approveBy, r.openedAtHi + APPROVAL_WINDOW);
      assert.equal(r.expiresAt, r.unlockAt + FINALIZE_WINDOW);
    }
    // The cooldown the refused open met: a day from the veto's later bound.
    assert.equal(s.lastVetoAt, NOW + VETO_SLACK);
    assert.ok(NOW < s.lastVetoAt + cooldownOf(1));
    assert.deepEqual(v2Summary(sim.ledger), {
      enrolled: 1, guardianLeaves: 3, recoveries: 2, approvals: 1, vetoes: 1, killed: 1, retired: 0, lineage: 1,
      guardianSets: 1, gateActions: 1, opens: 2, vetoCount: 1, reserved: 1, locked: 0, checkIns: 1,
    });
  });

  it('records what each accepted step changed, and nothing for a refusal', async () => {
    const { x, story } = inMemory();
    const records = await runV2Story(story, x);
    const by = Object.fromEntries(records.map((r) => [r.id, r]));
    assert.deepEqual(by['1.1'].publicChange, { enrolled: 1, lineage: 1, guardianSets: 1 });
    assert.deepEqual(by['2.2'].publicChange, { recoveries: 1, opens: 1 });
    assert.deepEqual(by['2.4'].publicChange, { vetoes: 1, killed: 1, vetoCount: 1, reserved: 1 });
    assert.deepEqual(by['3.1'].publicChange, { locked: 1 });
    assert.deepEqual(by['3.3'].publicChange, { locked: -1 });
    assert.deepEqual(by['3.4'].publicChange, { gateActions: 1 });
    assert.deepEqual(by['4.1'].publicChange, { checkIns: 1 });
    for (const r of records.filter((q) => q.outcome === 'refused')) {
      assert.equal(r.publicChange, undefined, r.id);
      assert.equal(r.tx, undefined, r.id);
    }
  });

  it('the stranger\'s refusal is the tree\'s, not a witness error: her leaf binds the public context', async () => {
    const { sim, x, story } = inMemory();
    const records = [];
    for (const step of story.steps.slice(0, 5)) records.push(await runV2Step(step, x));
    assert.equal(records[4].id, '2.1');
    assert.equal(records[4].message, 'guardian not in tree');
    // Without her borrowed path, the same persona fails in her own witness, before the circuit.
    const stranger = story.personas.stranger;
    assert.throws(() => sim.callAs({ ...stranger }, 'openRecovery', story.world.id, story.personas.devA.pk, periodOf(sim.now)),
      /leaf is not in the tree/);
  });

  it('what the chain returns equals what the story recomputes when a call\'s finalization times out', async () => {
    const { x, story } = inMemory();
    const records = await runV2Story(story, x);
    const { personas: p, world: w } = story;
    for (const [i, g] of [p.g1, p.g2, p.g3].entries()) {
      assert.deepEqual(g.leaf, pure.guardianLeafOf(g.guardianSecret, w.id, g.leafSalt));
      assert.equal(records[1 + i].result, Buffer.from(g.leaf).toString('hex'));
    }
    assert.deepEqual(w.rid1, pure.recoveryIdOf(w.id, p.devA.pk));
    assert.deepEqual(w.rid2, w.reserved);
  });

  it('the same seed gives the same story; another seed, other keys', () => {
    const a = inMemory('same').story.world, b = inMemory('same').story.world, c = inMemory('other').story.world;
    assert.deepEqual(a.id, b.id);
    assert.notDeepEqual(a.id, c.id);
  });

  it('messageOf takes the circuit\'s message out of a runtime error', () => {
    assert.equal(messageOf(new Error('Error: failed assert: identity is locked')), 'identity is locked');
    assert.equal(messageOf('no assert here'), 'no assert here');
  });
});
