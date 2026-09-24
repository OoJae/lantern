#!/usr/bin/env node
// npm run devnet [-- --quick]
//
// The Lantern story on a real chain: the local chain by default, or Preprod with
// LANTERN_NETWORK=preprod. Every accepted step is a real transaction with a real
// zero-knowledge proof. The same script, the same expectations, as `npm run story`.
//
//   --quick       the core recovery only: enrol, guardians, the DApp, open, approve, the
//                 timelock, finalize, and the DApp again. The full run adds the attacker,
//                 the refusals of beats 6 and 7 and the epilogue.
//   --self-pay    the genesis wallet (on Preprod, the operator wallet) pays for everything.
//                 By default the recovering phone holds no wallet at all -- it has lost
//                 everything -- so a sponsor pays its fees, and Seo-yeon pays for the open
//                 from her own wallet.
//
// One-shot: fresh contracts every run. The record is written only if every step goes as
// expected, to deployments/local-devnet.json (local-devnet-quick.json with --quick), or on
// Preprod to deployments/preprod.json (preprod-quick.json). On a public network each wallet
// resumes from a snapshot of its last sync (devnet/src/wallet.mjs). The SHIPPED contract's
// run on Preprod, with its real 72-hour lock, is devnet/src/shipped.mjs, recorded in
// deployments/preprod-shipped.json.
import './ws.mjs'; // before anything that loads the wallet SDK: see ws.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createStory, runStory, BEATS, publicRecord, hostRecord, duration } from '../../src/demo/story.mjs';
import { storyRng } from '../../src/demo/rng.mjs';
import { isQuickStep } from '../../src/demo/quick.mjs';
import { repoRoot, network, isPublic } from './config.mjs';
import { startWallet, readyToPay, saveSnapshot, GENESIS_SEED } from './wallet.mjs';
import { loadSeeds, snapshotOf } from './wallets.mjs';
import { loadBindings, LANTERN_ZK, HOST_ZK } from './bindings.mjs';
import { devnetExecutor } from './executor.mjs';
import { buildRecord, writeRecord } from './record.mjs';
import { flavour } from '../flavour.mjs';

const quick = process.argv.includes('--quick');
const sponsored = !process.argv.includes('--self-pay');
// Dev-preset seeds, funded at genesis on the local chain only (docs/spikes.md, S2). On a public
// network each role has its own funded wallet (devnet/src/wallets.mjs), resumed from a snapshot.
const SPONSOR_SEED = GENESIS_SEED.replace(/1$/, '3');
const GUARDIAN_SEED = GENESIS_SEED.replace(/1$/, '2');
const seeds = isPublic ? loadSeeds() : null;
const walletOf = (role, localSeed) => (isPublic
  ? startWallet(seeds[role], { snapshotFile: snapshotOf(role) }) : startWallet(localSeed));
const WALLET = isPublic ? 'the operator wallet' : 'the genesis wallet';
const WHERE = isPublic ? `${network.name.toUpperCase()}, MIDNIGHT'S PUBLIC TEST NETWORK` : 'A LOCAL CHAIN';
const startedAt = Date.now();
const color = process.stdout.isTTY && !process.argv.includes('--no-color');
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s), dim = (s) => c('2', s), red = (s) => c('31;1', s), green = (s) => c('32;1', s), cyan = (s) => c('36', s);
const stamp = () => dim(`[${duration(Math.round((Date.now() - startedAt) / 1000)).padStart(9)}]`);
const log = (m) => console.log(`${stamp()} ${m}`);



console.log();
console.log(bold(`  LANTERN · THE STORY ON ${WHERE}${quick ? ' (quick: the core recovery)' : ''}${sponsored ? ' · SPONSORED' : ''}`));
console.log(dim('  real proofs, real transactions, the devnet flavour: a 60 s timelock, one line changed'));
console.log();

const bindings = await loadBindings();
const { changedLine } = flavour(readFileSync(path.join(repoRoot, 'contracts', 'src', 'lantern.compact'), 'utf8'));

log(`syncing ${WALLET}…`);
const wallet = await walletOf('operator', GENESIS_SEED);
await readyToPay(wallet, (m) => log(m));

let sponsorship = null;
if (sponsored) {
  log('syncing the sponsor\'s wallet and Seo-yeon\'s wallet…');
  const [sponsorWallet, guardianWallet] = await Promise.all([walletOf('sponsor', SPONSOR_SEED), walletOf('seoyeon', GUARDIAN_SEED)]);
  await Promise.all([readyToPay(sponsorWallet), readyToPay(guardianWallet)]);
  sponsorship = { sponsorWallet, guardianWallet };
}
const x = await devnetExecutor({ bindings, zk: { lantern: LANTERN_ZK, host: HOST_ZK }, wallet, log, sponsorship,
  walletName: WALLET, name: isPublic ? network.name : 'local chain' });
