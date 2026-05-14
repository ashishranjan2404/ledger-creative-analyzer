import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchFinnhubEarnings, fetchQuoteAndShares, fetchEpsEstimates } from '../sources/finnhub.ts';
import { toTicker } from '../_watchlist.ts';

let server: Server;
let endpoint: string;
const seen: { url: string }[] = [];

const AAPL_RESPONSE = {
  earningsCalendar: [
    {
      symbol: 'AAPL',
      date: '2026-05-01',
      hour: 'amc',
      epsEstimate: null,
      revenueEstimate: 95000000000,
    },
  ],
};
const MSFT_EMPTY = { earningsCalendar: [] };
const NVDA_RESPONSE = {
  earningsCalendar: [
    {
      symbol: 'NVDA',
      date: '2026-05-22',
      hour: 'bmo',
      epsEstimate: 5.5,
      revenueEstimate: 28000000000,
    },
  ],
};
const GOOG_UNKNOWN_HOUR = {
  earningsCalendar: [
    {
      symbol: 'GOOG',
      date: '2026-05-15',
      hour: '',
      epsEstimate: null,
      revenueEstimate: null,
    },
  ],
};
const NOKEY_RESPONSE = {}; // earningsCalendar key absent

const FIXTURES: Record<string, unknown> = {
  AAPL: AAPL_RESPONSE,
  MSFT: MSFT_EMPTY,
  NVDA: NVDA_RESPONSE,
  GOOG: GOOG_UNKNOWN_HOUR,
  NOKEY: NOKEY_RESPONSE,
};

let quoteBase: string;

