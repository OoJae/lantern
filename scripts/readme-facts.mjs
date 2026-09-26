#!/usr/bin/env node
// The README states measured numbers. Each one lives in a generated block, rebuilt here from
// the file that holds it, so the prose can never drift from the evidence.
//
//   node scripts/readme-facts.mjs          check: exit 1 if any block differs (npm run readme:check)
//   node scripts/readme-facts.mjs --write  rewrite the blocks
//
// The circuit-size table (<!-- facts:circuits -->) needs the Compact toolchain, so
// scripts/check-cost.mjs maintains and checks that one.
//
// The test counts are taken from the runners' own lists, with no test run: vitest's, and Playwright's
// for the browser tests, which needs web/ installed. Where it is not (CI's clean-clone job), the
// browser counts are skipped, and said to be; CI's web job checks them, and runs on every change
// to README.md (.github/workflows/web.yml). node:test has no list, so each devnet test file is run
// and its own count read (a few seconds). Every count the README and docs/v2.md state (the total,
// the v1/v2 split, the per-file counts) must equal those lists; --write rewrites the README's block
// and the counts in its prose and in docs/v2.md's, and says which per-file counts in docs/v2.md it
// cannot rewrite.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RULES } from '../devnet/src/v2-story.mjs';

const root = new URL('..', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(`deployments/${f}`, root), 'utf8'));
const full = load('local-devnet.json');
const quick = load('local-devnet-quick.json');
const bench = load('bench-shipped-finalize.json');
// Midnight's public test network, once each has run: the shipped contract, and the whole story.
const shipped = existsSync(new URL('deployments/preprod-shipped.json', root)) ? load('preprod-shipped.json') : null;
const story = existsSync(new URL('deployments/preprod.json', root)) ? load('preprod.json') : null;
// Lantern v2, a separate contract, deployed on Preprod beside the shipped one, and its run on a local chain.
const v2 = existsSync(new URL('deployments/preprod-v2.json', root)) ? load('preprod-v2.json') : null;
const v2Local = existsSync(new URL('deployments/local-v2.json', root)) ? load('local-v2.json') : null;

const HOST = new Set(['attestVote', 'openEpoch', 'openRotation', 'requireCurrentOwnerAttested', 'rotateVote', 'sealEpoch', 'sealRotation']);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const sponsored = (r) => r.steps.filter((s) => s.sponsorship).length;
const s = (x) => `${x} s`;

function chain() {
  const col = (r) => r.summary;
  const rows = [
    ['Recorded', full.recordedAt.slice(0, 10), quick.recordedAt.slice(0, 10)],
    ['Steps: accepted · refused · off chain', ...[full, quick].map((r) => { const x = col(r); return `${x.steps}: ${x.accepted} · ${x.refused} · ${x.steps - x.accepted - x.refused}`; })],
    ['Transactions (including 2 deploys and 2 freezes)', col(full).transactions, col(quick).transactions],
    ['Paid by a sponsor; the device holds no wallet', sponsored(full), sponsored(quick)],
    ['Proof time: min / median / max', `${col(full).proveSeconds.min} / ${col(full).proveSeconds.median} / ${col(full).proveSeconds.max} s`, `${col(quick).proveSeconds.min} / ${col(quick).proveSeconds.median} / ${col(quick).proveSeconds.max} s`],
    ['Call to finalized, median', s(col(full).callToFinalizedSeconds.median), s(col(quick).callToFinalizedSeconds.median)],
    ['Wall-clock time of the story', `${col(full).wallClockMinutes} min`, `${col(quick).wallClockMinutes} min`],
  ];
  const m = full.machine;
  const b = bench.proveSeconds;
  return [
    '| | Full story ([`local-devnet.json`](deployments/local-devnet.json)) | Core recovery ([`local-devnet-quick.json`](deployments/local-devnet-quick.json)) |',
    '|---|---:|---:|',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
    `Machine: ${m.cpuModel} (${m.cpus} cores), Node ${m.node}; ${full.images.map((i) => i.replace('midnightntwrk/', '')).join(', ')}; a single local node, network id \`undeployed\`. Lantern ran as the devnet flavour: line ${full.flavour.line} of \`lantern.compact\` changed, a ${full.flavour.recoveryDelaySeconds}-second timelock in place of ${full.flavour.shipped / 3600} hours; LanternHost ran unchanged.`,
    '',
    `The **shipped** 72-hour \`finalizeRecovery\`, proved without being submitted ([\`bench-shipped-finalize.json\`](deployments/bench-shipped-finalize.json), ${bench.recordedAt.slice(0, 10)}): ${b[0]} s for the first, cold proof, then ${Math.min(...b.slice(1))}–${Math.max(...b.slice(1))} s. The same finalize ${bench.negativeControl.match(/(\d+) h/)[1]} hours after the open is refused locally: "timelock has not elapsed".`,
  ].join('\n');
}

