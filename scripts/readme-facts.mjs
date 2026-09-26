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
// The test counts are taken from the runners' own lists (no test runs): vitest's, and Playwright's
// for the browser tests, which needs web/ installed. Where it is not (CI's clean-clone job), the
// browser counts are skipped, and said to be; CI's web job checks them.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(`deployments/${f}`, root), 'utf8'));
const full = load('local-devnet.json');
const quick = load('local-devnet-quick.json');
const bench = load('bench-shipped-finalize.json');
// Midnight's public test network, once each has run: the shipped contract, and the whole story.
const shipped = existsSync(new URL('deployments/preprod-shipped.json', root)) ? load('preprod-shipped.json') : null;
const story = existsSync(new URL('deployments/preprod.json', root)) ? load('preprod.json') : null;

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
    `Paid by a sponsor: ${sp.length} transactions, from a device that holds no wallet; the device's intents spent ${spent('userIntentDustSpends')} DUST outputs, the sponsor's ${spent('sponsorDustSpends')}. Proof time: ${p.min} / ${p.median} / ${p.max} s (min / median / max). Call to finalized: median ${s(f.median)}, ${f.min}–${f.max} s. The story took ${x.wallClockMinutes} min. Machine: ${m.cpuModel} (${m.cpus} cores), Node ${m.node}; ${r.images.map((i) => i.replace('midnightntwrk/', '')).join(', ')}, with Preprod's public node and indexer.`,
    '',
    `\`LANTERN_NETWORK=preprod npm run devnet:verify\` checks this record against Preprod at any time: both contracts exist with their maintenance authorities frozen; every verifier key is byte-identical to a fresh compile, and the flavour differs from the shipped build in \`finalizeRecovery\` alone; both ledgers end where the record says; and all ${x.transactions} transactions are on the chain at their recorded blocks. It also re-reads the record's own entries for the ${sp.length} sponsored transactions: each came from a device with no wallet, and only the sponsor spent DUST.`,
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
 *  when web/ is not installed. Every project runs the same list (a test that skips itself is listed). */
function browserTests() {
  if (!existsSync(new URL('web/node_modules/@playwright/test/cli.js', root))) return null;
  const list = JSON.parse(run(['node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json'], 'web/'));
  const byFile = new Map();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
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
/** The sponsor's policy tests: node:test, dependency-free, one top-level test() each. */
const nodeTests = () => readdirSync(new URL('devnet/test/', root)).filter((f) => f.endsWith('.test.mjs'))
  .reduce((n, f) => n + (readFileSync(new URL(`devnet/test/${f}`, root), 'utf8').match(/^test\(/gm) ?? []).length, 0);

const UNIT = unitTests();
const BROWSER = browserTests();
const unitTotal = sum(UNIT);
const browserTotal = BROWSER && sum(BROWSER);

function tests() {
  if (!BROWSER) return null;
  const files = [...UNIT].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).map(([f, n]) => `${f} ${n}`).join(', ');
  return `**Tests.** ${unitTotal} Vitest tests in ${UNIT.size} files: ${files}. ${capital(inWords(nodeTests()))} node:test tests of the sponsor's policy. ${browserTotal} Playwright tests, ${inWords(BROWSER.get('break') ?? 0)} of them for the "Try to break it" panel and ${sum(BROWSER, ['live', 'rehearse', 'kit'])} for \`/live\`, \`/rehearse\` and \`/kit\`, run in CI in Chromium at desktop size and as an emulated Pixel 7, and before release in WebKit, as an emulated iPhone 15, and in Firefox.`;
}

// The same counts where the prose states them: each phrase must appear, and every number in it must
// be the count (--write rewrites them).
const COUNTS = [
  ['unit tests, For reviewers', /all (\d+) unit tests pass/g, unitTotal],
  ['unit tests, the Quality row', /(\d+) unit tests in about ten seconds/g, unitTotal],
  ['unit tests, Quickstart', /npm test +# (\d+) tests in about ten seconds/g, unitTotal],
  ['browser tests, the Quality row', /(\d+) browser tests in Chromium, WebKit and Firefox/g, browserTotal],
  ['browser tests, Quickstart', /# the (\d+) browser tests in Chromium/g, browserTotal],
  ['browser tests, Quickstart (cross)', /# the same (\d+) in WebKit/g, browserTotal],
];

const BLOCKS = { chain, 'chain-circuits': chainCircuits, attack, ...(shipped ? { preprod } : {}), ...(story ? { 'preprod-story': preprodStory } : {}), tests };

const file = new URL('README.md', root);
let readme = readFileSync(file, 'utf8');
const stale = [];
const skipped = [];
for (const [name, make] of Object.entries(BLOCKS)) {
  const re = new RegExp(`(<!-- facts:${name}:start -->\\n)([\\s\\S]*?)(\\n<!-- facts:${name}:end -->)`);
  const m = readme.match(re);
  if (!m) { stale.push(`${name}: block missing`); continue; }
  const body = make();
  if (body === null) { skipped.push(name); continue; }
  if (m[2] !== body) { stale.push(name); readme = readme.replace(re, `$1${body}$3`); }
}
for (const [what, re, count] of COUNTS) {
  if (count === null) { skipped.push(what); continue; }
  const found = [...readme.matchAll(re)];
  if (!found.length) { stale.push(`${what}: phrase missing`); continue; }
  if (found.some((m) => Number(m[1]) !== count)) {
    stale.push(`${what} (${found.map((m) => m[1]).join(', ')}, not ${count})`);
    readme = readme.replace(re, (m, n) => m.replace(n, String(count)));
  }
}
if (skipped.length) console.log(`readme-facts: skipped ${skipped.join(', ')}: web/ is not installed (npm run web:install)`);
if (process.argv.includes('--write')) {
  writeFileSync(file, readme);
  console.log(stale.length ? `readme-facts: rewrote ${stale.join(', ')}` : 'readme-facts: already current');
} else if (stale.length) {
  console.error(`readme-facts: README.md is out of date with the evidence: ${stale.join(', ')}. Run: node scripts/readme-facts.mjs --write`);
  process.exit(1);
} else {
  console.log(`readme-facts: all ${Object.keys(BLOCKS).length - skipped.filter((x) => x in BLOCKS).length} generated blocks and ${COUNTS.length - skipped.filter((x) => !(x in BLOCKS)).length} stated test counts match their sources`);
}
