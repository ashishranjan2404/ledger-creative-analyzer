import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchFundamentalsTrajectory, type FundamentalsTrajectory } from '../layers/fundamentals.ts';
import { _resetXbrlCache } from '../sources/edgar_xbrl.ts';
import { _resetCikCache, tickerToCik } from '../sources/edgar.ts';
import { toTicker } from '../_watchlist.ts';

const NVDA_CIK = '0001045810';
const TICKERS_JSON = JSON.stringify({ '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' } });
const BASE = `/api/xbrl/companyconcept/CIK${NVDA_CIK}/us-gaap`;
const path = (tag: string) => `${BASE}/${tag}.json`;
const usd = (e: unknown[]) => JSON.stringify({ units: { USD: e } });

let payloads = new Map<string, string>();
let server: Server;
let endpoint = '';

before(async () => {
  server = createServer((req, res) => {
    const body = payloads.get(req.url ?? '');
    if (!body || body === '__404__') return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/json' }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))));

beforeEach(async () => {
  payloads = new Map([['/files/company_tickers.json', TICKERS_JSON]]);
  _resetXbrlCache();
  _resetCikCache();
  await tickerToCik(toTicker('NVDA'), endpoint);
});

// 8 quarter-end dates spanning 2 fiscal years (Q1FY24 → Q4FY25).
const QENDS = [
  ['2023-04-30', 2024, 'Q1'], ['2023-07-30', 2024, 'Q2'], ['2023-10-29', 2024, 'Q3'], ['2024-01-28', 2024, 'Q4'],
  ['2024-04-28', 2025, 'Q1'], ['2024-07-28', 2025, 'Q2'], ['2024-10-27', 2025, 'Q3'], ['2025-01-26', 2025, 'Q4'],
] as const;

const rows = (values: readonly number[]) =>
  values.map((val, i) => {
    const [end, fy, fp] = QENDS[i]!;
    return { end, val, fp, fy, form: '10-Q', filed: end };
  });

const metric = (traj: FundamentalsTrajectory, label: string): readonly number[] => {
  const m = traj.metrics.find((x) => x.label === label);
  if (!m) throw new Error(`missing metric: ${label}`);
  return m.values;
};

test('happy path: 5 metrics × 8 values, math sanity, asOf populated', async () => {
  payloads.set(path('Revenues'), usd(rows([10e9, 12e9, 14e9, 18e9, 13e9, 15e9, 18e9, 22e9])));
  payloads.set(path('GrossProfit'), usd(rows([6e9, 7.2e9, 8.4e9, 10.8e9, 7.8e9, 9e9, 10.8e9, 13.2e9])));
  payloads.set(path('NetCashProvidedByOperatingActivities'), usd(rows([3e9, 4e9, 5e9, 6e9, 4e9, 5e9, 6e9, 8e9])));
  payloads.set(path('PaymentsToAcquirePropertyPlantAndEquipment'), usd(rows([1e9, 1e9, 1e9, 1e9, 1e9, 1e9, 1e9, 2e9])));
  payloads.set(path('OperatingIncomeLoss'), usd(rows([2e9, 3e9, 4e9, 5e9, 3e9, 4e9, 5e9, 7e9])));
  payloads.set(path('LongTermDebtNoncurrent'), usd(rows([10e9, 10e9, 10e9, 10e9, 10e9, 10e9, 10e9, 10e9])));
  payloads.set(path('CashAndCashEquivalentsAtCarryingValue'), usd(rows([5e9, 5e9, 5e9, 5e9, 5e9, 5e9, 5e9, 5e9])));

  const traj = await fetchFundamentalsTrajectory(toTicker('NVDA'), endpoint);
  assert.equal(traj.ticker, 'NVDA');
  assert.ok(traj.asOf instanceof Date && !Number.isNaN(traj.asOf.getTime()), 'asOf is a Date');
  assert.deepEqual(traj.metrics.map((m) => m.label),
    ['Revenue YoY', 'FCF margin', 'Gross margin', 'ROIC', 'Net debt / EBITDA']);
  assert.deepEqual(traj.metrics.map((m) => m.unit), ['pct', 'pct', 'pct', 'pct', 'ratio']);
  for (const m of traj.metrics) assert.equal(m.values.length, 8, `${m.label} length`);

  // Revenue YoY at index 4 (FY25Q1=13e9 vs FY24Q1=10e9) = +30%; first 4 NaN (no prior-year base).
  assert.ok(Math.abs(metric(traj, 'Revenue YoY')[4]! - 30) < 1e-9);
  for (let i = 0; i < 4; i++) assert.ok(Number.isNaN(metric(traj, 'Revenue YoY')[i]!));
  // Gross margin at index 7: 13.2/22 = 60%.
  assert.ok(Math.abs(metric(traj, 'Gross margin')[7]! - 60) < 1e-9);
  // FCF margin at index 7: (8 - 2)/22 ≈ 27.27%.
  assert.ok(Math.abs(metric(traj, 'FCF margin')[7]! - (6 / 22) * 100) < 1e-9);
  // ROIC at index 7: 7 / (10 + 0.5*22) = 7/21 ≈ 33.33%.
  assert.ok(Math.abs(metric(traj, 'ROIC')[7]! - (7 / 21) * 100) < 1e-9);
  // Net debt/EBITDA at index 7: (10 - 5)/7 ≈ 0.7143.
  assert.ok(Math.abs(metric(traj, 'Net debt / EBITDA')[7]! - 5 / 7) < 1e-9);
});

test('Revenues fallback used when primary tag returns 404', async () => {
  payloads.set(path('Revenues'), '__404__');
  payloads.set(path('RevenueFromContractWithCustomerExcludingAssessedTax'),
    usd(rows([10e9, 11e9, 12e9, 13e9, 14e9, 15e9, 16e9, 17e9])));
  const traj = await fetchFundamentalsTrajectory(toTicker('NVDA'), endpoint);
  const yoy = metric(traj, 'Revenue YoY');
  assert.ok(Math.abs(yoy[4]! - 40) < 1e-9, `14 vs 10 = 40% YoY, got ${yoy[4]}`);
  assert.ok(Number.isNaN(yoy[3]!));
});

test('missing tag (404) → that metric all-NaN, others succeed', async () => {
  payloads.set(path('Revenues'), usd(rows([10e9, 11e9, 12e9, 13e9, 14e9, 15e9, 16e9, 17e9])));
  payloads.set(path('GrossProfit'), '__404__'); // primary 404, no fallback list → metric NaN.
  payloads.set(path('NetCashProvidedByOperatingActivities'), usd(rows([3e9, 4e9, 5e9, 6e9, 4e9, 5e9, 6e9, 8e9])));
  payloads.set(path('PaymentsToAcquirePropertyPlantAndEquipment'), usd(rows([1e9, 1e9, 1e9, 1e9, 1e9, 1e9, 1e9, 2e9])));

  const traj = await fetchFundamentalsTrajectory(toTicker('NVDA'), endpoint);
  for (const v of metric(traj, 'Gross margin')) assert.ok(Number.isNaN(v), `gm=${v} expected NaN`);
  // FCF margin index 7: (8 - 2)/17 ≈ 35.29%; index 0 has no rev pair issue but cfo+capex+rev all present.
  assert.ok(Math.abs(metric(traj, 'FCF margin')[7]! - (6 / 17) * 100) < 1e-9);
});

test('insufficient quarters: 3 quarters → 5 leading NaN, last 3 computed; YoY all NaN', async () => {
  payloads.set(path('Revenues'), usd(rows([10e9, 11e9, 12e9])));
  payloads.set(path('GrossProfit'), usd(rows([6e9, 6.6e9, 7.2e9])));
  const traj = await fetchFundamentalsTrajectory(toTicker('NVDA'), endpoint);
  const gm = metric(traj, 'Gross margin');
  assert.equal(gm.length, 8);
  for (let i = 0; i < 5; i++) assert.ok(Number.isNaN(gm[i]!), `leading NaN at ${i}`);
  for (let i = 5; i < 8; i++) assert.ok(Math.abs(gm[i]! - 60) < 1e-9, `gm[${i}]=${gm[i]}`);
  for (const v of metric(traj, 'Revenue YoY')) assert.ok(Number.isNaN(v));
});

test('empty: every tag missing → all metrics NaN-only, no throw', async () => {
  const traj = await fetchFundamentalsTrajectory(toTicker('NVDA'), endpoint);
  assert.equal(traj.metrics.length, 5);
  for (const m of traj.metrics) {
    assert.equal(m.values.length, 8);
    for (const v of m.values) assert.ok(Number.isNaN(v), `${m.label} value should be NaN, got ${v}`);
  }
});

// ---- Cache wiring (Ralph 11) ----

import { createServer as createBbServer } from 'node:http';
import type { ButterbaseConfig } from '../_butterbase.ts';

type BbHit = { method: string | undefined; url: string | undefined; body: unknown };

async function withBbServer(
  fn: (cfg: ButterbaseConfig, hits: BbHit[], setGet: (body: unknown) => void) => Promise<void>,
): Promise<void> {
  const hits: BbHit[] = [];
  let getBody: unknown = [];
  const srv = createBbServer((req, res) => {
    let buf = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      const parsed: unknown = buf ? JSON.parse(buf) : undefined;
      hits.push({ method: req.method, url: req.url, body: parsed });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.method === 'GET') res.end(JSON.stringify(getBody));
      else res.end(JSON.stringify({ id: 'r', ...(parsed as object) }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  const cfg: ButterbaseConfig = { baseUrl: `http://127.0.0.1:${port}`, serviceKey: 'k' };
  try {
    await fn(cfg, hits, (b) => { getBody = b; });
  } finally {
    await new Promise<void>((res, rej) => srv.close((e) => (e ? rej(e) : res())));
  }
}

test('cache hit: cached payload returned, no XBRL fetch performed', async () => {
  // Sabotage XBRL by NOT setting any payloads — if cache misses, all metrics become NaN.
  // The cached value uses a sentinel metric label not produced by the live path.
  const today = new Date().toISOString().slice(0, 10);
  const cached = {
    ticker: 'NVDA',
    asOf: '2026-05-01T00:00:00.000Z',
    metrics: [{ label: 'CACHED_SENTINEL', values: [1, 2, 3, 4, 5, 6, 7, 8], unit: 'pct' }],
  };
  await withBbServer(async (cfg, hits, setGet) => {
    setGet([{ ticker: 'NVDA', layer: 'fundamentals_v1', snapshot_date: today, payload: cached }]);
    const traj = await fetchFundamentalsTrajectory(toTicker('NVDA'), endpoint, cfg);
    assert.equal(traj.metrics.length, 1);
    assert.equal(traj.metrics[0]?.label, 'CACHED_SENTINEL');
    assert.deepEqual(traj.metrics[0]?.values, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(traj.asOf instanceof Date && traj.asOf.toISOString() === '2026-05-01T00:00:00.000Z');
    // Only a GET to butterbase should have fired (no putSnapshot on hit).
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.method, 'GET');
  });
});

test('cache miss → live XBRL fetch → fire-and-forget write to butterbase', async () => {
  payloads.set(path('Revenues'), usd(rows([10e9, 11e9, 12e9, 13e9, 14e9, 15e9, 16e9, 17e9])));
  await withBbServer(async (cfg, hits, setGet) => {
    setGet([]); // no cached row
    const traj = await fetchFundamentalsTrajectory(toTicker('NVDA'), endpoint, cfg);
    // Live path produces the standard 5 metrics.
    assert.equal(traj.metrics.length, 5);
    assert.deepEqual(traj.metrics.map((m) => m.label),
      ['Revenue YoY', 'FCF margin', 'Gross margin', 'ROIC', 'Net debt / EBITDA']);
    // Wait one tick for the fire-and-forget putSnapshot to land.
    await new Promise((r) => setTimeout(r, 30));
    const methods = hits.map((h) => h.method);
    assert.deepEqual(methods, ['GET', 'POST']);
    const post = hits[1]?.body as { ticker: string; layer: string; payload: { metrics: unknown[] } };
    assert.equal(post.ticker, 'NVDA');
    assert.equal(post.layer, 'fundamentals_v1');
    assert.equal(post.payload.metrics.length, 5);
  });
});

test('cfg=null: behaves as today (no butterbase calls)', async () => {
  payloads.set(path('Revenues'), usd(rows([10e9, 11e9, 12e9, 13e9, 14e9, 15e9, 16e9, 17e9])));
  // Pass null explicitly; if the cache layer fired, this would throw (no server).
  const traj = await fetchFundamentalsTrajectory(toTicker('NVDA'), endpoint, null);
  assert.equal(traj.metrics.length, 5);
});

test('restated quarter: latest filed-date wins', async () => {
  // Same (fy=2025, fp=Q4) emitted twice: original 10-Q then restated 10-K with later filed date.
  const original = { end: '2025-01-26', val: 100e9, fp: 'Q4', fy: 2025, form: '10-Q', filed: '2025-02-20' };
  const restated = { end: '2025-01-26', val: 110e9, fp: 'Q4', fy: 2025, form: '10-K', filed: '2025-03-15' };
  payloads.set(path('Revenues'), usd([
    ...rows([10e9, 12e9, 14e9, 18e9, 13e9, 15e9, 18e9, 22e9]).slice(0, 7),
    original, restated,
  ]));
  payloads.set(path('GrossProfit'), usd(rows([6e9, 7.2e9, 8.4e9, 10.8e9, 7.8e9, 9e9, 10.8e9, 66e9])));
  const traj = await fetchFundamentalsTrajectory(toTicker('NVDA'), endpoint);
  // Gross margin index 7: 66/110 = 60% iff the restated 110e9 (not 100e9) was kept.
  assert.ok(Math.abs(metric(traj, 'Gross margin')[7]! - 60) < 1e-9, `restated value not used: gm=${metric(traj, 'Gross margin')[7]}`);
});
