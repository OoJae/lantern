// The owner's watcher (devnet/src/watch.mjs), its decisions checked without a chain: which alerts a
// change calls for, what is remembered when the webhook does not take one or a contract is not read,
// the --state file, the options (the webhook's URL among them), and how an alert is POSTed (never
// following a redirect).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { recoveryState } from '../../web/src/live/status.js';
import { alertsFor, classify, everyProblem, nextSeen, outcome, pickWebhook, postAlert, readSaved, standing, standingLine, webhookProblem } from '../src/watch-alerts.mjs';

const ID = 'c2'.repeat(32);
const RID = 'ab'.repeat(32);
const ADDR = 'aa'.repeat(32);
const KEY = `${ADDR}:${RID}`;
const DELAY = 72 * 3600;
const OPENED = Date.parse('2026-09-24T15:00:00Z');
const d = { words: 'one two three four five six', when: '2026-09-27T15:00Z', data: {} };

// A 2-of-2 identity and one recovery of it, as watch.mjs's read() decodes a contract.
function chain({ approvals = 0, killed = false, retired = false, ctxCurrent = true } = {}) {
  const r = { rid: RID, idCommit: ID, idRoot: ID, approvals, killed, ctxCurrent, openedAtLo: OPENED - 60_000, openedAtHi: OPENED };
  return { identities: { [ID]: { idCommit: ID, idRoot: ID, threshold: 2, retired } }, recoveries: [r] };
}
const AFTER_LOCK = OPENED + DELAY * 1000 + 3600_000;
const view = (c, now = AFTER_LOCK) => { const r = c.recoveries[0]; return { r, st: recoveryState(r, c, now, DELAY) }; };
const decide = (was, c, { baselined = true, now } = {}) => {
  const { r, st } = view(c, now);
  return alertsFor({ baselined, was, name: 'the shipped contract', r, st, d });
};
const types = (events) => events.map((e) => e.type);

describe('the watcher: which alerts a change calls for', () => {
  it('sends the approval and the finalize when both land between two reads', () => {
    const was = { approvals: 1, state: 'short' };
    const got = decide(was, chain({ approvals: 2, retired: true }));
    assert.deepEqual(types(got), ['approval', 'recovery-finalized']);
    assert.doesNotMatch(got[0].body, /can finalize from/, 'no finalize deadline for a recovery that has ended');
  });

  it('sends the approval and the veto when both land between two reads', () => {
    assert.deepEqual(types(decide({ approvals: 0, state: 'waiting' }, chain({ approvals: 1, killed: true }), { now: OPENED })), ['approval', 'recovery-vetoed']);
  });

  it('never says "unless you veto it" of a recovery first seen already ended', () => {
    for (const [c, type] of [[chain({ approvals: 1, killed: true }), 'recovery-vetoed'], [chain({ approvals: 2, retired: true }), 'recovery-finalized']]) {
      const got = decide(undefined, c);
      assert.deepEqual(types(got), [type]);
      assert.match(got[0].title, /was opened and has already ended/);
      assert.doesNotMatch(got[0].body, /unless you veto it/);
    }
  });

  it('says "unless you veto it" of a new recovery that is still open', () => {
    const got = decide(undefined, chain({ approvals: 1 }), { now: OPENED });
    assert.deepEqual(types(got), ['recovery-opened']);
    assert.match(got[0].body, /can finalize from .* unless you veto it/);
  });

  it('still alerts a finalize alone, an approval alone, and nothing when nothing moved', () => {
    assert.deepEqual(types(decide({ approvals: 2, state: 'ready' }, chain({ approvals: 2, retired: true }))), ['recovery-finalized']);
    const one = decide({ approvals: 0, state: 'waiting' }, chain({ approvals: 1 }), { now: OPENED });
    assert.deepEqual(types(one), ['approval']);
    assert.match(one[0].body, /It can finalize from/);
    assert.deepEqual(decide({ approvals: 1, state: 'waiting' }, chain({ approvals: 1 }), { now: OPENED }), []);
    // From one open state to another (the lock ended): not an alert.
    assert.deepEqual(decide({ approvals: 1, state: 'waiting' }, chain({ approvals: 1 })), []);
  });

  it('sends only what is open on a contract it has not read before', () => {
    assert.deepEqual(types(decide(undefined, chain({ approvals: 1 }), { baselined: false, now: OPENED })), ['recovery-open']);
    assert.deepEqual(decide(undefined, chain({ approvals: 2, retired: true }), { baselined: false }), []);
  });
});

