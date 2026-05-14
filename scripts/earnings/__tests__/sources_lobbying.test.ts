import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchLobbying, TICKER_TO_LOBBYING_CLIENT } from '../sources/lobbying.ts';
import { toTicker } from '../_watchlist.ts';

type RouteResp = { status: number; body: unknown };
// Routes keyed by `client_name` query parameter (period-agnostic — the test
// only cares which ticker the request resolved to).
let routes: Map<string, RouteResp>;
let hits: Map<string, number>;
let server: Server;
let endpoint = '';

const NVDA = toTicker('NVDA');
const AAPL = toTicker('AAPL');
const ZZZZ = toTicker('ZZZZ'); // valid format, not in TICKER_TO_LOBBYING_CLIENT

function clientNameOf(req: IncomingMessage): string {
  const url = new URL(req.url ?? '', 'http://x');
  return url.searchParams.get('client_name') ?? '';
}

function pick(name: string): RouteResp {
  return routes.get(name) ?? routes.get('*') ?? { status: 200, body: { results: [] } };
}

before(async () => {
  server = createServer((req, res) => {
    const name = clientNameOf(req);
    hits.set(name, (hits.get(name) ?? 0) + 1);
    const r = pick(name);
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/filings/`;
});

after(async () => {
  await new Promise<void>((ok, ko) => server.close((e) => (e ? ko(e) : ok())));
});

beforeEach(() => {
  routes = new Map();
  hits = new Map();
});

test('maps + filters to tickers in TICKER_TO_LOBBYING_CLIENT', async () => {
  routes.set(TICKER_TO_LOBBYING_CLIENT['NVDA']!, {
    status: 200,
    body: {
      results: [
        { filing_year: 2026, filing_period: 'first_quarter',
          client: { name: 'NVIDIA Corporation' }, income: '250000.00', expenses: null,
          lobbying_activities: [{ general_issue_code: 'CPT' }] },
      ],
    },
  });
  const rows = await fetchLobbying([NVDA], 1, endpoint);
  assert.equal(rows.length, 1);
  const r = rows[0]!;
  assert.equal(r.ticker, 'NVDA');
  assert.equal(r.amount, 250000);
  assert.equal(r.client, 'NVIDIA Corporation');
  assert.equal(r.issue, 'CPT');
  assert.equal(typeof r.year, 'number');
  assert.ok(r.quarter >= 1 && r.quarter <= 4);
});

test('ticker not in lookup → no HTTP request for that ticker', async () => {
  // Only NVDA route is set; ZZZZ has no entry in TICKER_TO_LOBBYING_CLIENT.
  routes.set(TICKER_TO_LOBBYING_CLIENT['NVDA']!, {
    status: 200, body: { results: [] },
  });
  await fetchLobbying([ZZZZ, NVDA], 2, endpoint);
  // Should have hit NVDA's client name (across 2 periods) and never anything
  // resembling ZZZZ. The map has no ZZZZ entry, so no request keyed by it.
  assert.ok((hits.get(TICKER_TO_LOBBYING_CLIENT['NVDA']!) ?? 0) >= 1);
  for (const key of hits.keys()) {
    assert.notEqual(key, 'ZZZZ');
    assert.notEqual(key, '');
  }
});

test('per-ticker 404 swallowed, sibling tickers still return', async () => {
  routes.set(TICKER_TO_LOBBYING_CLIENT['NVDA']!, { status: 404, body: { detail: 'nf' } });
  routes.set(TICKER_TO_LOBBYING_CLIENT['AAPL']!, {
    status: 200,
    body: {
      results: [
        { filing_year: 2026, filing_period: 'first_quarter',
          client: { name: 'Apple Inc' }, income: 100000,
          lobbying_activities: [{ general_issue_code: 'TEC' }] },
      ],
    },
  });
  const rows = await fetchLobbying([NVDA, AAPL], 1, endpoint);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.ticker, 'AAPL');
  assert.equal(rows[0]?.amount, 100000);
});

test('amount parses both string and number income/expenses', async () => {
  routes.set(TICKER_TO_LOBBYING_CLIENT['NVDA']!, {
    status: 200,
    body: {
      results: [
        // string income
        { filing_year: 2026, filing_period: 'first_quarter',
          client: { name: 'NVIDIA' }, income: '150000.00', expenses: null,
          lobbying_activities: [] },
        // numeric income
        { filing_year: 2025, filing_period: 'fourth_quarter',
          client: { name: 'NVIDIA' }, income: 200000, expenses: null,
          lobbying_activities: [] },
        // expenses fallback when income is null
        { filing_year: 2025, filing_period: 'third_quarter',
          client: { name: 'NVIDIA' }, income: null, expenses: '75000.50',
          lobbying_activities: [] },
      ],
    },
  });
  const rows = await fetchLobbying([NVDA], 4, endpoint);
  // The fixture server returns the same 3-row payload for every queried
  // period — we just need to assert the parser sees all three amount shapes.
  const amounts = new Set(rows.map((r) => r.amount));
  assert.ok(amounts.has(150000));
  assert.ok(amounts.has(200000));
  assert.ok(amounts.has(75000.5));
});

test('empty results → []', async () => {
  routes.set(TICKER_TO_LOBBYING_CLIENT['NVDA']!, { status: 200, body: { results: [] } });
  const rows = await fetchLobbying([NVDA], 1, endpoint);
  assert.deepEqual(rows, []);
});
