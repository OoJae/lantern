// A node that answers badly once in a while must not end a wait for the timelock: the shipped
// finalize can wait hours polling the public node's block time. A fake node on 127.0.0.1 answers
// from a script: a timestamp, a gateway's 502 page, a reset socket, a JSON-RPC error.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { jsonRpc, retrying, timestampSeconds, waitUntil } from '../src/rpc.mjs';

const tsHex = (seconds) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(seconds) * 1000n); return `0x${b.toString('hex')}`; };
const quiet = { sleep: async () => {}, say: () => {} };

let server;
let url;
let script = [];
let served = 0;
before(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      served++;
      const next = script.shift() ?? { ts: 0 };
      if (next.hang) return; // never answers
      if (next.reset) { req.socket.destroy(); return; }
      if (next.status) { res.writeHead(next.status, { 'content-type': 'text/html' }); res.end(`<html>${next.status} Bad Gateway</html>`); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (next.notJson) { res.end('<html>ok</html>'); return; }
      res.end(JSON.stringify(next.error ? { jsonrpc: '2.0', id: 1, error: next.error } : { jsonrpc: '2.0', id: 1, result: tsHex(next.ts) }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); });

const readTime = () => jsonRpc(url, 'state_getStorage', ['0x00']).then(timestampSeconds);

describe('node RPC', () => {
  it('names the method and the failure: a 502 page, a body that is not JSON, an RPC error, no answer', async () => {
    script = [{ status: 502 }, { notJson: true }, { error: { code: -32029, message: 'too many requests' } }, { hang: true }];
    await assert.rejects(jsonRpc(url, 'state_getStorage'), /state_getStorage: HTTP 502/);
    await assert.rejects(jsonRpc(url, 'state_getStorage'), /state_getStorage: the answer was not JSON/);
    await assert.rejects(jsonRpc(url, 'state_getStorage'), /state_getStorage: .*too many requests/);
    await assert.rejects(jsonRpc(url, 'state_getStorage', [], { timeoutMs: 200 }), /timeout|aborted/i);
  });

  it('reads the timestamp pallet as seconds, and refuses anything else', () => {
    assert.equal(timestampSeconds(tsHex(1_790_000_000)), 1_790_000_000);
    assert.throws(() => timestampSeconds(null), /not a block timestamp/);
    assert.throws(() => timestampSeconds('0x1234'), /not a block timestamp/);
  });

  it('asks again when a read fails, and throws the last failure once its tries are spent', async () => {
    script = [{ status: 502 }, { reset: true }, { ts: 42 }];
    assert.equal(await retrying(readTime, quiet), 42);
    script = [{ status: 502 }, { status: 503 }, { status: 504 }, { status: 502 }, { ts: 1 }];
    await assert.rejects(retrying(readTime, quiet), /HTTP 502/);
    assert.equal(script.length, 1, 'four tries, no more');
  });
});

describe('waiting for the chain time', () => {
  it('rides out a 502 page, a reset socket and an RPC error in the middle of the wait', async () => {
    const target = 1_000;
    script = [{ ts: 900 }, { status: 502 }, { ts: 950 }, { reset: true }, { error: { code: -32029, message: 'rate limited' } }, { ts: 999 }, { ts: 1_000 }];
    served = 0;
    const ticks = [];
    await waitUntil(readTime, target, { ...quiet, onTick: (left) => ticks.push(left) });
    assert.equal(served, 7);
    assert.deepEqual(ticks, [100, 50, 1]);
  });

  it('gives up only after its failures in a row, so a dead endpoint cannot hold it for ever', async () => {
    script = [{ ts: 10 }, { status: 502 }, { status: 502 }, { ts: 11 }, ...Array.from({ length: 5 }, () => ({ status: 502 }))];
    await assert.rejects(waitUntil(readTime, 100, { ...quiet, maxFails: 5 }), /HTTP 502/);
    assert.equal(script.length, 0, 'a good read resets the count');
  });
});

describe('the runners use it', () => {
  it('for every read of the node: block time, height, and the wait for the timelock', async () => {
    const { readFileSync } = await import('node:fs');
    const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.match(src('config.mjs'), /export const nodeRpc = \(method, params = \[\]\) => jsonRpc\(network\.node, method, params\);/);
    const chain = src('chain.mjs');
    assert.match(chain, /export const tipTime = \(\) => retrying\(readTipTime\);/);
    assert.match(chain, /export const tipHeight = \(\) => retrying\(/);
    assert.match(chain, /export const waitForChainTime = \(target, onTick = \(\) => \{\}\) => waitUntil\(readTipTime, target, \{ onTick \}\);/);
    assert.doesNotMatch(chain + src('config.mjs'), /await fetch\(/);
  });
});
