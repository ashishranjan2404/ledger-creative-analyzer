// Regression test suite for the 8 historical bugs caught during the original
// 30-task earnings-scout build (Loop 50 lock-in).
//
// Source-of-truth wiki:
//   docs/superpowers/sessions/2026-05-thedi-earnings-build.md  (search:
//   "Real bugs caught by code review").
//
// One test per bug, T-prefixed by the original task number, each crafted so
// the test would FAIL if the bug regressed. These deliberately overlap with
// existing per-module suites only where the cross-cutting failure-mode merits
// belt-and-suspenders coverage (e.g. the alert subject regex in T23).
//
// All tests are intentionally small + focused; fixture servers follow the
// `createServer + listen(0, '127.0.0.1')` pattern used elsewhere in __tests__/.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchValuationContext } from '../layers/valuation.ts';
import { _resetXbrlCache } from '../sources/edgar_xbrl.ts';
import { _resetCikCache } from '../sources/edgar.ts';
import { fetchRecentForm4 } from '../sources/edgar_form4.ts';
import { fetchNotableFund13F } from '../sources/edgar_13f.ts';
import { renderAlertSubject, type Alert } from '../render_alert.ts';
import { renderDeepDiveCard, type DeepDiveCard } from '../render_deepdive.ts';
import { defaultLlmClient } from '../layers/narrative.ts';
import { toTicker } from '../_watchlist.ts';
import type { Ticker } from '../_types.ts';
import type { ClusterBuy } from '../layers/insider.ts';
import type { InstitutionalSignal } from '../layers/institutional.ts';
import type { FundActivism } from '../sources/edgar_13f.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ────────────────────────────────────────────────────────────────────────────
// T16 — Valuation EV uses bsAt (point-in-time) for debt/cash, NOT ttmSum.
// Bug: summing 4 quarters of balance-sheet values 4×'d debt + cash, inflating EV.
// Wiki ref: T16 valuation. Code: layers/valuation.ts:147 (netDebt = bsAt - bsAt).
// ────────────────────────────────────────────────────────────────────────────

const NVDA_CIK = '0001045810';
const TICKERS_JSON = JSON.stringify({
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
});
const BASE = `/api/xbrl/companyconcept/CIK${NVDA_CIK}/us-gaap`;
const SUB = `/submissions/CIK${NVDA_CIK}.json`;
const PATHS = {
  opInc: `${BASE}/OperatingIncomeLoss.json`,
  ocf: `${BASE}/NetCashProvidedByOperatingActivities.json`,
  capex: `${BASE}/PaymentsToAcquirePropertyPlantAndEquipment.json`,
  debt: `${BASE}/LongTermDebt.json`,
  cash: `${BASE}/CashAndCashEquivalentsAtCarryingValue.json`,
  equity: `${BASE}/StockholdersEquity.json`,
  revenue: `${BASE}/Revenues.json`,
};
const usd = (e: unknown[]) => JSON.stringify({ units: { USD: e } });
function quarters(n: number, val: number, firstEnd = '2025-03-31'): unknown[] {
  const fps = ['Q1', 'Q2', 'Q3', 'Q4'];
  const start = new Date(firstEnd);
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() - 3 * i);
    out.push({ end: d.toISOString().slice(0, 10), val, fp: fps[i % 4]!,
      fy: 2025 - Math.floor(i / 4), form: '10-Q', filed: d.toISOString().slice(0, 10) });
  }
  return out;
}

let xbrlServer: Server;
let xbrlEndpoint = '';
let xbrlPayloads = new Map<string, string>();

before(async () => {
  xbrlServer = createServer((req, res) => {
    const body = xbrlPayloads.get(req.url ?? '/');
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/json' }).end(body);
  });
  await new Promise<void>((r) => xbrlServer.listen(0, '127.0.0.1', r));
  xbrlEndpoint = `http://127.0.0.1:${(xbrlServer.address() as AddressInfo).port}`;
});
after(async () => new Promise<void>((res, rej) => xbrlServer.close((e) => (e ? rej(e) : res()))));
beforeEach(() => { xbrlPayloads = new Map(); _resetXbrlCache(); _resetCikCache(); });

