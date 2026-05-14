import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchArcticShiftMentions } from '../sources/arcticshift.ts';
import { __test as rlTest, type AcquireOpts } from '../_ratelimit.ts';
import { toTicker } from '../_watchlist.ts';

let server: Server;
let endpoint = '';
let httpHits = 0;
const seen: { sub: string; selftext: string; after: string }[] = [];
let failPair: { sub: string; ticker: string } | null = null;
let posts: (sub: string, ticker: string) => unknown[] = () => [];

const rlCalls: { key: string; opts: AcquireOpts }[] = [];
const httpOrder: ('rl' | 'http')[] = [];

before(async () => {
  server = createServer((req, res) => {
    httpHits++;
    httpOrder.push('http');
    const url = new URL(req.url ?? '/', 'http://x');
    const sub = url.searchParams.get('subreddit') ?? '';
    const selftext = url.searchParams.get('selftext') ?? '';
    const after = url.searchParams.get('after') ?? '';
    seen.push({ sub, selftext, after });
    if (failPair && failPair.sub === sub && failPair.ticker === selftext) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: posts(sub, selftext) }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}/api/posts/search`;
});

beforeEach(() => {
  httpHits = 0;
  seen.length = 0;
  rlCalls.length = 0;
  httpOrder.length = 0;
  failPair = null;
  posts = () => [];
  rlTest.impl = (key, opts) => {
    rlCalls.push({ key, opts });
    httpOrder.push('rl');
    return Promise.resolve();
  };
});

after(async () => {
  rlTest.impl = () => Promise.resolve();
  await new Promise<void>((res, rej) =>
    server.close((err) => (err ? rej(err) : res())),
  );
});

const nowSec = () => Math.floor(Date.now() / 1000);
const call = (t: string[], s: string[], h: number) =>
  fetchArcticShiftMentions(t.map(toTicker), s, h, endpoint);

test('maps items to RawItem; filters off-window posts', async () => {
  posts = (sub) => [
    { title: `${sub} in`, permalink: `/r/${sub}/comments/a/`,
      selftext: 'body1', created_utc: nowSec() - 1800, subreddit: sub },
    { title: `${sub} stale`, permalink: `/r/${sub}/comments/c/`,
      selftext: 'old', created_utc: nowSec() - 7200, subreddit: sub },
  ];
  const items = await call(['AAPL'], ['wallstreetbets'], 2);
  assert.equal(items.length, 1, 'in-window posts only');
  assert.equal(items[0]?.source, 'arctic_shift');
  assert.equal(items[0]?.ticker, 'AAPL');
  assert.ok(items[0]?.url.startsWith('https://reddit.com/r/wallstreetbets/'));
  assert.equal(items[0]?.snippet, 'body1');
  assert.equal(seen[0]?.selftext, 'AAPL');
  assert.ok(Number(seen[0]?.after) > 0, 'after cutoff sent');
});

test('per-pair 404 swallowed; sibling pair returns', async () => {
  failPair = { sub: 'wallstreetbets', ticker: 'AAPL' };
  posts = (sub, t) => [{ title: `${sub}/${t} ok`, permalink: `/r/${sub}/o/`,
    created_utc: nowSec() - 600, subreddit: sub }];
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => { warns.push(m); };
  try {
    const items = await call(['AAPL'], ['wallstreetbets', 'stocks'], 24);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, 'stocks/AAPL ok');
    assert.match(warns[0]!, /\[arctic_shift\] wallstreetbets\/AAPL:/);
  } finally { console.warn = orig; }
});

test('empty input → [] with 0 HTTP and 0 rl calls', async () => {
  assert.deepEqual(await call([], ['stocks'], 24), []);
  assert.deepEqual(await call(['AAPL'], [], 24), []);
  assert.equal(httpHits, 0);
  assert.equal(rlCalls.length, 0);
});

test('acquireToken invoked with correct args before each HTTP call', async () => {
  posts = () => [];
  await call(['AAPL', 'MSFT'], ['stocks', 'wallstreetbets'], 24);
  assert.equal(rlCalls.length, 4, 'one rl call per (sub,ticker) pair');
  assert.equal(httpHits, 4);
  for (const c of rlCalls) {
    assert.equal(c.key, 'arctic_shift');
    assert.equal(c.opts.capacity, 10);
    assert.equal(c.opts.refillPerMinute, 30);
  }
  // Every http must be preceded by an rl call.
  const pattern = httpOrder.join(',');
  assert.equal(pattern, 'rl,http,rl,http,rl,http,rl,http');
});
