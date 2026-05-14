import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  applyEarningsAlertSeenSchema, renderCreateTable, wasSeen, markSeen,
  type AlertSeenKey,
} from '../schema/earnings_alert_seen.ts';
import type { Ticker } from '../_types.ts';

type Hit = { method?: string; url?: string; auth?: string; body?: unknown };
type Resp = { status: number; body: string; ct?: string };
let server: Server;
let base: string;
let hits: Hit[] = [];
let queue: Resp[] = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = ''; req.setEncoding('utf8');
    req.on('data', (c) => (buf += c));
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

before(async () => {
  server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const h: Hit = {};
    if (req.method !== undefined) h.method = req.method;
    if (req.url !== undefined) h.url = req.url;
    const a = req.headers['authorization'];
    if (typeof a === 'string') h.auth = a;
    if (raw) h.body = JSON.parse(raw);
    hits.push(h);
    const r = queue.shift() ?? { status: 200, body: 'ok' };
    res.writeHead(r.status, { 'content-type': r.ct ?? 'text/plain' });
    res.end(r.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => { await new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))); });

beforeEach(() => { hits = []; queue = []; });

const ACCN_KEY: AlertSeenKey = { ticker: 'NVDA' as Ticker, alertType: 'form4_cluster', sourceId: '0001234567-26-000001' };
const URL_KEY: AlertSeenKey = { ticker: 'AAPL' as Ticker, alertType: '8k_narrative', sourceId: 'https://x.test/a,b' };

test('renderCreateTable: 4 columns, composite PK, seen_at DESC index', () => {
  const sql = renderCreateTable();
  assert.match(sql, /CREATE TABLE IF NOT EXISTS earnings_alert_seen/);
  for (const c of ['ticker', 'alert_type', 'source_id', 'seen_at']) assert.match(sql, new RegExp(`\\b${c}\\b`), `missing ${c}`);
  assert.match(sql, /PRIMARY KEY \(ticker, alert_type, source_id\)/);
  assert.match(sql, /DEFAULT now\(\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_earnings_alert_seen_seen_at ON earnings_alert_seen \(seen_at DESC\)/);
});

test('applyEarningsAlertSeenSchema: 200 → applied, POST + Bearer', async () => {
  queue.push({ status: 200, body: 'ok' });
  const out = await applyEarningsAlertSeenSchema('sk_test', base);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.method, 'POST');
  assert.equal(hits[0]!.url, '/api/admin/apply_schema');
  assert.equal(hits[0]!.auth, 'Bearer sk_test');
  assert.equal((hits[0]!.body as { schema: { name: string } }).schema.name, 'earnings_alert_seen');
  assert.equal(out.applied, true);
});

test('applyEarningsAlertSeenSchema: 409 → already exists; 500 → throws', async () => {
  queue.push({ status: 409, body: 'exists' });
  assert.deepEqual(await applyEarningsAlertSeenSchema('k', base), { applied: false, message: 'already exists' });
  queue.push({ status: 500, body: 'boom' });
  await assert.rejects(() => applyEarningsAlertSeenSchema('k', base), /HTTP 500/);
});

test('wasSeen: EDGAR accession sourceId → eq.* filters + Bearer + limit=1', async () => {
  queue.push({ status: 200, body: '[{"ticker":"NVDA"}]', ct: 'application/json' });
  assert.equal(await wasSeen(ACCN_KEY, 'k', base), true);
  const h = hits[0]!;
  assert.equal(h.method, 'GET');
  assert.equal(h.auth, 'Bearer k');
  assert.match(h.url ?? '', /^\/api\/data\/earnings_alert_seen\?/);
  assert.match(h.url ?? '', /ticker=eq\.NVDA/);
  assert.match(h.url ?? '', /alert_type=eq\.form4_cluster/);
  assert.match(h.url ?? '', /source_id=eq\.0001234567-26-000001/);
  assert.match(h.url ?? '', /limit=1/);
});

test('wasSeen: URL sourceId → URLSearchParams percent-encodes commas/slashes', async () => {
  queue.push({ status: 200, body: '[{"ticker":"AAPL"}]', ct: 'application/json' });
  assert.equal(await wasSeen(URL_KEY, 'k', base), true);
  assert.match(hits[0]!.url ?? '', /source_id=eq\.https%3A%2F%2Fx\.test%2Fa%2Cb/);
});

test('wasSeen: empty array → false', async () => {
  queue.push({ status: 200, body: '[]', ct: 'application/json' });
  assert.equal(await wasSeen(ACCN_KEY, 'k', base), false);
});

test('markSeen: POSTs row with snake_case fields', async () => {
  queue.push({ status: 200, body: '{"id":"row_1"}', ct: 'application/json' });
  await markSeen(ACCN_KEY, 'k', base);
  assert.equal(hits[0]!.method, 'POST');
  assert.equal(hits[0]!.url, '/api/data/earnings_alert_seen');
  assert.deepEqual(hits[0]!.body, { ticker: 'NVDA', alert_type: 'form4_cluster', source_id: '0001234567-26-000001' });
});

test('markSeen: 409 PK conflict swallowed (idempotent)', async () => {
  queue.push({ status: 409, body: 'dup' });
  await assert.doesNotReject(() => markSeen(ACCN_KEY, 'k', base));
  assert.equal(hits.length, 1);
});

test('markSeen: 500 re-throws', async () => {
  queue.push({ status: 500, body: 'boom' });
  await assert.rejects(() => markSeen(ACCN_KEY, 'k', base), /HTTP 500/);
});