before(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? '' });
    const url = new URL(req.url ?? '/', 'http://x');
    const sym = url.searchParams.get('symbol');
    // Quote + profile2 endpoints for fetchQuoteAndShares tests.
    if (url.pathname === '/quote') {
      if (sym === 'BOOM') { res.writeHead(500); res.end('boom'); return; }
      if (sym === 'NULLC') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ c: null })); return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ c: 950.5 })); return;
    }
    if (url.pathname === '/stock/profile2') {
      if (sym === 'PBOOM') { res.writeHead(500); res.end('boom'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ shareOutstanding: 24500 })); return; // 24,500 million = 24.5B
    }
    // L36 estimate endpoint — happy returns ascending fiscal years, 500 for EBOOM,
    // empty array for EMPTY (free-tier "no analyst coverage" shape).
    if (url.pathname === '/stock/estimate') {
      if (sym === 'EBOOM') { res.writeHead(500); res.end('boom'); return; }
      if (sym === 'EMPTY') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [] })); return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        data: [
          { period: '2025-12-31', epsAvg: 4.0 },
          { period: '2026-12-31', epsAvg: 5.5 },
        ],
      }));
      return;
    }
    if (url.pathname !== '/calendar/earnings') {
      res.writeHead(404);
      res.end();
      return;
    }
    if (sym === 'TSLA') {
      res.writeHead(500);
      res.end('boom');
      return;
    }
    if (sym && sym in FIXTURES) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(FIXTURES[sym]));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}/calendar/earnings`;
  quoteBase = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

const FROM = new Date('2026-05-01T00:00:00Z');
const TO = new Date('2026-05-31T00:00:00Z');

test('maps fields, drops null estimates, normalizes hour, builds URL with all params', async () => {
  const before = seen.length;
  const events = await fetchFinnhubEarnings(
    [toTicker('AAPL'), toTicker('MSFT')],
    FROM,
    TO,
    'tk_test',
    endpoint,
  );
  assert.equal(events.length, 1);
  const ev = events[0]!;
  assert.equal(ev.ticker, 'AAPL');
  assert.equal(ev.companyName, '');
  assert.equal(ev.reportTime, 'AMC');
  assert.equal(ev.source, 'finnhub');
  assert.equal(ev.revenueEstimate, 95000000000);
  assert.ok(ev.reportDate instanceof Date);
  assert.equal(ev.reportDate.toISOString().slice(0, 10), '2026-05-01');
  // exactOptionalPropertyTypes: null estimate must result in absent key, not undefined value.
  assert.equal(Object.prototype.hasOwnProperty.call(ev, 'epsEstimate'), false);

  // URL shape: from/to/symbol/token all present and correctly formatted.
  const aaplCall = seen.slice(before).find((s) => s.url.includes('symbol=AAPL'));
  assert.ok(aaplCall, 'expected AAPL request');
  assert.match(aaplCall.url, /from=2026-05-01/);
  assert.match(aaplCall.url, /to=2026-05-31/);
  assert.match(aaplCall.url, /token=tk_test/);
});

test('bmo maps to BMO and preserves numeric eps', async () => {
  const events = await fetchFinnhubEarnings([toTicker('NVDA')], FROM, TO, 'k', endpoint);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.reportTime, 'BMO');
  assert.equal(events[0]?.epsEstimate, 5.5);
});

test("hour='' maps to unknown", async () => {
  const events = await fetchFinnhubEarnings([toTicker('GOOG')], FROM, TO, 'k', endpoint);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.reportTime, 'unknown');
});

test('missing earningsCalendar key returns []', async () => {
  const events = await fetchFinnhubEarnings([toTicker('NOKEY')], FROM, TO, 'k', endpoint);
  assert.deepEqual(events, []);
});

test('empty tickers array returns [] without firing HTTP', async () => {
  const before = seen.length;
  const events = await fetchFinnhubEarnings([], FROM, TO, 'k', endpoint);
  assert.deepEqual(events, []);
  assert.equal(seen.length, before, 'no HTTP requests should have been made');
});

test('per-ticker error is swallowed; siblings still return', async () => {
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (msg: string) => {
    warns.push(msg);
  };
  try {
    const events = await fetchFinnhubEarnings(
      [toTicker('TSLA'), toTicker('NVDA')],
      FROM,
      TO,
      'k',
      endpoint,
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.ticker, 'NVDA');
    assert.equal(warns.length, 1);
    assert.match(warns[0]!, /\[finnhub\] TSLA:/);
  } finally {
    console.warn = orig;
  }
});

// === fetchQuoteAndShares: L5 current-price + shares-outstanding wiring ===
test('fetchQuoteAndShares: happy path returns price + shares (MILLIONS → absolute)', async () => {
  const out = await fetchQuoteAndShares(toTicker('NVDA'), 'tk', quoteBase);
  assert.ok(out, 'expected non-null payload');
  assert.equal(out.price, 950.5);
  // shareOutstanding=24500 (millions) → 24500 * 1e6 = 2.45e10
  assert.equal(out.sharesOutstanding, 24_500_000_000);
});

test('fetchQuoteAndShares: 500 on quote endpoint → null (graceful)', async () => {
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (msg: string) => { warns.push(msg); };
  try {
    const out = await fetchQuoteAndShares(toTicker('BOOM'), 'tk', quoteBase);
    assert.equal(out, null);
    assert.equal(warns.length, 1);
    assert.match(warns[0]!, /\[finnhub-quote\] BOOM:/);
  } finally {
    console.warn = orig;
  }
});

test('fetchQuoteAndShares: 500 on profile2 endpoint → null (graceful)', async () => {
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (msg: string) => { warns.push(msg); };
  try {
    const out = await fetchQuoteAndShares(toTicker('PBOOM'), 'tk', quoteBase);
    assert.equal(out, null);
    assert.equal(warns.length, 1);
  } finally {
    console.warn = orig;
  }
});

// === fetchEpsEstimates: L36 forward-EPS YoY data ===
test('fetchEpsEstimates: happy path returns current + priorYear from sorted periods', async () => {
  const out = await fetchEpsEstimates(toTicker('NVDA'), 'tk', quoteBase);
  assert.ok(out, 'expected non-null payload');
  // ascending sort → last = 2026 (current), second-last = 2025 (prior)
  assert.equal(out.current, 5.5);
  assert.equal(out.priorYear, 4.0);
});

test('fetchEpsEstimates: 500 → null (graceful with warning)', async () => {
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (msg: string) => { warns.push(msg); };
  try {
    const out = await fetchEpsEstimates(toTicker('EBOOM'), 'tk', quoteBase);
    assert.equal(out, null);
    assert.equal(warns.length, 1);
    assert.match(warns[0]!, /\[finnhub-estimate\] EBOOM:/);
  } finally {
    console.warn = orig;
  }
});

test('fetchEpsEstimates: empty data[] → null (no analyst coverage)', async () => {
  const out = await fetchEpsEstimates(toTicker('EMPTY'), 'tk', quoteBase);
  assert.equal(out, null);
});

test('fetchQuoteAndShares: null `c` (closed market / no data) → null', async () => {
  // NULLC quote returns {c: null}; finnhub returns c:0 for unknown symbols too.
  // Either way we reject — passing 0/NaN to valuation would render misleading multiples.
  const out = await fetchQuoteAndShares(toTicker('NULLC'), 'tk', quoteBase);
  assert.equal(out, null);
});