describe('the watcher: what it remembers', () => {
  // One read, as tick() does it: the alerts, each delivered or not, then the memory.
  function read(seen, c, { baselined = true, deliver = () => true, now } = {}) {
    const { r, st } = view(c, now);
    const events = alertsFor({ baselined, was: seen.get(KEY), name: 'the shipped contract', r, st, d });
    const undelivered = new Map();
    const sent = [];
    for (const e of events) {
      if (deliver(e)) sent.push(e.type);
      else undelivered.set(KEY, (undelivered.get(KEY) ?? new Set()).add(e.covers));
    }
    const next = nextSeen(seen, new Map([[KEY, { r, st }]]), { undelivered });
    return { next, sent, code: outcome({ unreadable: 0, contracts: 1, undelivered: undelivered.size }) };
  }

  it('sends a "recovery opened" the webhook did not take again on the next run, then no more', () => {
    const c = chain({ approvals: 0 });
    const run1 = read(new Map(), c, { deliver: () => false, now: OPENED });
    assert.equal(run1.code, 'undelivered');
    assert.equal(run1.next.has(KEY), false, 'not remembered as seen');
    const run2 = read(run1.next, c, { now: OPENED });
    assert.deepEqual([run2.sent, run2.code], [['recovery-opened'], 'ok']);
    const run3 = read(run2.next, c, { now: OPENED });
    assert.deepEqual([run3.sent, run3.code], [[], 'ok']);
  });

  it('sends again only the part that was lost: a lost finalize, not the approval that was delivered', () => {
    const was = new Map([[KEY, { approvals: 1, state: 'short' }]]);
    const done = chain({ approvals: 2, retired: true });
    const run1 = read(was, done, { deliver: (e) => e.type === 'approval' });
    assert.deepEqual(run1.sent, ['approval']);
    assert.deepEqual(run1.next.get(KEY), { approvals: 2, state: 'short' });
    const run2 = read(run1.next, done);
    assert.deepEqual(run2.sent, ['recovery-finalized']);
    assert.deepEqual(read(run2.next, done).sent, []);
  });

  it('sends a lost approval again on the next run, then no more', () => {
    const was = new Map([[KEY, { approvals: 0, state: 'waiting' }]]);
    const one = chain({ approvals: 1 });
    const run1 = read(was, one, { deliver: (e) => e.type !== 'approval', now: OPENED });
    assert.deepEqual([run1.sent, run1.code], [[], 'undelivered']);
    assert.deepEqual(run1.next.get(KEY), { approvals: 0, state: 'waiting' }, 'the approval is not remembered as seen');
    const run2 = read(run1.next, one, { now: OPENED });
    assert.deepEqual([run2.sent, run2.code], [['approval'], 'ok']);
    assert.deepEqual(read(run2.next, one, { now: OPENED }).sent, []);
  });

  it('keeps what an unreadable contract showed last, so its recoveries are not new when it answers', () => {
    const seen = new Map([[KEY, { approvals: 1, state: 'waiting' }], [`${'bb'.repeat(32)}:${RID}`, { approvals: 0, state: 'waiting' }]]);
    const next = nextSeen(seen, new Map(), { unreadable: [ADDR] });
    assert.deepEqual([...next], [[KEY, { approvals: 1, state: 'waiting' }]]);
  });

  it('exits 2 for an unread contract or an undelivered alert, 0 only when all went through', () => {
    assert.equal(outcome({ unreadable: 0, contracts: 2, undelivered: 0 }), 'ok');
    assert.equal(outcome({ unreadable: 0, contracts: 2, undelivered: 1 }), 'undelivered');
    assert.equal(outcome({ unreadable: 1, contracts: 2, undelivered: 0 }), 'partial');
    assert.equal(outcome({ unreadable: 2, contracts: 2, undelivered: 1 }), 'unreadable');
    const src = readFileSync(new URL('../src/watch.mjs', import.meta.url), 'utf8');
    assert.match(src, /process\.exit\(r === 'ok' \? 0 : 2\)/);
  });

  it('exits 2, too, when it could not write its --state file or the identity is on no watched contract', () => {
    assert.equal(outcome({ unreadable: 0, contracts: 2, undelivered: 0, unsaved: true }), 'unsaved');
    assert.equal(outcome({ unreadable: 0, contracts: 2, undelivered: 0, unknown: true }), 'unknown');
    assert.equal(outcome({ unreadable: 0, contracts: 2, undelivered: 0, unsaved: false, unknown: false }), 'ok');
    // A worse outcome still names itself first.
    assert.equal(outcome({ unreadable: 1, contracts: 2, undelivered: 1, unsaved: true, unknown: true }), 'partial');
    assert.equal(outcome({ unreadable: 0, contracts: 2, undelivered: 1, unsaved: true }), 'undelivered');
    const src = readFileSync(new URL('../src/watch.mjs', import.meta.url), 'utf8');
    assert.match(src, /const saved = saveState\(\);\n\s*return outcome\(\{ unreadable: unreadable\.length, contracts: results\.length, undelivered: undelivered\.size, unsaved: !saved, unknown \}\);/);
    assert.match(src, /if \(!opts\.state\) return true;/);
    assert.match(src, /renameSync\(tmp, opts\.state\);[^\n]*\n\s*return true;\n\s*\} catch \(e\) \{\n[^\n]*\n\s*return false;/);
  });
});

