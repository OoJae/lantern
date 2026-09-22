#!/usr/bin/env node
// npm run attack
//
// One attacker, four guardian schemes, no chain, no indexer, no Docker. The
// attacker is handed an address book and a frozen view of each contract's
// PUBLIC ledger -- nothing else -- and tries to name the victim's guardians.
//
//   --json      machine-readable result
//   --markdown  the summary table as GitHub markdown, for the README
//   --no-color  plain output
//
// Exits non-zero if a vulnerable target is NOT fully broken, or if the shipped
// contract IS. So this script is also a test.
import { buildTargets } from '../src/attack/targets.mjs';
import { runAttack } from '../src/attack/attack.mjs';
import { leakReport } from '../src/attack/leaks.mjs';
import { ADDRESS_BOOK, TRUE_GUARDIANS } from '../src/attack/candidates.mjs';

const args = new Set(process.argv.slice(2));
const color = !args.has('--no-color') && !args.has('--json') && !args.has('--markdown')
  && process.stdout.isTTY;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s), dim = (s) => c('2', s), red = (s) => c('31;1', s), green = (s) => c('32;1', s);

const targets = buildTargets();
const known = new Set();
const results = targets.map((t) => {
  const r = runAttack(t.view, { knownNames: [...known] });
  for (const n of r.named) known.add(n);
  const broken = r.named.size > 0;
  return { t, r, broken, verdict: broken ? 'BROKEN' : 'HELD' };
});

// Invariants: 1/2a/2b fully named, 3 not named at all.
const failures = results.filter(({ t, r }) =>
  t.view.id === '3' ? r.named.size !== 0 : r.named.size !== t.truth.guardians);

const shipped = results.find((x) => x.t.view.id === '3');
const leaks = leakReport(shipped.t.view);

