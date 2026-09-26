#!/usr/bin/env node
// LANTERN_NETWORK=preprod npm run watch -- --id <identity commitment> [--webhook <url>] [--once]
//                                           [--state <file>] [--every <seconds>] [--contract <address>]...
//
// The owner's watcher: every recovery opened against one Lantern identity, and an alert whenever
// one opens, gains an approval, or ends. A recovery waits 72 hours in plain sight so its owner can
// veto it; this is how the owner hears about it without keeping a browser tab open (the site's
// "Watch an identity", on /live, does the same while its tab stays open).
//
// It reads only public data, the way `shipped.mjs status` does: each Lantern contract's state from
// the network's public indexer (midnight-js's indexer provider, whose GraphQL passes values as
// variables), read with the shipped build's own generated ledger() (devnet/build/shipped; every
// Lantern build shares the ledger's layout). It needs no wallet, no proof server and no private
// state, and it writes nothing anywhere but standard output, the webhook you name and the --state
// file, if you name one.
//
//   --id <hex>        the identity commitment to watch (64 hex characters; 0x allowed). Recoveries
//                     are matched on it, or on it as the identity root, so a commitment that has
//                     since been succeeded by a recovery is still followed.
//   --webhook <url>   POST each alert there as JSON ({ type, text, content, ... }: `text` suits a
//                     Slack incoming webhook, `content` a Discord one). https only, or http to
//                     localhost. At start, each recovery that is still open is sent too.
//   --once            read once, print, alert, and exit. Exit 0 when every contract was read; 2 when
//                     any could not be (what could be read is still printed and alerted). With no
//                     --state, each run starts afresh, so it alerts every recovery still open, on
//                     every run.
//   --state <file>    remember what was seen in this file (JSON: recoveries, approvals, states), and
//                     start from it: alerts are then only for what changed since the last run. For
//                     cron, use it with --once. A file for another identity or network is ignored.
//   --every <s>       seconds between reads (default 30, at least 10).
//   --contract <hex>  a Lantern deployment to watch instead of the recorded ones (repeatable).
//
// By default it watches the Lantern contracts this repository records for the network:
// preprod, the shipped contract (deployments/preprod-shipped.json) and the whole story's
// (deployments/preprod.json); the local chain, deployments/local-devnet.json's.
//
// Setup, as for devnet:verify: `npm ci && npm ci --prefix devnet && bash devnet/compile.sh` (Node 24
// or later, compact 0.31.1). Ctrl-C stops it cleanly.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { network, repoRoot } from './config.mjs';
import { SHIPPED_ZK } from './bindings.mjs';
import { fingerprintWords } from '../../src/words.js';
import { parseIdCommit, recoveriesFor, recoveryState, shortHex, spanWords, STATE_WORDS } from '../../web/src/live/status.js';
const hex = (u) => Buffer.from(u).toString('hex');
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const stamp = () => new Date().toISOString().slice(11, 19);
const say = (m) => console.log(m);
const fail = (m) => { console.error(`watch: ${m}`); process.exit(1); };