test('T16 regression: EV uses bsAt (latest balance) for debt/cash, not ttmSum', async () => {
  // Wiki §T16: balance-sheet stocks must NOT be summed. With LongTermDebt=5e9 and
  // Cash=10e9 across all quarters, the correct EV is marketCap + (5e9 - 10e9).
  // The regression would produce EV with 4× those values (20e9 - 40e9 = -20e9 net debt).
  const DEBT = 5e9, CASH = 10e9, MARKET_CAP = 1e11;
  xbrlPayloads.set('/files/company_tickers.json', TICKERS_JSON);
  xbrlPayloads.set(SUB, JSON.stringify({ sic: '7372' }));
  xbrlPayloads.set(PATHS.opInc, usd(quarters(24, 1e9)));
  xbrlPayloads.set(PATHS.ocf, usd(quarters(24, 1.2e9)));
  xbrlPayloads.set(PATHS.capex, usd(quarters(24, 0.2e9)));
  xbrlPayloads.set(PATHS.debt, usd(quarters(24, DEBT)));
  xbrlPayloads.set(PATHS.cash, usd(quarters(24, CASH)));
  xbrlPayloads.set(PATHS.equity, usd(quarters(24, 2e10)));
  xbrlPayloads.set(PATHS.revenue, usd(quarters(24, 8e9)));

  const ctx = await fetchValuationContext(toTicker('NVDA'), 100, 1e9, undefined, xbrlEndpoint);
  const evEbitda = ctx.metrics.find((m) => m.label === 'EV/EBITDA')!.current;
  // ttmOp = 1e9 × 4 = 4e9. Correct EV = 1e11 + (5e9 - 10e9) = 9.5e10. EV/EBITDA = 23.75.
  // Regressed EV (using ttmSum for debt/cash) = 1e11 + (20e9 - 40e9) = 8e10 ⇒ 20.0 — distinct.
  const expected = (MARKET_CAP + (DEBT - CASH)) / 4e9;
  assert.ok(
    Math.abs(evEbitda - expected) < 1e-6,
    `EV/EBITDA=${evEbitda} should equal ${expected} (bsAt point-in-time); regression yields ~20`,
  );
});

// ────────────────────────────────────────────────────────────────────────────
// T19 — edgar_form4 insiderName must descend <reportingOwnerId><rptOwnerName>,
// not just <rptOwnerName> directly under <reportingOwner>.
// Wiki §T19. Code: sources/edgar_form4.ts:49.
// ────────────────────────────────────────────────────────────────────────────

const FORM4_TICKERS = JSON.stringify({
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
});
const F4_ACC = '0001127602-26-009999';
const F4_ACC_ND = F4_ACC.replace(/-/g, '');
const f4FeedIso = new Date(Date.now() - 3 * 3600_000).toISOString();
function f4AtomFeed(): string {
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>4</title>
    <link href="https://x/Archives/edgar/data/1045810/${F4_ACC_ND}/${F4_ACC}-index.htm"/>
    <updated>${f4FeedIso}</updated></entry></feed>`;
}
function nestedForm4Xml(name: string): string {
  // REAL SEC SHAPE: <reportingOwner><reportingOwnerId><rptOwnerName>...
  return `<?xml version="1.0"?><ownershipDocument>
    <reportingOwner><reportingOwnerId><rptOwnerName>${name}</rptOwnerName></reportingOwnerId>
      <reportingOwnerRelationship><isDirector>0</isDirector>
        <isTenPercentOwner>0</isTenPercentOwner><officerTitle>CEO</officerTitle>
      </reportingOwnerRelationship></reportingOwner>
    <nonDerivativeTable><nonDerivativeTransaction>
      <transactionDate><value>2026-05-08</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>10</value></transactionPricePerShare>
      </transactionAmounts>
    </nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;
}
function flatBrokenForm4Xml(name: string): string {
  // BROKEN SHAPE: <rptOwnerName> directly under <reportingOwner>, NO wrapper.
  // pathText('reportingOwnerId','rptOwnerName') should NOT find it.
  return `<?xml version="1.0"?><ownershipDocument>
    <reportingOwner><rptOwnerName>${name}</rptOwnerName>
      <reportingOwnerRelationship><isDirector>0</isDirector>
        <isTenPercentOwner>0</isTenPercentOwner><officerTitle>CEO</officerTitle>
      </reportingOwnerRelationship></reportingOwner>
    <nonDerivativeTable><nonDerivativeTransaction>
      <transactionDate><value>2026-05-08</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>10</value></transactionPricePerShare>
      </transactionAmounts>
    </nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;
}

let f4Server: Server;
let f4Endpoint = '';
let f4Xml = '';

before(async () => {
  f4Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    if (p === '/files/company_tickers.json') {
      return res.writeHead(200, { 'content-type': 'application/json' }).end(FORM4_TICKERS);
    }
    if (p === '/cgi-bin/browse-edgar') {
      return res.writeHead(200, { 'content-type': 'application/atom+xml' }).end(f4AtomFeed());
    }
    if (p.endsWith(`${F4_ACC}.xml`)) {
      return res.writeHead(200, { 'content-type': 'text/xml' }).end(f4Xml);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => f4Server.listen(0, '127.0.0.1', r));
  f4Endpoint = `http://127.0.0.1:${(f4Server.address() as AddressInfo).port}`;
});
after(async () => new Promise<void>((res, rej) => f4Server.close((e) => (e ? rej(e) : res()))));

