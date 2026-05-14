import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchValuationContext, type SectorPriorsLookup } from '../layers/valuation.ts';
import { _resetXbrlCache } from '../sources/edgar_xbrl.ts';
import { _resetCikCache, tickerToCik } from '../sources/edgar.ts';
import { toTicker } from '../_watchlist.ts';

const NVDA_CIK = '0001045810';
const TICKERS_JSON = JSON.stringify({
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
});
const BASE = `/api/xbrl/companyconcept/CIK${NVDA_CIK}/us-gaap`;
const SUB = `/submissions/CIK${NVDA_CIK}.json`;
const PATHS = {
  opInc: `${BASE}/OperatingIncomeLoss.json`,
  ocf: `${BASE}/NetCashProvidedByOperatingActivities.json`,
  capex: `${BASE}/PaymentsToAcquirePropertyPlantAndEquipment.json`,
  debt: `${BASE}/LongTermDebt.json`,
  cash: `${BASE}/CashAndCashEquivalentsAtCarryingValue.json`,
  equity: `${BASE}/StockholdersEquity.json`,
  revenue: `${BASE}/Revenues.json`,
  revenueAsc606: `${BASE}/RevenueFromContractWithCustomerExcludingAssessedTax.json`,
};
const usd = (e: unknown[]) => JSON.stringify({ units: { USD: e } });

// Build N quarters of synthetic data ending at given date, going back per-quarter.
// fp cycles Q1..Q4. val is constant unless overridden.
function quarters(n: number, val: number, opts?: { firstEnd?: string }): unknown[] {
  const fps = ['Q1', 'Q2', 'Q3', 'Q4'];
  const startEnd = opts?.firstEnd ? new Date(opts.firstEnd) : new Date('2025-03-31');
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(startEnd);
    d.setMonth(d.getMonth() - 3 * i);
    out.push({
      end: d.toISOString().slice(0, 10),
      val,
      fp: fps[i % 4]!,
      fy: 2025 - Math.floor(i / 4),
      form: '10-Q',
      filed: d.toISOString().slice(0, 10),
    });
  }
  return out;
}

let payloadByPath = new Map<string, string>();
let server: Server;
let endpoint = '';

before(async () => {
  server = createServer((req, res) => {
    const body = payloadByPath.get(req.url ?? '/');
    if (!body || body === '__404__') return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/json' }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  payloadByPath = new Map([
    ['/files/company_tickers.json', TICKERS_JSON],
    [SUB, JSON.stringify({ sic: '7372', sicDescription: 'Software' })],
  ]);
  _resetXbrlCache();
  _resetCikCache();
  await tickerToCik(toTicker('NVDA'), endpoint);
});

// Default equity + revenue so pre-L34 tests still see finite P/B + EV/Sales.
// Tests that probe missing-equity / missing-revenue paths overwrite via `__404__`.
function seedEquityRevenueDefaults(): void {
  payloadByPath.set(PATHS.equity, usd(quarters(24, 2e10)));
  payloadByPath.set(PATHS.revenue, usd(quarters(24, 8e9)));
}

after(async () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))));

function setHistory(opInc: number, ocf: number, capex: number, debt: number, cash: number, n = 24): void {
  payloadByPath.set(PATHS.opInc, usd(quarters(n, opInc)));
  payloadByPath.set(PATHS.ocf, usd(quarters(n, ocf)));
  payloadByPath.set(PATHS.capex, usd(quarters(n, capex)));
  payloadByPath.set(PATHS.debt, usd(quarters(n, debt)));
  payloadByPath.set(PATHS.cash, usd(quarters(n, cash)));
}

// L34/L35: separate helper so tests can choose equity + revenue independently.
function setEquityAndRevenue(equity: number, revenue: number, n = 24): void {
  payloadByPath.set(PATHS.equity, usd(quarters(n, equity)));
  payloadByPath.set(PATHS.revenue, usd(quarters(n, revenue)));
}