function chainCircuits() {
  const by = new Map();
  for (const r of [full, quick]) {
    for (const st of r.steps) {
      if (!st.tx?.txId) continue;
      const e = by.get(st.circuit) ?? { prove: [], total: [], sponsored: 0 };
      e.prove.push(st.timings.prove); e.total.push(st.timings.total);
      if (st.sponsorship) e.sponsored++;
      by.set(st.circuit, e);
    }
  }
  return [
    '| Contract | Circuit | Transactions | Proof, median | Proof, range | Call to finalized, median |',
    '|---|---|---:|---:|---:|---:|',
    ...[...by].sort(([a], [b]) => (HOST.has(a) - HOST.has(b)) || a.localeCompare(b)).map(([c, e]) =>
      `| ${HOST.has(c) ? 'host' : 'lantern'} | \`${c}\` | ${e.prove.length}${e.sponsored ? ` (${e.sponsored} sponsored)` : ''} | ${s(median(e.prove))} | ${Math.min(...e.prove)}–${Math.max(...e.prove)} s | ${s(median(e.total))} |`),
    '',
    'Both local-chain runs merged. For an even number of samples the median shown is the upper of the two middle values.',
  ].join('\n');
}

function attack() {
  return execFileSync(process.execPath, ['scripts/enumerate.mjs', '--markdown'], { cwd: new URL('.', root) }).toString().trim();
}

function preprod() {
  const r = shipped;
  const tx = (t) => `[block ${t.blockHeight}](${r.explorer}/transactions/${t.txHash})`;
  const minute = (t) => t.replace('T', ' ').slice(0, 16); // 2026-09-24 15:03
  const c = r.contract;
  const { openedAtLo, openedAtHi, approvals, finalizeNoEarlierThan } = r.recovery;
  const rows = r.steps.map((x) => `| ${x.id} | ${x.actor} | \`${x.circuit}\` | ${x.outcome === 'accepted' ? `accepted · ${tx(x.tx)}` : `refused: "${x.message}", before any transaction`} |`);
  // The contract records two bounds on the open's block time, not the time itself.
  const [loDay, loTime] = minute(openedAtLo).split(' ');
  const [hiDay, hiTime] = minute(openedAtHi).split(' ');
  const when = loDay === hiDay
    ? `on ${loDay}, at a block time between ${loTime} and ${hiTime} UTC`
    : `at a block time between ${minute(openedAtLo)} and ${minute(openedAtHi)} UTC`;
  const opened = `The recovery opened in ${tx(r.steps.find((x) => x.circuit === 'openRecovery').tx)} ${when}`;
  const f = r.finalize;
  const fin = f
    ? `It finalized in ${tx(f.tx)}${f.afterOpenHours == null ? '' : `, ${f.afterOpenHours} hours after the later bound recorded at the open${/tip/.test(f.afterOpenHoursMeasuredAt ?? '') ? ' (measured at the chain tip just after it)' : ''}`}${f.sponsorship ? ', paid for by a sponsor: the phone held no wallet' : ''}.`
    : `It cannot finalize before **${minute(finalizeNoEarlierThan)} UTC**: 72 hours after the later bound recorded at the open.`;
  return [
    `The shipped \`contracts/src/lantern.compact\`, unchanged, on Preprod since ${r.openedAt.slice(0, 10)}: [\`${c.address.slice(0, 16)}…\`](${r.explorer}/contracts/${c.address}) (deploy ${tx(c)}; maintenance authority frozen in ${tx(c.maintenanceAuthority.frozenBy)}, committee ${c.maintenanceAuthority.committee}, threshold ${c.maintenanceAuthority.threshold}). Its verifier keys: ${c.verifierKeys}.`,
    '',
    '| Step | Who | Circuit | Outcome |',
    '|---|---|---|---|',
    ...rows,
    '',
    `${opened}, and ${f ? 'reached' : 'has'} ${approvals} approvals. ${fin}`,
  ].join('\n');
}