describe('the watcher: a contract the indexer does not know', () => {
  const C = { name: 'the shipped contract', address: ADDR };
  const OTHER = { name: "the whole story's Lantern", address: 'bb'.repeat(32) };
  // A contract as read() decodes it, with the timelock it reads.
  const got = (c) => ({ ...c, delay: DELAY, assumed: false });
  // One read, as tick() does it: sort the results, alert, remember, baseline, and the exit code.
  function tick(state, results, { now = OPENED } = {}) {
    const { current, read: answered, unreadable, unknown } = classify(results, ID, now);
    const sent = [];
    for (const [k, { c, r, st }] of current) {
      for (const e of alertsFor({ baselined: state.baselined.has(c.address), was: state.seen.get(k), name: c.name, r, st, d })) sent.push(e.type);
    }
    const seen = nextSeen(state.seen, current, { unreadable });
    const baselined = new Set(state.baselined);
    for (const { c } of answered) baselined.add(c.address);
    const code = outcome({ unreadable: unreadable.length, contracts: results.length, undelivered: 0, unknown });
    return { seen, baselined, sent, code };
  }
  const fresh = () => ({ seen: new Map(), baselined: new Set() });

  it('is not read: read, then "no such contract", then read again sends no alert, and exits 0, 2, 0', () => {
    const open = got(chain({ approvals: 1 }));
    const run1 = tick(fresh(), [{ c: C, got: open }]);
    assert.deepEqual([run1.sent, run1.code], [['recovery-open'], 'ok']);
    const run2 = tick(run1, [{ c: C, got: null }]);
    assert.deepEqual([run2.sent, run2.code], [[], 'unreadable']);
    assert.deepEqual([...run2.seen], [[KEY, { approvals: 1, state: 'waiting' }]], 'what it showed last is kept');
    const run3 = tick(run2, [{ c: C, got: open }]);
    assert.deepEqual([run3.sent, run3.code], [[], 'ok'], 'no "a recovery was opened" for a recovery already reported');
  });

  it('reports what changed while it was not known as a change, never as "opened and has already ended"', () => {
    const run1 = tick(fresh(), [{ c: C, got: got(chain({ approvals: 1 })) }]);
    const run2 = tick(run1, [{ c: C, got: null }]);
    const run3 = tick(run2, [{ c: C, got: got(chain({ approvals: 2, retired: true })) }], { now: AFTER_LOCK });
    assert.deepEqual(run3.sent, ['approval', 'recovery-finalized']);
  });

  it('is not baselined: a contract first seen missing sends its baseline when it answers, not "a recovery was opened"', () => {
    const run1 = tick(fresh(), [{ c: C, got: null }]);
    assert.deepEqual([[...run1.baselined], run1.code], [[], 'unreadable']);
    const run2 = tick(run1, [{ c: C, got: got(chain({ approvals: 1 })) }]);
    assert.deepEqual([run2.sent, [...run2.baselined]], [['recovery-open'], [ADDR]]);
  });

  it('exits 2 when one of two contracts is missing, and still reads the other', () => {
    const run = tick(fresh(), [{ c: OTHER, got: null }, { c: C, got: got(chain({ approvals: 1 })) }]);
    assert.deepEqual([run.sent, run.code, [...run.baselined]], [['recovery-open'], 'partial', [ADDR]]);
    const { missing, failed, unreadable } = classify([{ c: OTHER, got: null }, { c: C, error: new Error('x') }], ID, OPENED);
    assert.deepEqual([missing.length, failed.length, [...unreadable].sort()], [1, 1, [ADDR, OTHER.address]]);
  });

  it('says so when every contract answered and the identity is on none of them', () => {
    const elsewhere = { identities: { ['dd'.repeat(32)]: { idCommit: 'dd'.repeat(32), idRoot: 'dd'.repeat(32), threshold: 2, retired: false } }, recoveries: [] };
    assert.equal(classify([{ c: C, got: got(elsewhere) }], ID, OPENED).unknown, true);
    assert.equal(tick(fresh(), [{ c: C, got: got(elsewhere) }]).code, 'unknown');
    // Not while a contract could not be read: it may be there.
    assert.equal(classify([{ c: C, got: got(elsewhere) }, { c: OTHER, got: null }], ID, OPENED).unknown, false);
    // Enrolled; the root of an enrolled commitment (succeeded by a recovery); only a recovery's identity.
    const enrolled = { identities: { [ID]: { idCommit: ID, idRoot: ID, threshold: 2, retired: false } }, recoveries: [] };
    const heir = { identities: { ['ee'.repeat(32)]: { idCommit: 'ee'.repeat(32), idRoot: ID, threshold: 2, retired: false } }, recoveries: [] };
    const recovering = { identities: {}, recoveries: chain().recoveries };
    for (const known of [enrolled, heir, recovering]) assert.equal(classify([{ c: C, got: got(known) }], ID, OPENED).unknown, false);
  });

  it('is how watch.mjs sorts every read', () => {
    const src = readFileSync(new URL('../src/watch.mjs', import.meta.url), 'utf8');
    assert.match(src, /const \{ current, read: answered, unreadable, unknown \} = classify\(results, ID, now\);/);
    assert.match(src, /for \(const \{ c \} of answered\) baselined\.add\(c\.address\);/);
    assert.doesNotMatch(src, /if \(!error\) baselined\.add/, 'a contract the indexer does not know is not baselined');
  });
});