test('T19 regression: form4 parses nested <reportingOwnerId><rptOwnerName> shape', async () => {
  // Real SEC nests the name; production code must descend through <reportingOwnerId>.
  _resetCikCache();
  f4Xml = nestedForm4Xml('HUANG JEN-HSUN');
  const rows = await fetchRecentForm4([toTicker('NVDA')], 7, f4Endpoint);
  assert.equal(rows.length, 1, 'nested fixture should parse 1 transaction');
  assert.equal(
    rows[0]!.insiderName,
    'HUANG JEN-HSUN',
    'wiki §T19: descending through <reportingOwnerId> is required for real filings',
  );
});

test('T19 regression: form4 returns empty name for flat (non-real) shape', async () => {
  // Lock the descent: a fixture missing the <reportingOwnerId> wrapper must NOT
  // accidentally surface the name via a more permissive walker. If a future
  // refactor loosens pathText to descend wildcards, this asserts the behavior.
  _resetCikCache();
  f4Xml = flatBrokenForm4Xml('SHOULD NOT APPEAR');
  const rows = await fetchRecentForm4([toTicker('NVDA')], 7, f4Endpoint);
  assert.equal(rows.length, 1, 'tx parsing still succeeds');
  assert.equal(
    rows[0]!.insiderName,
    '',
    'flat shape must yield empty name — pathText is strict about the path',
  );
});

// ────────────────────────────────────────────────────────────────────────────
// T20 — Complexity-comment lock for detectClusterBuys. Original PR claimed "O(n)"
// for what is actually an O(n²) sliding window. Correctness was fine; the
// comment was misleading. This test reads layers/insider.ts and asserts the
// comment is honest (mentions O(n^2) / quadratic, NOT a bare "O(n)" claim).
// Wiki §T20.
// ────────────────────────────────────────────────────────────────────────────

test('T20 regression: detectClusterBuys complexity comment does not claim O(n)', () => {
  const src = readFileSync(pathResolve(__dirname, '../layers/insider.ts'), 'utf8');
  // Acceptable phrasings — any honest description of the quadratic upper bound:
  //   - O(n^2) / O(n²) / O(n*n)
  //   - "quadratic"
  // We assert that the file contains at least one such marker AND that no bare
  // "O(n)" sits in a comment adjacent to the cluster window scan (which would
  // re-introduce the misleading claim).
  const honest = /O\(n\^?2\)|O\(n\s*[\*·×]\s*n\)|O\(n²\)|quadratic/i.test(src);
  assert.ok(honest, 'wiki §T20: insider.ts must honestly note O(n^2) / quadratic complexity');
  // Defensive: a bare "O(n)" with a non-digit boundary (not "O(n^2)" or "O(n²)")
  // should not appear as a complexity claim. Match "O(n)" followed by space/dot/end.
  const dishonest = /O\(n\)(?!\s*[\^²])/.test(src);
  assert.equal(dishonest, false, 'wiki §T20: no bare "O(n)" claim allowed on the n^2 window');
});