// The steps of the Preprod story shown with their transactions: the open and its approvals, the
// veto of the thief's recovery, the finalize and the refusals before it, and a DApp of each kind.
const STORY_STEPS = ['3.2', '4.1', '4.2', '7.9', '8.2', '8.10', '8.11', '9.2', '9.14'];

function preprodStory() {
  const r = story;
  const x = r.summary;
  const tx = (t) => `[block ${t.blockHeight}](${r.explorer}/transactions/${t.txHash})`;
  const contracts = Object.values(r.contracts);
  const row = (c) => `| ${c.name} | [\`${c.address.slice(0, 16)}…\`](${r.explorer}/contracts/${c.address}) | ${tx(c)} | ${tx(c.maintenanceAuthority.frozenBy)}, committee ${c.maintenanceAuthority.committee}, threshold ${c.maintenanceAuthority.threshold} |`;
  const step = (id) => {
    const st = r.steps.find((y) => y.id === id);
    if (!st) throw new Error(`deployments/preprod.json has no step ${id}`);
    return st.outcome === 'accepted'
      ? `| ${st.id} | ${st.actor} | \`${st.circuit}\` | accepted · ${tx(st.tx)} | ${st.payer} |`
      : `| ${st.id} | ${st.actor} | \`${st.circuit}\` | refused: "${st.message}", before any transaction | no one |`;
  };
  const sp = r.steps.filter((y) => y.sponsorship);
  const spent = (k) => sp.reduce((n, y) => n + y.sponsorship[k], 0);
  const m = r.machine;
  const p = x.proveSeconds;
  const f = x.callToFinalizedSeconds;
  return [
    `Recorded on Preprod on ${r.recordedAt.slice(0, 10)} ([\`preprod.json\`](deployments/preprod.json)): ${x.steps} steps, ${x.accepted} accepted, ${x.refused} refused as the story expects and ${x.steps - x.accepted - x.refused} off chain, in ${x.transactions} transactions (including ${contracts.length} deploys and ${contracts.length} freezes). Lantern ran as the devnet flavour: line ${r.flavour.line} of \`lantern.compact\` changed, a ${r.flavour.recoveryDelaySeconds}-second timelock in place of ${r.flavour.shipped / 3600} hours; LanternHost ran unchanged.`,
    '',
    '| Contract | Address | Deploy | Maintenance authority frozen |',
    '|---|---|---|---|',
    ...contracts.map(row),
    '',
    '| Step | Who | Circuit | Outcome | Paid by |',
    '|---|---|---|---|---|',
    ...STORY_STEPS.map(step),
    '',
    `The operator wallet is the run's own funded wallet: it deployed ${contracts.length === 2 ? 'both' : `all ${contracts.length}`} contracts and paid for every step not marked otherwise${r.steps.filter((y) => y.circuit === 'approveRecovery' && y.tx).every((y) => y.payer === 'the operator wallet') ? ', the guardians\' approvals included' : ''}. Paid by a sponsor: ${sp.length} transactions, from a device that holds no wallet; the device's intents spent ${spent('userIntentDustSpends')} DUST outputs, the sponsor's ${spent('sponsorDustSpends')}. Proof time: ${p.min} / ${p.median} / ${p.max} s (min / median / max). Call to finalized: median ${s(f.median)}, ${f.min}–${f.max} s. The story took ${x.wallClockMinutes} min. Machine: ${m.cpuModel} (${m.cpus} cores), Node ${m.node}; ${r.images.map((i) => i.replace('midnightntwrk/', '')).join(', ')}, with Preprod's public node and indexer.`,
    '',
    `\`LANTERN_NETWORK=preprod npm run devnet:verify\` checks this record against Preprod at any time: both contracts exist with their maintenance authorities frozen; every verifier key is byte-identical to a fresh compile, and the flavour differs from the shipped build in \`finalizeRecovery\` alone; both ledgers end where the record says; and all ${x.transactions} transactions are on the chain at their recorded blocks. It also re-reads the record's own entries for the ${sp.length} sponsored transactions: each came from a device with no wallet, and only the sponsor spent DUST.`,
  ].join('\n');
}