test('happy path: current + median5yr populated; sectorMedian via 2-digit SIC prefix', async () => {
  setHistory(1e9, 1.2e9, 0.2e9, 5e9, 10e9);
  seedEquityRevenueDefaults();
  const calls: string[] = [];
  const lookup: SectorPriorsLookup = (s) => {
    calls.push(s);
    return s === '73' ? { fwdPE: 25, evEbitda: 18, fcfYield: 4 } : undefined;
  };
  const ctx = await fetchValuationContext(toTicker('NVDA'), 100, 1e9, lookup, endpoint);
  assert.equal(ctx.sectorSic, '7372');
  assert.deepEqual(calls, ['73'], 'lookup called with 2-digit prefix');
  const m = Object.fromEntries(ctx.metrics.map((x) => [x.label, x]));
  // marketCap=1e11, ttmOp=4e9, EV = 1e11 + 5e9 - 10e9 = 9.5e10
  assert.ok(Math.abs(m['Fwd P/E']!.current - 1e11 / (4e9 * 1.05)) < 1e-6);
  assert.ok(Math.abs(m['EV/EBITDA']!.current - 9.5e10 / 4e9) < 1e-6);
  // FCF = (1.2e9 - 0.2e9)*4 / 1e11 *100 = 4
  assert.ok(Math.abs(m['FCF yield']!.current - 4) < 1e-6);
  // fwdEPS YoY medians are intentionally NaN (L36 has no historical context).
  for (const x of ctx.metrics) {
    if (x.label === 'fwdEPS YoY') continue;
    assert.ok(Number.isFinite(x.median5yr), `${x.label} median5yr`);
  }
  assert.equal(m['Fwd P/E']!.sectorMedian, 25);
  assert.equal(m['EV/EBITDA']!.sectorMedian, 18);
  assert.equal(m['FCF yield']!.sectorMedian, 4);
});

test('missing sectorPriors: sectorMedian NaN; other fields populated', async () => {
  setHistory(1e9, 1.2e9, 0.2e9, 5e9, 10e9);
  seedEquityRevenueDefaults();
  const ctx = await fetchValuationContext(toTicker('NVDA'), 100, 1e9, undefined, endpoint);
  for (const x of ctx.metrics) {
    assert.ok(Number.isNaN(x.sectorMedian), `${x.label} sectorMedian`);
    // fwdEPS YoY current depends on FINNHUB_KEY (absent here) → NaN by design.
    if (x.label === 'fwdEPS YoY') {
      assert.ok(Number.isNaN(x.current), 'fwdEPS NaN without key');
      continue;
    }
    assert.ok(Number.isFinite(x.current), `${x.label} current`);
  }
});

test('divide-by-zero: OpInc=0 ⇒ Fwd P/E + EV/EBITDA NaN, no throw', async () => {
  setHistory(0, 1.2e9, 0.2e9, 5e9, 10e9);
  const ctx = await fetchValuationContext(toTicker('NVDA'), 100, 1e9, undefined, endpoint);
  const m = Object.fromEntries(ctx.metrics.map((x) => [x.label, x]));
  assert.ok(Number.isNaN(m['Fwd P/E']!.current));
  assert.ok(Number.isNaN(m['EV/EBITDA']!.current));
  assert.ok(Number.isFinite(m['FCF yield']!.current)); // FCF doesn't depend on OpInc
});

test('insufficient history (2 quarters) ⇒ median5yr NaN, current NaN too', async () => {
  setHistory(1e9, 1.2e9, 0.2e9, 5e9, 10e9, 2);
  const ctx = await fetchValuationContext(toTicker('NVDA'), 100, 1e9, undefined, endpoint);
  for (const x of ctx.metrics) {
    assert.ok(Number.isNaN(x.median5yr), `${x.label} median5yr should be NaN`);
  }
  // TTM also NaN with <4 quarters
  const m = Object.fromEntries(ctx.metrics.map((x) => [x.label, x]));
  assert.ok(Number.isNaN(m['Fwd P/E']!.current));
});

// === L34: P/B ratio ===
test('L34 P/B: current = marketCap/equity; 5yr median + sector populated', async () => {
  setHistory(1e9, 1.2e9, 0.2e9, 5e9, 10e9);
  setEquityAndRevenue(2e10, 8e9);
  // FINNHUB_KEY absent — fwdEPS YoY → n/a, but P/B/EV/Sales still compute.
  const ctx = await fetchValuationContext(
    toTicker('NVDA'), 100, 1e9,
    () => ({ fwdPE: 25, evEbitda: 18, fcfYield: 4, pb: 3, evSales: 6 }),
    endpoint,
  );
  const m = Object.fromEntries(ctx.metrics.map((x) => [x.label, x]));
  // marketCap = 1e11; equity = 2e10 → P/B = 5
  assert.ok(Math.abs(m['P/B']!.current - 5) < 1e-6, `got ${m['P/B']!.current}`);
  assert.ok(Math.abs(m['P/B']!.median5yr - 5) < 1e-6, '5yr median = same since equity constant');
  assert.equal(m['P/B']!.sectorMedian, 3);
  assert.equal(m['P/B']!.unit, 'multiple');
});

