// deployments/local-devnet.json, or preprod.json with LANTERN_NETWORK=preprod: committed
// evidence of a real run of the story. Written only when a run completes with every step as
// expected -- never a partial record. The SHIPPED contract's run on Preprod writes its own
// record, deployments/preprod-shipped.json (devnet/src/shipped.mjs).
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot, network, isPublic } from './config.mjs';
import { FLAVOUR_DELAY_SECONDS } from '../flavour.mjs';

/** deployments/local-devnet.json is the full story; -quick the core recovery; preprod.json the same story on Preprod. Self-pay runs are for debugging. */
export const recordPath = ({ quick = false, selfPay = false } = {}) =>
  path.join(repoRoot, 'deployments', `${isPublic ? network.networkId : 'local-devnet'}${quick ? '-quick' : ''}${selfPay ? '-self-pay' : ''}.json`);

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

export function buildRecord({ mode, x, records, finalLedger, finalHostLedger, startedAt, flavourLine, sponsored = false }) {
  const txs = records.filter((r) => r.tx?.txId);
  const proves = txs.map((r) => r.timings?.prove).filter((v) => v != null);
  const totals = txs.map((r) => r.timings?.total).filter((v) => v != null);
  return {
    what: isPublic
      ? `A real run of the Lantern story on Midnight's public test network ${network.name}: every accepted step is a proved, balanced, finalized transaction anyone can look up.`
      : 'A real run of the Lantern story on a local Midnight chain: every accepted step is a proved, balanced, finalized transaction.',
    network: isPublic ? `${network.networkId} (Midnight's public test network)` : 'undeployed (local, single node)',
    ...(isPublic ? { explorer: network.explorer, endpoints: { node: network.node, indexer: network.indexer } } : {}),
    recordedAt: new Date().toISOString(),
    mode,
    machine: { platform: `${os.platform()} ${os.arch()}`, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, node: process.version },
    images: isPublic ? ['midnightntwrk/proof-server:8.1.0 (local)']
      : ['midnightntwrk/midnight-node:1.0.0', 'midnightntwrk/indexer-standalone:4.3.3', 'midnightntwrk/proof-server:8.1.0'],
    toolchain: { compact: '0.31.1', 'compact-runtime': '0.16.0', 'midnight-js': '4.1.1', 'wallet-sdk': '1.2.0' },
    flavour: {
      what: 'contracts/src/lantern.compact with exactly one line changed, so the timelock can be waited out',
      line: flavourLine, recoveryDelaySeconds: FLAVOUR_DELAY_SECONDS, shipped: 259200,
    },
    payer: sponsored
      ? `per step: the recovering phone holds no wallet and a sponsor paid its fees; Seo-yeon paid for the open; the ${isPublic ? 'operator' : 'genesis'} wallet paid the rest`
      : `the ${isPublic ? 'operator' : 'genesis'} wallet paid every transaction (a --self-pay debugging run)`,
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
