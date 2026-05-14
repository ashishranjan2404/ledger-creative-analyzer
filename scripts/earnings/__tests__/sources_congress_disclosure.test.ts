import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchCongressionalTrades } from '../sources/congress_disclosure.ts';
import { toTicker } from '../_watchlist.ts';

type RouteResp = { status: number; body: unknown };
let routes: Map<string, RouteResp>;
let hits: string[];
let server: Server;
let senateUrl = '';
let houseUrl = '';

const NVDA = toTicker('NVDA');
const AAPL = toTicker('AAPL');
const DAY = 86_400_000;
const NOW = Date.now();
const recent = (d: number): string => new Date(NOW - d * DAY).toISOString().slice(0, 10);

function route(req: IncomingMessage): RouteResp {
  return routes.get(req.url ?? '') ?? { status: 404, body: { error: 'nf' } };
}

before(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    const r = route(req);
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  senateUrl = `http://127.0.0.1:${port}/senate.json`;
  houseUrl = `http://127.0.0.1:${port}/house.json`;
});

after(async () => {
  await new Promise<void>((ok, ko) => server.close((e) => (e ? ko(e) : ok())));
});

beforeEach(() => {
  routes = new Map();
  hits = [];
});

test('maps + filters senate + house trades to watchlist and sinceDays', async () => {
  routes.set('/senate.json', {
    status: 200,
    body: [
      { senator: 'Tuberville, Tommy', party: 'R', ticker: 'NVDA',
        transaction_date: recent(5), disclosure_date: recent(2),
        type: 'Purchase', amount: '$1,001 - $15,000' },
      { senator: 'Old, Tim', party: 'D', ticker: 'NVDA',
        transaction_date: recent(100), disclosure_date: recent(95),
        type: 'Sale (Partial)', amount: '$15,001 - $50,000' }, // outside 30d
      { senator: 'NotTracked', party: 'I', ticker: 'XYZ',
        transaction_date: recent(1), disclosure_date: recent(1),
        type: 'Purchase', amount: '$1' }, // off-watchlist
    ],
  });
  routes.set('/house.json', {
    status: 200,
    body: [
      { representative: 'Pelosi, Nancy', ticker: 'AAPL',
        transaction_date: recent(10), disclosure_date: recent(7),
        type: 'sale_full', amount: '$1,000,001 - $5,000,000' },
    ],
  });
  const rows = await fetchCongressionalTrades([NVDA, AAPL], 30, senateUrl, houseUrl);
  assert.equal(rows.length, 2);
  // Sorted desc by transactionDate: NVDA (5d) before AAPL (10d).
  assert.equal(rows[0]?.ticker, 'NVDA');
  assert.equal(rows[0]?.chamber, 'Senate');
  assert.equal(rows[0]?.transaction, 'Purchase');
  assert.equal(rows[0]?.representative, 'Tuberville, Tommy');
  assert.equal(rows[1]?.ticker, 'AAPL');
  assert.equal(rows[1]?.chamber, 'House');
  assert.equal(rows[1]?.transaction, 'Sale');
  assert.equal(rows[1]?.representative, 'Pelosi, Nancy');
  assert.equal(rows[1]?.party, ''); // House feed has no party field
});

test('malformed dates dropped', async () => {
  routes.set('/senate.json', {
    status: 200,
    body: [
      { senator: 'A', party: 'D', ticker: 'NVDA',
        transaction_date: 'not-a-date', disclosure_date: recent(1),
        type: 'Purchase', amount: '$1' },
    ],
  });
  routes.set('/house.json', { status: 200, body: [] });
  const rows = await fetchCongressionalTrades([NVDA], 30, senateUrl, houseUrl);
  assert.equal(rows.length, 0);
});

test('Senate-only returns if House 404s (Promise.allSettled isolation)', async () => {
  routes.set('/senate.json', {
    status: 200,
    body: [{ senator: 'A', party: 'D', ticker: 'NVDA',
      transaction_date: recent(2), disclosure_date: recent(1),
      type: 'Purchase', amount: '$1 - $2' }],
  });
  // /house.json intentionally missing -> 404
  const rows = await fetchCongressionalTrades([NVDA], 30, senateUrl, houseUrl);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.chamber, 'Senate');
});

test('chamber field set correctly per source', async () => {
  routes.set('/senate.json', {
    status: 200,
    body: [{ senator: 'S', party: 'R', ticker: 'NVDA',
      transaction_date: recent(1), disclosure_date: recent(1),
      type: 'purchase', amount: '$1' }],
  });
  routes.set('/house.json', {
    status: 200,
    body: [{ representative: 'H', ticker: 'NVDA',
      transaction_date: recent(2), disclosure_date: recent(2),
      type: 'purchase', amount: '$1' }],
  });
  const rows = await fetchCongressionalTrades([NVDA], 30, senateUrl, houseUrl);
  assert.equal(rows.length, 2);
  const chambers = rows.map((r) => r.chamber).sort();
  assert.deepEqual(chambers, ['House', 'Senate']);
});

test('empty tickers => [] with 0 HTTP', async () => {
  const rows = await fetchCongressionalTrades([], 30, senateUrl, houseUrl);
  assert.deepEqual(rows, []);
  assert.equal(hits.length, 0);
});
