import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchRecentForm4 } from '../sources/edgar_form4.ts';
import { _resetCikCache } from '../sources/edgar.ts';
import { toTicker } from '../_watchlist.ts';

const TICKERS_JSON = JSON.stringify({
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  '1': { cik_str: 320193, ticker: 'AAPL', title: 'APPLE INC' },
});
const day = 86_400_000;
const recentIso = new Date(Date.now() - 3 * 3600_000).toISOString();
const oldIso = new Date(Date.now() - 30 * day).toISOString();
const ACC_NVDA = '0001127602-26-001234';
const ACC_AAPL = '0001127602-26-002000';

// Real SEC nests <rptOwnerName> under <reportingOwnerId>; fixture must mirror that.
function form4Xml(o: {
  name?: string; title?: string; date?: string; code?: string; shares?: string; price?: string;
  rule10b51?: '0' | '1'; isTenPct?: boolean; addDerivative?: boolean; malformed?: boolean;
} = {}): string {
  if (o.malformed) return '<ownershipDocument><reportingOwner><rptOwner';
  const officerTitle = o.title === '' ? '' : `<officerTitle>${o.title ?? 'CEO'}</officerTitle>`;
  const deriv = o.addDerivative
    ? `<derivativeTable><derivativeTransaction>
         <transactionDate><value>${o.date ?? '2026-05-08'}</value></transactionDate>
         <transactionCoding><transactionCode>M</transactionCode></transactionCoding>
         <transactionAmounts>
           <transactionShares><value>500</value></transactionShares>
           <transactionPricePerShare><value>0</value></transactionPricePerShare>
         </transactionAmounts></derivativeTransaction></derivativeTable>` : '';
  return `<?xml version="1.0"?><ownershipDocument>
    <reportingOwner><reportingOwnerId><rptOwnerName>${o.name ?? 'Huang, Jensen'}</rptOwnerName></reportingOwnerId>
      <reportingOwnerRelationship><isDirector>0</isDirector>
        <isTenPercentOwner>${o.isTenPct ? '1' : '0'}</isTenPercentOwner>
        ${officerTitle}</reportingOwnerRelationship></reportingOwner>
    <nonDerivativeTable><nonDerivativeTransaction>
      <transactionDate><value>${o.date ?? '2026-05-08'}</value></transactionDate>
      <transactionCoding><transactionCode>${o.code ?? 'P'}</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>${o.shares ?? '1000'}</value></transactionShares>
        <transactionPricePerShare><value>${o.price ?? '850.50'}</value></transactionPricePerShare>
      </transactionAmounts>
      <rule10b5_1Flag><value>${o.rule10b51 ?? '0'}</value></rule10b5_1Flag>
    </nonDerivativeTransaction></nonDerivativeTable>${deriv}</ownershipDocument>`;
}

function atomFeed(cik: string, acc: string, dateIso: string): string {
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>4</title>
    <link href="https://x/Archives/edgar/data/${parseInt(cik, 10)}/${acc.replace(/-/g, '')}/${acc}-index.htm"/>
    <updated>${dateIso}</updated></entry></feed>`;
}

let server: Server, endpoint = '';
let xmlByAcc = new Map<string, string | '__404__'>();
let feedOverride = new Map<string, string | '__404__'>();

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x'); const p = url.pathname;
    if (p === '/files/company_tickers.json')
      return res.writeHead(200, { 'content-type': 'application/json' }).end(TICKERS_JSON);
    if (p === '/cgi-bin/browse-edgar') {
      const cik = url.searchParams.get('CIK') ?? '';
      const o = feedOverride.get(cik);
      if (o === '__404__') return res.writeHead(404).end();
      const acc = cik === '0001045810' ? ACC_NVDA : ACC_AAPL;
      return res.writeHead(200, { 'content-type': 'application/atom+xml' })
        .end(o ?? atomFeed(cik, acc, recentIso));
    }
    const m = p.match(/\/Archives\/edgar\/data\/\d+\/\d+\/(?:xslF345X05\/)?(.+)\.xml$/);
    if (m) {
      const xml = xmlByAcc.get(m[1]!);
      if (!xml || xml === '__404__') return res.writeHead(404).end();
      return res.writeHead(200, { 'content-type': 'text/xml' }).end(xml);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => { xmlByAcc = new Map(); feedOverride = new Map(); _resetCikCache(); });
after(async () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))));

test('happy path: parses fields, computes totalValue, detects 10b5-1', async () => {
  xmlByAcc.set(ACC_NVDA, form4Xml({ name: 'HUANG JEN-HSUN', title: 'CEO', code: 'S',
    shares: '120000', price: '850.50', rule10b51: '1', date: '2026-04-15' }));
  const rows = await fetchRecentForm4([toTicker('NVDA')], 30, endpoint);
  assert.equal(rows.length, 1);
  const r = rows[0]!;
  assert.equal(r.insiderName, 'HUANG JEN-HSUN');
  assert.equal(r.insiderTitle, 'CEO');
  assert.equal(r.transactionCode, 'S');
  assert.equal(r.shares, 120000);
  assert.equal(r.totalValue, 120000 * 850.5);
  assert.equal(r.is10b51Plan, true);
  assert.equal(r.accessionNumber, ACC_NVDA);
});

test('title fallback: 10% owner branch', async () => {
  xmlByAcc.set(ACC_NVDA, form4Xml({ title: '', isTenPct: true }));
  const rows = await fetchRecentForm4([toTicker('NVDA')], 7, endpoint);
  assert.equal(rows[0]!.insiderTitle, '10% Owner');
});

test('derivative transactions (code M) are also captured', async () => {
  xmlByAcc.set(ACC_NVDA, form4Xml({ addDerivative: true }));
  const rows = await fetchRecentForm4([toTicker('NVDA')], 7, endpoint);
  assert.deepEqual(rows.map((r) => r.transactionCode).sort(), ['M', 'P']);
});

test('sinceDays filter excludes stale filings', async () => {
  feedOverride.set('0001045810', atomFeed('1045810', ACC_NVDA, oldIso));
  xmlByAcc.set(ACC_NVDA, form4Xml());
  assert.equal((await fetchRecentForm4([toTicker('NVDA')], 7, endpoint)).length, 0);
});

test('error isolation + malformed XML: warn for failed ticker, drop bad rows', async () => {
  feedOverride.set('0000320193', '__404__');
  xmlByAcc.set(ACC_NVDA, form4Xml({ malformed: true }));
  const orig = console.warn; let warned = '';
  console.warn = (m: unknown) => { warned += String(m); };
  try {
    const rows = await fetchRecentForm4([toTicker('NVDA'), toTicker('AAPL')], 7, endpoint);
    assert.deepEqual(rows, []);
    assert.match(warned, /\[form4\].*AAPL/);
  } finally { console.warn = orig; }
});
