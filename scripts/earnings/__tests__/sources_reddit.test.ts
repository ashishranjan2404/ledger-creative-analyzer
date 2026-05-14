import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { _resetRedditToken, fetchRedditMentions } from '../sources/reddit.ts';
import { toTicker } from '../_watchlist.ts';

const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';
const CID = 'cid';
const CSEC = 'csec';
const BASIC = `Basic ${Buffer.from(`${CID}:${CSEC}`).toString('base64')}`;

let server: Server;
let endpoint = '';
let oauth = '';
let tokenHits = 0;
let searchHits = 0;
const seen: { sub: string; q: string; auth: string; ua: string }[] = [];
let failPair: { sub: string; ticker: string } | null = null;
let posts: (sub: string) => unknown[] = () => [];

const readBody = (req: IncomingMessage): Promise<string> => new Promise((res) => {
  const bufs: Buffer[] = [];
  req.on('data', (c: Buffer) => bufs.push(c));
  req.on('end', () => res(Buffer.concat(bufs).toString('utf8')));
});

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/api/v1/access_token') {
      tokenHits++;
      const body = await readBody(req);
      assert.equal(req.headers.authorization, BASIC, 'basic auth');
      assert.equal(req.headers['user-agent'], UA, 'token UA');
      assert.equal(body, 'grant_type=client_credentials');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      return;
    }
    const m = url.pathname.match(/^\/r\/([^/]+)\/search\.json$/);
    if (m) {
      searchHits++;
      const sub = m[1]!;
      const q = url.searchParams.get('q') ?? '';
      seen.push({ sub, q, auth: String(req.headers.authorization ?? ''), ua: String(req.headers['user-agent'] ?? '') });
      if (failPair && failPair.sub === sub && failPair.ticker === q) {
        res.writeHead(500); res.end('boom'); return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { children: posts(sub) } }));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}`;
  oauth = `${endpoint}/api/v1/access_token`;
});

beforeEach(() => {
  tokenHits = 0;
  searchHits = 0;
  seen.length = 0;
  failPair = null;
  posts = () => [];
  _resetRedditToken();
});

after(async () => {
  await new Promise<void>((res, rej) =>
    server.close((err) => (err ? rej(err) : res())),
  );
});

const nowSec = () => Math.floor(Date.now() / 1000);
const call = (t: string[], s: string[], h: number) =>
  fetchRedditMentions(t.map(toTicker), s, h, CID, CSEC, endpoint, oauth);

test('happy path: 1 ticker x 2 subs returns 2 posts in window with auth+UA', async () => {
  posts = (sub) => [{
    data: {
      title: `${sub} post`, permalink: `/r/${sub}/comments/abc/`,
      selftext: 'body text', created_utc: nowSec() - 3600,
    },
  }];
  const items = await call(['AAPL'], ['wallstreetbets', 'stocks'], 24);
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.equal(it.source, 'reddit');
    assert.equal(it.ticker, 'AAPL');
    assert.match(it.url, /^https:\/\/reddit\.com\/r\/(wallstreetbets|stocks)\//);
    assert.equal(it.snippet, 'body text');
    assert.ok(it.published instanceof Date);
  }
  for (const s of seen) {
    assert.equal(s.auth, 'Bearer tok');
    assert.equal(s.ua, UA, 'search request carries UA');
    assert.equal(s.q, 'AAPL', 'plain ticker query');
  }
});

test('token cached across multiple fetchRedditMentions calls', async () => {
  await call(['AAPL'], ['stocks'], 24);
  await call(['MSFT'], ['stocks'], 24);
  await call(['NVDA'], ['stocks'], 24);
  assert.equal(tokenHits, 1, 'OAuth endpoint hit only once');
});

test('posts older than hoursBack filtered out', async () => {
  posts = (sub) => [
    { data: { title: 'fresh', permalink: `/r/${sub}/f/`, created_utc: nowSec() - 1800 } },
    { data: { title: 'stale', permalink: `/r/${sub}/s/`, created_utc: nowSec() - 7200 } },
  ];
  const items = await call(['AAPL'], ['stocks'], 1);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, 'fresh');
});

test('per-(sub,ticker) failure swallowed; sibling returns', async () => {
  failPair = { sub: 'wallstreetbets', ticker: 'AAPL' };
  posts = (sub) => [
    { data: { title: `${sub} ok`, permalink: `/r/${sub}/o/`, created_utc: nowSec() - 600 } },
  ];
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => { warns.push(m); };
  try {
    const items = await call(['AAPL'], ['wallstreetbets', 'stocks'], 24);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, 'stocks ok');
    assert.equal(warns.length, 1);
    assert.match(warns[0]!, /\[reddit\] wallstreetbets\/AAPL:/);
  } finally {
    console.warn = orig;
  }
});

test('empty tickers or subreddits fires zero HTTP requests', async () => {
  const a = await call([], ['stocks'], 24);
  assert.deepEqual(a, []);
  const b = await call(['AAPL'], [], 24);
  assert.deepEqual(b, []);
  assert.equal(tokenHits, 0, 'no token request when no work');
  assert.equal(searchHits, 0, 'no search request when no work');
});
