import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { insertRow, insertRows, selectRows, type ButterbaseConfig } from '../_butterbase.ts';

type Hit = {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  contentType: string | undefined;
  body: unknown;
};

let server: Server;
let base: string;
let hits: Hit[] = [];
let nextStatus = 200;
let nextGetBody: unknown = []; // body returned for GET (selectRows) requests.

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (buf += c));
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

before(async () => {
  server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    hits.push({
      method: req.method,
      url: req.url,
      authorization: req.headers['authorization'] as string | undefined,
      contentType: req.headers['content-type'] as string | undefined,
      body: parsed,
    });
    if (nextStatus !== 200) {
      res.writeHead(nextStatus, { 'content-type': 'text/plain' });
      res.end('boom');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.method === 'GET') {
      res.end(JSON.stringify(nextGetBody));
    } else if (Array.isArray(parsed)) {
      const rows = parsed.map((r, i) => ({ id: `fake-uuid-${i}`, ...(r as object) }));
      res.end(JSON.stringify(rows));
    } else {
      res.end(JSON.stringify({ id: 'fake-uuid-0', created_at: '2026-05-09T00:00:00Z', ...(parsed as object) }));
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(() => {
  hits = [];
  nextStatus = 200;
  nextGetBody = [];
});

const cfg = (): ButterbaseConfig => ({ baseUrl: base, serviceKey: 'sk_test_123' });

test('insertRow sends Authorization header and POST body, returns row with id', async () => {
  const row = { ticker: 'NVDA', score: 0.93 };
  const out = await insertRow('findings', row, cfg());
  assert.equal(hits.length, 1);
  const h = hits[0]!;
  assert.equal(h.method, 'POST');
  assert.equal(h.url, '/api/data/findings');
  assert.equal(h.authorization, 'Bearer sk_test_123');
  assert.equal(h.contentType, 'application/json');
  assert.deepEqual(h.body, row);
  assert.equal(out.id, 'fake-uuid-0');
  assert.equal(out.ticker, 'NVDA');
  assert.equal(out.created_at, '2026-05-09T00:00:00Z');
});

test('insertRows with 3 rows hits /bulk endpoint, returns 3 rows', async () => {
  const rows = [{ a: 1 }, { a: 2 }, { a: 3 }];
  const out = await insertRows('audit_log', rows, cfg());
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.url, '/api/data/audit_log/bulk');
  assert.equal(hits[0]?.method, 'POST');
  assert.deepEqual(hits[0]?.body, rows);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r.id), ['fake-uuid-0', 'fake-uuid-1', 'fake-uuid-2']);
  assert.equal(out[2]?.a, 3);
});

test('insertRows with empty array returns [] without firing HTTP', async () => {
  const out = await insertRows('audit_log', [], cfg());
  assert.deepEqual(out, []);
  assert.equal(hits.length, 0);
});

test('insertRow propagates HTTP 500 (does not swallow)', async () => {
  nextStatus = 500;
  await assert.rejects(
    () => insertRow('findings', { x: 1 }, cfg()),
    /HTTP 500/,
  );
});

test('insertRows propagates HTTP 500 (does not swallow)', async () => {
  nextStatus = 500;
  await assert.rejects(
    () => insertRows('findings', [{ x: 1 }], cfg()),
    /HTTP 500/,
  );
});

test('selectRows: GET with querystring filters, Bearer auth, returns parsed array', async () => {
  nextGetBody = [
    { ticker: 'NVDA', layer: 'fundamentals_v1', snapshot_date: '2026-05-13', payload: { foo: 1 } },
  ];
  const out = await selectRows<{ ticker: string; payload: { foo: number } }>(
    'earnings_snapshot', { ticker: 'NVDA', layer: 'fundamentals_v1' }, cfg(),
  );
  assert.equal(hits.length, 1);
  const h = hits[0]!;
  assert.equal(h.method, 'GET');
  // Query order follows Object.entries insertion order.
  assert.equal(h.url, '/api/data/earnings_snapshot?ticker=NVDA&layer=fundamentals_v1');
  assert.equal(h.authorization, 'Bearer sk_test_123');
  assert.equal(out.length, 1);
  assert.equal(out[0]?.ticker, 'NVDA');
  assert.deepEqual(out[0]?.payload, { foo: 1 });
});

test('selectRows: empty where omits querystring', async () => {
  nextGetBody = [];
  await selectRows('earnings_snapshot', {}, cfg());
  assert.equal(hits[0]?.url, '/api/data/earnings_snapshot');
});

test('selectRows: propagates HTTP 500', async () => {
  nextStatus = 500;
  await assert.rejects(
    () => selectRows('earnings_snapshot', { ticker: 'NVDA' }, cfg()),
    /HTTP 500/,
  );
});

test('default baseUrl targets app_36ybfio2fiy7.butterbase.dev', async () => {
  const original = globalThis.fetch;
  let capturedUrl = '';
  globalThis.fetch = (async (input: string | URL | Request) => {
    capturedUrl = typeof input === 'string' ? input : input.toString();
    throw new Error('intercepted');
  }) as typeof fetch;
  try {
    await assert.rejects(() =>
      insertRow('findings', { x: 1 }, { serviceKey: 'k' }),
    );
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(capturedUrl, 'https://app_36ybfio2fiy7.butterbase.dev/api/data/findings');
});