// Lantern v2 on Preprod: a separate contract, deployed beside the shipped one (never in its place),
// in parts because the node refuses a deploy carrying all its verifier keys, then frozen; then each
// v2 rule run once. Every step is shown, with its transaction or its refusal.
function preprodV2() {
  const r = v2;
  const x = r.summary;
  const c = r.contracts.lantern2;
  const tx = (t) => `[block ${t.blockHeight}](${r.explorer}/transactions/${t.txHash})`;
  const inserts = c.verifierKeysInsertedBy ?? [];
  const keys = c.operationsAtDeploy.length + inserts.reduce((n, u) => n + u.operations.length, 0);
  const code = (ops) => ops.map((o) => `\`${o}\``);
  const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
  const seen = new Set();
  const row = (st) => {
    const rule = seen.has(st.rule) ? '' : `${st.rule}. ${RULES[st.rule]}`;
    seen.add(st.rule);
    return st.outcome === 'accepted'
      ? `| ${rule} | ${st.id} | ${st.actor} | \`${st.circuit}\` | accepted · ${tx(st.tx)} |`
      : `| ${rule} | ${st.id} | ${st.actor} | \`${st.circuit}\` | refused: "${st.message}", before any transaction |`;
  };
  const payers = new Set(r.steps.filter((st) => st.tx).map((st) => st.payer));
  if (payers.size !== 1 || !payers.has('the operator wallet')) throw new Error('deployments/preprod-v2.json: a step was not paid by the operator wallet; say who paid');
  const p = x.proveSeconds;
  const f = x.callToFinalizedSeconds;
  const m = r.machine;
  const hours = r.delay.chosenSeconds / 3600;
  if (r.steps.some((st) => st.circuit === 'finalizeRecovery')) throw new Error('deployments/preprod-v2.json finalizes a recovery: say so');
  const outcomes = (rec) => JSON.stringify(rec.steps.map((st) => [st.id, st.circuit, st.outcome, st.message ?? null]));
  let local = '';
  if (v2Local) {
    const l = v2Local.summary;
    if (outcomes(v2Local) !== outcomes(r)) throw new Error('deployments/local-v2.json and preprod-v2.json differ in their steps: say how');
    local = ` It also ran on a local chain on ${v2Local.recordedAt.slice(0, 10)} ([\`local-v2.json\`](deployments/local-v2.json), \`npm run devnet:v2\`): the same ${l.steps} steps with the same outcomes, in ${l.transactions} transactions.`;
  }
  return [
    `Lantern v2 is a separate contract, [\`contracts/v2/lantern2.compact\`](contracts/v2/lantern2.compact) as compiled, deployed on Preprod beside the shipped contract and not in its place: [\`${c.address.slice(0, 16)}…\`](${r.explorer}/contracts/${c.address}). Recorded on ${r.recordedAt.slice(0, 10)} ([\`preprod-v2.json\`](deployments/preprod-v2.json)): each v2 rule run once, ${x.steps} steps, ${x.accepted} accepted and ${x.refused} refused by the circuit's own asserts, in ${x.transactions} transactions (the deploy, ${inWords(inserts.length)} key insert${inserts.length === 1 ? '' : 's'} and the freeze, then ${x.accepted} steps).`,
    '',
    `The node refuses a deploy carrying all ${keys} verifier keys ("Transaction would exhaust the block limits"), so the deploy carried ${c.operationsAtDeploy.length} and ${inserts.length === 1 ? 'one maintenance update' : `${inserts.length} maintenance updates`} added the other ${keys - c.operationsAtDeploy.length} before the freeze:`,
    '',
    '| Deploy | Verifier keys added | Maintenance authority frozen |',
    '|---|---|---|',
    `| ${tx(c)}, with ${c.operationsAtDeploy.length} of the ${keys} verifier keys: ${list(code(c.operationsAtDeploy))} | ${inserts.map((u) => `${tx(u)}: ${list(code(u.operations))}`).join('; ')} | ${tx(c.maintenanceAuthority.frozenBy)}, committee ${c.maintenanceAuthority.committee}, threshold ${c.maintenanceAuthority.threshold} |`,
    '',
    '| Rule | Step | Who | Circuit | Outcome |',
    '|---|---|---|---|---|',
    ...r.steps.map(row),
    '',
    `The owner chose v2's minimum delay at enrolment, ${hours} hours; nothing in the run waits it out, so no v2 recovery is finalized. The operator wallet, the run's own funded wallet, paid for every transaction. Proof time: ${p.min} / ${p.median} / ${p.max} s (min / median / max). Call to finalized: median ${s(f.median)}, ${f.min}–${f.max} s. The run took ${x.wallClockMinutes} min. Machine: ${m.cpuModel} (${m.cpus} cores), Node ${m.node}; ${r.images.map((i) => i.replace('midnightntwrk/', '')).join(', ')}, with Preprod's public node and indexer.${local}`,
    '',
    `\`LANTERN_NETWORK=preprod npm run devnet:verify:v2\` checks this record against Preprod at any time, with no wallet: the record is consistent and was compiled from the sources committed here; the contract exists, with its maintenance authority frozen, and its counter shows no maintenance update but the recorded ${inserts.length === 1 ? 'key insert' : 'key inserts'} and the freeze; all ${keys} verifier keys are byte-identical to a fresh compile of \`contracts/v2/lantern2.compact\`; the ledger and the story's identity end where the record says, read in the block of its last transaction; and all ${x.transactions} transactions are on the chain at their recorded blocks, each carrying the recorded action on this contract. Offline, [\`test/v2-record.test.js\`](test/v2-record.test.js) checks both v2 records on every \`npm test\`.`,
  ].join('\n');
}