describe("the watcher: an identity's lineage", () => {
  // R enrolled; a recovery of R finalized to S1; a recovery of S1 finalized to S2. finalizeRecovery
  // writes idRoots[successor] = the ROOT, so S1 and S2 both name R. A recovery is now open against S2.
  const R = ID;
  const S1 = 'e1'.repeat(32);
  const S2 = 'e2'.repeat(32);
  const X = 'dd'.repeat(32); // someone else
  const C = { name: 'the shipped contract', address: ADDR };
  const who = (idCommit, retired) => ({ idCommit, idRoot: idCommit === X ? X : R, threshold: 2, retired });
  const rec = (rid, idCommit) => ({ rid, idCommit, idRoot: idCommit === X ? X : R, approvals: 1, killed: false, ctxCurrent: true, openedAtLo: OPENED - 60_000, openedAtHi: OPENED });
  const decoded = {
    identities: { [R]: who(R, true), [S1]: who(S1, true), [S2]: who(S2, false), [X]: who(X, false) },
    recoveries: [rec('a2'.repeat(32), S2), rec('a9'.repeat(32), X)],
    delay: DELAY, assumed: false,
  };

  it('sees a recovery opened on the current commitment, whichever commitment of the lineage is watched', () => {
    for (const id of [R, S1, S2]) {
      const { current, unknown } = classify([{ c: C, got: decoded }], id, OPENED);
      assert.deepEqual([...current.keys()], [`${ADDR}:${'a2'.repeat(32)}`], `watching ${id.slice(0, 4)}`);
      assert.equal(unknown, false);
    }
    // Never another identity's.
    assert.deepEqual([...classify([{ c: C, got: decoded }], X, OPENED).current.keys()], [`${ADDR}:${'a9'.repeat(32)}`]);
  });

  it('names the current commitment when the one watched has been succeeded', () => {
    const s1 = standing(S1, decoded);
    assert.deepEqual([s1.mine.idCommit, s1.lineage.map((i) => i.idCommit).sort(), s1.current.idCommit], [S1, [R, S2].sort(), S2]);
    assert.equal(standingLine(s1), `enrolled, 2 approvals needed, since retired by a recovery; current: ${S2}`);
    assert.equal(standingLine(standing(R, decoded)), `enrolled, 2 approvals needed, since retired by a recovery; current: ${S2}`);
    assert.equal(standingLine(standing(S2, decoded)), 'enrolled, 2 approvals needed, current');
    assert.equal(standingLine(standing('ff'.repeat(32), decoded)), 'not enrolled here');
    const rootGone = { identities: { [S2]: who(S2, false) }, recoveries: [] };
    assert.equal(standingLine(standing(R, rootGone)), `the root of 1 enrolled commitment(s); current: ${S2}`);
  });

  it('is how watch.mjs prints each contract', () => {
    const src = readFileSync(new URL('../src/watch.mjs', import.meta.url), 'utf8');
    assert.match(src, /const where = standing\(ID, got\);/);
    assert.match(src, /say\(`\$\{head\}: \$\{standingLine\(where\)\}`\);/);
    assert.doesNotMatch(src, /i\.idRoot === ID && i\.idCommit !== ID/, 'no root-only match left');
  });
});