// ---- arguments -----------------------------------------------------------------------------------
const args = process.argv.slice(2);
const opts = { id: null, webhook: null, once: false, every: 30, contracts: [], state: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => { if (i + 1 >= args.length) fail(`${a} needs a value`); return args[++i]; };
  if (a === '--id') opts.id = next();
  else if (a === '--webhook') opts.webhook = next();
  else if (a === '--once') opts.once = true;
  else if (a === '--state') opts.state = path.resolve(next());
  else if (a === '--every') opts.every = Number(next());
  else if (a === '--contract') opts.contracts.push(next());
  else if (a === '--help' || a === '-h') { say(readFileSync(new URL(import.meta.url), 'utf8').split('\nimport ')[0].replace(/^#!.*\n/, '').replace(/^\/\/ ?/gm, '')); process.exit(0); }
  else fail(`unknown argument ${a} (try --help)`);
}
const parsed = parseIdCommit(opts.id);
if (!opts.id) fail('which identity? --id <identity commitment>');
if (!parsed.ok) fail(parsed.why);
const ID = parsed.id;
if (!Number.isFinite(opts.every) || opts.every < 10) fail('--every takes a number of seconds, at least 10');
if (opts.webhook) {
  let u;
  try { u = new URL(opts.webhook); } catch { fail('--webhook is not a URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) fail('--webhook must be https (or http to localhost)');
}

// ---- which contracts -----------------------------------------------------------------------------
const record = (f) => { const p = path.join(repoRoot, 'deployments', f); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const SHIPPED_ENTRY = path.join(SHIPPED_ZK, 'contract', 'index.js');
if (!existsSync(SHIPPED_ENTRY)) fail('devnet/build is missing: run `bash devnet/compile.sh` (compact 0.31.1)');
const Shipped = await import(pathToFileURL(SHIPPED_ENTRY).href);
const shippedFinalizeKey = createHash('sha256').update(readFileSync(path.join(SHIPPED_ZK, 'keys', 'finalizeRecovery.verifier'))).digest('hex');
const SHIPPED_DELAY = Number(Shipped.pureCircuits.recoveryDelaySeconds());

function recorded() {
  if (network.networkId === 'preprod') {
    const s = record('preprod-shipped.json');
    const w = record('preprod.json');
    return [
      s && { name: 'the shipped contract', address: s.contract.address, delay: s.timelockSeconds },
      w && { name: "the whole story's Lantern", address: w.contracts.lantern.address, delay: w.flavour.recoveryDelaySeconds },
    ].filter(Boolean);
  }
  const l = record('local-devnet.json');
  return l ? [{ name: 'Lantern, on the local chain', address: l.contracts.lantern.address, delay: l.flavour?.recoveryDelaySeconds ?? null }] : [];
}
const CONTRACTS = opts.contracts.length
  ? opts.contracts.map((a, i) => {
    const p = parseIdCommit(a);
    if (!p.ok) fail(`--contract: ${p.why.replace('An identity commitment', 'A contract address')}`);
    return { name: `contract ${i + 1}`, address: p.id, delay: null };
  })
  : recorded();
if (!CONTRACTS.length) fail(`no Lantern contract is recorded for ${network.networkId}: name one with --contract`);

// ---- reading the chain ---------------------------------------------------------------------------
const pdp = indexerPublicDataProvider(network.indexer, network.indexerWS);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('the indexer did not answer in time')), ms).unref())]);

/** A contract's public state, decoded: the same shape the site's live/decode.js gives. */
async function read(c) {
  const cs = await withTimeout(pdp.queryContractState(c.address), 45_000);
  if (!cs) return null;
  const L = Shipped.ledger(cs.data);
  const identities = {};
  for (const x of L.enrolled) {
    identities[hex(x)] = {
      idCommit: hex(x),
      idRoot: L.idRoots.member(x) ? hex(L.idRoots.lookup(x)) : null,
      threshold: L.thresholds.member(x) ? Number(L.thresholds.lookup(x)) : null,
      retired: L.retiredIdentities.member(x),
    };
  }
  const recoveries = [];
  for (const [rid, r] of L.recoveries) {
    recoveries.push({
      rid: hex(rid), idCommit: hex(r.idCommit), idRoot: hex(r.idRoot), ctx: hex(r.ctx), ephemeralPk: hex(r.ephemeralPk),
      openedAtLo: Number(r.openedAtLo) * 1000, openedAtHi: Number(r.openedAtHi) * 1000,
      approvals: L.approvals.member(rid) ? Number(L.approvals.lookup(rid).read()) : 0,
      killed: L.killed.member(rid),
      ctxCurrent: L.guardianCtx.member(r.idRoot) && hex(L.guardianCtx.lookup(r.idRoot)) === hex(r.ctx),
    });
  }
  recoveries.sort((x, y) => x.openedAtHi - y.openedAtHi);
  // The timelock: the record's, or the shipped 72 h, which the contract's finalizeRecovery key
  // confirms when it is the shipped build's (only that circuit reads the delay). A contract with
  // another key is assumed to be 72 h too, and the output says it is assumed.
  let delay = c.delay;
  let assumed = false;
  if (delay == null) {
    const vk = cs.operation('finalizeRecovery')?.verifierKey;
    const shipped = vk && createHash('sha256').update(vk).digest('hex') === shippedFinalizeKey;
    delay = SHIPPED_DELAY;
    assumed = !shipped;
  }
  return { identities, recoveries, delay, assumed };
}

// ---- telling -------------------------------------------------------------------------------------
const OPEN = new Set(['waiting', 'short', 'ready']);

async function alert(event) {
  const text = `Lantern: ${event.title}. ${event.body}`;
  say(`[${stamp()}] ALERT ${event.title}. ${event.body}`);
  if (!opts.webhook) return;
  try {
    const res = await fetch(opts.webhook, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...event.data, type: event.type, text, content: text, network: network.networkId, identity: ID, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) say(`[${stamp()}]   the webhook answered HTTP ${res.status}`);
  } catch (e) {
    say(`[${stamp()}]   the webhook could not be reached: ${e.message}`);
  }
}

function describe(c, r, st, assumed) {
  const words = fingerprintWords(r.ephemeralPk).join(' ');
  const when = `${iso(st.canFinalizeAt)}${assumed ? ' (assuming the shipped 72-hour timelock: this contract is not the shipped build)' : ''}`;
  return {
    words, when,
    data: {
      contract: c.address, recovery: r.rid, recoveryIdentity: r.idCommit, state: st.state,
      approvals: r.approvals, threshold: st.threshold, fingerprint: words,
      canFinalizeAt: iso(st.canFinalizeAt), timelockAssumed: assumed, explorer: network.explorer ? `${network.explorer}/contracts/${c.address}` : null,
    },
  };
}

function print(c, got, now) {
  const head = `  ${c.name} ${shortHex(c.address)}`;
  if (!got) { say(`${head}: no such contract on ${network.networkId}`); return; }
  const mine = got.identities[ID];
  const heirs = Object.values(got.identities).filter((i) => i.idRoot === ID && i.idCommit !== ID);
  const recs = recoveriesFor(ID, got);
  say(`${head}: ${mine ? `enrolled, ${mine.threshold} approvals needed, ${mine.retired ? 'since retired by a recovery' : 'current'}` : heirs.length ? `the root of ${heirs.length} enrolled commitment(s)` : 'not enrolled here'}`);
  if (!recs.length && (mine || heirs.length)) say('    no recovery opened');
  for (const r of recs) {
    const st = recoveryState(r, got, now, got.delay);
    const d = describe(c, r, st, got.assumed);
    say(`    recovery ${shortHex(r.rid)}  ${STATE_WORDS[st.state].toLowerCase()}`);
    say(`      new device's fingerprint: ${d.words}`);
    say(`      approvals ${r.approvals} of ${st.threshold ?? '?'} · can finalize from ${d.when}${st.state === 'waiting' ? ` (in ${spanWords(st.canFinalizeAt - now)})` : ''}`);
    if (OPEN.has(st.state)) say('      not your new device? veto it with your veto card before then: no guardian can stop a veto');
  }
}

// ---- the loop ------------------------------------------------------------------------------------
// Each contract keeps its own baseline. Its first successful read sets it (and, as at start, sends
// what is open); only after that is anything on it "new". A contract that cannot be read keeps its last
// baseline, so a failed read never turns old recoveries into new alerts once it answers again.
let seen = new Map(); // `${address}:${rid}` -> { approvals, state }
const baselined = new Set(); // contracts read at least once
let first = true;
let timer = null;
let stopping = false;

// ---- the --state file: the baselines, kept between runs -------------------------------------------
const STATES = new Set(Object.keys(STATE_WORDS));
function loadState() {
  if (!opts.state || !existsSync(opts.state)) return;
  let s;
  try { s = JSON.parse(readFileSync(opts.state, 'utf8')); } catch { say(`  ${opts.state} could not be read as JSON: starting afresh`); return; }
  if (s?.identity !== ID || s?.network !== network.networkId) { say(`  ${opts.state} is for another identity or network: starting afresh`); return; }
  const watched = new Set(CONTRACTS.map((c) => c.address));
  const HEX64 = /^[0-9a-f]{64}$/;
  for (const [k, v] of Object.entries(s.seen ?? {})) {
    const [address, rid] = k.split(':');
    if (watched.has(address) && HEX64.test(rid ?? '') && Number.isSafeInteger(v?.approvals) && STATES.has(v?.state)) seen.set(k, { approvals: v.approvals, state: v.state });
  }
  for (const a of Array.isArray(s.baselined) ? s.baselined : []) if (watched.has(a)) baselined.add(a);
  say(`  from ${opts.state}: ${seen.size} recover${seen.size === 1 ? 'y' : 'ies'} already seen, last written ${String(s.at ?? 'at an unknown time')}`);
}
function saveState() {
  if (!opts.state) return;
  const out = { identity: ID, network: network.networkId, at: new Date().toISOString(), seen: Object.fromEntries(seen), baselined: [...baselined] };
  const tmp = `${opts.state}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`);
    renameSync(tmp, opts.state); // whole or not at all
  } catch (e) {
    say(`[${stamp()}]   ${opts.state} could not be written: ${e.message}`);
  }
}

