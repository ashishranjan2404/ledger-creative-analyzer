import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchSecularSignal, TICKER_SECULAR_KEYWORDS } from '../layers/secular.ts';
import { toTicker } from '../_watchlist.ts';

const NVDA = toTicker('NVDA');

const DAY_MS = 86_400_000;
// Fixed clock so the arxiv feed entries (dated relative to NOW) and HN bounded
// queries (numericFilters built from NOW) line up deterministically.
const NOW = new Date('2026-05-01T00:00:00Z');
const NOW_MS = NOW.getTime();

// Build an arxiv Atom feed: `recentN` entries dated 30d before NOW, `priorN` 120d before.
function arxivFeed(recentN: number, priorN: number): string {
  const entry = (offsetDays: number, i: number): string =>
    `<entry><title>p${i}</title><link href="https://arxiv.org/abs/${i}"/>` +
    `<updated>${new Date(NOW_MS - offsetDays * DAY_MS).toISOString()}</updated></entry>`;
  const recent = Array.from({ length: recentN }, (_, i) => entry(30, i));
  const prior = Array.from({ length: priorN }, (_, i) => entry(120, 1000 + i));
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${recent.join('')}${prior.join('')}</feed>`;
}

// Fixture: per-keyword arxiv/hn counts. Keys = lower-cased keyword substring of URL.
type Counts = { arxivRecent: number; arxivPrior: number; hnCurrent: number; hnPrior: number };
let fixture = new Map<string, Counts>();
let arxivShould500 = false;

let server: Server;
let arxivEndpoint = '';
let hnEndpoint = '';

before(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '';
    const lower = decodeURIComponent(url).toLowerCase();
    const match = [...fixture.entries()].find(([kw]) => lower.includes(kw.toLowerCase()));
    if (!match) return res.writeHead(404).end();
    const [, c] = match;
    if (url.startsWith('/arxiv')) {
      if (arxivShould500) return res.writeHead(500).end();
      res.writeHead(200, { 'content-type': 'application/atom+xml' });
      // Single arxiv fetch returns both windows — secular.ts slices client-side.
      return res.end(arxivFeed(c.arxivRecent, c.arxivPrior));
    }
    if (url.startsWith('/hn')) {
      // Bounded date-range query carries created_at_i>{from}. Current bucket's
      // `from` is NOW-90d; prior bucket's `from` is NOW-180d. Distinguish by
      // checking which side of NOW-90d the lower bound sits on.
      const m = lower.match(/created_at_i>(\d+)/);
      const fromSec = m ? Number(m[1]) : 0;
      const cutoff90Sec = Math.floor((NOW_MS - 90 * DAY_MS) / 1000);
      const isPriorBucket = fromSec < cutoff90Sec - 60; // 60s slack
      const total = isPriorBucket ? c.hnPrior : c.hnCurrent;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ nbHits: total, hits: [] }));
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  arxivEndpoint = `http://127.0.0.1:${port}/arxiv`;
  hnEndpoint = `http://127.0.0.1:${port}/hn`;
});

after(async () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))));

beforeEach(() => {
  fixture = new Map();
  arxivShould500 = false;
});

test('happy path: both metrics populated, trend computed', async () => {
  // NVDA keywords: 'CUDA', 'GPU training', 'transformer training'. Two seeded.
  fixture.set('cuda', { arxivRecent: 60, arxivPrior: 40, hnCurrent: 30, hnPrior: 20 });
  fixture.set('gpu training', { arxivRecent: 60, arxivPrior: 40, hnCurrent: 30, hnPrior: 20 });
  const sig = await fetchSecularSignal(NVDA, { arxivEndpoint, hnEndpoint, now: NOW });
  // Sums across 2 matching keywords (third 404s — failure swallowed).
  assert.equal(sig.arxivMentions90d, 120);
  assert.equal(sig.arxivMentions90dPriorPeriod, 80);
  assert.equal(sig.arxivTrend, 'accelerating'); // 120 > 80 * 1.2
  assert.equal(sig.hnMentions90d, 60);
  assert.equal(sig.hnMentions90dPriorPeriod, 40);
  assert.equal(sig.hnTrend, 'accelerating');
});

test('ticker not in keyword map → all metrics undefined', async () => {
  const sig = await fetchSecularSignal(toTicker('FAKE'), { arxivEndpoint, hnEndpoint, now: NOW });
  assert.equal(sig.arxivMentions90d, undefined);
  assert.equal(sig.arxivTrend, undefined);
  assert.equal(sig.hnMentions90d, undefined);
  assert.equal(sig.hnTrend, undefined);
  assert.ok(sig.asOf instanceof Date);
});

test('arxiv error swallowed; HN still computes', async () => {
  arxivShould500 = true;
  fixture.set('cuda', { arxivRecent: 0, arxivPrior: 0, hnCurrent: 100, hnPrior: 50 });
  const sig = await fetchSecularSignal(NVDA, { arxivEndpoint, hnEndpoint, now: NOW });
  assert.equal(sig.arxivMentions90d, undefined);
  assert.equal(sig.arxivTrend, undefined);
  assert.equal(sig.hnMentions90d, 100);
  assert.equal(sig.hnMentions90dPriorPeriod, 50);
  assert.equal(sig.hnTrend, 'accelerating'); // 100 > 50*1.2
});

test('trend math: accel / flat / decel boundaries', async () => {
  fixture.set('cuda', { arxivRecent: 120, arxivPrior: 80, hnCurrent: 100, hnPrior: 100 });
  const accel = await fetchSecularSignal(NVDA, { arxivEndpoint, hnEndpoint, now: NOW });
  assert.equal(accel.arxivTrend, 'accelerating');
  fixture.set('cuda', { arxivRecent: 100, arxivPrior: 100, hnCurrent: 100, hnPrior: 100 });
  const flat = await fetchSecularSignal(NVDA, { arxivEndpoint, hnEndpoint, now: NOW });
  assert.equal(flat.arxivTrend, 'flat');
  fixture.set('cuda', { arxivRecent: 50, arxivPrior: 100, hnCurrent: 100, hnPrior: 100 });
  const decel = await fetchSecularSignal(NVDA, { arxivEndpoint, hnEndpoint, now: NOW });
  assert.equal(decel.arxivTrend, 'decelerating');
});

test('keyword map covers 8 watchlist tickers', () => {
  const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'AMD', 'TSLA'];
  for (const t of tickers) {
    const kws = TICKER_SECULAR_KEYWORDS[t];
    assert.ok(kws, `${t} has keywords`);
    assert.ok(kws!.length >= 2 && kws!.length <= 4, `${t} keyword count ~3`);
  }
});
