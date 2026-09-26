#!/usr/bin/env node
// LANTERN_NETWORK=preprod npm run watch -- --id <identity commitment> [--webhook-file <file>] [--once]
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
// state, and it writes nothing anywhere but standard output and error, the webhook you name and the
// --state file, if you name one.
//
//   --id <hex>        the identity commitment to watch (64 hex characters; 0x allowed). Recoveries
//                     are matched on the identity's whole lineage (its root), whichever of its
//                     commitments you give: a commitment since succeeded by a recovery still sees the
//                     recoveries of the current one, and the printout names it ("current: <hex>").
//   --webhook-file <file>
//                     POST each alert to the URL on this file's first line, as JSON ({ type, text,
//                     content, ... }: `text` suits a Slack incoming webhook, `content` a Discord one).
//                     https only, or http to localhost; redirects are not followed, so name the final
//                     URL. At start, each recovery that is still open is sent too. An alert the webhook
//                     does not take (no answer, or not 2xx) is not marked as seen: it is sent again on
//                     the next read (every --every seconds, or the next cron run with --state).
//                     A Slack or Discord webhook URL is a secret: anyone who has it can post into your
//                     channel. Keep the file owner-only (chmod 600), or pass the URL in the
//                     LANTERN_WEBHOOK environment variable, which only you and root can read.
//   --webhook <url>   the same URL on the command line, where every user of this machine can read it
//                     (ps, /proc) while the watcher runs: only for a URL that is not a secret. It wins
//                     over --webhook-file, which wins over LANTERN_WEBHOOK.
//   --once            read once, print, alert, and exit. Exit 0 when every contract was read, every
//                     alert delivered and the --state file, if named, written. Exit 2 when any contract
//                     could not be read (a failed read, or a contract the indexer does not know), when
//                     any alert could not be delivered, when the --state file could not be written, or
//                     when every contract was read and the identity is on none of them (not enrolled,
//                     not the root of an enrolled commitment, no recovery: check --id and --contract).
//                     What could be read is still printed and alerted. With no --state, each run starts
//                     afresh, so it alerts every recovery still open, on every run.
//   --state <file>    remember what was seen in this file (JSON: recoveries, approvals, states), and
//                     start from it: alerts are then only for what changed since the last run. For
//                     cron, use it with --once (and --webhook-file). A file for another identity or
//                     network is ignored.
//   --every <s>       seconds between reads (default 30, from 10 to 86400: a day).
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
import { alertsFor, classify, everyProblem, nextSeen, OPEN, outcome, pickWebhook, postAlert, readSaved, standing, standingLine } from './watch-alerts.mjs';
const hex = (u) => Buffer.from(u).toString('hex');
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const stamp = () => new Date().toISOString().slice(11, 19);
const say = (m) => console.log(m);
const fail = (m) => { console.error(`watch: ${m}`); process.exit(1); };