describe('the watcher: its --state file', () => {
  const base = { identity: ID, network: 'preprod', at: 'x', baselined: [ADDR, 'cc'.repeat(32)] };
  const opts = { id: ID, networkId: 'preprod', watched: [ADDR] };
  it('is ignored for another identity or network', () => {
    assert.equal(readSaved({ ...base, identity: 'dd'.repeat(32) }, opts).ok, false);
    assert.equal(readSaved({ ...base, network: 'undeployed' }, opts).ok, false);
    assert.equal(readSaved(null, opts).ok, false);
  });
  it('keeps only sound entries of the contracts watched now', () => {
    const s = readSaved({
      ...base,
      seen: {
        [KEY]: { approvals: 1, state: 'waiting' },
        [`${ADDR}:${'AB'.repeat(32)}`]: { approvals: 1, state: 'waiting' },
        [`${ADDR}:${'ef'.repeat(32)}`]: { approvals: -1, state: 'waiting' },
        [`${ADDR}:${'12'.repeat(32)}`]: { approvals: 1, state: 'gone' },
        [`${ADDR}:${'34'.repeat(32)}`]: { approvals: 1.5, state: 'ready' },
        [`${ADDR}:${'56'.repeat(32)}:x`]: { approvals: 1, state: 'ready' },
        [`${'cc'.repeat(32)}:${RID}`]: { approvals: 1, state: 'ready' },
        [`${ADDR}:${'78'.repeat(32)}`]: { approvals: 0, state: 'toString' },
      },
    }, opts);
    assert.equal(s.ok, true);
    assert.deepEqual([...s.seen], [[KEY, { approvals: 1, state: 'waiting' }]]);
    assert.deepEqual([...s.baselined], [ADDR]);
  });
});

