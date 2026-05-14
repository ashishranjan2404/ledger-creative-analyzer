import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchApeWisdom } from '../sources/apewisdom.ts';
import { toTicker } from '../_watchlist.ts';

let server: Server;
let base: string;
let lastUA: string | undefined;
let nextStatus = 200;
let nextBody: unknown = { results: [] };

before(async () => {
  server = createServer((req, res) => {
    lastUA = req.headers['user-agent'] as string | undefined;
    res.writeHead(nextStatus, { 'content-type': 'application/json' });
    res.end(JSON.stringify(nextBody));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
});

beforeEach(() => {
  nextStatus = 200;
  nextBody = { results: [] };
  lastUA = undefined;
});

test('fetchApeWisdom: empty tickers returns [] with no HTTP', async () => {
  nextStatus = 500; // would fail if HTTP fired
  const out = await fetchApeWisdom([], 'all-stocks', base);
  assert.deepEqual(out, []);
  assert.equal(lastUA, undefined);
});

test('fetchApeWisdom: maps watchlist rows; drops off-watchlist + invalid tickers', async () => {
  nextBody = {
    results: [
      { rank: 1, ticker: 'NVDA', name: 'NVIDIA Corp', mentions: '250', upvotes: 1450,
        rank_24h_ago: 2, mentions_24h_ago: '180', sentiment: 'Bullish', sentiment_score: '0.85' },
      { rank: 2, ticker: 'GME', name: 'GameStop', mentions: 200, mentions_24h_ago: 50,
        sentiment: 'Bullish', sentiment_score: 0.9 }, // off watchlist
      { rank: 3, ticker: 'MSFT', name: 'Microsoft', mentions: 80, mentions_24h_ago: 100,
        sentiment: 'Neutral', sentiment_score: 0.5 },
    ],
  };
  const out = await fetchApeWisdom([toTicker('NVDA'), toTicker('MSFT')], 'all-stocks', base);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.ticker, 'NVDA');
  assert.equal(out[0]?.mentions, 250);
  assert.equal(out[0]?.mentionsPrior24h, 180);
  assert.equal(out[0]?.sentimentLabel, 'Bullish');
  assert.equal(out[0]?.sentimentScore, 0.85);
  assert.equal(out[1]?.ticker, 'MSFT');
});

test('fetchApeWisdom: sets UA header', async () => {
  nextBody = { results: [] };
  await fetchApeWisdom([toTicker('NVDA')], 'all-stocks', base);
  assert.match(lastUA ?? '', /Thedi-Personal/);
});

test('fetchApeWisdom: missing `results` key tolerated → []', async () => {
  nextBody = {};
  const out = await fetchApeWisdom([toTicker('NVDA')], 'all-stocks', base);
  assert.deepEqual(out, []);
});

test('fetchApeWisdom: malformed numbers coerce to 0, not NaN', async () => {
  nextBody = {
    results: [
      { rank: 'oops', ticker: 'NVDA', name: 'NVIDIA',
        mentions: 'bad', upvotes: 'n/a', mentions_24h_ago: null, sentiment: 'Bullish', sentiment_score: 'NaN' },
    ],
  };
  const out = await fetchApeWisdom([toTicker('NVDA')], 'all-stocks', base);
  assert.equal(out[0]?.mentions, 0);
  assert.equal(out[0]?.mentionsPrior24h, 0);
  assert.equal(out[0]?.sentimentScore, 0);
});

test('fetchApeWisdom: HTTP 500 throws (no swallow — single call, caller decides)', async () => {
  nextStatus = 500;
  await assert.rejects(
    () => fetchApeWisdom([toTicker('NVDA')], 'all-stocks', base),
    /HTTP 500/,
  );
});
