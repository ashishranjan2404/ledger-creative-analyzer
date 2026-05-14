import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchGovContracts, TICKER_TO_CONTRACT_RECIPIENT } from '../sources/gov_contracts.ts';
import { toTicker } from '../_watchlist.ts';

let server: Server;
let endpoint = '';
let hits: { method: string; body: unknown }[] = [];
type ReqBody = { filters?: { recipient_search_text?: string[] }; page?: number };
let respond: (body: ReqBody) => { status: number; body: unknown } = () => ({ status: 200, body: { results: [] } });

const NVDA = toTicker('NVDA');
const AAPL = toTicker('AAPL');
const DAY = 86_400_000;
const NOW = Date.now();
const recent = (d: number): string => new Date(NOW - d * DAY).toISOString().slice(0, 10);

const readBody = (req: IncomingMessage): Promise<string> => new Promise((res) => {
  const bufs: Buffer[] = [];
  req.on('data', (c: Buffer) => bufs.push(c));
  req.on('end', () => res(Buffer.concat(bufs).toString('utf8')));
});

before(async () => {
  server = createServer(async (req, res) => {
    const raw = await readBody(req);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    hits.push({ method: req.method ?? '', body: parsed });
    const r = respond((parsed as ReqBody) ?? {});
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/search/`;
});

after(async () => {
  await new Promise<void>((ok, ko) => server.close((e) => (e ? ko(e) : ok())));
});

beforeEach(() => {
  hits = [];
  respond = () => ({ status: 200, body: { results: [] } });
});

test('maps + filters by sinceDays; sorts desc; agency object accepted', async () => {
  respond = () => ({ status: 200, body: { results: [
    { 'Award ID': 'A1', 'Recipient Name': 'NVIDIA CORPORATION', 'Award Amount': 5_000_000,
      'Awarding Agency': { name: 'Department of Defense' }, Description: 'GPUs',
      'Action Date': recent(10) },
    { 'Award ID': 'A2', 'Recipient Name': 'NVIDIA CORPORATION', 'Award Amount': 1_000,
      'Awarding Agency': 'NASA', Description: '', 'Action Date': recent(2) },
  ] } });
  const rows = await fetchGovContracts([NVDA], 90, endpoint);
  assert.equal(rows.length, 2);
  // sort desc by date: recent(2) first
  assert.equal(rows[0]?.amount, 1_000);
  assert.equal(rows[0]?.agency, 'NASA');
  assert.equal(rows[0]?.description, 'A2');           // falls back to Award ID
  assert.equal(rows[1]?.agency, 'Department of Defense');
  assert.equal(rows[1]?.description, 'GPUs');
  assert.ok(rows[0]?.date instanceof Date);
});

test('ticker not in lookup map → skipped (no HTTP)', async () => {
  const FOO = 'ZZZZ' as unknown as ReturnType<typeof toTicker>;
  assert.equal(TICKER_TO_CONTRACT_RECIPIENT[FOO as unknown as string], undefined);
  const rows = await fetchGovContracts([FOO], 90, endpoint);
  assert.deepEqual(rows, []);
  assert.equal(hits.length, 0);
});

test('per-ticker 500 swallowed; sibling tickers still return', async () => {
  // Identify the failing ticker by recipient_search_text in the body so the
  // 500 is per-ticker (and persistent across the retry helper's 4 attempts).
  respond = (body) => {
    const recipient = (body?.filters?.recipient_search_text?.[0] ?? '') as string;
    if (recipient.startsWith('NVIDIA')) {
      return { status: 500, body: { error: 'boom' } };
    }
    return { status: 200, body: { results: [
      { 'Award ID': 'B1', 'Recipient Name': 'APPLE INC', 'Award Amount': 42,
        'Awarding Agency': 'GSA', Description: 'iPads', 'Action Date': recent(5) },
    ] } };
  };
  const rows = await fetchGovContracts([NVDA, AAPL], 90, endpoint);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.ticker, 'AAPL');
  assert.equal(rows[0]?.amount, 42);
});

test('malformed dates / amounts dropped', async () => {
  respond = () => ({ status: 200, body: { results: [
    { 'Award ID': 'X', 'Award Amount': 100, 'Awarding Agency': 'A', Description: 'd',
      'Action Date': 'not-a-date' },                            // bad date
    { 'Award ID': 'Y', 'Award Amount': 'lots', 'Awarding Agency': 'A', Description: 'd',
      'Action Date': recent(1) },                                // bad amount
    { 'Award ID': 'Z', 'Award Amount': 99, 'Awarding Agency': 'A', Description: 'd',
      'Action Date': recent(2) },                                // good
  ] } });
  const rows = await fetchGovContracts([NVDA], 90, endpoint);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.amount, 99);
});

test('POST body contains expected filters', async () => {
  await fetchGovContracts([NVDA], 90, endpoint);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.method, 'POST');
  const b = hits[0]?.body as Record<string, unknown>;
  const f = b.filters as Record<string, unknown>;
  assert.deepEqual(f.award_type_codes, ['A', 'B', 'C', 'D']);
  assert.deepEqual(f.recipient_search_text, ['NVIDIA CORPORATION']);
  const tp = (f.time_period as Array<Record<string, string>>)[0]!;
  assert.match(tp.start_date!, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(tp.end_date!, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(new Date(tp.end_date!).getTime() > new Date(tp.start_date!).getTime());
});

test('empty tickers → [] no HTTP', async () => {
  const rows = await fetchGovContracts([], 90, endpoint);
  assert.deepEqual(rows, []);
  assert.equal(hits.length, 0);
});