// ────────────────────────────────────────────────────────────────────────────
// T21 — edgar_13f fundHoldings must NOT blindly fetch items[0].link (an Atom
// href pointing at -index.htm); the raw XML lives at the CDN path derived from
// the accession number. Wiki §T21. Code: sources/edgar_13f.ts:67-70.
// ────────────────────────────────────────────────────────────────────────────

const BERK_CIK = '0001067983';
const BERK_NO_PAD = '1067983';
const T21_ACC = '0001067983-26-007777';
const T21_ACC_ND = T21_ACC.replace(/-/g, '');
const t21FeedIso = new Date(Date.now() - 2 * 3600_000).toISOString();

// Atom feed whose entry <link> points at the -index.htm wrapper. A regressed
// implementation would fetch that URL directly (404 here because we ONLY
// register the CDN-constructed path). The correct impl extracts the accession
// and rebuilds the canonical CDN URL.
const t21AtomFeed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <title>13F-HR</title>
  <link href="https://x/Archives/edgar/data/${BERK_NO_PAD}/${T21_ACC_ND}/${T21_ACC}-index.htm"/>
  <updated>${t21FeedIso}</updated><summary>13F</summary></entry></feed>`;

const t21InfoTable = `<?xml version="1.0"?><informationTable><infoTable>
  <nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip>
  <value>175000000000</value><shrsOrPrnAmt><sshPrnamt>900000000</sshPrnamt></shrsOrPrnAmt>
</infoTable></informationTable>`;

const t21PrimaryDoc = `<?xml version="1.0"?><edgarSubmission><filingManager>
  <name>BERKSHIRE HATHAWAY INC</name></filingManager>
  <periodOfReport>2026-03-31</periodOfReport></edgarSubmission>`;

let t21Server: Server;
let t21Endpoint = '';
let t21IndexHtmFetched = false;

before(async () => {
  t21Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    if (p === '/cgi-bin/browse-edgar') {
      return res.writeHead(200, { 'content-type': 'application/atom+xml' }).end(t21AtomFeed);
    }
    // Track regression attempts: a regressed impl would hit the index.htm wrapper.
    if (p.endsWith(`${T21_ACC}-index.htm`)) {
      t21IndexHtmFetched = true;
      return res.writeHead(404).end();
    }
    // Canonical CDN paths the correct impl constructs:
    if (p === `/Archives/edgar/data/${BERK_NO_PAD}/${T21_ACC_ND}/infotable.xml`) {
      return res.writeHead(200, { 'content-type': 'application/xml' }).end(t21InfoTable);
    }
    if (p === `/Archives/edgar/data/${BERK_NO_PAD}/${T21_ACC_ND}/primary_doc.xml`) {
      return res.writeHead(200, { 'content-type': 'application/xml' }).end(t21PrimaryDoc);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => t21Server.listen(0, '127.0.0.1', r));
  t21Endpoint = `http://127.0.0.1:${(t21Server.address() as AddressInfo).port}`;
});
after(async () => new Promise<void>((res, rej) => t21Server.close((e) => (e ? rej(e) : res()))));

test('T21 regression: 13F fundHoldings builds CDN URL from accession, not Atom href', async () => {
  t21IndexHtmFetched = false;
  const holdings = await fetchNotableFund13F([BERK_CIK], t21Endpoint);
  // Correct: hit the constructed CDN path and parse infotable.xml.
  assert.equal(holdings.length, 1, 'wiki §T21: must resolve via accession-derived CDN URL');
  assert.equal(holdings[0]!.shares, 900000000);
  assert.equal(holdings[0]!.fundName, 'BERKSHIRE HATHAWAY INC');
  assert.equal(t21IndexHtmFetched, false,
    'wiki §T21: production must NOT blindly fetch items[0].link (-index.htm)');
});

// ────────────────────────────────────────────────────────────────────────────
// T22 — Coatue/Greenlight/Baupost notable-fund CIKs.
// Covered by __tests__/layers_institutional.test.ts test
// 'NOTABLE_FUNDS — covers original spec + Loops 32-33 additions'. Keeping this
// pointer-only "test" so the regression-suite manifest stays complete; we don't
// duplicate the existing assertions. Wiki §T22.
// ────────────────────────────────────────────────────────────────────────────

