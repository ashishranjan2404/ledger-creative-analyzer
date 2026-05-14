import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchPolygonEarnings } from '../sources/polygon.ts';
import { toTicker } from '../_watchlist.ts';

let server: Server;
let base = '';
let lastUrl = '';

const AAPL_RESPONSE = {
  status: 'OK',
  results: [
    {
      tickers: ['AAPL'],
      filing_date: '2026-05-02',
      end_date: '2026-03-29',
      company_name: 'Apple Inc.',
    },
    {
      tickers: ['AAPL'],
      filing_date: 'not-a-date',
    },
    {
      tickers: ['AAPL'],
    },
  ],
};
const MSFT_EMPTY = { status: 'OK', results: [] };
const NVDA_NO_FILING_DATE = {
  status: 'OK',
  // exercises the end_date fallback in toEvent
  results: [{ tickers: ['NVDA'], end_date: '2026-04-30', company_name: 'NVIDIA' }],
};
// API mis-keys the response: ticker field says WRONG even though we asked for AAPL.
const AAPL_MISKEYED = {
  status: 'OK',
  results: [{ tickers: ['WRONG'], filing_date: '2026-05-15', company_name: 'Wrong Co' }],
};

before(async () => {
  server = createServer((req, res) => {
    lastUrl = req.url ?? '';
    const url = new URL(lastUrl, 'http://x');
    if (url.pathname !== '/vX/reference/financials') {
      res.writeHead(404);
      res.end();
      return;
    }
    const sym = url.searchParams.get('ticker');
    const apiKey = url.searchParams.get('apiKey');
    if (sym === 'AAPL' && apiKey === 'miskey') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(AAPL_MISKEYED));
      return;
    }
    if (sym === 'AAPL') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(AAPL_RESPONSE));
      return;
    }
    if (sym === 'MSFT') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(MSFT_EMPTY));
      return;
    }
    if (sym === 'NVDA') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(NVDA_NO_FILING_DATE));
      return;
    }
    if (sym === 'TSLA') {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('boom');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

const FROM = new Date('2026-05-01T00:00:00Z');
const TO = new Date('2026-05-31T00:00:00Z');

test('happy path: maps filing_date, drops invalid + missing dates', async () => {
  const events = await fetchPolygonEarnings([toTicker('AAPL')], FROM, TO, 'k', base);
  assert.equal(events.length, 1);
  const ev = events[0]!;
  assert.equal(ev.ticker, 'AAPL');
  assert.equal(ev.companyName, ''); // spec: empty string even when API returns company_name
  assert.equal(ev.reportTime, 'unknown');
  assert.equal(ev.source, 'polygon');
  assert.equal(ev.epsEstimate, undefined);
  assert.equal(ev.revenueEstimate, undefined);
  assert.ok(ev.reportDate instanceof Date);
  assert.equal(ev.reportDate.toISOString().slice(0, 10), '2026-05-02');
  assert.equal('epsEstimate' in ev, false);
  assert.equal('revenueEstimate' in ev, false);
});

test('empty response yields no events', async () => {
  const events = await fetchPolygonEarnings([toTicker('MSFT')], FROM, TO, 'k', base);
  assert.deepEqual(events, []);
});

test('end_date fallback when filing_date missing', async () => {
  const events = await fetchPolygonEarnings([toTicker('NVDA')], FROM, TO, 'k', base);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.reportDate.toISOString().slice(0, 10), '2026-04-30');
  assert.equal(events[0]?.companyName, ''); // spec compliance even with company_name in payload
});

test('per-ticker error swallowed; sibling ticker still returns', async () => {
  const events = await fetchPolygonEarnings(
    [toTicker('TSLA'), toTicker('AAPL')],
    FROM,
    TO,
    'k',
    base,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.ticker, 'AAPL');
});

test('url params include filing_date.gte/lte and encoded apiKey', async () => {
  await fetchPolygonEarnings([toTicker('AAPL')], FROM, TO, 'sk_test', base);
  assert.match(lastUrl, /ticker=AAPL/);
  assert.match(lastUrl, /filing_date\.gte=2026-05-01/);
  assert.match(lastUrl, /filing_date\.lte=2026-05-31/);
  assert.match(lastUrl, /apiKey=sk_test/);
});

test('mis-keyed response: event ticker is the request ticker, not response tickers[0]', async () => {
  // API returns tickers: ['WRONG'] but we asked for AAPL — defend against API bug.
  const events = await fetchPolygonEarnings([toTicker('AAPL')], FROM, TO, 'miskey', base);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.ticker, 'AAPL');
});
