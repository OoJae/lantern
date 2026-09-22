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
    // These read no secret: an open needs none, descent is a public fact, and the committee
    // signs off the circuit -- its circuits verify public signatures.
    const NO_SECRET = ['openRecovery', 'proveSuccession', 'openEpoch', 'attestVote', 'sealEpoch',
      'openRotation', 'rotateVote', 'sealRotation'];
    const readers = accepted.filter((r) => !NO_SECRET.includes(r.circuit));
    for (const r of readers) expect(r.scan.fields.length, r.id).toBeGreaterThan(0);
  });

  it('the attacker, with the real guardians\' names, names none of them and links no vote', () => {
    expect(story.world.attack).toMatchObject({ named: 0, votes: 0 });
    expect(story.world.attack.probes).toBeGreaterThan(200);
  });

  it('the stolen secret buys impersonation until recovery, and nothing else', () => {
    const jihoon = calls.filter((r) => r.actor === 'Jihoon');
    const acceptedCircuits = jihoon.filter((r) => r.outcome === 'accepted').map((r) => r.circuit);
    expect(acceptedCircuits.sort()).toEqual(['approveRecovery', 'hostGatedAction', 'openRecovery',
      'requireCurrentOwnerAttested', 'requireCurrentOwnerAttested']);
    const after = records.find((r) => r.id === '9.1');
    expect(after.message).toBe('not the current owner of this identity root');
  });

  it('shows the attested DApp\'s window, and its close, on the same ledgers', () => {
    const byId = Object.fromEntries(records.map((r) => [r.id, r]));
    expect(byId['9.1'].message).toBe('not the current owner of this identity root');   // in-contract: at once
    expect(byId['9.6'].outcome).toBe('accepted');                                     // attested: the gap
    expect(byId['9.12'].message).toBe('ownership leaf is not in the attested snapshot'); // closed by epoch 2
    expect(byId['10.14'].message).toBe('public key does not match this committee slot'); // a rotated key is dead
  });

  it('is reproducible from its seed, and different without one', async () => {
    const again = await run('story-test');
    // Everything reproduces except the committee's Schnorr signatures, whose nonce the
    // Foundation library draws fresh for every signature. Compare those steps without it.
    const SIGNED = ['attestVote', 'rotateVote'];
    const strip = (rs) => rs.map(({ scan, ...r }) => (SIGNED.includes(r.circuit) ? { ...r, args: r.args.slice(0, -1) } : r));
    expect(strip(again.records)).toEqual(strip(records));
    const fresh = await run(undefined);
    expect(fresh.records.find((r) => r.id === '0.1').args[0])
      .not.toBe(records.find((r) => r.id === '0.1').args[0]);
  });
});
