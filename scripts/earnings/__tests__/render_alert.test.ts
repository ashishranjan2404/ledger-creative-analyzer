import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  renderAlertSubject, renderAlertBody, filterAndMarkUnseen, type Alert,
} from '../render_alert.ts';
import type { Ticker } from '../_types.ts';
import type { ClusterBuy } from '../layers/insider.ts';
import type { InstitutionalSignal } from '../layers/institutional.ts';
import type { FundActivism } from '../sources/edgar_13f.ts';

const T = (s: string) => s as Ticker;

const cluster: ClusterBuy = {
  ticker: T('NVDA'), insiderCount: 3, totalShares: 50_000, totalDollarValue: 4_200_000,
  windowStart: new Date('2026-04-15'), windowEnd: new Date('2026-05-02'),
  insiders: [
    { name: 'Jensen Huang', title: 'CEO', shares: 30_000, value: 2_500_000 },
    { name: 'Colette Kress', title: 'CFO', shares: 15_000, value: 1_200_000 },
    { name: 'Mark Stevens', title: 'Director', shares: 5_000, value: 500_000 },
  ],
};

const activist: FundActivism = {
  filerName: 'Elliott Management', filerCik: '0001234567', ticker: T('NVDA'),
  formType: '13D', percentOwnership: 5.4, filingDate: new Date('2026-05-01'),
  accessionNumber: '0001234567-26-000001',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/1045810/000123456726000001-index.htm',
};
const instSignal: InstitutionalSignal = { ticker: T('NVDA'), changes: [], activists: [activist] };

const clusterAlert: Alert = {
  kind: 'form4_cluster', ticker: T('NVDA'), sourceId: '0001234567-26-000001', data: cluster,
};
const instAlert: Alert = {
  kind: 'institutional', ticker: T('NVDA'), sourceId: 'https://www.sec.gov/x-13d',
  data: instSignal, reason: '13D activist position by Elliott Management',
};

test('cluster subject renders insider count + total dollars (M)', () => {
  assert.equal(renderAlertSubject(clusterAlert), '🚨 ALERT: NVDA · cluster buy (3 insiders, $4.2M)');
});

test('cluster body lists each insider, total, window dates, footer', () => {
  const b = renderAlertBody(clusterAlert);
  assert.match(b, /Jensen Huang \(CEO\) — 30,000 sh · \$2\.5M/);
  assert.match(b, /Colette Kress \(CFO\) — 15,000 sh · \$1\.2M/);
  assert.match(b, /Mark Stevens \(Director\) — 5,000 sh · \$500,000/);
  assert.match(b, /Total: 50,000 sh · \$4\.2M/);
  assert.match(b, /2026-04-15.*2026-05-02/);
  assert.match(b, /Filings: https:\/\/www\.sec\.gov/);
  assert.match(b, /⚠️ Personal long-term tool\. Sources: SEC EDGAR\./);
  assert.ok(b.split(/\s+/).length <= 150, 'body ≤150 words');
});

test('cluster body omits parens for titleless insider (no "Sam Kim (")', () => {
  // Safety net for titleless filings (Form 4 leaves Title blank for some
  // beneficial-owner reports). Render must be `Sam Kim — …` not `Sam Kim () —`
  // or `Sam Kim (insider) —` so the rendered line stays readable.
  const titlelessCluster: ClusterBuy = {
    ...cluster,
    insiders: [{ name: 'Sam Kim', title: '', shares: 1_000, value: 100_000 }],
  };
  const a: Alert = { kind: 'form4_cluster', ticker: T('NVDA'), sourceId: 'acc-titleless', data: titlelessCluster };
  const b = renderAlertBody(a);
  assert.match(b, /Sam Kim/);
  assert.doesNotMatch(b, /Sam Kim \(/);
});

test('institutional activist subject names filer + form type', () => {
  assert.equal(renderAlertSubject(instAlert),
    '🚨 ALERT: NVDA · 13D activist filing (Elliott Management)');
});

test('institutional body includes activist row with link + footer', () => {
  const b = renderAlertBody(instAlert);
  assert.match(b, /institutional signal \(13D activist position by Elliott Management\)/);
  assert.match(b, /13D by Elliott Management \(5\.4%\)/);
  assert.match(b, /https:\/\/www\.sec\.gov\/Archives/);
  assert.match(b, /⚠️ Personal long-term tool/);
});

// --- filterAndMarkUnseen with fixture server ---
type Hit = { method?: string; url?: string; body?: unknown };
type Resp = { status: number; body: string; ct?: string };
let server: Server;
let base: string;
let hits: Hit[] = [];
let queue: Resp[] = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = ''; req.setEncoding('utf8');
    req.on('data', (c) => (buf += c));
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

before(async () => {
  server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const h: Hit = {};
    if (req.method !== undefined) h.method = req.method;
    if (req.url !== undefined) h.url = req.url;
    if (raw) h.body = JSON.parse(raw);
    hits.push(h);
    const r = queue.shift() ?? { status: 200, body: 'ok' };
    res.writeHead(r.status, { 'content-type': r.ct ?? 'text/plain' });
    res.end(r.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))); });
beforeEach(() => { hits = []; queue = []; });

test('filterAndMarkUnseen: already-seen excluded, unseen included AND markSeen called', async () => {
  // Two alerts: clusterAlert (seen) + instAlert (unseen).
  // wasSeen #1 → returns row → seen
  queue.push({ status: 200, body: '[{"ticker":"NVDA"}]', ct: 'application/json' });
  // wasSeen #2 → empty → unseen
  queue.push({ status: 200, body: '[]', ct: 'application/json' });
  // markSeen for instAlert → 200
  queue.push({ status: 200, body: '{"id":"row_1"}', ct: 'application/json' });
  const out = await filterAndMarkUnseen([clusterAlert, instAlert], 'sk', base);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.kind, 'institutional');
  // 2 GETs (wasSeen) + 1 POST (markSeen)
  const gets = hits.filter((h) => h.method === 'GET');
  const posts = hits.filter((h) => h.method === 'POST');
  assert.equal(gets.length, 2);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0]!.body, {
    ticker: 'NVDA', alert_type: '13dg', source_id: 'https://www.sec.gov/x-13d',
  });
});

test('filterAndMarkUnseen: wasSeen failure → treat as unseen and still markSeen', async () => {
  queue.push({ status: 500, body: 'boom' });           // wasSeen fails
  queue.push({ status: 200, body: '{"ok":1}', ct: 'application/json' }); // markSeen
  const out = await filterAndMarkUnseen([clusterAlert], 'sk', base);
  assert.equal(out.length, 1);
  assert.equal(hits.filter((h) => h.method === 'POST').length, 1);
});

test('filterAndMarkUnseen: all seen → empty result, no markSeen calls', async () => {
  queue.push({ status: 200, body: '[{"x":1}]', ct: 'application/json' });
  queue.push({ status: 200, body: '[{"x":1}]', ct: 'application/json' });
  const out = await filterAndMarkUnseen([clusterAlert, instAlert], 'sk', base);
  assert.equal(out.length, 0);
  assert.equal(hits.filter((h) => h.method === 'POST').length, 0);
});
