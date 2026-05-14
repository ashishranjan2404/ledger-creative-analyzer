import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchBenzingaNews } from '../sources/benzinga.ts';
import { toTicker } from '../_watchlist.ts';

let server: Server;
let endpoint = '';
let lastUrl = '';
let nextStatus = 200;
let nextBody: unknown = [];

const HOUR = 3_600_000;
const NOW = Date.now();
const RECENT = new Date(NOW - 1 * HOUR).toISOString();
const STALE = new Date(NOW - 50 * HOUR).toISOString();

before(async () => {
  server = createServer((req, res) => {
    lastUrl = req.url ?? '';
    res.writeHead(nextStatus, { 'content-type': 'application/json' });
    res.end(JSON.stringify(nextBody));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}/api/v2/news`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test('builds URL with token, tickers, displayOutput=full, pageSize=50', async () => {
  nextStatus = 200;
  nextBody = [];
  await fetchBenzingaNews([toTicker('NVDA'), toTicker('AAPL')], 24, 'sk_test', endpoint);
  assert.match(lastUrl, /token=sk_test/);
  assert.match(lastUrl, /tickers=NVDA/);
  assert.match(lastUrl, /AAPL/);
  assert.match(lastUrl, /displayOutput=full/);
  assert.match(lastUrl, /pageSize=50/);
});

test('multi-stock fan-out: one item with NVDA+AAPL emits two RawItems', async () => {
  nextStatus = 200;
  nextBody = [
    {
      id: 1,
      created: RECENT,
      title: 'Joint headline',
      url: 'https://benzinga.test/1',
      body: '<p>x</p>',
      stocks: [{ name: 'NVDA' }, { name: 'AAPL' }],
    },
  ];
  const items = await fetchBenzingaNews(
    [toTicker('NVDA'), toTicker('AAPL')],
    24,
    'k',
    endpoint,
  );
  assert.equal(items.length, 2);
  const tickers = items.map((i) => i.ticker).sort();
  assert.deepEqual(tickers, ['AAPL', 'NVDA']);
  assert.equal(items[0]?.source, 'benzinga');
  assert.equal(items[0]?.title, 'Joint headline');
  assert.equal(items[0]?.url, 'https://benzinga.test/1');
});

test('off-watchlist stocks in same item are filtered out', async () => {
  nextStatus = 200;
  nextBody = [
    {
      id: 2,
      created: RECENT,
      title: 'Mixed',
      url: 'https://benzinga.test/2',
      stocks: [{ name: 'NVDA' }, { name: 'XYZ' }, { name: 'AAPL' }],
    },
  ];
  const items = await fetchBenzingaNews(
    [toTicker('NVDA'), toTicker('AAPL')],
    24,
    'k',
    endpoint,
  );
  assert.equal(items.length, 2);
  for (const it of items) assert.notEqual(it.ticker, 'XYZ');
});

test('HTML strip, entity decode, 200-char snippet', async () => {
  const long = 'word '.repeat(80);
  nextStatus = 200;
  nextBody = [
    {
      id: 3,
      created: RECENT,
      title: 'T',
      url: 'https://benzinga.test/3',
      body: `<p>Hello &amp; <a href="x">world</a> &#39;quoted&#39; ${long}</p>`,
      stocks: [{ name: 'NVDA' }],
    },
  ];
  const items = await fetchBenzingaNews([toTicker('NVDA')], 24, 'k', endpoint);
  assert.equal(items.length, 1);
  const snip = items[0]?.snippet ?? '';
  assert.equal(snip.length, 200);
  assert.ok(!/[<>]/.test(snip), 'no angle brackets remain');
  assert.ok(snip.startsWith("Hello & world 'quoted'"), `got: ${snip.slice(0, 40)}`);
});

test('window filter drops items older than hoursBack', async () => {
  nextStatus = 200;
  nextBody = [
    { id: 4, created: RECENT, title: 'fresh', url: 'https://b.test/4', stocks: [{ name: 'NVDA' }] },
    { id: 5, created: STALE, title: 'old', url: 'https://b.test/5', stocks: [{ name: 'NVDA' }] },
  ];
  const items = await fetchBenzingaNews([toTicker('NVDA')], 24, 'k', endpoint);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, 'fresh');
});

test('item with no matching stock yields nothing', async () => {
  nextStatus = 200;
  nextBody = [
    { id: 6, created: RECENT, title: 'noise', url: 'https://b.test/6', stocks: [{ name: 'XYZ' }] },
  ];
  const items = await fetchBenzingaNews([toTicker('NVDA')], 24, 'k', endpoint);
  assert.deepEqual(items, []);
});

test('item without body has no snippet key (exactOptionalPropertyTypes)', async () => {
  nextStatus = 200;
  nextBody = [
    { id: 7, created: RECENT, title: 't', url: 'https://b.test/7', stocks: [{ name: 'NVDA' }] },
  ];
  const items = await fetchBenzingaNews([toTicker('NVDA')], 24, 'k', endpoint);
  assert.equal(items.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(items[0], 'snippet'), false);
});

test('empty tickers returns [] without HTTP', async () => {
  const before = lastUrl;
  const items = await fetchBenzingaNews([], 24, 'k', endpoint);
  assert.deepEqual(items, []);
  assert.equal(lastUrl, before, 'no request should fire');
});

test('HTTP 500 throws (no swallow on single batched call)', async () => {
  nextStatus = 500;
  nextBody = { error: 'boom' };
  await assert.rejects(
    () => fetchBenzingaNews([toTicker('NVDA')], 24, 'k', endpoint),
    /HTTP 500/,
  );
  nextStatus = 200;
});
