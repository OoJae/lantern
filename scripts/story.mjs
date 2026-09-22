#!/usr/bin/env node
// npm run story
//
// The whole recovery story in a terminal: every beat, run through the real
// compiled circuits against an in-memory ledger. No wallet, no chain, no
// proofs -- `npm run devnet` runs the same script with real ones.
//
//   --seed <s>  deterministic run (the tests use one)
//   --json      the full record, one entry per step
//   --no-color  plain output
//
// Exits non-zero if any step's outcome differs from what the story expects.
import { rootBindings } from '../src/bindings/root.mjs';
import { createStory, runStory, BEATS } from '../src/demo/story.mjs';
import { simExecutor } from '../src/demo/sim-executor.mjs';
import { storyRng } from '../src/demo/rng.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const seedAt = argv.indexOf('--seed');
const seed = seedAt >= 0 ? argv[seedAt + 1] : undefined;
const color = !flag('--no-color') && !flag('--json') && process.stdout.isTTY;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s), dim = (s) => c('2', s), red = (s) => c('31;1', s), green = (s) => c('32;1', s), cyan = (s) => c('36', s);

const x = simExecutor(rootBindings);
const story = createStory({ pure: x.pure, rng: storyRng(seed) });

const W = 86;
const wrap = (text, indent) => {
  const out = []; let line = '';
  for (const word of text.split(' ')) {
    if ((line + word).length > W - indent) { out.push(line.trimEnd()); line = ''; }
    line += `${word} `;
  }
  if (line.trim()) out.push(line.trimEnd());
  return out.map((l) => ' '.repeat(indent) + l).join('\n');
};

let lastBeat = -1;
const started = Date.now();
const printStep = (r) => {
  if (flag('--json')) return;
  if (r.beat !== lastBeat) {
    lastBeat = r.beat;
    const b = BEATS[r.beat];
    console.log();
    console.log(bold(r.beat === 10 ? '  EPILOGUE' : `  BEAT ${r.beat} · ${b.title.toUpperCase()}`));
    console.log(dim(wrap(b.caption, 2)));
  }
  console.log(wrap(r.say, 4));
  if (r.kind === 'call') {
    const mark = r.ok ? green('✓') : red('✗ UNEXPECTED');
    const verdict = r.outcome === 'accepted' ? green('accepted') : cyan(`refused: "${r.message}"`);
    console.log(`      ${mark} ${dim(`${r.actor} → ${r.circuit}`)}  ${verdict}`);
    if (r.publicChange && Object.keys(r.publicChange).length) {
      const ch = Object.entries(r.publicChange).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ');
      console.log(dim(`        public record: ${ch}`));
    }
    if (r.scan) {
      const s = r.scan;
      const line = s.fields.length
        ? `${s.clean ? 'absent from the public record' : 'LEAKED'}: ${s.fields.join(', ')}`
        : 'reads no secret';
      console.log(s.clean ? dim(`        ${line}`) : red(`        ${line}`));
    }
  } else {
    console.log(`      ${r.ok ? green('✓') : red('✗ UNEXPECTED')} ${dim(r.detail ?? '')}`);
  }
};

if (!flag('--json')) {
  console.log();
  console.log(bold('  LANTERN · THE STORY'));
  console.log(dim(`  ${x.name}: the real compiled circuits, no wallet, no chain, no proofs${seed ? ` · seed "${seed}"` : ''}`));
}
const records = await runStory(story, x, { onStep: printStep });
const bad = records.filter((r) => !r.ok || (r.scan && !r.scan.clean));

if (flag('--json')) {
  console.log(JSON.stringify({ executor: x.name, seed: seed ?? null, ok: bad.length === 0, steps: records }, null, 2));
} else {
  const calls = records.filter((r) => r.kind === 'call');
  console.log();
  console.log(dim('─'.repeat(W)));
  console.log(`  ${records.length} steps · ${calls.filter((r) => r.outcome === 'accepted').length} accepted · `
    + `${calls.filter((r) => r.outcome === 'refused').length} refused, each by the circuit's own assert · `
    + `${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(bad.length ? red(`  ${bad.length} step(s) did not go as the story expects.`) : green('  Every step went exactly as expected.'));
  console.log(dim('  real proofs on a local chain: npm run devnet'));
}
process.exit(bad.length ? 1 : 0);
