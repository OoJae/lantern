// deployments/local-devnet.json: committed evidence of a real run. Written only when a run
// completes with every step as expected -- never a partial record.
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot } from './config.mjs';
import { FLAVOUR_DELAY_SECONDS } from '../flavour.mjs';

/** deployments/local-devnet.json is the full story; -quick the core recovery. Self-pay runs are for debugging. */
export const recordPath = ({ quick = false, selfPay = false } = {}) =>
  path.join(repoRoot, 'deployments', `local-devnet${quick ? '-quick' : ''}${selfPay ? '-self-pay' : ''}.json`);

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

export function buildRecord({ mode, x, records, finalLedger, finalHostLedger, startedAt, flavourLine, sponsored = false }) {
  const txs = records.filter((r) => r.tx?.txId);
  const proves = txs.map((r) => r.timings?.prove).filter((v) => v != null);
  const totals = txs.map((r) => r.timings?.total).filter((v) => v != null);
  return {
    what: 'A real run of the Lantern story on a local Midnight chain: every accepted step is a proved, balanced, finalized transaction.',
    network: 'undeployed (local, single node)',
    recordedAt: new Date().toISOString(),
    mode,
    machine: { platform: `${os.platform()} ${os.arch()}`, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, node: process.version },
    images: ['midnightntwrk/midnight-node:1.0.0', 'midnightntwrk/indexer-standalone:4.3.3', 'midnightntwrk/proof-server:8.1.0'],
    toolchain: { compact: '0.31.1', 'compact-runtime': '0.16.0', 'midnight-js': '4.1.1', 'wallet-sdk': '1.2.0' },
    flavour: {
      what: 'contracts/src/lantern.compact with exactly one line changed, so the timelock can be waited out',
      line: flavourLine, recoveryDelaySeconds: FLAVOUR_DELAY_SECONDS, shipped: 259200,
    },
    payer: sponsored
      ? 'per step: the recovering phone holds no wallet and a sponsor paid its fees; Seo-yeon paid for the open; the genesis wallet paid the rest'
      : 'the genesis wallet paid every transaction (a --self-pay debugging run)',
    contracts: {
      lantern: { ...x.contracts.lantern, name: 'Lantern (devnet flavour)' },
      host: { ...x.contracts.host, name: 'LanternHost (unchanged)', committee: 'three Jubjub keys generated for this run; quorum 2' },
    },
    timingNotes: 'seconds. execute: the circuit run locally; prove: the local proof server; balance: adding DUST; '
      + 'submit: until the node included the transaction in a block (about 6 s per block); finalize: until midnight-js '
      + 'saw it finalized. The first proof of a run is marked cold.',
    steps: records.map(({ scan, ...r }) => r),
    finalPublicRecord: finalLedger,
    finalHostRecord: finalHostLedger,
    summary: {
      steps: records.length,
      accepted: records.filter((r) => r.outcome === 'accepted').length,
      refused: records.filter((r) => r.outcome === 'refused').length,
      transactions: txs.length + 4, // + two deploys + two freezes
      proveSeconds: { min: Math.min(...proves), median: median(proves), max: Math.max(...proves), coldFirst: proves[0] ?? null },
      callToFinalizedSeconds: { min: Math.min(...totals), median: median(totals), max: Math.max(...totals) },
      wallClockMinutes: Math.round((Date.now() - startedAt) / 6000) / 10,
    },
  };
}

export function writeRecord(record, opts) {
  const file = recordPath(opts);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}
