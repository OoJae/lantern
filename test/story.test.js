// The story every executor runs, checked end to end on the in-memory ledger:
// every step's outcome, a leak scan of every accepted circuit (each with its
// positive control), and the attacker naming nobody.
import { describe, it, expect } from 'vitest';
import { rootBindings } from '../src/bindings/root.mjs';
import { createStory, runStory, BEATS } from '../src/demo/story.mjs';
import { simExecutor } from '../src/demo/sim-executor.mjs';
import { storyRng } from '../src/demo/rng.mjs';

async function run(seed) {
  const x = simExecutor(rootBindings);
  const story = createStory({ pure: x.pure, rng: storyRng(seed) });
  const records = await runStory(story, x);
  return { story, records, x };
}

const { story, records } = await run('story-test');
const calls = records.filter((r) => r.kind === 'call');

describe('the story, on the in-memory ledger', () => {
  it('every step goes exactly as the story expects', () => {
    const wrong = records.filter((r) => !r.ok).map((r) => `${r.id}: expected ${r.expect}, got ${r.outcome} ${r.message ?? ''}`);
    expect(wrong).toEqual([]);
  });

  it('covers every beat, in order, with unique step ids', () => {
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
    expect([...new Set(records.map((r) => r.beat))]).toEqual(BEATS.map((b) => b.n));
  });

  it('every refusal is the circuit\'s own assert, word for word', () => {
    const refused = calls.filter((r) => r.outcome === 'refused');
    expect(refused.length).toBeGreaterThanOrEqual(10);
    for (const r of refused) expect(r.expect).toBe(`refused: ${r.message}`);
  });

  it('every accepted circuit leaks none of the secrets it read, and the scanner saw each one', () => {
    const accepted = calls.filter((r) => r.outcome === 'accepted');
    for (const r of accepted) {
      expect(r.scan, r.id).toBeDefined();
      for (const f of r.scan.fields) {
        expect(r.scan.report[f].private, `${r.id} ${f}: positive control`).toBe(true);
        expect(r.scan.report[f].public, `${r.id} ${f}: leaked`).toBe(false);
      }
    }
    // The scans are not vacuous: every secret-bearing circuit read something.
    const readers = accepted.filter((r) => r.circuit !== 'openRecovery');
    for (const r of readers) expect(r.scan.fields.length, r.id).toBeGreaterThan(0);
  });

  it('the attacker, with the real guardians\' names, names none of them and links no vote', () => {
    expect(story.world.attack).toMatchObject({ named: 0, votes: 0 });
    expect(story.world.attack.probes).toBeGreaterThan(200);
  });

  it('the stolen secret buys impersonation until recovery, and nothing else', () => {
    const jihoon = calls.filter((r) => r.actor === 'Jihoon');
    const acceptedCircuits = jihoon.filter((r) => r.outcome === 'accepted').map((r) => r.circuit);
    expect(acceptedCircuits.sort()).toEqual(['approveRecovery', 'hostGatedAction', 'openRecovery']);
    const after = records.find((r) => r.id === '9.1');
    expect(after.message).toBe('not the current owner of this identity root');
  });

  it('is reproducible from its seed, and different without one', async () => {
    const again = await run('story-test');
    const strip = (rs) => rs.map(({ scan, ...r }) => r);
    expect(strip(again.records)).toEqual(strip(records));
    const fresh = await run(undefined);
    expect(fresh.records.find((r) => r.id === '0.1').args[0])
      .not.toBe(records.find((r) => r.id === '0.1').args[0]);
  });
});