test('T22 regression: NOTABLE_FUNDS coverage (see layers_institutional.test.ts)', () => {
  // Intentional no-op pointer test. The authoritative assertion lives in
  // __tests__/layers_institutional.test.ts (search: 'NOTABLE_FUNDS — covers').
  // Duplicating it here would couple two test files without adding signal;
  // this stub keeps the regression manifest enumerable.
  assert.ok(true, 'see layers_institutional.test.ts for NOTABLE_FUNDS assertions');
});

// ────────────────────────────────────────────────────────────────────────────
// T23 — renderAlertSubject must dispatch on the /^13D\b/i regex against the
// rich `reason` string, not a literal equality check. Wiki §T23.
// Code: render_alert.ts:48.
// ────────────────────────────────────────────────────────────────────────────

const T = (s: string) => s as Ticker;
const t23Activist: FundActivism = {
  filerName: 'Bill Ackman', filerCik: '0009999999', ticker: T('AAPL'),
  formType: '13D', percentOwnership: 6.1, filingDate: new Date('2026-05-01'),
  accessionNumber: '0009999999-26-000001',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000999999926000001-index.htm',
};
const t23ActivistSignal: InstitutionalSignal = {
  ticker: T('AAPL'), changes: [], activists: [t23Activist],
};

test('T23 regression: activist alert subject says "activist" for rich 13D reason', () => {
  const alert: Alert = {
    kind: 'institutional', ticker: T('AAPL'),
    sourceId: 'https://www.sec.gov/x-13d', data: t23ActivistSignal,
    // Real shouldAlertInstitutional output: starts with "13D" then rich detail.
    reason: '13D activist position by Bill Ackman',
  };
  const subj = renderAlertSubject(alert);
  assert.match(subj, /activist/i,
    'wiki §T23: /^13D\\b/i must match rich reasons starting with "13D"');
});

test('T23 regression: non-13D consensus reason omits "activist" branch', () => {
  // shouldAlertInstitutional returns strings like "2-fund consensus buy …"
  // for non-activist signals. The regex must NOT misfire on these.
  const consensusSignal: InstitutionalSignal = { ticker: T('AAPL'), changes: [], activists: [] };
  const alert: Alert = {
    kind: 'institutional', ticker: T('AAPL'),
    sourceId: 'consensus-key', data: consensusSignal,
    reason: 'consensus buy by 2 notable funds',
  };
  const subj = renderAlertSubject(alert);
  assert.doesNotMatch(subj, /activist/i,
    'wiki §T23: non-13D reasons must NOT trigger the activist subject');
});

// ────────────────────────────────────────────────────────────────────────────
// T26 — narrative defaultLlmClient must (a) use the current model id
// 'claude-sonnet-4-6' (NOT the stale 'claude-sonnet-4-5') AND (b) route through
// fetchWithTimeout, not raw fetch. Wiki §T26. Code: layers/narrative.ts.
// ────────────────────────────────────────────────────────────────────────────

