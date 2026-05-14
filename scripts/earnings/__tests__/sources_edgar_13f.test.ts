import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  CUSIP_TO_TICKER, diffHoldings, fetchActivism, fetchNotableFund13F,
  type FundHolding,
} from '../sources/edgar_13f.ts';
import { _resetCikCache } from '../sources/edgar.ts';
import { toTicker } from '../_watchlist.ts';

const TICKERS_JSON = JSON.stringify({
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  '1': { cik_str: 320193, ticker: 'AAPL', title: 'APPLE INC' },
});
const BERK_CIK = '0001067983'; // Berkshire Hathaway
const BERK_NO_PAD = '1067983';
const ACC = '0001067983-26-000123';
const ACC_ND = ACC.replace(/-/g, '');

const day = 86_400_000;
const recentIso = new Date(Date.now() - 2 * 3600_000).toISOString();
const oldIso = new Date(Date.now() - 30 * day).toISOString();

const fundFeedXml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <title>13F-HR</title><link href="https://x/Archives/edgar/data/${BERK_NO_PAD}/${ACC_ND}/${ACC}-index.htm"/>
  <updated>${recentIso}</updated><summary>13F filing</summary></entry></feed>`;

const primaryDoc = `<?xml version="1.0"?><edgarSubmission><filingManager>
  <name>BERKSHIRE HATHAWAY INC</name></filingManager><periodOfReport>2026-03-31</periodOfReport></edgarSubmission>`;

const infoTable = `<?xml version="1.0"?><informationTable>
  <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip>
    <value>175000000000</value><shrsOrPrnAmt><sshPrnamt>900000000</sshPrnamt></shrsOrPrnAmt></infoTable>
  <infoTable><nameOfIssuer>NVIDIA CORP</nameOfIssuer><cusip>67066G104</cusip>
    <value>5000000000</value><shrsOrPrnAmt><sshPrnamt>4000000</sshPrnamt></shrsOrPrnAmt></infoTable>
  <infoTable><nameOfIssuer>UNKNOWN INC</nameOfIssuer><cusip>999999999</cusip>
    <value>1000</value><shrsOrPrnAmt><sshPrnamt>10</sshPrnamt></shrsOrPrnAmt></infoTable>
</informationTable>`;

const activismFeed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>SC 13D - Filed by ICAHN ASSOCIATES for AAPL, 5.4% owned</title>
    <link href="https://x/Archives/edgar/data/320193/000119312526000111/0001193125-26-000111-index.htm"/>
    <updated>${recentIso}</updated><summary>activist</summary></entry>
  <entry><title>SC 13G - Filed by VANGUARD GROUP for AAPL, 7.2% owned</title>
    <link href="https://x/Archives/edgar/data/320193/000119312526000222/0001193125-26-000222-index.htm"/>
    <updated>${recentIso}</updated><summary>passive</summary></entry>
  <entry><title>SC 13G - Old filing</title>
    <link href="https://x/Archives/edgar/data/320193/000119312500000333/0001193125-00-000333-index.htm"/>
    <updated>${oldIso}</updated><summary>old</summary></entry></feed>`;

let server: Server; let endpoint = '';
let routes = new Map<string, string>();

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/cgi-bin/browse-edgar') {
      const cik = url.searchParams.get('CIK') ?? '';
      const type = url.searchParams.get('type') ?? '';
      const body = routes.get(`feed:${cik}:${type}`);
      if (!body) return res.writeHead(404).end();
      return res.writeHead(200, { 'content-type': 'application/atom+xml' }).end(body);
    }
    const body = routes.get(url.pathname);
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/xml' }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  routes = new Map<string, string>([
    ['/files/company_tickers.json', TICKERS_JSON],
    [`feed:${BERK_CIK}:13F`, fundFeedXml],
    [`feed:0000320193:SC 13`, activismFeed],
    [`feed:0001045810:SC 13`, `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`],
    [`/Archives/edgar/data/${BERK_NO_PAD}/${ACC_ND}/infotable.xml`, infoTable],
    [`/Archives/edgar/data/${BERK_NO_PAD}/${ACC_ND}/primary_doc.xml`, primaryDoc],
  ]);
  _resetCikCache();
});