// ---- the test suites, as their runners list them -------------------------------------------------
const run = (args, cwd) => execFileSync(process.execPath, args, { cwd: new URL(cwd, root), stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).toString();

/** Each Vitest test file (by name, without .test.js) and how many tests it holds. */
function unitTests() {
  const byFile = new Map();
  for (const t of JSON.parse(run(['node_modules/vitest/vitest.mjs', 'list', '--json'], '.'))) {
    const f = t.file.split(/[\\/]/).pop().replace(/\.test\.js$/, '');
    byFile.set(f, (byFile.get(f) ?? 0) + 1);
  }
  return byFile;
}

/** Each Playwright spec (by name, without .spec.js) and how many tests it holds in one project, or null
 *  when web/ is not installed. Every project runs the same list (a test that skips itself is listed).
 *  `browserRuns` counts the tests of every project: one run each. */
let browserRuns = 0;
function browserTests() {
  if (!existsSync(new URL('web/node_modules/@playwright/test/cli.js', root))) return null;
  const list = JSON.parse(run(['node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json'], 'web/'));
  const byFile = new Map();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        browserRuns += 1;
        if (t.projectName !== list.config.projects[0].name) continue;
        const f = spec.file.replace(/\.spec\.js$/, '');
        byFile.set(f, (byFile.get(f) ?? 0) + 1);
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of list.suites) walk(suite);
  return byFile;
}

const sum = (m, keys = [...m.keys()]) => keys.reduce((n, k) => n + (m.get(k) ?? 0), 0);
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const inWords = (n) => WORDS[n] ?? String(n);
const capital = (w) => w.charAt(0).toUpperCase() + w.slice(1);
/** The node:test tests in devnet/test (dependency-free; CI runs them with `node --test`), counted apart
 *  for the sponsor's policy (policy.test.mjs) and for the other devnet scripts. node:test has no list,
 *  and some files make their tests in a loop, so each file is run and its own count read ("# tests",
 *  which counts a skipped test too): a few seconds in all. */
function nodeTests() {
  const count = { policy: 0, scripts: 0 };
  for (const f of readdirSync(new URL('devnet/test/', root)).filter((x) => x.endsWith('.test.mjs')).sort()) {
    const out = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `devnet/test/${f}`],
      { cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 64 << 20 }).stdout ?? '';
    const n = out.match(/^# tests (\d+)$/m);
    if (!n) throw new Error(`devnet/test/${f}: node --test printed no "# tests" line`);
    count[f === 'policy.test.mjs' ? 'policy' : 'scripts'] += Number(n[1]);
  }
  return count;
}

