import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchFinnhubEarnings } from '../sources/finnhub.ts';
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

before(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? '' });
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/calendar/earnings') {
      res.writeHead(404);
      res.end();
      return;
    }
    const sym = url.searchParams.get('symbol');
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