test('L34 P/B: missing StockholdersEquity ⇒ n/a (no throw)', async () => {
  setHistory(1e9, 1.2e9, 0.2e9, 5e9, 10e9);
  // equity 404; revenue still set so EV/Sales survives
  payloadByPath.set(PATHS.revenue, usd(quarters(24, 8e9)));
  const ctx = await fetchValuationContext(toTicker('NVDA'), 100, 1e9, undefined, endpoint);
  const m = Object.fromEntries(ctx.metrics.map((x) => [x.label, x]));
  assert.ok(Number.isNaN(m['P/B']!.current), 'P/B current NaN when equity absent');
  assert.ok(Number.isFinite(m['EV/Sales']!.current), 'sibling EV/Sales unaffected');
});

// === L35: EV/Sales ===
test('L35 EV/Sales: current = EV/ttmRevenue; 5yr median + sector populated', async () => {
  setHistory(1e9, 1.2e9, 0.2e9, 5e9, 10e9);
  setEquityAndRevenue(2e10, 8e9);
  const ctx = await fetchValuationContext(
    toTicker('NVDA'), 100, 1e9,
    () => ({ fwdPE: 25, evEbitda: 18, fcfYield: 4, pb: 3, evSales: 6 }),
    endpoint,
  );
  const m = Object.fromEntries(ctx.metrics.map((x) => [x.label, x]));
  // EV = 1e11 + 5e9 - 10e9 = 9.5e10; ttm rev = 8e9 * 4 = 3.2e10 → EV/Sales = ~2.969
  const expected = 9.5e10 / 3.2e10;
  assert.ok(Math.abs(m['EV/Sales']!.current - expected) < 1e-6);
  assert.ok(Number.isFinite(m['EV/Sales']!.median5yr));
  assert.equal(m['EV/Sales']!.sectorMedian, 6);
});

test('L35 EV/Sales: uses ASC-606 fallback when Revenues absent', async () => {
  setHistory(1e9, 1.2e9, 0.2e9, 5e9, 10e9);
  payloadByPath.set(PATHS.equity, usd(quarters(24, 2e10)));
  // Revenues 404; ASC-606 tag present.
  payloadByPath.set(PATHS.revenueAsc606, usd(quarters(24, 8e9)));
  const ctx = await fetchValuationContext(toTicker('NVDA'), 100, 1e9, undefined, endpoint);
  const m = Object.fromEntries(ctx.metrics.map((x) => [x.label, x]));
  assert.ok(Number.isFinite(m['EV/Sales']!.current), 'fallback tag should yield finite EV/Sales');
});

// === L36: Forward EPS YoY ===
test('L36 fwdEPS YoY: missing FINNHUB_KEY ⇒ n/a, sibling metrics finite', async () => {
  setHistory(1e9, 1.2e9, 0.2e9, 5e9, 10e9);
  setEquityAndRevenue(2e10, 8e9);
  // finnhubKey null ⇒ no fetch attempted; fwdEPS row still present, just NaN.
  const ctx = await fetchValuationContext(toTicker('NVDA'), 100, 1e9, undefined, endpoint, null);
  const m = Object.fromEntries(ctx.metrics.map((x) => [x.label, x]));
  assert.ok(Number.isNaN(m['fwdEPS YoY']!.current), 'fwdEPS current NaN sans key');
  assert.ok(Number.isNaN(m['fwdEPS YoY']!.median5yr), 'fwdEPS median5yr always NaN');
  assert.ok(Number.isNaN(m['fwdEPS YoY']!.sectorMedian), 'fwdEPS sectorMedian always NaN');
  assert.equal(m['fwdEPS YoY']!.unit, 'pct');
  // Siblings unaffected by missing key.
  assert.ok(Number.isFinite(m['P/B']!.current), 'P/B unaffected');
  assert.ok(Number.isFinite(m['EV/Sales']!.current), 'EV/Sales unaffected');
});

test('SIC fetch failure ⇒ sectorSic empty, layer continues with multiples', async () => {
  setHistory(1e9, 1.2e9, 0.2e9, 5e9, 10e9);
  seedEquityRevenueDefaults();
  payloadByPath.set(SUB, '__404__');
  const ctx = await fetchValuationContext(
    toTicker('NVDA'), 100, 1e9,
    () => ({ fwdPE: 25, evEbitda: 18, fcfYield: 4 }),
    endpoint,
  );
  assert.equal(ctx.sectorSic, '');
  // No SIC ⇒ no lookup call ⇒ sectorMedian NaN, but multiples still computed.
  for (const x of ctx.metrics) {
    assert.ok(Number.isNaN(x.sectorMedian), `${x.label} sectorMedian NaN without SIC`);
    // fwdEPS YoY needs FINNHUB_KEY (not set here) → NaN current is expected.
    if (x.label === 'fwdEPS YoY') continue;
    assert.ok(Number.isFinite(x.current), `${x.label} current finite`);
  }
});
