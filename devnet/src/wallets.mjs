#!/usr/bin/env node
// LANTERN_NETWORK=preprod node devnet/src/wallets.mjs [--sync] [--register] [--role <r>]
//
// The wallets a Preprod run pays with. There is no genesis wallet on a public network, so
// each role gets its own random seed, kept in devnet/.state/preprod-wallets.json (gitignored,
// owner-only). This script never prints a seed: only addresses and balances.
//
//   (no flag)    create the seeds if they do not exist yet, and print each role's address
//   --sync       sync each wallet in turn, reporting progress and saving a snapshot every 10
//                minutes and at the end (a fresh wallet replays Preprod's whole DUST history once,
//                about 1.56 million events; later runs resume from the snapshot)
//   --register   also register any unregistered NIGHT for DUST generation (fees are paid in DUST)
//   --role <r>   only that wallet
import './ws.mjs'; // before anything that loads the wallet SDK: see ws.mjs
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { network, stateDir, isPublic } from './config.mjs';
import { deriveKeys } from './wallet.mjs';

// The funded wallet that deploys and pays by default; Seo-yeon's own wallet, which pays for
// the open; and the sponsor, which pays for the walletless phone.
export const ROLES = ['operator', 'seoyeon', 'sponsor'];
const file = path.join(stateDir, `${network.networkId}-wallets.json`);
export const snapshotOf = (role) => path.join(stateDir, `${network.networkId}-${role}.snapshot.json`);

export function loadSeeds() {
  if (!isPublic) throw new Error('wallets.mjs is for a public network: set LANTERN_NETWORK=preprod');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  mkdirSync(stateDir, { recursive: true });
  const seeds = Object.fromEntries(ROLES.map((r) => [r, randomBytes(32).toString('hex')]));
  writeFileSync(file, JSON.stringify(seeds, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
  return seeds;
}

const addressOf = (seed) => deriveKeys(seed).unshieldedKeystore.getBech32Address().asString();

// Run directly, not imported. fileURLToPath decodes %20; URL.pathname would not.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--role');
  if (i > 0 && !ROLES.includes(process.argv[i + 1])) throw new Error(`--role takes one of ${ROLES.join(', ')}`);
  const seeds = loadSeeds();
  console.log(`network ${network.networkId} · seeds in ${path.relative(process.cwd(), file)} (never printed)`);
  for (const r of ROLES) console.log(`${r.padEnd(9)} ${addressOf(seeds[r])}`);
  if (process.argv.includes('--sync') || process.argv.includes('--register')) {
    const { startWallet, balances, registerNightForDust, saveSnapshot } = await import('./wallet.mjs');
    const t0 = Date.now();
    const at = () => `${Math.round((Date.now() - t0) / 1000)} s`;
    const idx = (p) => (p ? `${p.appliedIndex ?? '?'}` : '?');
    // One at a time: the indexer serves concurrent syncs no faster than one, so a parallel sync
    // only delays the first wallet. --role <name> syncs just that one.
    const roles = i > 0 ? [process.argv[i + 1]] : ROLES;
    for (const r of roles) await (async () => {
      const ctx = await startWallet(seeds[r], { snapshotFile: snapshotOf(r) });
      let last = null;
      const sub = ctx.wallet.state().subscribe((st) => { last = st; });
      // Every 10 minutes, also save a snapshot: a sync that is interrupted resumes from there.
      let ticks = 0;
      const tick = setInterval(() => {
        if (!last) return;
        console.log(`${at().padStart(7)} ${r.padEnd(9)} shielded ${idx(last.shielded?.progress)} · dust ${idx(last.dust?.progress)}`);
        if (++ticks % 10 === 0) saveSnapshot(ctx, snapshotOf(r)).catch((e) => console.log(`snapshot failed: ${e.message}`));
      }, 60_000);
      const state = await ctx.wallet.waitForSyncedState();
      clearInterval(tick); sub.unsubscribe();
      await saveSnapshot(ctx, snapshotOf(r));
      const { night, dust } = balances(state);
      console.log(`${at().padStart(7)} ${r.padEnd(9)} synced, snapshot saved · NIGHT=${night} DUST=${dust}`);
      if (process.argv.includes('--register') && night > 0n) {
        const tx = await registerNightForDust(ctx);
        console.log(`${at().padStart(7)} ${r.padEnd(9)} ${tx ? `registered NIGHT for DUST generation: tx ${tx}` : 'NIGHT already registered'}`);
      }
      await ctx.wallet.stop();
    })();
  }
  process.exit(0);
}
