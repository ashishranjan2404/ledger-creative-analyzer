import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { _resetCikCache } from '../sources/edgar.ts';
import { fetchRecentTranscripts } from '../sources/transcripts.ts';
import { toTicker } from '../_watchlist.ts';

const TICKERS_JSON = {
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  '1': { cik_str: 320193, ticker: 'AAPL', title: 'APPLE INC' },
  '2': { cik_str: 789019, ticker: 'MSFT', title: 'MICROSOFT' },
};
const recentIso = new Date(Date.now() - 3 * 3600_000).toISOString();
// Synthetic accession numbers — one per ticker, present in feed link
const ACC = {
  NVDA: '0001045810-26-000001',
  AAPL: '0000320193-26-000002',
  MSFT: '0000789019-26-000003',
} as const;
type Sym = keyof typeof ACC;
const CIK_NOPAD: Record<Sym, string> = { NVDA: '1045810', AAPL: '320193', MSFT: '789019' };

function feedFor(sym: Sym): string {
  const acc = ACC[sym];
  // SEC index URL ends with `<acc>-index.htm` — accession-extracting regex anchors on `-index.`
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>${sym} 8-K</title>
      <link href="https://www.sec.gov/Archives/edgar/data/${CIK_NOPAD[sym]}/${acc.replace(/-/g, '')}/${acc}-index.htm"/>
      <updated>${recentIso}</updated><summary>recent</summary></entry></feed>`;
}

// Per-path overrides — keyed by URL pathname
const indexJsonByPath = new Map<string, string>();
const exhibitsByPath = new Map<string, { status: number; body: string }>();
const seenUserAgents: string[] = [];
let exhibitHits = 0;

function captureUa(req: IncomingMessage): void {
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string') seenUserAgents.push(ua);
}

let server: Server;
let endpoint = '';

before(async () => {
  server = createServer((req, res) => {
    captureUa(req);
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    if (p === '/files/company_tickers.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(TICKERS_JSON));
      return;
    }
    if (p === '/cgi-bin/browse-edgar') {
      const cik = url.searchParams.get('CIK') ?? '';
      const sym: Sym | undefined =
        cik === '0001045810' ? 'NVDA' : cik === '0000320193' ? 'AAPL'
        : cik === '0000789019' ? 'MSFT' : undefined;
      res.writeHead(200, { 'content-type': 'application/atom+xml' });
      res.end(sym ? feedFor(sym) : '<feed/>');
      return;
    }
    if (p.endsWith('/index.json')) {
      const body = indexJsonByPath.get(p);
      if (!body) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }
    const ex = exhibitsByPath.get(p);
    if (ex) {
      exhibitHits++;
      res.writeHead(ex.status, { 'content-type': 'text/html' });
      res.end(ex.body);
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  indexJsonByPath.clear();
  exhibitsByPath.clear();
  seenUserAgents.length = 0;
  exhibitHits = 0;
  _resetCikCache();
});

function dirFor(sym: Sym): string {
  return `/Archives/edgar/data/${CIK_NOPAD[sym]}/${ACC[sym].replace(/-/g, '')}`;
}

test('happy path: detects transcript exhibit, strips HTML, computes wordCount', async () => {
  const dir = dirFor('NVDA');
  indexJsonByPath.set(`${dir}/index.json`, JSON.stringify({
    directory: { item: [
      { name: 'ex99-1.htm', type: 'EX-99.1' },
      { name: 'primary_doc.xml', type: 'XML' },
    ] },
  }));
  exhibitsByPath.set(`${dir}/ex99-1.htm`, {
    status: 200,
    body: '<html><body><p>Q4 transcript: <b>strong</b> growth &amp; record revenue.</p></body></html>',
  });
  const out = await fetchRecentTranscripts([toTicker('NVDA')], 1, endpoint);
  assert.equal(out.length, 1);
  const t = out[0]!;
  assert.equal(t.ticker, 'NVDA');
  assert.equal(t.accessionNumber, ACC.NVDA);
  assert.equal(t.exhibitUrl, `${endpoint}${dir}/ex99-1.htm`);
  assert.equal(t.text, 'Q4 transcript: strong growth & record revenue.');
  assert.equal(t.wordCount, 7);
  assert.ok(t.filingDate instanceof Date);
});

test('no-exhibit-skip: filing with only non-transcript items returns nothing', async () => {
  const dir = dirFor('AAPL');
  indexJsonByPath.set(`${dir}/index.json`, JSON.stringify({
    directory: { item: [
      { name: 'ex10-1.htm', type: 'EX-10.1' },           // wrong exhibit number
      { name: 'ex99-1.jpg', type: 'GRAPHIC' },           // matches ex99 but binary — must skip
      { name: 'primary_doc.xml', type: 'XML' },
    ] },
  }));
  // No exhibit registered — if filter is wrong, fetch will 404 and processFiling will catch.
  const out = await fetchRecentTranscripts([toTicker('AAPL')], 1, endpoint);
  assert.equal(out.length, 0);
  assert.equal(exhibitHits, 0, 'should not fetch any exhibit body');
});

test('error isolation: one ticker 404s on index.json, others still return', async () => {
  // NVDA: good. MSFT: missing index.json (404). AAPL: good with "press release" exhibit.
  const nvdaDir = dirFor('NVDA');
  indexJsonByPath.set(`${nvdaDir}/index.json`, JSON.stringify({
    directory: { item: [{ name: 'ex99-1.htm', type: 'EX-99.1' }] },
  }));
  exhibitsByPath.set(`${nvdaDir}/ex99-1.htm`, { status: 200, body: '<p>nvda transcript text</p>' });
  // Intentionally do NOT register MSFT index.json -> 404 -> caught per-filing -> ticker still resolves []
  const aaplDir = dirFor('AAPL');
  indexJsonByPath.set(`${aaplDir}/index.json`, JSON.stringify({
    directory: { item: [{ name: 'press-release.htm', type: 'EX-99.1' }] },
  }));
  exhibitsByPath.set(`${aaplDir}/press-release.htm`, { status: 200, body: '<p>aapl press text</p>' });

  const out = await fetchRecentTranscripts(
    [toTicker('NVDA'), toTicker('MSFT'), toTicker('AAPL')], 1, endpoint,
  );
  const tickers = out.map((t) => t.ticker).sort();
  assert.deepEqual(tickers, ['AAPL', 'NVDA']);
});

test('HTML stripping: drops <script>/<style>/<!--comments-->, decodes entities, collapses whitespace', async () => {
  const dir = dirFor('NVDA');
  indexJsonByPath.set(`${dir}/index.json`, JSON.stringify({
    directory: { item: [{ name: 'transcript.htm', type: 'EX-99.1' }] },
  }));
  exhibitsByPath.set(`${dir}/transcript.htm`, {
    status: 200,
    body: `<html><head>
      <style>body { color: red; LEAK_STYLE; }</style>
      <script>var leak = "LEAK_SCRIPT";</script>
    </head><body>
      <h1>Q1   Earnings  Call</h1>
      <!-- LEAK_COMMENT internal note -->
      <p>Revenue grew &gt; 30% &mdash; thanks to&#160;customers.</p>
      <p>It&#39;s great &#x27;quoted&#x27; news.</p>
    </body></html>`,
  });
  const out = await fetchRecentTranscripts([toTicker('NVDA')], 1, endpoint);
  assert.equal(out.length, 1);
  const text = out[0]!.text;
  assert.ok(!text.includes('LEAK_SCRIPT'), 'script body must not leak');
  assert.ok(!text.includes('LEAK_STYLE'), 'style body must not leak');
  assert.ok(!text.includes('LEAK_COMMENT'), 'HTML comment must not leak');
  assert.ok(text.includes('Q1 Earnings Call'), `whitespace should collapse, got: ${text}`);
  assert.ok(text.includes('Revenue grew > 30%'), `entity should decode, got: ${text}`);
  assert.ok(text.includes("It's great 'quoted' news."), `numeric apostrophes should decode, got: ${text}`);
  assert.ok(!/\s{2,}/.test(text), 'no double spaces');
});

test('UA header carried on every request type (feed + index.json + exhibit)', async () => {
  const dir = dirFor('NVDA');
  indexJsonByPath.set(`${dir}/index.json`, JSON.stringify({
    directory: { item: [{ name: 'ex99-1.htm', type: 'EX-99.1' }] },
  }));
  exhibitsByPath.set(`${dir}/ex99-1.htm`, { status: 200, body: '<p>x</p>' });
  await fetchRecentTranscripts([toTicker('NVDA')], 1, endpoint);
  assert.ok(seenUserAgents.length >= 3, `expected tickers+feed+index+exhibit, got ${seenUserAgents.length}`);
  for (const ua of seenUserAgents) {
    assert.equal(ua, 'Thedi-Personal ashish@platformy.org');
  }
});