describe('the watcher: its options', () => {
  it('reads every 10 s to a day, and refuses what would overflow the timer (a loop with no pause)', () => {
    for (const ok of [10, 30, 86_400]) assert.equal(everyProblem(ok), null, String(ok));
    for (const bad of [9, 86_401, 3_600_000, 2_200_000, 1e30, NaN, Infinity]) assert.match(everyProblem(bad), /from 10 to 86400/, String(bad));
  });
  it('POSTs only over https, or plain http to this machine', () => {
    for (const ok of ['https://hooks.example.org/x', 'http://127.0.0.1:9/hook', 'http://localhost/x', 'http://[::1]:8/x']) assert.equal(webhookProblem(ok), null, ok);
    assert.match(webhookProblem('http://hooks.example.org/x'), /must be https/);
    assert.match(webhookProblem('http://localhost.example.org/x'), /must be https/);
    assert.match(webhookProblem('not a url'), /not a URL/);
  });
});

describe('the watcher: where the webhook URL comes from', () => {
  const HOOK = 'https://hooks.slack.com/services/T0/B0/secret';
  let dir;
  before(() => { dir = mkdtempSync(path.join(tmpdir(), 'lantern-watch-')); });
  after(() => rmSync(dir, { recursive: true, force: true }));
  const file = (name, text, mode = 0o600) => { const f = path.join(dir, name); writeFileSync(f, text); chmodSync(f, mode); return f; };

  it('takes LANTERN_WEBHOOK, checked as --webhook is', () => {
    assert.deepEqual(pickWebhook({ env: HOOK }), { url: HOOK, from: 'LANTERN_WEBHOOK' });
    assert.deepEqual(pickWebhook({ env: ` ${HOOK}\n` }), { url: HOOK, from: 'LANTERN_WEBHOOK' });
    assert.match(pickWebhook({ env: 'http://hooks.example.org/x' }).problem, /^LANTERN_WEBHOOK must be https/);
    assert.match(pickWebhook({ env: 'not a url' }).problem, /^LANTERN_WEBHOOK is not a URL/);
    assert.deepEqual(pickWebhook({ env: 'http://127.0.0.1:9/hook' }), { url: 'http://127.0.0.1:9/hook', from: 'LANTERN_WEBHOOK' });
    assert.deepEqual(pickWebhook({}), { url: null, from: null });
    assert.deepEqual(pickWebhook({ env: '  ' }), { url: null, from: null });
  });

  it('takes the first line of --webhook-file, checked the same way, and says when others can read it', () => {
    const f = file('hook', `${HOOK}\nanything after the first line\n`);
    assert.deepEqual(pickWebhook({ file: f }), { url: HOOK, from: `--webhook-file ${f}` });
    assert.match(pickWebhook({ file: file('plain', 'http://hooks.example.org/x\n') }).problem, /--webhook-file .* must be https/);
    assert.match(pickWebhook({ file: file('empty', '\n\n') }).problem, /is empty/);
    assert.match(pickWebhook({ file: path.join(dir, 'nowhere') }).problem, /could not be read \(ENOENT\)/);
    const open = pickWebhook({ file: file('open', HOOK, 0o644) });
    assert.equal(open.url, HOOK);
    assert.match(open.warning, /can be read by other users of this machine: chmod 600/);
  });

  it('prefers --webhook, then --webhook-file, then LANTERN_WEBHOOK', () => {
    const f = file('pick', 'https://from.file.example/x');
    assert.equal(pickWebhook({ flag: HOOK, file: f, env: 'https://from.env.example/x' }).url, HOOK);
    assert.equal(pickWebhook({ file: f, env: 'https://from.env.example/x' }).url, 'https://from.file.example/x');
    assert.match(pickWebhook({ flag: 'http://hooks.example.org/x', env: HOOK }).problem, /^--webhook must be https/, 'a bad --webhook is refused, not replaced by the variable');
  });

  it('is how watch.mjs picks its webhook', () => {
    const src = readFileSync(new URL('../src/watch.mjs', import.meta.url), 'utf8');
    assert.match(src, /const hook = pickWebhook\(\{ flag: opts\.webhook, file: opts\.webhookFile, env: process\.env\.LANTERN_WEBHOOK \}\);\nif \(hook\.problem\) fail\(hook\.problem\);\nopts\.webhook = hook\.url;/);
    assert.match(src, /else if \(a === '--webhook-file'\) opts\.webhookFile = path\.resolve\(next\(\)\);/);
    // The header says the URL is a secret, and how to keep it off the command line.
    assert.match(src, /A Slack or Discord webhook URL is a secret/);
    assert.match(src, /LANTERN_WEBHOOK environment variable/);
  });
});

