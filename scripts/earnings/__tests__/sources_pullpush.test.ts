import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchPullPushMentions } from '../sources/pullpush.ts';
import { toTicker } from '../_watchlist.ts';

const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';

let server: Server;
let endpoint = '';
let httpHits = 0;
const seen: { sub: string; q: string; after: string; ua: string }[] = [];
let failPair: { sub: string; ticker: string } | null = null;
let posts: (sub: string, ticker: string) => unknown[] = () => [];

before(async () => {
  server = createServer((req, res) => {
    httpHits++;
    const url = new URL(req.url ?? '/', 'http://x');
    const sub = url.searchParams.get('subreddit') ?? '';
    const q = url.searchParams.get('q') ?? '';
    const after = url.searchParams.get('after') ?? '';
    seen.push({ sub, q, after, ua: String(req.headers['user-agent'] ?? '') });
    if (failPair && failPair.sub === sub && failPair.ticker === q) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: posts(sub, q) }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}/reddit/search/submission`;
});

beforeEach(() => {
  httpHits = 0;
  seen.length = 0;
  failPair = null;
  posts = () => [];
});

after(async () => {
  await new Promise<void>((res, rej) =>
    server.close((err) => (err ? rej(err) : res())),
  );
});

const nowSec = () => Math.floor(Date.now() / 1000);
const call = (t: string[], s: string[], h: number) =>
  fetchPullPushMentions(t.map(toTicker), s, h, endpoint);

test('maps posts to RawItem with reddit.com URL; filters off-window posts', async () => {
  posts = (sub) => [
    { title: `${sub} in-window-1`, permalink: `/r/${sub}/comments/a/`,
      selftext: 'b1', created_utc: nowSec() - 1800, subreddit: sub },
    { title: `${sub} in-window-2`, permalink: `/r/${sub}/comments/b/`,
      selftext: 'b2', created_utc: nowSec() - 3600, subreddit: sub },
    { title: `${sub} stale`, permalink: `/r/${sub}/comments/c/`,
      selftext: 'old', created_utc: nowSec() - 7200, subreddit: sub },
  ];
  const items = await call(['AAPL'], ['wallstreetbets'], 2);
  assert.equal(items.length, 2, 'two in-window posts, one filtered');
  assert.ok(items.every((i) => i.source === 'pullpush'));
  assert.ok(items.every((i) => i.ticker === 'AAPL'));
  assert.ok(items.every((i) => i.url.startsWith('https://reddit.com/r/wallstreetbets/')));
  assert.deepEqual(items.map((i) => i.snippet), ['b1', 'b2']);
  assert.ok(items.every((i) => i.published instanceof Date));
  assert.equal(seen[0]?.ua, UA, 'UA header set');
  assert.equal(seen[0]?.sub, 'wallstreetbets');
  assert.equal(seen[0]?.q, 'AAPL');
  assert.ok(Number(seen[0]?.after) > 0, 'after cutoff sent');
});

test('per-pair 404 swallowed; sibling pair returns', async () => {
  failPair = { sub: 'wallstreetbets', ticker: 'AAPL' };
  posts = (sub, t) => [
    { title: `${sub}/${t} ok`, permalink: `/r/${sub}/o/`,
      created_utc: nowSec() - 600, subreddit: sub },
  ];
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => { warns.push(m); };
  try {
    const items = await call(['AAPL'], ['wallstreetbets', 'stocks'], 24);
    assert.equal(items.length, 1, 'only sibling sub returns');
    assert.equal(items[0]?.title, 'stocks/AAPL ok');
    assert.equal(warns.length, 1);
    assert.match(warns[0]!, /\[pullpush\] wallstreetbets\/AAPL:/);
  } finally {
    console.warn = orig;
  }
});

test('empty tickers or subreddits fires zero HTTP', async () => {
  const a = await call([], ['stocks'], 24);
  assert.deepEqual(a, []);
  const b = await call(['AAPL'], [], 24);
  assert.deepEqual(b, []);
  assert.equal(httpHits, 0, 'no HTTP when no work');
});

test('permalink turned into reddit.com URL', async () => {
  posts = () => [{
    title: 't', permalink: '/r/stocks/comments/xyz/some_post/',
    created_utc: nowSec() - 300, subreddit: 'stocks',
  }];
  const items = await call(['MSFT'], ['stocks'], 24);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.url, 'https://reddit.com/r/stocks/comments/xyz/some_post/');
});