// ---- arguments -----------------------------------------------------------------------------------
const args = process.argv.slice(2);
const opts = { id: null, webhook: null, webhookFile: null, once: false, every: 30, contracts: [], state: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => { if (i + 1 >= args.length) fail(`${a} needs a value`); return args[++i]; };
  if (a === '--id') opts.id = next();
  else if (a === '--webhook') opts.webhook = next();
  else if (a === '--webhook-file') opts.webhookFile = path.resolve(next());
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
if (everyProblem(opts.every)) fail(everyProblem(opts.every));
// The webhook: --webhook, else --webhook-file, else LANTERN_WEBHOOK, each checked the same way.
const hook = pickWebhook({ flag: opts.webhook, file: opts.webhookFile, env: process.env.LANTERN_WEBHOOK });
if (hook.problem) fail(hook.problem);
opts.webhook = hook.url;
if (hook.warning) console.error(`watch: ${hook.warning}`);
if (hook.from === '--webhook' && new URL(hook.url).protocol === 'https:') {
  console.error('watch: --webhook is on the command line, where other users of this machine can read it (ps): for a Slack or Discord URL, which is a secret, use --webhook-file or LANTERN_WEBHOOK');
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
/** Print an alert, and POST it to the webhook if one is named. True when it was delivered (or there is no webhook). */
async function alert(event) {
  const text = `Lantern: ${event.title}. ${event.body}`;
  say(`[${stamp()}] ALERT ${event.title}. ${event.body}`);
  if (!opts.webhook) return true;
  const sent = await postAlert(opts.webhook, { ...event.data, type: event.type, text, content: text, network: network.networkId, identity: ID, at: new Date().toISOString() });
  if (!sent.delivered) say(`[${stamp()}]   ${sent.why}: it is sent again on the next read`);
  return sent.delivered;
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
  if (!got) { say(`${head}: no such contract on ${network.networkId}, as far as its indexer knows: counted as not read, and alerts for it are paused until it answers`); return; }
  // Matched on the identity's whole lineage (its root), whichever of its commitments --id names.
  const where = standing(ID, got);
  const recs = recoveriesFor(ID, got);
  say(`${head}: ${standingLine(where)}`);
  if (!recs.length && (where.mine || where.lineage.length)) say('    no recovery opened');
  for (const r of recs) {
    const st = recoveryState(r, got, now, got.delay);
    const d = describe(c, r, st, got.assumed);
    say(`    recovery ${shortHex(r.rid)}  ${STATE_WORDS[st.state].toLowerCase()}`);
    say(`      new device's fingerprint: ${d.words}`);
    say(`      approvals ${r.approvals} of ${st.threshold ?? '?'} · can finalize from ${d.when}${st.state === 'waiting' ? ` (in ${spanWords(st.canFinalizeAt - now)})` : ''}`);
    if (OPEN.has(st.state)) say('      not your new device? veto it now with your veto card: a recovery never expires, and no guardian can stop a veto');
  }
}

// ---- the loop ------------------------------------------------------------------------------------
// Each contract keeps its own baseline. Its first successful read sets it (and, as at start, sends
// what is open); only after that is anything on it "new". A contract that cannot be read keeps its last
// baseline, so a failed read never turns old recoveries into new alerts once it answers again. A
// contract the indexer does not know counts as not read (classify, in watch-alerts.mjs): an answer of
// "no such contract" is never taken for "no recoveries".
let seen = new Map(); // `${address}:${rid}` -> { approvals, state }
const baselined = new Set(); // contracts read at least once
let first = true;
let warnedUnknown = false;
let timer = null;
let stopping = false;

// ---- the --state file: the baselines, kept between runs -------------------------------------------
function loadState() {
  if (!opts.state || !existsSync(opts.state)) return;
  let s;
  try { s = JSON.parse(readFileSync(opts.state, 'utf8')); } catch { say(`  ${opts.state} could not be read as JSON: starting afresh`); return; }
  const saved = readSaved(s, { id: ID, networkId: network.networkId, watched: CONTRACTS.map((c) => c.address) });
  if (!saved.ok) { say(`  ${opts.state} ${saved.why}: starting afresh`); return; }
  seen = saved.seen;
  for (const a of saved.baselined) baselined.add(a);
  say(`  from ${opts.state}: ${seen.size} recover${seen.size === 1 ? 'y' : 'ies'} already seen, last written ${String(s.at ?? 'at an unknown time')}`);
}
/** True when the file was written (or none is named): a run that cannot remember is not a success. */
function saveState() {
  if (!opts.state) return true;
  const out = { identity: ID, network: network.networkId, at: new Date().toISOString(), seen: Object.fromEntries(seen), baselined: [...baselined] };
  const tmp = `${opts.state}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 }); // it names the identity watched: owner-only
    renameSync(tmp, opts.state); // whole or not at all
    return true;
  } catch (e) {
    console.error(`[${stamp()}] watch: ${opts.state} could not be written (${e.message}): the next run will not know what this one saw`);
    return false;
  }
}

async function tick() {
  const now = Date.now();
  const results = await Promise.all(CONTRACTS.map((c) => read(c).then((got) => ({ c, got }), (e) => ({ c, error: e }))));
  // A contract the indexer does not know (got null) is unreadable too, never "no recoveries".
  const { current, read: answered, unreadable, unknown } = classify(results, ID, now);
  // The whole picture on the first read and whenever anything moved; otherwise one line.
  const moved = first || unreadable.length || current.size !== seen.size
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
  // Every alert a recovery's change calls for (an approval and the end it allowed can share a read).
  // One the webhook does not take leaves its part of the memory as it was, so the next read sends it again.
  const undelivered = new Map(); // key -> Set of what its failed alerts covered
  for (const [k, { c, r, st, assumed }] of current) {
    const d = describe(c, r, st, assumed);
    for (const e of alertsFor({ baselined: baselined.has(c.address), was: seen.get(k), name: c.name, r, st, d })) {
      if (!(await alert(e))) undelivered.set(k, (undelivered.get(k) ?? new Set()).add(e.covers));
    }
  }
  // An unreadable contract keeps what it showed last, so its recoveries are not "new" when it answers again.
  seen = nextSeen(seen, current, { unreadable, undelivered });
  for (const { c } of answered) baselined.add(c.address);
  // Said once, and again only after it changed (a loop with --every would say it every read).
  if (unknown && !warnedUnknown) console.error(`[${stamp()}] watch: ${ID} is not enrolled on any watched contract, nor the root of one, nor the identity of any recovery there: check --id and --contract`);
  warnedUnknown = unknown;
  const saved = saveState();
  return outcome({ unreadable: unreadable.length, contracts: results.length, undelivered: undelivered.size, unsaved: !saved, unknown });
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
