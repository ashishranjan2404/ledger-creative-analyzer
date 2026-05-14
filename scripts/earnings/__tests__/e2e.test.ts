// E2E smoke: runTactical / runDeepDive / runEventPoll against ONE shared
// node:http fixture server. We override globalThis.fetch to rewrite ALL
// outbound URLs to that server, then route by URL.pathname via a handler
// MAP (not a switch — handlers stay individually addressable so a missing
// route fails loudly with a 404 + path echo). RECIPIENT is enforced as the
// personal address; runX returns the documented shape on the happy path.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { runTactical } from '../tactical.ts';
import { runDeepDive } from '../deepdive.ts';
import { runEventPoll } from '../event_poll.ts';
import { RECIPIENT } from '../_recipient.ts';
import { _resetCikCache } from '../sources/edgar.ts';
import { _resetXbrlCache } from '../sources/edgar_xbrl.ts';
import { _resetRedditToken } from '../sources/reddit.ts';
import { __test as rlTest, _resetRateLimiter } from '../_ratelimit.ts';

type Handler = (url: URL, body: string) => { status?: number; json?: unknown; text?: string };

// Per-host rewriting: every external host the Routine code touches must
// map to the fixture, otherwise a missed mapping yields a real network
// call. Listed explicitly (not regex) so adding a new source = obvious diff.
const REROUTE_HOSTS = new Set([
  'finnhub.io', 'api.polygon.io', 'api.benzinga.com',
  'feeds.finance.yahoo.com', 'www.reddit.com', 'oauth.reddit.com',
  'api.stocktwits.com', 'www.sec.gov', 'data.sec.gov',
  'api.resend.com', 'app_36ybfio2fiy7.butterbase.dev',
  'api.github.com', 'export.arxiv.org', 'hn.algolia.com',
  'api.anthropic.com',
  // New tactical sources (keyless): all four sentiment fetchers now run by
  // default so the fixture must cover them or the e2e attempts real network.
  'apewisdom.io', 'api.pullpush.io', 'arctic-shift.photon-reddit.com',
  // Quiver: dormant after the L8 free-source swap (sources/quiver.ts kept in
  // tree for optional paid use); host listed defensively for any future re-wire.
  'api.quiverquant.com',
  // L8 GOV free sources (deepdive, always-on after the Quiver→free swap):
  // Senate/House stock-watcher GitHub mirrors, LDA filings API, USAspending awards.
  'raw.githubusercontent.com', 'lda.senate.gov', 'api.usaspending.gov',
]);

