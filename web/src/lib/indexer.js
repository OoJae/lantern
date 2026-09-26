// Midnight Preprod's public indexer, read from the browser: the one place this site talks to anything
// but itself, and only from /live (pages/Live.jsx loads this module; no other page imports it).
//
// Everything here only reads. Each query is a fixed GraphQL document and its values travel as
// variables, never pasted into the query text. What comes back is data from the network, so it is
// checked for shape (hex where hex is due, integers where numbers are) before the page uses it, and
// the page only ever renders it as text.
//
// Two ways in, both public and both allowed by the site's connect-src:
//  - HTTPS (POST, JSON): a contract's latest action and its state, its state as of one block (the
//    action in that block, and the state after it), one transaction by identifier;
//  - a WebSocket (graphql-transport-ws), only to replay a contract's actions from a block onwards:
//    the indexer can list them no other way. It is opened to catch up and closed once caught up.

export const INDEXER = 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
export const EXPLORER = 'https://preprod.midnightexplorer.com';

const HEX = /^[0-9a-f]+$/;
export const isHex = (v, bytes) => typeof v === 'string' && HEX.test(v) && (bytes == null ? v.length % 2 === 0 : v.length === bytes * 2);
const isInt = (v) => Number.isSafeInteger(v) && v >= 0;

export const txUrl = (hash) => (isHex(hash, 32) ? `${EXPLORER}/transactions/${hash}` : null);
export const contractUrl = (address) => (isHex(address, 32) ? `${EXPLORER}/contracts/${address}` : null);

/** Why a read failed, in terms the page can say plainly. */
export class IndexerError extends Error {
  /** @param {'unreachable'|'slow'|'http'|'refused'|'shape'} kind */
  constructor(kind, message) {
    super(message);
    this.name = 'IndexerError';
    this.kind = kind;
  }
}

/**
 * One GraphQL query. `timeoutMs` bounds the whole exchange; `signal` lets the page give up (it
 * unmounted, or asked again).
 */
export async function query(document, variables = {}, { timeoutMs = 20_000, signal } = {}) {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs);
  const stop = () => ctl.abort();
  signal?.addEventListener('abort', stop, { once: true });
  try {
    let res;
    try {
      res = await fetch(INDEXER, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query: document, variables }),
        signal: ctl.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw timedOut
        ? new IndexerError('slow', `the indexer did not answer within ${Math.round(timeoutMs / 1000)} s`)
        : new IndexerError('unreachable', 'the indexer could not be reached');
    }
    if (!res.ok) throw new IndexerError('http', `the indexer answered HTTP ${res.status}`);
    let body;
    try { body = await res.json(); } catch (e) {
      if (signal?.aborted) throw e;
      throw timedOut ? new IndexerError('slow', 'the indexer stopped answering part-way') : new IndexerError('shape', 'the indexer sent something that is not JSON');
    }
    if (Array.isArray(body?.errors) && body.errors.length) {
      throw new IndexerError('refused', `the indexer refused the query: ${body.errors.map((e) => String(e?.message ?? '')).join('; ').slice(0, 200)}`);
    }
    if (!body || typeof body.data !== 'object' || body.data === null) throw new IndexerError('shape', 'the indexer sent no data');
    return body.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

// ---- the documents -------------------------------------------------------------------------------

const TX = 'hash block { height timestamp } ... on RegularTransaction { identifiers transactionResult { status } }';
const ACTION = `__typename address ... on ContractCall { entryPoint } transaction { ${TX} }`;

const LATEST = `query LanternLatest($address: HexEncoded!) { contractAction(address: $address) { ${ACTION} } }`;
const STATE = `query LanternState($address: HexEncoded!) { contractAction(address: $address) { ${ACTION} state } }`;
const STATE_AT = `query LanternStateAt($address: HexEncoded!, $offset: ContractActionOffset!) { contractAction(address: $address, offset: $offset) { ${ACTION} state } }`;
const TX_BY_ID = `query LanternTx($offset: TransactionOffset!) { transactions(offset: $offset) { ${TX} contractActions { __typename address ... on ContractCall { entryPoint } } } }`;
const ACTIONS_FROM = `subscription LanternActions($address: HexEncoded!, $offset: BlockOffset) { contractActions(address: $address, offset: $offset) { ${ACTION} } }`;

/** The five documents, for the e2e fixtures' recorder (web/e2e/fixtures/record.mjs). */
export const DOCUMENTS = Object.freeze({ LATEST, STATE, STATE_AT, TX_BY_ID, ACTIONS_FROM });

// ---- shapes --------------------------------------------------------------------------------------

const KINDS = { ContractDeploy: 'deploy', ContractCall: 'call', ContractUpdate: 'update' };
const STATUS = { SUCCESS: 'success', PARTIAL_SUCCESS: 'partial', FAILURE: 'failure' };

/** A transaction as the page uses it, or null if the indexer's answer is not one. */
function txOf(t) {
  if (!t || !isHex(t.hash, 32) || !isInt(t.block?.height) || !isInt(t.block?.timestamp)) return null;
  const ids = Array.isArray(t.identifiers) ? t.identifiers.filter((i) => isHex(i)) : [];
  return {
    hash: t.hash,
    height: t.block.height,
    time: t.block.timestamp, // milliseconds
    identifiers: ids,
    status: STATUS[t.transactionResult?.status] ?? (t.transactionResult ? 'unknown' : null),
  };
}

/** A contract action as the page uses it, or null. Exported for live.spec.js, which reads the
 *  recorded answers the way the page does. */
export function actionOf(a) {
  const kind = KINDS[a?.__typename];
  if (!kind || !isHex(a.address, 32)) return null;
  const tx = txOf(a.transaction);
  if (!tx) return null;
  const entryPoint = kind === 'call' && typeof a.entryPoint === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(a.entryPoint) ? a.entryPoint : null;
  return { kind, address: a.address, entryPoint, tx };
}