async function tick() {
  const now = Date.now();
  const results = await Promise.all(CONTRACTS.map((c) => read(c).then((got) => ({ c, got }), (e) => ({ c, error: e }))));
  const errors = results.filter((x) => x.error);
  const current = new Map();
  for (const { c, got } of results) {
    if (!got) continue;
    for (const r of recoveriesFor(ID, got)) current.set(`${c.address}:${r.rid}`, { c, r, st: recoveryState(r, got, now, got.delay), assumed: got.assumed });
  }
  // The whole picture on the first read and whenever anything moved; otherwise one line.
  const moved = first || errors.length || current.size !== seen.size
    || [...current].some(([k, v]) => { const w = seen.get(k); return !w || w.approvals !== v.r.approvals || w.state !== v.st.state; });
  first = false;
  if (moved) {
    say(`[${stamp()}] ${network.networkId} · identity ${shortHex(ID, 10, 6)}`);
    for (const { c, got, error } of results) {
      if (error) say(`  ${c.name} ${shortHex(c.address)}: could not be read (${error.message})`);
      else print(c, got, now);
    }
  } else {
    say(`[${stamp()}] read again: no change`);
  }
  for (const [k, { c, r, st, assumed }] of current) {
    const was = seen.get(k);
    const d = describe(c, r, st, assumed);
    if (!baselined.has(c.address)) {
      if (OPEN.has(st.state)) await alert({ type: 'recovery-open', title: 'an open recovery for the identity you watch', body: `On ${c.name}: ${STATE_WORDS[st.state].toLowerCase()}, approvals ${r.approvals} of ${st.threshold ?? '?'}, can finalize from ${d.when}. New device: ${d.words}.`, data: d.data });
    } else if (!was) {
      await alert({ type: 'recovery-opened', title: 'a recovery was opened for the identity you watch', body: `On ${c.name}. New device: ${d.words}. It can finalize from ${d.when} unless you veto it.`, data: d.data });
    } else if (r.approvals > was.approvals) {
      await alert({ type: 'approval', title: 'a recovery for the identity you watch gained an approval', body: `Now ${r.approvals} of ${st.threshold ?? '?'} on ${c.name}. It can finalize from ${d.when}.`, data: d.data });
    } else if (st.state !== was.state && !OPEN.has(st.state)) {
      await alert({ type: `recovery-${st.state}`, title: `a recovery for the identity you watch: ${STATE_WORDS[st.state].toLowerCase()}`, body: `On ${c.name}, recovery ${shortHex(r.rid)}.`, data: d.data });
    }
  }
  // Keep what an unreadable contract showed last, so its recoveries are not "new" when it answers again.
  const next = new Map(current);
  for (const { c, error } of results) if (error) for (const [k, v] of seen) if (k.startsWith(`${c.address}:`)) next.set(k, v);
  seen = new Map([...next].map(([k, v]) => [k, v.st ? { approvals: v.r.approvals, state: v.st.state } : v]));
  for (const { c, error } of results) if (!error) baselined.add(c.address);
  saveState();
  return !errors.length ? 'ok' : errors.length === results.length ? 'unreadable' : 'partial';
}

const stop = () => {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  say(`[${stamp()}] stopped`);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

say(`watching ${ID} on ${network.networkId} (${new URL(network.indexer).host}): ${CONTRACTS.map((c) => `${c.name} ${shortHex(c.address)}`).join(', ')}`);
loadState();
if (opts.once) {
  const r = await tick().catch((e) => { console.error(`watch: ${e.message}`); return 'unreadable'; });
  process.exit(r === 'ok' ? 0 : 2);
}
say(`reading every ${opts.every} s; Ctrl-C stops`);
const loop = async () => {
  try { await tick(); } catch (e) { say(`[${stamp()}] ${e.message}`); }
  if (!stopping) timer = setTimeout(loop, opts.every * 1000);
};
await loop();
