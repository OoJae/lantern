#!/usr/bin/env node
// npm run devnet:v2
//
// Lantern v2 on a real chain: the local chain by default, or Preprod with LANTERN_NETWORK=preprod.
// Deploys contracts/v2/lantern2.compact as compiled (bash devnet/compile.sh --v2), freezes its
// maintenance authority, then runs v2's chain story (v2-story.mjs): each v2 rule of docs/v2.md
// exercised once, every accepted step a real transaction with a real zero-knowledge proof, every
// refusal the circuit's own assert, raised locally before anything is proved.
//
// One-shot: a fresh contract every run. The paying wallet (the genesis wallet locally, the
// operator wallet on Preprod) pays for everything. The record is written only if every step goes
// as expected: deployments/local-v2.json, or deployments/preprod-v2.json on Preprod. Check
// it against the chain, with no wallet: npm run devnet:verify:v2.
import './ws.mjs'; // before anything that loads the wallet SDK: see ws.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, network, isPublic } from './config.mjs';
import { startWallet, readyToPay, saveSnapshot, GENESIS_SEED } from './wallet.mjs';
import { loadSeeds, snapshotOf } from './wallets.mjs';
import { loadLantern2, LANTERN2_ZK } from './bindings.mjs';
import { v2Executor } from './v2-executor.mjs';
import { createV2Story, runV2Story, v2Summary, identityState, RULES, V2_DELAY } from './v2-story.mjs';
import { buildV2Record, v2RecordName, checkInPeriodOf, V2_SOURCES } from './v2-record.mjs';
import { storyRng } from '../../src/demo/rng.mjs';
import { duration } from '../../src/demo/story.mjs';

const WALLET = isPublic ? 'the operator wallet' : 'the genesis wallet';
const WHERE = isPublic ? `${network.name.toUpperCase()}, MIDNIGHT'S PUBLIC TEST NETWORK` : 'A LOCAL CHAIN';
const startedAt = Date.now();
const color = process.stdout.isTTY && !process.argv.includes('--no-color');
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s), dim = (s) => c('2', s), red = (s) => c('31;1', s), green = (s) => c('32;1', s), cyan = (s) => c('36', s);
const stamp = () => dim(`[${duration(Math.round((Date.now() - startedAt) / 1000)).padStart(9)}]`);
const log = (m) => console.log(`${stamp()} ${m}`);
const sha256 = (file) => createHash('sha256').update(readFileSync(path.join(repoRoot, file))).digest('hex');

console.log();
console.log(bold(`  LANTERN v2 · EACH v2 RULE ON ${WHERE}`));
console.log(dim(`  contracts/v2/lantern2.compact as committed · real proofs, real transactions · a ${V2_DELAY / 3600} h delay, chosen at enrolment`));
console.log();

const Lantern2 = await loadLantern2();
const info = JSON.parse(readFileSync(path.join(LANTERN2_ZK, 'compiler', 'contract-info.json'), 'utf8'));
const compiler = { compact: info['compiler-version'], language: info['language-version'], runtime: info['runtime-version'] };
const sources = Object.fromEntries(V2_SOURCES.map((f) => [f, sha256(f)]));

log(`syncing ${WALLET}…`);
// On a public network the operator wallet has its own seed (wallets.mjs) and resumes from a snapshot.
const wallet = isPublic
  ? await startWallet(loadSeeds().operator, { snapshotFile: snapshotOf('operator') })
  : await startWallet(GENESIS_SEED);
await readyToPay(wallet, (m) => log(m));

const x = await v2Executor({ Lantern2, zk: LANTERN2_ZK, wallet, log, walletName: WALLET, name: isPublic ? network.name : 'local chain' });
// Fresh keys every run: real entropy, as a real owner's would be.
const story = createV2Story({ pure: Lantern2.pureCircuits, rng: storyRng() });

let lastRule = -1;
const records = await runV2Story(story, x, {
  onStep: (r) => {
    if (r.rule !== lastRule) {
      lastRule = r.rule;
      console.log();
      console.log(bold(`  ${r.rule} · ${RULES[r.rule].toUpperCase()}`));
    }
    const mark = r.ok ? green('✓') : red('✗ UNEXPECTED');
    const verdict = r.outcome === 'accepted' ? green('accepted') : cyan(`refused: "${r.message}"`);
    log(`${mark} ${r.actor} → ${r.circuit}  ${verdict}`);
    if (r.tx?.txId) {
      const t = r.timings;
      log(dim(`    block ${r.tx.blockHeight} · tx ${r.tx.txId.slice(0, 16)}… · prove ${t.prove} s${t.cold ? ' (cold)' : ''} · balance ${t.balance} s · submit and inclusion ${t.submit} s · finalized ${t.finalize} s after · total ${t.total} s`));
    }
    if (r.tx?.note) log(dim(`    ${r.tx.note}`));
  },
});

const bad = records.filter((r) => !r.ok);
const L = await x.ledger();
const finalLedger = v2Summary(L);
const period = checkInPeriodOf(records);
const finalIdentity = period === null ? null : identityState(L, Lantern2.pureCircuits, story.world.id, period);
if (isPublic) await saveSnapshot(wallet, snapshotOf('operator')); // keep the sync for the next run
await wallet.wallet.stop();
console.log();
if (bad.length) {
  console.log(red(`  ${bad.length} step(s) did not go as the story expects. No record written.`));
  for (const r of bad) console.log(red(`    ${r.id}: expected ${r.expect}, got ${r.outcome ?? ''} ${r.message ?? ''}`));
  process.exit(1);
}
const record = buildV2Record({ network, isPublic, contract: x.contract, records, finalLedger, finalIdentity, startedAt, compiler, sources,
  delaySeconds: V2_DELAY, walletName: WALLET });
const file = path.join(repoRoot, 'deployments', v2RecordName({ networkId: network.networkId, isPublic }));
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
const s = record.summary;
console.log(green(`  Every step went exactly as expected: ${s.accepted} accepted, ${s.refused} refused, ${s.transactions} transactions.`));
console.log(`  proofs: ${s.proveSeconds.min}–${s.proveSeconds.max} s (median ${s.proveSeconds.median} s) · call to finalized: median ${s.callToFinalizedSeconds.median} s · ${s.wallClockMinutes} min in all`);
console.log(`  Lantern v2 at ${x.contract.address} · the identity ends unlocked, one veto, its reserved recovery live, ${finalIdentity.checkIns.count} check-in this period`);
console.log(dim(`  record: ${path.relative(repoRoot, file)} · check it against the chain: ${isPublic ? `LANTERN_NETWORK=${network.networkId} ` : ''}npm run devnet:verify:v2`));
process.exit(0);
