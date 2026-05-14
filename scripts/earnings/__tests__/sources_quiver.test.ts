import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  fetchCongressionalTrades,
  fetchGovContracts,
  fetchLobbying,
} from '../sources/quiver.ts';
import { toTicker } from '../_watchlist.ts';

type RouteResp = { status: number; body: unknown };
// path -> response (status + body); '*' is a wildcard fallback.
let routes: Map<string, RouteResp>;
let lastAuth: string | undefined;
let server: Server;
let endpoint = '';

const NVDA = toTicker('NVDA');
const AAPL = toTicker('AAPL');
const DAY = 86_400_000;
const NOW = Date.now();
const recent = (d: number): string => new Date(NOW - d * DAY).toISOString().slice(0, 10);

function route(req: IncomingMessage): RouteResp {
  return routes.get(req.url ?? '') ?? routes.get('*') ?? { status: 404, body: { error: 'nf' } };
}

before(async () => {
  server = createServer((req, res) => {
    lastAuth = req.headers.authorization;
    const r = route(req);
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/beta`;
});

after(async () => {
  await new Promise<void>((ok, ko) => server.close((e) => (e ? ko(e) : ok())));
});

beforeEach(() => {
  routes = new Map();
  lastAuth = undefined;
});

test('congressional: Authorization is "Token <key>", maps + filters sinceDays', async () => {
  routes.set('/beta/historical/congresstrading/NVDA', {
    status: 200,
    body: [
      { Representative: 'Pelosi, Nancy', Party: 'D', Chamber: 'House',
        TransactionDate: recent(5), ReportDate: recent(2),
        Transaction: 'Purchase', Range: '$1,001 - $15,000' },
      { Representative: 'Old, Tim', Party: 'R', Chamber: 'Senate',
        TransactionDate: recent(100), ReportDate: recent(95),
        Transaction: 'Sale', Range: '$15,001 - $50,000' }, // outside 30d window
      { Representative: 'BadDate', Party: 'D', Chamber: 'House',
        TransactionDate: 'not-a-date', ReportDate: recent(1),
        Transaction: 'Sale', Range: '$1' }, // dropped
    ],
  });
  const rows = await fetchCongressionalTrades([NVDA], 30, 'sk_q', endpoint);
  assert.equal(lastAuth, 'Token sk_q');
  assert.equal(rows.length, 1);
  const r = rows[0]!;
  assert.equal(r.ticker, 'NVDA');
  assert.equal(r.representative, 'Pelosi, Nancy');
  assert.equal(r.party, 'D');
  assert.equal(r.chamber, 'House');
  assert.equal(r.transaction, 'Purchase');
  assert.equal(r.amount, '$1,001 - $15,000');
  assert.ok(r.transactionDate instanceof Date);
});

test('congressional: per-ticker 404 swallowed, sibling tickers still return', async () => {
  routes.set('/beta/historical/congresstrading/NVDA', { status: 404, body: { error: 'nf' } });
  routes.set('/beta/historical/congresstrading/AAPL', {
    status: 200,
    body: [{ Representative: 'X', Party: 'I', Chamber: 'House',
      TransactionDate: recent(1), ReportDate: recent(1),
      Transaction: 'Purchase', Range: '$1 - $2' }],
  });
  const rows = await fetchCongressionalTrades([NVDA, AAPL], 30, 'k', endpoint);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.ticker, 'AAPL');
});

test('lobbying: groups by quarter, filters to N quarters back', async () => {
  const now = new Date();
  const curY = now.getUTCFullYear();
  const curQ = Math.floor(now.getUTCMonth() / 3) + 1;
  routes.set('/beta/historical/lobbying/NVDA', {
    status: 200,
    body: [
      { Year: curY, Quarter: curQ, Amount: 100000, Client: 'NVIDIA', Issue: 'AI policy' },
      { Year: curY - 5, Quarter: 1, Amount: 1, Client: 'OLD', Issue: 'X' }, // dropped (too old)
      { Year: curY, Quarter: 'bad' as unknown as number, Amount: 1 }, // dropped (bad quarter)
    ],
  });
  const rows = await fetchLobbying([NVDA], 1, 'k', endpoint);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.amount, 100000);
  assert.equal(rows[0]?.client, 'NVIDIA');
  assert.equal(rows[0]?.year, curY);
  assert.equal(rows[0]?.quarter, curQ);
});

test('gov contracts: maps Dollars field, filters by sinceDays, drops bad dates', async () => {
  routes.set('/beta/historical/govcontracts/NVDA', {
    status: 200,
    body: [
      { Date: recent(10), Dollars: 5_000_000, Agency: 'DoD', Description: 'GPUs' },
      { Date: recent(200), Dollars: 999, Agency: 'NASA', Description: 'old' }, // outside 90d
      { Date: 'not-a-date', Dollars: 1, Agency: 'X', Description: 'bad' }, // dropped
    ],
  });
  const rows = await fetchGovContracts([NVDA], 90, 'k', endpoint);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.amount, 5_000_000);
  assert.equal(rows[0]?.agency, 'DoD');
  assert.equal(rows[0]?.description, 'GPUs');
  assert.ok(rows[0]?.date instanceof Date);
});

test('all empty when tickers is empty', async () => {
  assert.deepEqual(await fetchCongressionalTrades([], 30, 'k', endpoint), []);
  assert.deepEqual(await fetchLobbying([], 4, 'k', endpoint), []);
  assert.deepEqual(await fetchGovContracts([], 90, 'k', endpoint), []);
});