describe('the watcher: delivering an alert', () => {
  let hook;
  let plain;
  let hookUrl;
  let plainUrl;
  const received = [];
  let answer = 200;
  before(async () => {
    plain = http.createServer((req, res) => { let b = ''; req.on('data', (x) => { b += x; }); req.on('end', () => { received.push({ method: req.method, body: b }); res.end('ok'); }); });
    await new Promise((r) => plain.listen(0, '127.0.0.1', r));
    plainUrl = `http://127.0.0.1:${plain.address().port}/elsewhere`;
    hook = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        if (answer >= 300 && answer < 400) res.writeHead(answer, { location: plainUrl });
        else res.writeHead(answer);
        res.end();
      });
    });
    await new Promise((r) => hook.listen(0, '127.0.0.1', r));
    hookUrl = `http://127.0.0.1:${hook.address().port}/hook`;
  });
  after(() => { for (const s of [hook, plain]) { s.closeAllConnections(); s.close(); } });

  it('is delivered on a 2xx answer only', async () => {
    answer = 200;
    assert.deepEqual(await postAlert(hookUrl, { identity: ID }), { delivered: true });
    answer = 500;
    const r = await postAlert(hookUrl, { identity: ID });
    assert.equal(r.delivered, false);
    assert.match(r.why, /HTTP 500/);
  });

  it('never follows a redirect: neither on to another URL (307, 308) nor turned into a GET (301, 302, 303)', async () => {
    for (const code of [301, 302, 303, 307, 308]) {
      answer = code;
      const r = await postAlert(hookUrl, { identity: ID });
      assert.equal(r.delivered, false, String(code));
      assert.match(r.why, new RegExp(`HTTP ${code}, a redirect, which is not followed`));
    }
    assert.deepEqual(received, [], 'nothing reached the redirect target');
  });

  it('is not delivered when nothing answers', async () => {
    const closed = http.createServer();
    await new Promise((r) => closed.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${closed.address().port}/hook`;
    await new Promise((r) => closed.close(r));
    const r = await postAlert(url, {});
    assert.equal(r.delivered, false);
    assert.match(r.why, /could not be reached/);
  });

  it('is how watch.mjs sends every alert, and how it checks its options', () => {
    const src = readFileSync(new URL('../src/watch.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.match(src, /const sent = await postAlert\(opts\.webhook,/);
    assert.match(src, /alertsFor\(\{ baselined: baselined\.has\(c\.address\), was: seen\.get\(k\)/);
    assert.match(src, /seen = nextSeen\(seen, current, \{ unreadable, undelivered \}\);/);
    assert.match(src, /if \(everyProblem\(opts\.every\)\) fail\(everyProblem\(opts\.every\)\);/);
    assert.match(src, /const hook = pickWebhook\(\{ flag: opts\.webhook,[^\n]*\);\nif \(hook\.problem\) fail\(hook\.problem\);/);
  });
});
