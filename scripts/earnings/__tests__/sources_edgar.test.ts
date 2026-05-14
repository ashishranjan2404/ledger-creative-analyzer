import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { _resetCikCache, fetchRecent8K, tickerToCik } from '../sources/edgar.ts';
import { toTicker } from '../_watchlist.ts';

const TICKERS_JSON = {
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  '1': { cik_str: 320193, ticker: 'AAPL', title: 'APPLE INC' },
  '2': { cik_str: 789019, ticker: 'MSFT', title: 'MICROSOFT' },
};

let tickersHits = 0;
let feedHitsByCik = new Map<string, number>();
const seenUserAgents: string[] = [];

const day = 86_400_000;
const recentIso = new Date(Date.now() - 3 * 3600_000).toISOString(); // 3h ago
const oldIso = new Date(Date.now() - 30 * day).toISOString(); // 30d ago

// Per-cik feed override knob — lets specific tests inject custom XML
let feedOverrideByCik = new Map<string, string>();

function defaultFeedXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - Current report</title>
    <link href="https://www.sec.gov/recent.htm"/>
    <updated>${recentIso}</updated>
    <summary>Recent filing summary</summary>
  </entry>
  <entry>
    <title>8-K - Old report</title>
    <link href="https://www.sec.gov/old.htm"/>
    <updated>${oldIso}</updated>
    <summary>Old filing</summary>
  </entry>
</feed>`;
}

let server: Server;
let endpoint = '';

function captureUa(req: IncomingMessage): void {
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string') seenUserAgents.push(ua);
}

before(async () => {
  server = createServer((req, res) => {
    captureUa(req);
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/files/company_tickers.json') {
      tickersHits++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(TICKERS_JSON));
      return;
    }
    if (url.pathname === '/cgi-bin/browse-edgar') {
      const cik = url.searchParams.get('CIK') ?? '';
      feedHitsByCik.set(cik, (feedHitsByCik.get(cik) ?? 0) + 1);
      const override = feedOverrideByCik.get(cik);
      if (override === '__404__') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/atom+xml' });
      res.end(override ?? defaultFeedXml());
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}`;
});

beforeEach(() => {
  tickersHits = 0;
  feedHitsByCik = new Map();
  feedOverrideByCik = new Map();
  seenUserAgents.length = 0;
  _resetCikCache();
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test('tickerToCik returns 10-digit padded CIK and caches', async () => {
  const cik1 = await tickerToCik(toTicker('NVDA'), endpoint);
  assert.equal(cik1, '0001045810');
  assert.equal(cik1.length, 10);
  const cik2 = await tickerToCik(toTicker('AAPL'), endpoint);
  assert.equal(cik2, '0000320193');
  // Two ticker lookups, one fetch (cached)
  assert.equal(tickersHits, 1, 'company_tickers.json should be fetched only once');
});

test('CIK map promise-cache: concurrent first-callers dedupe to one fetch', async () => {
  // promise-cache angle: even with N parallel cold-start callers, only one HTTP hit
  const results = await Promise.all([
    tickerToCik(toTicker('NVDA'), endpoint),
    tickerToCik(toTicker('AAPL'), endpoint),
    tickerToCik(toTicker('MSFT'), endpoint),
  ]);
  assert.deepEqual(results, ['0001045810', '0000320193', '0000789019']);
  assert.equal(tickersHits, 1, 'expected single dedup-ed fetch');
});

test('fetchRecent8K returns recent items only and filters old', async () => {
  const items = await fetchRecent8K([toTicker('NVDA')], 1, endpoint);
  assert.equal(items.length, 1);
  const it = items[0]!;
  assert.equal(it.source, 'edgar');
  assert.equal(it.ticker, 'NVDA');
  assert.equal(it.title, '8-K - Current report');
  assert.equal(it.url, 'https://www.sec.gov/recent.htm');
  assert.equal(it.snippet, 'Recent filing summary');
  assert.ok(it.published instanceof Date);
  assert.equal(feedHitsByCik.get('0001045810'), 1);
});

test('every request carries the SEC-required UA header (exact match)', async () => {
  await fetchRecent8K([toTicker('NVDA')], 1, endpoint);
  assert.ok(seenUserAgents.length >= 2, 'expect at least tickers + feed request');
  for (const ua of seenUserAgents) {
    assert.equal(ua, 'Thedi-Personal ashish@platformy.org');
  }
});

test('multi-ticker: stale-only ticker dropped, fresh ones kept', async () => {
  // Override AAPL+NVDA with one fresh entry each; MSFT with all-stale.
  const fresh = (sym: string) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>${sym} 8-K</title><link href="https://sec.gov/${sym}/0"/>
    <updated>${new Date(Date.now() - 1 * day).toISOString()}</updated>
    <summary>fresh</summary></entry></feed>`;
  const stale = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>old</title><link href="https://sec.gov/old/0"/>
    <updated>${new Date(Date.now() - 40 * day).toISOString()}</updated>
    <summary>old</summary></entry></feed>`;
  feedOverrideByCik.set('0001045810', fresh('NVDA'));
  feedOverrideByCik.set('0000320193', fresh('AAPL'));
  feedOverrideByCik.set('0000789019', stale);

  const items = await fetchRecent8K(
    [toTicker('NVDA'), toTicker('AAPL'), toTicker('MSFT')],
    7,
    endpoint,
  );
  const tickers = items.map((i) => i.ticker).sort();
  assert.deepEqual(tickers, ['AAPL', 'NVDA']);
});

test('boundary: pubDate exactly at cutoff is excluded', async () => {
  // Build the entry at exactly Date.now() - sinceDays*day. By the time fetchRecent8K
  // computes its own cutoff (microseconds later), the entry's pubDate is strictly less
  // than cutoff, so the `< cutoff` filter excludes it.
  const sinceDays = 7;
  const cutoffIso = new Date(Date.now() - sinceDays * day).toISOString();
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>boundary</title><link href="https://sec.gov/b/0"/>
    <updated>${cutoffIso}</updated><summary>edge</summary></entry></feed>`;
  feedOverrideByCik.set('0001045810', xml);

  const items = await fetchRecent8K([toTicker('NVDA')], sinceDays, endpoint);
  assert.equal(items.length, 0);
});

test('error isolation: one ticker 404s but others still return items', async () => {
  feedOverrideByCik.set('0000320193', '__404__'); // AAPL feed 404s
  // NVDA + MSFT use defaultFeedXml (one fresh + one stale entry each)
  const items = await fetchRecent8K(
    [toTicker('NVDA'), toTicker('AAPL'), toTicker('MSFT')],
    7,
    endpoint,
  );
  const tickers = items.map((i) => i.ticker).sort();
  assert.deepEqual(tickers, ['MSFT', 'NVDA']);
});
