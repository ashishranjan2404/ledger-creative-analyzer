import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchYahooNews } from '../sources/yahoo.ts';
import { toTicker } from '../_watchlist.ts';

const HOUR = 3_600_000;
const recent = new Date(Date.now() - 2 * HOUR).toISOString();
const old = new Date(Date.now() - 48 * HOUR).toISOString();

const it = (sym: string, kind: 'fresh' | 'stale' | 'undated') =>
  kind === 'fresh'
    ? `<item><title>${sym} fresh news</title><link>https://yh/${sym}/fresh</link><pubDate>${recent}</pubDate><description>fresh blurb</description></item>`
    : kind === 'stale'
    ? `<item><title>${sym} stale</title><link>https://yh/${sym}/stale</link><pubDate>${old}</pubDate></item>`
    : `<item><title>${sym} no-date</title><link>https://yh/${sym}/nd</link></item>`;
const rss = (...inner: string[]) =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${inner.join('')}</channel></rss>`;

let server: Server;
let endpoint = '';
let lastQueryBySym = new Map<string, URLSearchParams>();
let hitsBySym = new Map<string, number>();
let failSyms = new Set<string>();

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const sym = url.searchParams.get('s') ?? '';
    hitsBySym.set(sym, (hitsBySym.get(sym) ?? 0) + 1);
    lastQueryBySym.set(sym, url.searchParams);
    if (failSyms.has(sym)) { res.writeHead(500); res.end('boom'); return; }
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    if (sym === 'NVDA') return res.end(rss(it('NVDA', 'fresh'), it('NVDA', 'stale')));
    if (sym === 'MSFT') return res.end(rss(it('MSFT', 'stale'))); // only stale
    if (sym === 'TSLA') return res.end(rss(it('TSLA', 'fresh'), it('TSLA', 'undated')));
    return res.end(rss(it(sym, 'fresh')));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rss`;
});

beforeEach(() => { hitsBySym = new Map(); lastQueryBySym = new Map(); failSyms = new Set(); });

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test('happy path: maps RSS → RawItem with source=yahoo and snippet', async () => {
  const items = await fetchYahooNews([toTicker('AAPL')], 24, endpoint);
  assert.equal(items.length, 1);
  const r = items[0]!;
  assert.equal(r.source, 'yahoo');
  assert.equal(r.ticker, 'AAPL');
  assert.equal(r.title, 'AAPL fresh news');
  assert.equal(r.url, 'https://yh/AAPL/fresh');
  assert.equal(r.snippet, 'fresh blurb');
  assert.ok(r.published instanceof Date);
});

test('window filter: stale items dropped, undated items dropped', async () => {
  // NVDA: fresh+stale → fresh; MSFT: only stale → 0; TSLA: fresh+undated → fresh
  const items = await fetchYahooNews(
    [toTicker('NVDA'), toTicker('MSFT'), toTicker('TSLA')], 24, endpoint,
  );
  assert.deepEqual(items.map((i) => i.ticker).sort(), ['NVDA', 'TSLA']);
});

test('boundary: pubDate exactly at cutoff is excluded', async () => {
  // 1h window vs MSFT's 48h-old item → excluded by `<=` filter.
  const items = await fetchYahooNews([toTicker('MSFT')], 1, endpoint);
  assert.equal(items.length, 0);
});

test('error isolation: one ticker 500s, others still return', async () => {
  failSyms = new Set(['AAPL']);
  const items = await fetchYahooNews([toTicker('AAPL'), toTicker('NVDA')], 24, endpoint);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.ticker, 'NVDA');
});

test('url params + one request per ticker', async () => {
  await fetchYahooNews([toTicker('AAPL'), toTicker('NVDA'), toTicker('MSFT')], 24, endpoint);
  for (const sym of ['AAPL', 'NVDA', 'MSFT']) {
    const q = lastQueryBySym.get(sym);
    assert.ok(q, `expected query for ${sym}`);
    assert.equal(q.get('s'), sym);
    assert.equal(q.get('region'), 'US');
    assert.equal(q.get('lang'), 'en-US');
    assert.equal(hitsBySym.get(sym), 1);
  }
});

test('empty ticker list: no requests, empty result', async () => {
  const items = await fetchYahooNews([], 24, endpoint);
  assert.deepEqual(items, []);
  assert.equal(hitsBySym.size, 0);
});