// Minimal-but-realistic fixtures. Each handler returns the *shape* that
// the source parser actually reads — empty arrays/objects propagate as
// "no data" without throwing in adapters.
const HANDLERS: Array<{ match: (u: URL) => boolean; h: Handler }> = [
  // EDGAR ticker→CIK map (used by every edgar_* and transcripts source)
  { match: (u) => u.pathname === '/files/company_tickers.json', h: () => ({ json: {
    '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple' },
    '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft' },
    '2': { cik_str: 1652044, ticker: 'GOOGL', title: 'Alphabet' },
    '3': { cik_str: 1018724, ticker: 'AMZN', title: 'Amazon' },
    '4': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA' },
    '5': { cik_str: 1326801, ticker: 'META', title: 'Meta' },
    '6': { cik_str: 2488, ticker: 'AMD', title: 'AMD' },
    '7': { cik_str: 1318605, ticker: 'TSLA', title: 'Tesla' },
  } }) },
  // EDGAR atom feeds (Form 4, 13F, 13D/G, 8-K, transcripts) — empty feed.
  { match: (u) => u.pathname === '/cgi-bin/browse-edgar',
    h: () => ({ text: '<feed xmlns="http://www.w3.org/2005/Atom"></feed>' }) },
  // EDGAR XBRL companyconcept JSON.
  { match: (u) => u.pathname.startsWith('/api/xbrl/companyconcept/'),
    h: () => ({ json: { units: { USD: [] } } }) },
  // EDGAR submissions JSON (used by valuation.fetchSic).
  { match: (u) => u.pathname.startsWith('/submissions/'), h: () => ({ json: { sic: '7372' } }) },
  // Resend → 200 with id (sent: true path).
  { match: (u) => u.hostname === 'api.resend.com' || u.pathname === '/emails',
    h: () => ({ json: { id: 'email_fake' } }) },
  // Butterbase data API: GET (wasSeen) → []; POST (insert*/markSeen) → echo {id}.
  { match: (u) => u.pathname.startsWith('/api/data/'),
    h: (_u, body) => body ? { json: { id: 'row_fake' } } : { json: [] } },
  // Reddit OAuth + search (used by tactical's reddit source).
  { match: (u) => u.pathname === '/api/v1/access_token',
    h: () => ({ json: { access_token: 'tok_fake', expires_in: 3600 } }) },
  { match: (u) => u.pathname.endsWith('/search.json') || u.pathname.startsWith('/r/'),
    h: () => ({ json: { data: { children: [] } } }) },
  // Finnhub earnings calendar.
  { match: (u) => u.pathname === '/api/v1/calendar/earnings',
    h: () => ({ json: { earningsCalendar: [] } }) },
  // Polygon financials.
  { match: (u) => u.pathname.startsWith('/vX/reference/financials'),
    h: () => ({ json: { results: [], status: 'OK' } }) },
  // Benzinga news (returns array — adapter expects array, not object).
  { match: (u) => u.pathname === '/api/v2/news', h: () => ({ json: [] }) },
  // Yahoo RSS (XML).
  { match: (u) => u.pathname === '/rss/2.0/headline',
    h: () => ({ text: '<rss><channel></channel></rss>' }) },
  // StockTwits per-symbol stream.
  { match: (u) => u.pathname.includes('/streams/symbol/'),
    h: () => ({ json: { messages: [] } }) },
  // GitHub (operational layer) — return small repo + contributors.
  { match: (u) => u.hostname === 'api.github.com' && u.pathname.startsWith('/repos/'),
    h: (u) => u.pathname.endsWith('/contributors')
      ? { json: [] } : { json: { stargazers_count: 1 } } },
  // arXiv (secular layer): /api/query returns Atom feed.
  { match: (u) => u.pathname === '/api/query',
    h: () => ({ text: '<feed xmlns="http://www.w3.org/2005/Atom"></feed>' }) },
  // HN algolia (secular layer): /api/v1/search_by_date.
  { match: (u) => u.pathname.startsWith('/api/v1/search'),
    h: () => ({ json: { nbHits: 0 } }) },
  // ApeWisdom paged filter (e.g. /api/v1.0/filter/all-stocks).
  { match: (u) => u.pathname.startsWith('/api/v1.0/filter/'),
    h: () => ({ json: { results: [] } }) },
  // PullPush submission search (single endpoint, query params vary per call).
  { match: (u) => u.pathname === '/reddit/search/submission',
    h: () => ({ json: { data: [] } }) },
  // Arctic-Shift post search.
  { match: (u) => u.pathname === '/api/posts/search',
    h: () => ({ json: { data: [] } }) },
  // Reddit RSS per-sub search feed (consumed by reddit_rss source via fetchRss).
  // Path pattern: /r/<sub>/search.rss — matched after the /r/ JSON rule above
  // because that rule matches anything under /r/. Reorder isn't needed: the
  // earlier rule already returns empty data → fetchRss handles both empty JSON
  // and empty RSS shapes gracefully.

  // Quiver historical endpoints — dormant adapter retained; defensive coverage
  // in case sources/quiver.ts is ever re-wired into a routine.
  { match: (u) => u.pathname.startsWith('/beta/historical/'), h: () => ({ json: [] }) },
  // L8 GOV free sources (deepdive, always-on):
  // Senate/House stock-watcher GitHub mirrors — fetchJson expects an array.
  { match: (u) => u.pathname.includes('-stock-watcher-data/'), h: () => ({ json: [] }) },
  // LDA filings API — adapter reads `.results[]`.
  { match: (u) => u.pathname.startsWith('/api/v1/filings'),
    h: () => ({ json: { results: [] } }) },
  // USAspending /search/spending_by_award/ — adapter reads `.results[]`.
  { match: (u) => u.pathname.startsWith('/api/v2/search/spending_by_award'),
    h: () => ({ json: { results: [] } }) },
];

function dispatch(req: IncomingMessage, res: ServerResponse, body: string): void {
  const url = new URL(req.url ?? '/', 'http://fixture');
  const hit = HANDLERS.find((r) => r.match(url));
  if (!hit) { res.statusCode = 404; res.end(`no fixture route for ${url.pathname}`); return; }
  const { status = 200, json, text } = hit.h(url, body);
  res.statusCode = status;
  res.setHeader('content-type', json !== undefined ? 'application/json' : 'application/xml');
  res.end(json !== undefined ? JSON.stringify(json) : (text ?? ''));
}