const story = createStory({ pure: x.pure, rng: storyRng() });
const steps = quick ? story.steps.filter(isQuickStep) : story.steps;

let lastBeat = -1;
const records = await runStory({ ...story, steps }, x, {
  onStep: (r) => {
    if (r.beat !== lastBeat) {
      lastBeat = r.beat;
      console.log();
      console.log(bold(r.beat === 10 ? '  EPILOGUE' : `  BEAT ${r.beat} · ${BEATS[r.beat].title.toUpperCase()}`));
    }
    const mark = r.ok ? green('✓') : red('✗ UNEXPECTED');
    if (r.kind === 'call') {
      const verdict = r.outcome === 'accepted' ? green('accepted') : cyan(`refused: "${r.message}"`);
      // A refusal happens locally, before anything is proved: nobody pays for it.
      const paid = r.outcome === 'accepted' && r.payer && sponsored ? dim(`  · paid by ${r.payer}`) : '';
      log(`${mark} ${r.actor} → ${r.contract === 'host' ? 'host.' : ''}${r.circuit}  ${verdict}${paid}`);
      if (r.tx?.txId) {
        const t = r.timings, sp = r.sponsorship;
        // A sponsored call hands its bound transaction to the sponsor inside `balance`, and the
        // sponsor submits it: show the sponsor's own split instead.
        const pay = sp
          ? `sponsor balance ${sp.sponsorBalanceSeconds} s · sponsor submit and inclusion ${sp.sponsorSubmitSeconds} s`
          : `balance ${t.balance} s · submit and inclusion ${t.submit} s`;
        log(dim(`    block ${r.tx.blockHeight} · tx ${r.tx.txId.slice(0, 16)}… · prove ${t.prove} s${t.cold ? ' (cold)' : ''} · ${pay} · finalized ${t.finalize} s after · total ${t.total} s`));
      } else if (r.tx?.note) log(dim(`    ${r.tx.note}`));
    } else {
      log(`${mark} ${r.actor}: ${r.detail ?? ''}`);
    }
  },
});

const bad = records.filter((r) => !r.ok);
const finalLedger = publicRecord(await x.ledger());
const finalHostLedger = hostRecord(await x.hostLedger());
if (isPublic) {
  // Keep each wallet's sync for the next run on this network.
  await saveSnapshot(wallet, snapshotOf('operator'));
  if (sponsorship) await Promise.all([saveSnapshot(sponsorship.sponsorWallet, snapshotOf('sponsor')), saveSnapshot(sponsorship.guardianWallet, snapshotOf('seoyeon'))]);
}
await wallet.wallet.stop();
if (sponsorship) await Promise.all([sponsorship.sponsorWallet.wallet.stop(), sponsorship.guardianWallet.wallet.stop()]);
console.log();
if (bad.length) {
  console.log(red(`  ${bad.length} step(s) did not go as the story expects. No record written.`));
  for (const r of bad) console.log(red(`    ${r.id}: expected ${r.expect}, got ${r.outcome ?? ''} ${r.message ?? ''}`));
  process.exit(1);
}
const mode = `${quick ? 'quick' : 'full'}${sponsored ? '+sponsored' : ''}`;
const record = buildRecord({ mode, x, records, finalLedger, finalHostLedger, startedAt, flavourLine: changedLine, sponsored });
const file = writeRecord(record, { quick, selfPay: !sponsored });
const s = record.summary;
console.log(green(`  Every step went exactly as expected: ${s.accepted} accepted, ${s.refused} refused, ${s.transactions} transactions.`));
console.log(`  proofs: ${s.proveSeconds.min}–${s.proveSeconds.max} s (median ${s.proveSeconds.median} s) · call to finalized: median ${s.callToFinalizedSeconds.median} s · ${s.wallClockMinutes} min in all`);
if (sponsored) {
  const ev = records.filter((r) => r.sponsorship);
  console.log(`  sponsored: ${ev.length} transactions from a device with no wallet; the device's intents spent ${ev.reduce((n, r) => n + r.sponsorship.userIntentDustSpends, 0)} DUST outputs, the sponsor's ${ev.reduce((n, r) => n + r.sponsorship.sponsorDustSpends, 0)}`);
}
console.log(dim(`  record: ${path.relative(repoRoot, file)} · check it against the chain: ${isPublic ? `LANTERN_NETWORK=${network.networkId} ` : ''}npm run devnet:verify${quick ? ' -- --quick' : ''}`));
process.exit(0);
