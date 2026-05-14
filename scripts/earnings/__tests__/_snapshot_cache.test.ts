import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { getLatestSnapshot, putSnapshot } from '../_snapshot_cache.ts';
import type { ButterbaseConfig } from '../_butterbase.ts';

type Hit = { method: string | undefined; url: string | undefined; body: unknown };

let server: Server;
let base: string;
let hits: Hit[] = [];
let nextStatus = 200;
let nextGetBody: unknown = [];

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
    hits.push({ method: req.method, url: req.url, body: parsed });
    if (nextStatus !== 200) {
      res.writeHead(nextStatus, { 'content-type': 'text/plain' });
      res.end('err');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.method === 'GET') res.end(JSON.stringify(nextGetBody));
    else res.end(JSON.stringify({ id: 'rowid', ...(parsed as object) }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res())));
});

beforeEach(() => {
  hits = [];
  nextStatus = 200;
  nextGetBody = [];
});

const cfg = (): ButterbaseConfig => ({ baseUrl: base, serviceKey: 'sk_test' });

// "today" baseline so age math is stable; tests pick dates relative to system clock.
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

test('getLatestSnapshot: cache hit (fresh row within default 6-day window) returns payload', async () => {
  nextGetBody = [
    { ticker: 'NVDA', layer: 'fundamentals_v1', snapshot_date: isoDaysAgo(2), payload: { metrics: [1, 2, 3] } },
  ];
  const out = await getLatestSnapshot<{ metrics: number[] }>('NVDA', 'fundamentals_v1', cfg());
  assert.deepEqual(out, { metrics: [1, 2, 3] });
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.method, 'GET');
  assert.ok(hits[0]?.url?.includes('ticker=NVDA'));
  assert.ok(hits[0]?.url?.includes('layer=fundamentals_v1'));
});

test('getLatestSnapshot: picks newest row when multiple present', async () => {
  nextGetBody = [
    { ticker: 'NVDA', layer: 'fundamentals_v1', snapshot_date: isoDaysAgo(5), payload: { v: 'old' } },
    { ticker: 'NVDA', layer: 'fundamentals_v1', snapshot_date: isoDaysAgo(1), payload: { v: 'new' } },
    { ticker: 'NVDA', layer: 'fundamentals_v1', snapshot_date: isoDaysAgo(3), payload: { v: 'mid' } },
  ];
  const out = await getLatestSnapshot<{ v: string }>('NVDA', 'fundamentals_v1', cfg());
  assert.deepEqual(out, { v: 'new' });
});

test('getLatestSnapshot: miss when latest row older than maxAgeDays (default 6)', async () => {
  nextGetBody = [
    { ticker: 'NVDA', layer: 'fundamentals_v1', snapshot_date: isoDaysAgo(10), payload: { v: 'stale' } },
  ];
  const out = await getLatestSnapshot('NVDA', 'fundamentals_v1', cfg());
  assert.equal(out, null);
});

test('getLatestSnapshot: custom maxAgeDays respected', async () => {
  nextGetBody = [
    { ticker: 'NVDA', layer: 'fundamentals_v1', snapshot_date: isoDaysAgo(3), payload: { v: 'x' } },
  ];
  // maxAgeDays=2 makes a 3-day-old row stale.
  const out = await getLatestSnapshot('NVDA', 'fundamentals_v1', cfg(), { maxAgeDays: 2 });
  assert.equal(out, null);
});

test('getLatestSnapshot: miss when no rows', async () => {
  nextGetBody = [];
  const out = await getLatestSnapshot('NVDA', 'fundamentals_v1', cfg());
  assert.equal(out, null);
});

test('getLatestSnapshot: HTTP error propagates (so caller can log + degrade)', async () => {
  nextStatus = 500;
  await assert.rejects(
    () => getLatestSnapshot('NVDA', 'fundamentals_v1', cfg()),
    /HTTP 500/,
  );
});

test('putSnapshot: POSTs row with today UTC date and payload', async () => {
  await putSnapshot('NVDA', 'fundamentals_v1', { metrics: [1, 2] }, cfg());
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.method, 'POST');
  assert.equal(hits[0]?.url, '/api/data/earnings_snapshot');
  const body = hits[0]?.body as { ticker: string; layer: string; snapshot_date: string; payload: { metrics: number[] } };
  assert.equal(body.ticker, 'NVDA');
  assert.equal(body.layer, 'fundamentals_v1');
  assert.equal(body.snapshot_date, new Date().toISOString().slice(0, 10));
  assert.deepEqual(body.payload, { metrics: [1, 2] });
});

test('putSnapshot: HTTP error propagates', async () => {
  nextStatus = 500;
  await assert.rejects(
    () => putSnapshot('NVDA', 'fundamentals_v1', { v: 1 }, cfg()),
    /HTTP 500/,
  );
});