// ---- reads ---------------------------------------------------------------------------------------

/** The contract's latest action (null: the indexer knows no contract at that address). */
export async function latestAction(address, opts) {
  const d = await query(LATEST, { address }, opts);
  if (d.contractAction == null) return null;
  const a = actionOf(d.contractAction);
  if (!a) throw new IndexerError('shape', 'the indexer sent an action this page does not recognise');
  return a;
}

/** The contract's latest action and its state after it, as hex (null: no such contract). */
export async function contractState(address, opts) {
  const d = await query(STATE, { address }, { timeoutMs: 30_000, ...opts });
  if (d.contractAction == null) return null;
  const a = actionOf(d.contractAction);
  const state = d.contractAction.state;
  if (!a || !isHex(state)) throw new IndexerError('shape', 'the indexer sent a state this page cannot read');
  return { action: a, state };
}

/**
 * The contract's action in block `height` and its state after it, as hex (null: the indexer holds no
 * action of that contract in that block). Only that block's: the indexer does not look back from it.
 */
export async function contractStateAt(address, height, opts) {
  if (!isInt(height)) throw new IndexerError('shape', 'no block to ask about');
  const d = await query(STATE_AT, { address, offset: { blockOffset: { height } } }, { timeoutMs: 30_000, ...opts });
  if (d.contractAction == null) return null;
  const a = actionOf(d.contractAction);
  const state = d.contractAction.state;
  if (!a || !isHex(state) || a.address !== address || a.tx.height !== height) throw new IndexerError('shape', 'the indexer sent a state this page cannot read');
  return { action: a, state };
}

/** A transaction by one of its identifiers, with the contract actions it carries (null: none). */
export async function transactionById(identifier, opts) {
  const d = await query(TX_BY_ID, { offset: { identifier } }, opts);
  const t = Array.isArray(d.transactions) ? d.transactions[0] : null;
  if (!t) return null;
  const tx = txOf(t);
  if (!tx) throw new IndexerError('shape', 'the indexer sent a transaction this page does not recognise');
  const actions = (Array.isArray(t.contractActions) ? t.contractActions : [])
    .map((a) => ({ kind: KINDS[a?.__typename] ?? null, address: isHex(a?.address, 32) ? a.address : null, entryPoint: typeof a?.entryPoint === 'string' ? a.entryPoint : null }))
    .filter((a) => a.kind && a.address);
  return { ...tx, actions };
}

/**
 * Replays each contract's actions from a block onwards, over one WebSocket, until each reaches the
 * action named by `untilHash` (its latest, read over HTTPS just before). Resolves with the actions
 * per address, oldest first; a contract that did not catch up in `timeoutMs` is marked incomplete.
 * The socket is closed as soon as every contract has caught up.
 *
 * @param {{ address: string, fromHeight: number, untilHash: string }[]} wanted
 * @returns {Promise<Record<string, { actions: object[], complete: boolean }>>}
 */
export function catchUpActions(wanted, { timeoutMs = 25_000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const out = Object.fromEntries(wanted.map((w) => [w.address, { actions: [], complete: false }]));
    const byId = new Map(wanted.map((w, i) => [String(i + 1), w]));
    let ws;
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      try {
        if (ws && ws.readyState <= 1) {
          for (const id of byId.keys()) { try { ws.send(JSON.stringify({ id, type: 'complete' })); } catch { /* closing anyway */ } }
          ws.close(1000);
        }
      } catch { /* already closed */ }
      if (err && !Object.values(out).some((o) => o.actions.length)) reject(err);
      else resolve(out);
    };
    const abort = () => finish(new DOMException('aborted', 'AbortError'));
    const timer = setTimeout(() => finish(new IndexerError('slow', 'the indexer did not replay every action in time')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    const allDone = () => Object.values(out).every((o) => o.complete);
    if (!wanted.length) { finish(); return; }
    try {
      ws = new WebSocket(INDEXER_WS, 'graphql-transport-ws');
    } catch {
      finish(new IndexerError('unreachable', 'the indexer\'s stream could not be opened'));
      return;
    }
    ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init', payload: {} }));
    ws.onerror = () => finish(new IndexerError('unreachable', 'the indexer\'s stream could not be opened'));
    ws.onclose = () => finish(allDone() ? undefined : new IndexerError('unreachable', 'the indexer\'s stream closed early'));
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m?.type === 'connection_ack') {
        for (const [id, w] of byId) {
          ws.send(JSON.stringify({
            id, type: 'subscribe',
            payload: { query: ACTIONS_FROM, variables: { address: w.address, offset: { height: w.fromHeight } } },
          }));
        }
      } else if (m?.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      } else if (m?.type === 'next' && byId.has(m.id)) {
        const w = byId.get(m.id);
        const a = actionOf(m.payload?.data?.contractActions);
        const o = out[w.address];
        if (!a || a.address !== w.address || o.complete) return;
        if (!o.actions.some((x) => x.tx.hash === a.tx.hash)) o.actions.push(a);
        if (a.tx.hash === w.untilHash) o.complete = true;
        if (allDone()) finish();
      } else if (m?.type === 'error' && byId.has(m.id)) {
        finish(new IndexerError('refused', 'the indexer refused the stream'));
      }
    };
  });
}

/** Up to `limit` tasks at a time; each result (or error) is handed to `each` as it lands. Once
 *  `signal` aborts (the page was left), no further task starts. */
export async function pool(items, limit, task, each, { signal } = {}) {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const i = next++;
      let result = null;
      let error = null;
      try { result = await task(items[i], i); } catch (e) { error = e; }
      each(i, result, error);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
