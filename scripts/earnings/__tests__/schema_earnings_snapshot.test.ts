import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { applyEarningsSnapshotSchema, renderCreateTable } from '../schema/earnings_snapshot.ts';

type Hit = { method: string | undefined; url: string | undefined; auth: string | undefined; body: unknown };
let server: Server;
let base: string;
let hits: Hit[] = [];
let nextStatus = 200;

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
    hits.push({
      method: req.method,
      url: req.url,
      auth: req.headers['authorization'] as string | undefined,
      body: raw ? JSON.parse(raw) : undefined,
    });
    res.writeHead(nextStatus, { 'content-type': 'text/plain' });
    res.end(nextStatus === 200 ? 'ok' : nextStatus === 409 ? 'exists' : 'boom');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res())));
});

beforeEach(() => { hits = []; nextStatus = 200; });

test('renderCreateTable emits CREATE TABLE IF NOT EXISTS with all 5 columns + PK', () => {
  const sql = renderCreateTable();
  assert.match(sql, /CREATE TABLE IF NOT EXISTS earnings_snapshot/);
  for (const col of ['ticker', 'layer', 'snapshot_date', 'payload', 'created_at']) {
    assert.match(sql, new RegExp(`\\b${col}\\b`), `missing column ${col}`);
  }
  assert.match(sql, /PRIMARY KEY \(ticker, layer, snapshot_date\)/);
  assert.match(sql, /DEFAULT now\(\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_earnings_snapshot_ticker_date ON earnings_snapshot \(ticker, snapshot_date DESC\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_earnings_snapshot_layer_date ON earnings_snapshot \(layer, snapshot_date DESC\)/);
});

test('applyEarningsSnapshotSchema POSTs to /api/admin/apply_schema with Bearer header', async () => {
  const out = await applyEarningsSnapshotSchema('sk_test_xyz', base);
  assert.equal(hits.length, 1);
  const h = hits[0]!;
  assert.equal(h.method, 'POST');
  assert.equal(h.url, '/api/admin/apply_schema');
  assert.equal(h.auth, 'Bearer sk_test_xyz');
  assert.equal((h.body as { schema: { name: string } }).schema.name, 'earnings_snapshot');
  assert.equal(out.applied, true);
});

test('applyEarningsSnapshotSchema: 409 → applied:false, message:"already exists"', async () => {
  nextStatus = 409;
  const out = await applyEarningsSnapshotSchema('k', base);
  assert.deepEqual(out, { applied: false, message: 'already exists' });
});

test('applyEarningsSnapshotSchema: 500 → throws', async () => {
  nextStatus = 500;
  await assert.rejects(() => applyEarningsSnapshotSchema('k', base), /HTTP 500/);
});
