import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { _resetXbrlCache, fetchXbrlConcept } from '../sources/edgar_xbrl.ts';
import { _resetCikCache, tickerToCik } from '../sources/edgar.ts';
import { toTicker } from '../_watchlist.ts';

const NVDA_CIK = '0001045810';
const TICKERS_JSON = JSON.stringify({
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
});
const BASE = `/api/xbrl/companyconcept/CIK${NVDA_CIK}/us-gaap`;
const REV = `${BASE}/Revenues.json`;
const GP = `${BASE}/GrossProfit.json`;
const usd = (e: unknown[]) => JSON.stringify({ units: { USD: e } });

const hits = new Map<string, number>();
const seenUa: string[] = [];
let payloadByPath = new Map<string, string>();
let server: Server;
let endpoint = '';

before(async () => {
  server = createServer((req, res) => {
    const ua = req.headers['user-agent'];
    if (typeof ua === 'string') seenUa.push(ua);
    const path = req.url ?? '/';
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const body = payloadByPath.get(path);
    if (!body || body === '__404__') return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/json' }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  hits.clear();
  payloadByPath = new Map([['/files/company_tickers.json', TICKERS_JSON]]);
  seenUa.length = 0;
  _resetXbrlCache();
  _resetCikCache();
  // Prime CIK cache against fixture so fetchXbrlConcept's tickerToCik() doesn't hit real SEC.
  await tickerToCik(toTicker('NVDA'), endpoint);
});

after(async () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))));

test('happy path: parses, drops invalid/missing fields, sorts by filed asc', async () => {
  payloadByPath.set(
    REV,
    usd([
      { end: '2024-01-28', val: 22103000000, fp: 'Q4', fy: 2024, form: '10-K', filed: '2024-02-21' },
      { end: '2023-04-30', val: 7192000000, fp: 'Q1', fy: 2024, form: '10-Q', filed: '2023-05-24' },
      { end: '2023-07-30', val: 13507000000, fp: 'Q2', fy: 2024, form: '10-Q', filed: '2023-08-28' },
      { end: 'not-a-date', val: 1, fp: 'Q1', fy: 2020, form: '10-Q', filed: '2020-05-01' },
      { end: '2022-01-30', val: 2, fy: 2022, form: '10-K', filed: '2022-02-21' }, // missing fp
    ]),
  );
  const pts = await fetchXbrlConcept(toTicker('NVDA'), 'Revenues', endpoint);
  assert.equal(pts.length, 3, 'invalid-date + missing-fp entries dropped');
  assert.deepEqual(
    pts.map((p) => p.filed.toISOString().slice(0, 10)),
    ['2023-05-24', '2023-08-28', '2024-02-21'],
  );
  assert.deepEqual(
    { fp: pts[0]!.fp, fy: pts[0]!.fy, form: pts[0]!.form, val: pts[0]!.val, end: pts[0]!.end.toISOString().slice(0, 10) },
    { fp: 'Q1', fy: 2024, form: '10-Q', val: 7192000000, end: '2023-04-30' },
  );
});

test('UA header matches edgar.ts (SEC requirement)', async () => {
  payloadByPath.set(REV, usd([]));
  await fetchXbrlConcept(toTicker('NVDA'), 'Revenues', endpoint);
  const xbrlUas = seenUa.slice(1); // index 0 was the cik prime
  assert.ok(xbrlUas.length >= 1);
  for (const ua of xbrlUas) assert.equal(ua, 'Thedi-Personal ashish@platformy.org');
});

test('404 throws and evicts cache so retry can succeed', async () => {
  payloadByPath.set(REV, '__404__');
  await assert.rejects(
    () => fetchXbrlConcept(toTicker('NVDA'), 'Revenues', endpoint),
    /HTTP 404/,
  );
  payloadByPath.set(REV, usd([]));
  const pts = await fetchXbrlConcept(toTicker('NVDA'), 'Revenues', endpoint);
  assert.deepEqual(pts, []);
  assert.equal(hits.get(REV), 2, 'one failed + one successful fetch');
});

test('concurrent + repeat callers for same key dedupe to one fetch', async () => {
  payloadByPath.set(
    REV,
    usd([{ end: '2025-01-01', val: 1, fp: 'Q1', fy: 2025, form: '10-Q', filed: '2025-02-01' }]),
  );
  const t = toTicker('NVDA');
  const [a, b, c] = await Promise.all([
    fetchXbrlConcept(t, 'Revenues', endpoint),
    fetchXbrlConcept(t, 'Revenues', endpoint),
    fetchXbrlConcept(t, 'Revenues', endpoint),
  ]);
  assert.equal(a, b); // reference equality proves promise-cache, not just value-cache
  assert.equal(b, c);
  await fetchXbrlConcept(t, 'Revenues', endpoint); // resolved-promise reuse
  assert.equal(hits.get(REV), 1);
});

test('cache miss: different tag for same ticker triggers a new fetch', async () => {
  payloadByPath.set(REV, usd([]));
  payloadByPath.set(GP, usd([{ end: '2024-01-28', val: 100, fp: 'FY', fy: 2024, form: '10-K', filed: '2024-02-21' }]));
  const t = toTicker('NVDA');
  await fetchXbrlConcept(t, 'Revenues', endpoint);
  const gp = await fetchXbrlConcept(t, 'GrossProfit', endpoint);
  assert.equal(gp.length, 1);
  assert.equal(hits.get(REV), 1);
  assert.equal(hits.get(GP), 1);
});