let server: http.Server;
let fixtureBase: string;
let originalFetch: typeof fetch;
let savedEnv: Record<string, string | undefined> = {};
const ENV: Record<string, string> = {
  FINNHUB_KEY: 'fk', POLYGON_KEY: 'pk', BENZINGA_KEY: 'bk',
  REDDIT_CLIENT_ID: 'rid', REDDIT_CLIENT_SECRET: 'rs',
  RESEND_KEY: 'rk', BUTTERBASE_SERVICE_KEY: 'sk', RECIPIENT,
};

before(async () => {
  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => dispatch(req, res, Buffer.concat(chunks).toString('utf8')));
    });
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  fixtureBase = `http://127.0.0.1:${port}`;
  originalFetch = globalThis.fetch;
  // Rewrite known-host URLs to the fixture; passthrough anything else (none expected).
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const u = new URL(raw);
    if (REROUTE_HOSTS.has(u.hostname)) {
      const rewritten = `${fixtureBase}${u.pathname}${u.search}`;
      return originalFetch(rewritten, init);
    }
    return originalFetch(raw, init);
  }) as typeof fetch;
  for (const [k, v] of Object.entries(ENV)) { savedEnv[k] = process.env[k]; process.env[k] = v; }
  // ANTHROPIC_API_KEY intentionally unset → narrative path skipped (V1).
  // QUIVER_API_KEY no longer consulted by either routine (post free-source
  // swap); deepdive L8 + event_poll congressional both run unconditionally
  // against the free gov sources (Senate/House mirrors, LDA, USAspending)
  // and the fixture returns empty for each → renderer suppresses the GOV block.
  delete process.env['ANTHROPIC_API_KEY'];
  // Bypass the rate limiter: tactical now fans into PullPush/Arctic-Shift/Reddit-RSS,
  // each of which calls acquireToken per (sub, ticker). The token-bucket would
  // serialize 32 calls at 10/min for Reddit RSS → minutes-long e2e. Resolve
  // instantly here so fixture HTTP, not the limiter, is the bottleneck.
  rlTest.impl = () => Promise.resolve();
});

after(async () => {
  globalThis.fetch = originalFetch;
  for (const k of Object.keys(ENV)) {
    if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k]; else delete process.env[k];
  }
  _resetRateLimiter();
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())));
});

// Module-level caches (CIK map, XBRL concepts, Reddit token) memoize across
// tests — wipe so each run resolves through the fixture, not stale state from
// a prior test's resolution chain. Once-only reset leaks ordering coupling.
beforeEach(() => { _resetCikCache(); _resetXbrlCache(); _resetRedditToken(); });

// === Schema-validated assertions: each runX must return its EXACT shape. ====

test('runTactical: returns { sent, findings, ms } with right types', async () => {
  const r = await runTactical();
  assert.equal(typeof r.sent, 'boolean');
  assert.equal(typeof r.findings, 'number');
  assert.ok(Number.isInteger(r.findings) && r.findings >= 0, 'findings is non-neg int');
  assert.equal(typeof r.ms, 'number');
  assert.ok(r.ms >= 0, 'ms is non-negative');
  assert.equal(r.sent, true, 'fixture Resend returns 200 → sent must be true');
  assert.deepEqual(Object.keys(r).sort(), ['findings', 'ms', 'sent']);
});

test('runDeepDive: returns { sent, cards, ms } with cards in (0, 4]', async () => {
  const r = await runDeepDive();
  assert.equal(typeof r.sent, 'boolean');
  assert.equal(typeof r.cards, 'number');
  assert.equal(typeof r.ms, 'number');
  assert.equal(r.sent, true);
  assert.ok(r.cards > 0 && r.cards <= 4, `cards=${r.cards} out of (0,4] rotation budget`);
  assert.deepEqual(Object.keys(r).sort(), ['cards', 'ms', 'sent']);
});

test('runEventPoll: returns { alerts, newAlerts, ms } with newAlerts ≤ alerts', async () => {
  const r = await runEventPoll();
  assert.equal(typeof r.alerts, 'number');
  assert.equal(typeof r.newAlerts, 'number');
  assert.equal(typeof r.ms, 'number');
  assert.ok(r.alerts >= 0 && r.newAlerts >= 0);
  assert.ok(r.newAlerts <= r.alerts, 'newAlerts is a subset of alerts');
  assert.deepEqual(Object.keys(r).sort(), ['alerts', 'ms', 'newAlerts']);
});

test('RECIPIENT is the enforced personal address', () => {
  assert.equal(RECIPIENT, 'ashishranjan2404@gmail.com');
  assert.equal(process.env['RECIPIENT'], RECIPIENT);
});