const UNIT = unitTests();
const NODE = nodeTests();
const BROWSER = browserTests();
// Lantern v2's files are test/v2-*.test.js (npm run test:v2); every other file tests shipped Lantern.
const V2 = [...UNIT.keys()].filter((f) => f.startsWith('v2-'));
const V1 = [...UNIT.keys()].filter((f) => !f.startsWith('v2-'));
const unitTotal = sum(UNIT);
const v1Total = sum(UNIT, V1);
const v2Total = sum(UNIT, V2);
const browserTotal = BROWSER && sum(BROWSER);

function tests() {
  if (!BROWSER) return null;
  const files = V1.map((f) => [f, UNIT.get(f)]).sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).map(([f, n]) => `${f} ${n}`).join(', ');
  return `**Tests.** ${unitTotal} Vitest tests in ${UNIT.size} files. Shipped Lantern's ${v1Total} are in ${V1.length}: ${files}. Lantern v2's ${v2Total} are in ${V2.length} ([docs/v2.md §13](docs/v2.md#13-implementation)). ${capital(inWords(NODE.policy))} node:test tests of the sponsor's policy, and ${NODE.scripts} of the other devnet scripts. ${browserTotal} Playwright tests, ${inWords(BROWSER.get('break') ?? 0)} of them for the "Try to break it" panel and ${sum(BROWSER, ['live', 'rehearse', 'kit'])} for \`/live\`, \`/rehearse\` and \`/kit\`, run in CI in Chromium at desktop size and as an emulated Pixel 7, and before release in WebKit, as an emulated iPhone 15, and in Firefox.`;
}