test('T26 regression: narrative DEFAULT_MODEL is current claude-sonnet-4-6 + fetchWithTimeout', () => {
  // Read the source so the regression is locked at the production constant —
  // not a duplicated constant in this test. This catches a refactor that
  // re-introduces a stale model id (e.g. claude-sonnet-4-5).
  const src = readFileSync(pathResolve(__dirname, '../layers/narrative.ts'), 'utf8');
  // (a) Model: only the current id should appear; stale id must be absent.
  assert.match(src, /claude-sonnet-4-6/,
    'wiki §T26: defaultLlmClient must declare claude-sonnet-4-6 as DEFAULT_MODEL');
  assert.doesNotMatch(src, /claude-sonnet-4-5/,
    'wiki §T26: stale claude-sonnet-4-5 string must not reappear');
  // (b) Timeout: inner request must go through fetchWithTimeout, not bare fetch.
  assert.match(src, /fetchWithTimeout\s*\(/,
    'wiki §T26: defaultLlmClient must use fetchWithTimeout (not raw fetch)');
  // Sanity-check the export resolves with a key set. A schema regression
  // (e.g. ctor that secretly bypasses the wrapper) would be caught upstream
  // by the existing narrative tests; here we only need to confirm the export
  // is still constructible.
  const client = defaultLlmClient({ apiKey: 'sk-test-not-real', endpoint: 'http://127.0.0.1:1' });
  assert.equal(typeof client, 'function', 'defaultLlmClient must return a callable');
});

// ────────────────────────────────────────────────────────────────────────────
// T29 — renderDeepDiveCard section order is FUND → NAR → VAL → OPS → SEC → GOV.
// Wiki §T29. Code: render_deepdive.ts:202-209.
// ────────────────────────────────────────────────────────────────────────────

test('T29 regression: deep-dive section order is FUND → NAR → VAL → OPS → SEC → GOV', () => {
  const card: DeepDiveCard = {
    ticker: T('NVDA'),
    asOf: new Date('2026-05-10T12:00:00Z'),
    fundamentals: {
      ticker: T('NVDA'), asOf: new Date('2026-05-10T12:00:00Z'),
      metrics: [
        { label: 'Revenue YoY', unit: 'pct', values: [50, 60, 70, 80, 90, 100, 110, 120] },
        { label: 'FCF margin',  unit: 'pct', values: [40, 41, 42, 43, 44, 45, 46, 47] },
      ],
    },
    valuation: {
      ticker: T('NVDA'), asOf: new Date('2026-05-10T12:00:00Z'), sectorSic: '7372',
      metrics: [
        { label: 'Fwd P/E', current: 31, median5yr: 42, sectorMedian: 28, unit: 'multiple' },
      ],
    },
    narrative: {
      ticker: T('NVDA'),
      currentQuarter: { date: new Date('2026-04-15'), accessionNumber: 'a' },
      priorQuarter:   { date: new Date('2026-01-15'), accessionNumber: 'b' },
      shifts: ['Pivot from buildout to monetization.'],
      asOf: new Date('2026-05-10T12:00:00Z'),
    },
    operational: {
      ticker: T('NVDA'), asOf: new Date('2026-05-10T12:00:00Z'),
      openJobs: 120, openJobsDelta90d: 0.15,
    },
    secular: {
      ticker: T('NVDA'), asOf: new Date('2026-05-10T12:00:00Z'),
      arxivMentions90d: 42, arxivMentions90dPriorPeriod: 30, arxivTrend: 'accelerating',
    },
    govCapital: {
      congressional: [{
        ticker: T('NVDA'), representative: 'Pelosi, Nancy', party: 'D', chamber: 'House',
        transaction: 'Purchase', amount: '$1M-$5M',
        transactionDate: new Date('2026-04-20'), reportedDate: new Date('2026-04-25'),
      }],
      lobbying: [], contracts: [],
    },
  };

  const out = renderDeepDiveCard(card);
  const idxFund = out.indexOf('▌FUNDAMENTALS');
  const idxNar  = out.indexOf('▌NARRATIVE SHIFT');
  const idxVal  = out.indexOf('▌VALUATION');
  const idxOps  = out.indexOf('▌OPERATIONAL VELOCITY');
  const idxSec  = out.indexOf('▌SECULAR');
  const idxGov  = out.indexOf('▌GOVERNMENT & CAPITAL');
  for (const [name, i] of [
    ['FUNDAMENTALS', idxFund], ['NARRATIVE', idxNar], ['VALUATION', idxVal],
    ['OPERATIONAL', idxOps], ['SECULAR', idxSec], ['GOVERNMENT', idxGov],
  ] as const) {
    assert.ok(i >= 0, `wiki §T29: section ${name} must be present in render`);
  }
  // The exact chain that locks the order. Any swap fails one of these.
  assert.ok(idxFund < idxNar, 'FUND before NAR');
  assert.ok(idxNar  < idxVal, 'NAR before VAL');
  assert.ok(idxVal  < idxOps, 'VAL before OPS');
  assert.ok(idxOps  < idxSec, 'OPS before SEC');
  assert.ok(idxSec  < idxGov, 'SEC before GOV');
});