if (args.has('--json')) {
  console.log(JSON.stringify({
    addressBook: ADDRESS_BOOK.length,
    targets: results.map(({ t, r, verdict }) => ({
      id: t.view.id, label: t.view.label.trim(), scheme: t.view.scheme,
      probes: r.probes, ms: +r.ms.toFixed(1),
      guardiansNamed: r.named.size, guardiansTotal: t.truth.guardians,
      votesLinked: r.votes, votesTotal: t.truth.votes, verdict,
      families: r.families,
    })),
    leaks: leaks.map(({ field, sev, what, measured }) => ({ field, sev, what, measured })),
    ok: failures.length === 0,
  }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

if (args.has('--markdown')) {
  console.log('| # | target | scheme | probes | guardians named | votes linked | verdict |');
  console.log('|---|---|---|---:|---:|---:|---|');
  for (const { t, r, verdict } of results) {
    console.log(`| ${t.view.id} | ${t.view.label.trim()} | \`${t.view.scheme}\` | ${r.probes} | `
      + `${r.named.size} / ${t.truth.guardians} | ${r.votes} / ${t.truth.votes} | **${verdict}** |`);
  }
  process.exit(failures.length ? 1 : 0);
}

// ---------------------------------------------------------------- the show --
const W = 86;
const rule = (label = '', right = '') => {
  const body = label ? `─── ${label} ` : '';
  const tail = right ? ` ${right} ───` : '';
  return dim(body + '─'.repeat(Math.max(3, W - body.length - tail.length)) + tail);
};

console.log();
console.log(bold('  LANTERN · ADVERSARIAL ENUMERATION'));
console.log(dim('  one attacker, four guardian schemes · no chain · no indexer · no Docker'));
console.log();
console.log(`  world      1 identity · ${TRUE_GUARDIANS.length} guardians · 2 approvals`);
console.log(`  attacker   a ${ADDRESS_BOOK.length}-name address book, and nothing else`);
console.log('  oracle     Ledger.findPathForLeaf()  +  Set/Map [Symbol.iterator]()');
console.log(dim('             from the contracts in this repo, compiled with compact 0.31.1'));
console.log(dim('             no privileged access · no private state · no witness'));
console.log();

const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
console.log(dim('  #    target                       probes     wall   guardians    votes   verdict'));
console.log(dim('  ──── ──────────────────────────── ────── ──────── ─────────── ──────── ─────────'));
for (const { t, r, verdict } of results) {
  const v = verdict === 'BROKEN' ? red(pad(verdict, 7)) : green(pad(verdict, 7));
  console.log(`  ${pad(t.view.id, 4)} ${pad(t.view.label.trim(), 28)} ${lpad(r.probes, 6)} `
    + `${lpad(r.ms.toFixed(1) + ' ms', 8)} ${lpad(`${r.named.size} / ${t.truth.guardians}`, 11)} `
    + `${lpad(`${r.votes} / ${t.truth.votes}`, 8)}   ${v}`);
  console.log(dim(`       ${t.view.scheme}`));
}

const detail = {
  '1': [
    'Read straight out of the ledger. No hashing. The address book is used only',
    'to put names to identifiers that are already public -- and every vote too.',
    '',
    'This is what every deployed EVM social-recovery wallet does, because the EVM',
    'has no other option. It is not a strawman; it is the state of the art.',
  ],
  '2a': [
    'The guardian identifier is a WITNESS. It appears in no public part of the',
    'transaction -- asserted in test/adversarial.test.js. Only a HASH of it',
    'reaches the chain.',
    '',
    'And the hash is enough. Anyone can compute the same hash for every name in',
    'an address book and ask findPathForLeaf whether it is in the tree. Hashing a',
    'guessable value does not hide it. It only makes it cost one guess.',
  ],
  '2b': [
    'This variant DOES salt, with 32 bytes of randomness -- derived from public',
    'data, because a stateless client must be able to recompute any leaf. It',
    'passes any review that asks "do you salt your commitments?"',
    '',
    'Salting with public randomness multiplied the attacker\'s work by the slot',
    'range, and by nothing else. The lesson is not "salt your hashes". It is:',
    '',
    bold('    a commitment hides exactly the entropy in its preimage that is not'),
    bold('    already on chain -- and not one bit more.'),
  ],
};

for (const { t, r } of results) {
  console.log();
  const right = `${r.probes} probes · ${r.named.size} named`;
  console.log(rule(`${t.view.id} · ${t.view.label.trim()}`, right));
  console.log();
  if (detail[t.view.id]) {
    if (r.named.size) console.log(`    named:  ${[...r.named].map((n) => bold(n)).join('   ')}`);
    console.log();
    for (const line of detail[t.view.id]) console.log('    ' + line);
    continue;
  }
  // The shipped contract.
  console.log(dim('    strategy                                                  probes   hits'));
  for (const f of r.families) {
    const mark = f.name.startsWith('KNOWN') ? '  ←' : '';
    console.log(`    ${pad(f.name, 56)} ${lpad(f.probes, 6)} ${lpad(f.hits, 6)}${mark}`);
  }
  console.log();
  console.log('    The arrowed row is the one that matters. The attacker was handed the');
  console.log('    real names -- recovered from the targets above -- and still could not');
  console.log('    confirm a single one here.');
  console.log();
  console.log('    The guardian context the leaf hashes over is PUBLIC, read live from the');
  console.log('    ledger. It buys nothing, because the preimage also holds 32 bytes of');
  console.log('    per-guardian entropy that is not a function of who the guardian is. So');
  console.log('    this is not a hard search. It is the wrong search:');
  console.log();
  console.log(bold('        the leaf preimage contains no function of the guardian\'s identity,'));
  console.log(bold('        so no amount of work over an address book can ever confirm a name.'));
  console.log();
  console.log('    What remains is a preimage search on a 256-bit value: 2^256 ≈ 1.2e77 per');
  console.log('    guardian. HONEST CAVEAT: this holds only while guardianSecret is real');
  console.log('    entropy. Derive it from anything guessable and this row breaks exactly');
  console.log('    like 2a. The contract cannot enforce that; the client uses');
  console.log('    webcrypto.getRandomValues, and that is the whole of the assumption.');
}

console.log();
console.log(rule('WHAT THE SHIPPED CONTRACT STILL LEAKS', `${leaks.length} of ${leaks.length} fields`));
console.log();
console.log(dim('    measured on its own ledger, in this run -- nothing below is hypothetical'));
console.log();
for (const l of leaks) {
  const sev = { HIGH: red, MED: (s) => c('33;1', s), LOW: (s) => c('36', s), BENIGN: dim }[l.sev](pad(l.sev, 7));
  console.log(`    ${sev} ${pad(l.field, 19)} ${pad(l.what, 50)} ${dim(l.measured)}`);
}
console.log();
console.log(dim('    Reasoning for each is in SECURITY.md. This script is the part of it that runs.'));
console.log();
console.log(rule());
const total = results.reduce((a, x) => a + x.r.probes, 0);
const ms = results.reduce((a, x) => a + x.r.ms, 0);
console.log(`  ${results.length} targets · ${total} probes · ${(ms / 1000).toFixed(2)} s · no chain touched`);
if (failures.length === 0) {
  console.log(`  ${bold('3 of 4 broken.')} The one that held is the one in contracts/src/.`);
} else {
  console.log(red(`  UNEXPECTED RESULT for target(s): ${failures.map((f) => f.t.view.id).join(', ')}`));
}
console.log(dim('  reproduce: npm run attack      assert: npm run test:adversarial'));
console.log();
process.exit(failures.length ? 1 : 0);