// The same counts where the prose states them: each phrase must appear, and every number in it must
// be its count, in order (--write rewrites them).
const COUNTS = [
  ['README.md', 'unit tests, For reviewers', /all (\d+) unit tests pass, (\d+) for shipped Lantern and (\d+) for Lantern v2,/g, [unitTotal, v1Total, v2Total]],
  ['README.md', 'unit tests, the Quality row', /(\d+) unit tests \((\d+) for shipped Lantern, (\d+) for \[Lantern v2\]/g, [unitTotal, v1Total, v2Total]],
  ['README.md', 'unit tests, Quickstart', /npm test +# (\d+) tests \(v1's (\d+), v2's (\d+)\)/g, [unitTotal, v1Total, v2Total]],
  ['README.md', 'unit and browser tests, In one minute', /(\d+) unit tests and (\d+) browser tests/g, [unitTotal, browserTotal]],
  ['README.md', 'browser tests, the Quality row', /(\d+) browser tests, run in CI in Chromium/g, [browserTotal]],
  ['README.md', 'browser tests, Quickstart', /# the (\d+) browser tests in Chromium/g, [browserTotal]],
  ['README.md', 'browser test runs, Quickstart', /as an emulated Pixel 7: (\d+) runs/g, [BROWSER && browserRuns]],
  ['README.md', 'browser tests, Quickstart (cross)', /# the same (\d+) in WebKit/g, [browserTotal]],
  ['docs/v2.md', 'unit tests, docs/v2.md §13', /`npm run test:v2`: (\d+) files, (\d+) tests\. `npm test` runs them with shipped Lantern's (\d+), which are unchanged: (\d+) in all\./g,
    [V2.length, v2Total, v1Total, unitTotal]],
];

/** Every match of `re` in `text`, and `text` with each group set to its count. */
function fixCounts(text, re, want) {
  const found = [...text.matchAll(new RegExp(re.source, `${re.flags}d`))];
  const edits = [];
  for (const m of found) m.indices.slice(1).forEach(([a, b], i) => { if (text.slice(a, b) !== String(want[i])) edits.push([a, b, String(want[i])]); });
  let out = text;
  for (const [a, b, v] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + v + out.slice(b);
  return { found, out };
}

/** docs/v2.md §13's table has one row per v2 test file, and §14.2 cites files by count. */
function v2FileCounts(text) {
  const problems = [];
  const rows = new Set([...text.matchAll(/^\| `(v2-[a-z0-9-]+)\.test\.js` \| \d+ \|/gm)].map((m) => m[1]));
  for (const f of V2) if (!rows.has(f)) problems.push(`docs/v2.md §13: no row for ${f}.test.js (${UNIT.get(f)} tests)`);
  for (const f of rows) if (!UNIT.has(f)) problems.push(`docs/v2.md §13: a row for ${f}.test.js, which has no tests`);
  for (const [cite, f] of text.matchAll(/`(v2-[a-z0-9-]+)` \(\d+\)/g)) if (!UNIT.has(f)) problems.push(`docs/v2.md: ${cite} names no test file`);
  const count = (m, a, f, b) => (UNIT.has(f) ? `${a}${UNIT.get(f)}${b}` : m);
  const out = text
    .replace(/^(\| `(v2-[a-z0-9-]+)\.test\.js` \| )\d+( \|)/gm, (m, a, f, b) => count(m, a, f, b))
    .replace(/(`(v2-[a-z0-9-]+)` \()\d+(\))/g, (m, a, f, b) => count(m, a, f, b));
  return { problems, out };
}

const BLOCKS = { chain, 'chain-circuits': chainCircuits, attack, ...(shipped ? { preprod } : {}), ...(story ? { 'preprod-story': preprodStory } : {}), ...(v2 ? { 'preprod-v2': preprodV2 } : {}), tests };

const file = new URL('README.md', root);
const v2doc = new URL('docs/v2.md', root);
let readme = readFileSync(file, 'utf8');
const stale = [];
const skipped = [];
const problems = [];
for (const [name, make] of Object.entries(BLOCKS)) {
  const re = new RegExp(`(<!-- facts:${name}:start -->\\n)([\\s\\S]*?)(\\n<!-- facts:${name}:end -->)`);
  const m = readme.match(re);
  if (!m) { stale.push(`${name}: block missing`); continue; }
  const body = make();
  if (body === null) { skipped.push(name); continue; }
  if (m[2] !== body) { stale.push(name); readme = readme.replace(re, `$1${body}$3`); }
}
const texts = { 'README.md': readme, 'docs/v2.md': readFileSync(v2doc, 'utf8') };
for (const [doc, what, re, want] of COUNTS) {
  if (want.some((n) => n === null)) { skipped.push(what); continue; }
  const { found, out } = fixCounts(texts[doc], re, want);
  if (!found.length) { problems.push(`${doc}: ${what}: no sentence matches ${re}`); continue; }
  if (out !== texts[doc]) {
    stale.push(`${what} (${found.map((m) => m.slice(1).join(' / ')).join(', ')}, not ${want.join(' / ')})`);
    texts[doc] = out;
  }
}
const perFile = v2FileCounts(texts['docs/v2.md']);
problems.push(...perFile.problems);
if (perFile.out !== texts['docs/v2.md']) { stale.push('docs/v2.md per-file v2 test counts'); texts['docs/v2.md'] = perFile.out; }
for (const p of problems) console.error(`readme-facts: test count: ${p}`);
if (skipped.length) console.log(`readme-facts: skipped ${skipped.join(', ')}: web/ is not installed (npm run web:install)`);
if (process.argv.includes('--write')) {
  writeFileSync(file, texts['README.md']);
  writeFileSync(v2doc, texts['docs/v2.md']);
  console.log(stale.length ? `readme-facts: rewrote ${stale.join(', ')}` : 'readme-facts: already current');
  if (problems.length) process.exit(1);
} else if (stale.length) {
  console.error(`readme-facts: README.md or docs/v2.md is out of date with the evidence: ${stale.join(', ')}. Run: node scripts/readme-facts.mjs --write`);
  process.exit(1);
} else if (problems.length) {
  process.exit(1);
} else {
  console.log(`readme-facts: all ${Object.keys(BLOCKS).length - skipped.filter((x) => x in BLOCKS).length} generated blocks and ${COUNTS.length - skipped.filter((x) => !(x in BLOCKS)).length} stated test counts match their sources, and so does every per-file count in docs/v2.md`);
}
