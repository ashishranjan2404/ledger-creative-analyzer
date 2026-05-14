import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchRedditRssMentions } from '../sources/reddit_rss.ts';
import { toTicker } from '../_watchlist.ts';
import { __test as rateTest, type AcquireOpts } from '../_ratelimit.ts';

const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';
const HOUR = 3_600_000;
const recent = () => new Date(Date.now() - HOUR).toISOString();
const old = () => new Date(Date.now() - 48 * HOUR).toISOString();

const item = (sym: string, kind: 'fresh' | 'stale') =>
  kind === 'fresh'
    ? `<item><title>${sym} fresh</title><link>https://r/${sym}/f</link><pubDate>${recent()}</pubDate><description>blurb</description></item>`
    : `<item><title>${sym} stale</title><link>https://r/${sym}/s</link><pubDate>${old()}</pubDate></item>`;
const rss = (...i: string[]) => `<?xml version="1.0"?><rss version="2.0"><channel>${i.join('')}</channel></rss>`;

let server: Server;
let endpoint = '';
let httpHits = 0;
let lastUA: string | undefined;
const seen: { sub: string; q: string }[] = [];
let fail403: { sub: string; q: string } | null = null;

before(async () => {
  server = createServer((req, res) => {
    httpHits++;
    lastUA = req.headers['user-agent'] as string | undefined;
    // URL: /r/{sub}/search.rss?q={ticker}&...
    const url = new URL(req.url ?? '/', 'http://x');
    const sub = url.pathname.split('/')[2] ?? '';
    const q = url.searchParams.get('q') ?? '';
    seen.push({ sub, q });
    if (fail403 && fail403.sub === sub && fail403.q === q) {
      res.writeHead(403); res.end('blocked'); return;
    }
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.end(rss(item(q, 'fresh'), item(q, 'stale')));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res())));
});

let acquireCalls: { key: string; opts: AcquireOpts }[] = [];
beforeEach(() => {
  httpHits = 0; lastUA = undefined; seen.length = 0; fail403 = null; acquireCalls = [];
  rateTest.impl = (key, opts) => { acquireCalls.push({ key, opts }); return Promise.resolve(); };
});

const call = (t: string[], s: string[], h: number) =>
  fetchRedditRssMentions(t.map(toTicker), s, h, endpoint);

test('maps RSS to RawItem with reddit_rss source; off-window dropped', async () => {
  const items = await call(['AAPL'], ['wallstreetbets'], 24);
  assert.equal(items.length, 1, 'fresh kept, stale dropped');
  const r = items[0]!;
  assert.equal(r.source, 'reddit_rss');
  assert.equal(r.ticker, 'AAPL');
  assert.equal(r.title, 'AAPL fresh');
  assert.equal(r.url, 'https://r/AAPL/f');
  assert.equal(r.snippet, 'blurb');
  assert.ok(r.published instanceof Date);
  assert.equal(seen[0]?.sub, 'wallstreetbets');
  assert.equal(seen[0]?.q, 'AAPL');
});

test('per-pair 403 swallowed; sibling pair still returns', async () => {
  fail403 = { sub: 'wallstreetbets', q: 'AAPL' };
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => { warns.push(m); };
  try {
    const items = await call(['AAPL'], ['wallstreetbets', 'stocks'], 24);
    assert.equal(items.length, 1, 'only sibling sub returns');
    assert.equal(items[0]?.title, 'AAPL fresh');
    assert.equal(warns.length, 1);
    assert.match(warns[0]!, /\[reddit_rss\] wallstreetbets\/AAPL:/);
  } finally {
    console.warn = orig;
  }
});

test('empty tickers or subreddits: [] with zero HTTP and zero acquireToken', async () => {
  const a = await call([], ['stocks'], 24);
  assert.deepEqual(a, []);
  const b = await call(['AAPL'], [], 24);
  assert.deepEqual(b, []);
  assert.equal(httpHits, 0);
  assert.equal(acquireCalls.length, 0);
});

test('UA header set on every request', async () => {
  await call(['AAPL'], ['stocks'], 24);
  assert.equal(lastUA, UA);
});

test('acquireToken invoked once per HTTP request with reddit_rss limits', async () => {
  await call(['AAPL', 'MSFT'], ['stocks', 'wallstreetbets'], 24);
  assert.equal(acquireCalls.length, 4, '2 tickers x 2 subs = 4 acquires');
  assert.equal(httpHits, 4, '1:1 with HTTP requests');
  for (const c of acquireCalls) {
    assert.equal(c.key, 'reddit_rss');
    assert.equal(c.opts.capacity, 5);
    assert.equal(c.opts.refillPerMinute, 10);
  }
});