after(async () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))));

test('CUSIP_TO_TICKER covers the 8-ticker watchlist', () => {
  const ts = new Set(CUSIP_TO_TICKER.values());
  for (const t of ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'AMD', 'TSLA'])
    assert.ok(ts.has(t as never), `missing ${t}`);
});

test('fetchNotableFund13F extracts holdings, drops unknown CUSIPs', async () => {
  const holdings = await fetchNotableFund13F([BERK_CIK], endpoint);
  assert.equal(holdings.length, 2, 'unknown CUSIP filtered');
  const aapl = holdings.find((h) => h.ticker === 'AAPL')!;
  assert.equal(aapl.fundCik, BERK_CIK);
  assert.equal(aapl.fundName, 'BERKSHIRE HATHAWAY INC');
  assert.equal(aapl.shares, 900000000);
  assert.equal(aapl.marketValue, 175000000000);
  assert.equal(aapl.accessionNumber, ACC);
  assert.equal(aapl.periodOfReport.toISOString().slice(0, 10), '2026-03-31');
});

test('fetchActivism filters by sinceDays and parses formType + pct', async () => {
  const rows = await fetchActivism([toTicker('AAPL'), toTicker('NVDA')], 7, endpoint);
  assert.equal(rows.length, 2, 'old filing dropped, NVDA empty feed');
  const d = rows.find((r) => r.formType === '13D')!;
  assert.equal(d.ticker, 'AAPL');
  assert.equal(d.percentOwnership, 5.4);
  assert.match(d.filerName, /ICAHN/);
  const g = rows.find((r) => r.formType === '13G')!;
  assert.equal(g.percentOwnership, 7.2);
});

test('error isolation: failed fund still returns others', async () => {
  routes.delete(`feed:0000000999:13F`);
  const out = await fetchNotableFund13F(['0000000999', BERK_CIK], endpoint);
  assert.equal(out.length, 2);
  assert.ok(out.every((h) => h.fundCik === BERK_CIK));
});

test('diffHoldings classifies new/exit/increased/decreased and skips no-change', () => {
  const mk = (fc: string, t: string, s: number): FundHolding => ({ fundName: 'F', fundCik: fc,
    ticker: t as never, shares: s, marketValue: s * 10, periodOfReport: new Date(0),
    filingDate: new Date(0), accessionNumber: 'a' });
  const prior = [mk('A', 'AAPL', 100), mk('A', 'NVDA', 50), mk('A', 'MSFT', 10), mk('B', 'TSLA', 200)];
  const cur = [mk('A', 'AAPL', 100), mk('A', 'NVDA', 75), mk('A', 'AMD', 5), mk('B', 'TSLA', 100)];
  const by = new Map(diffHoldings(cur, prior).map((c) => [`${c.fundCik}:${c.ticker}`, c]));
  assert.equal(by.get('A:AAPL'), undefined, 'no-change skipped');
  assert.equal(by.get('A:NVDA')!.changeType, 'increased');
  assert.equal(by.get('A:NVDA')!.shareDelta, 25);
  assert.equal(by.get('A:NVDA')!.pctChange, 50);
  assert.equal(by.get('A:AMD')!.changeType, 'new');
  assert.equal(by.get('A:AMD')!.pctChange, Infinity);
  assert.equal(by.get('A:MSFT')!.changeType, 'exit');
  assert.equal(by.get('A:MSFT')!.shareDelta, -10);
  assert.equal(by.get('A:MSFT')!.pctChange, -100);
  assert.equal(by.get('B:TSLA')!.changeType, 'decreased');
  assert.equal(by.get('B:TSLA')!.shareDelta, -100);
  assert.equal(by.get('B:TSLA')!.pctChange, -50);
});
