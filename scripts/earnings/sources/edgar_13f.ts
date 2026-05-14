import { fetchRss, fetchWithTimeout } from '../_http.ts';
import { tickerToCik } from './edgar.ts';
import { toTicker } from '../_watchlist.ts';
import type { Ticker } from '../_types.ts';

// SEC requires a descriptive UA per https://www.sec.gov/os/accessing-edgar-data
const UA = 'Thedi-Personal ashish@platformy.org';
const HEADERS = { 'user-agent': UA, accept: 'application/atom+xml,text/xml' };
const DEFAULT_BASE = 'https://www.sec.gov';

// WHY: hardcoded for the 8-ticker watchlist. If the watchlist exceeds ~20, pivot to a CUSIP service.
// ReadonlyMap with toTicker() runtime validation at construction (vs double-cast).
const CUSIPS = [
  ['037833100', 'AAPL'], ['594918104', 'MSFT'], ['02079K305', 'GOOGL'], ['023135106', 'AMZN'],
  ['67066G104', 'NVDA'], ['30303M102', 'META'], ['007903107', 'AMD'], ['88160R101', 'TSLA'],
] as const;
export const CUSIP_TO_TICKER: ReadonlyMap<string, Ticker> = new Map(
  CUSIPS.map(([c, t]) => [c, toTicker(t)] as const),
);

export type FundHolding = { fundName: string; fundCik: string; ticker: Ticker; shares: number;
  marketValue: number; periodOfReport: Date; filingDate: Date; accessionNumber: string };
export type FundActivism = { filerName: string; filerCik: string; ticker: Ticker;
  formType: '13D' | '13G'; percentOwnership: number; filingDate: Date;
  accessionNumber: string; filingUrl: string };
// WHY: pctChange is in percent units (×100): 50 = +50%, -100 = full exit, Infinity = new position.
export type FundPositionChange = { fundCik: string; fundName: string; ticker: Ticker;
  changeType: 'new' | 'exit' | 'increased' | 'decreased'; shareDelta: number; pctChange: number };

const ACCESSION_RE = /\/(\d{10}-\d{2}-\d{6})-index\./i;
const tag = (xml: string, n: string): string | undefined =>
  xml.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`, 'i'))?.[1]?.trim();
async function fetchXml(url: string): Promise<string | null> {
  try { const r = await fetchWithTimeout(url, { headers: HEADERS }); return r.ok ? await r.text() : null; }
  catch { return null; }
}
const feedUrl = (e: string, cik: string, t: string): string =>
  `${e}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(t)}` +
  `&dateb=&owner=include&count=10&output=atom`;

// WHY: 13F rows: <infoTable><cusip>X</cusip><value>$</value><shrsOrPrnAmt><sshPrnamt>N</sshPrnamt>...
// `value` is reported as whole USD post-2022 amendments (older filings used USD-thousands; documented gap).
function parseHoldings(xml: string): { cusip: string; value: number; shares: number }[] {
  const out: { cusip: string; value: number; shares: number }[] = [];
  for (const m of xml.matchAll(/<infoTable\b[^>]*>([\s\S]*?)<\/infoTable>/gi)) {
    const r = m[1] ?? '';
    const cusip = (tag(r, 'cusip') ?? '').toUpperCase();
    const value = Number(tag(r, 'value') ?? '0');
    const shares = Number(tag(tag(r, 'shrsOrPrnAmt') ?? '', 'sshPrnamt') ?? '0');
    if (cusip && Number.isFinite(value) && Number.isFinite(shares)) out.push({ cusip, value, shares });
  }
  return out;
}

async function fundHoldings(fundCik: string, endpoint: string): Promise<FundHolding[]> {
  const padded = fundCik.padStart(10, '0');
  const items = await fetchRss(feedUrl(endpoint, padded, '13F'), { headers: HEADERS });
  const latest = items[0]; if (!latest) return [];
  // WHY: SEC Atom <link> points at -index.htm (HTML wrapper); the raw XML lives at the
  // CDN path constructed from accession number (404s otherwise).
  const accession = latest.link.match(ACCESSION_RE)?.[1]; if (!accession) return [];
  const dir = `${endpoint}/Archives/edgar/data/${parseInt(padded, 10)}/${accession.replace(/-/g, '')}`;
  const xml = await fetchXml(`${dir}/infotable.xml`) ?? await fetchXml(`${dir}/informationtable.xml`);
  const header = await fetchXml(`${dir}/primary_doc.xml`);
  const fundName = header ? (tag(header, 'name') ?? tag(header, 'filingManager') ?? '') : '';
  const periodRaw = header ? new Date(tag(header, 'periodOfReport') ?? '') : new Date(NaN);
  const filingDate = latest.pubDate ?? new Date();
  const periodOfReport = isNaN(periodRaw.getTime()) ? filingDate : periodRaw;
  if (!xml) return [];
  return parseHoldings(xml).flatMap((h) => {
    const ticker = CUSIP_TO_TICKER.get(h.cusip);
    return ticker ? [{ fundName, fundCik: padded, ticker, shares: h.shares,
      marketValue: h.value, periodOfReport, filingDate, accessionNumber: accession }] : [];
  });
}

async function settle<T>(label: string, ids: readonly string[], work: (id: string) => Promise<T[]>): Promise<T[]> {
  const settled = await Promise.allSettled(ids.map((id) => work(id)));
  const out: T[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(...r.value);
    else console.warn(`${label} fetch failed for ${ids[i]}: ${String(r.reason)}`);
  });
  return out;
}

export const fetchNotableFund13F = (fundCiks: readonly string[], endpoint: string = DEFAULT_BASE):
  Promise<FundHolding[]> => settle('[13f]', fundCiks, (c) => fundHoldings(c, endpoint));

async function activismFor(ticker: Ticker, cutoffMs: number, endpoint: string): Promise<FundActivism[]> {
  const cik = await tickerToCik(ticker, endpoint);
  // WHY: SEC matches "SC 13" as a prefix — covers SC 13D, SC 13D/A, SC 13G, SC 13G/A.
  const items = await fetchRss(feedUrl(endpoint, cik, 'SC 13'), { headers: HEADERS });
  const out: FundActivism[] = [];
  for (const it of items) {
    if (!it.pubDate || it.pubDate.getTime() <= cutoffMs) continue;
    const accession = it.link.match(ACCESSION_RE)?.[1] ?? '';
    const formType: '13D' | '13G' = /SC\s*13D/i.test(it.title) ? '13D' : '13G';
    // WHY: percent-ownership lives in the filing primary_doc; Atom title/summary often surfaces it.
    const blob = `${it.title}\n${it.description ?? ''}`;
    const pct = Number((blob.match(/(\d+(?:\.\d+)?)\s*%/) ?? [])[1] ?? '0');
    const filerName = blob.match(/by\s+([^,]+?)\s+for/i)?.[1]?.trim() ?? '';
    out.push({ filerName, filerCik: '', ticker, formType,
      percentOwnership: Number.isFinite(pct) ? pct : 0,
      filingDate: it.pubDate, accessionNumber: accession, filingUrl: it.link });
  }
  return out;
}

export const fetchActivism = (tickers: readonly Ticker[], sinceDays: number,
  endpoint: string = DEFAULT_BASE): Promise<FundActivism[]> => {
  const cutoff = Date.now() - sinceDays * 86_400_000;
  return settle('[13dg]', tickers as readonly string[], (t) => activismFor(t as Ticker, cutoff, endpoint));
};

export function diffHoldings(
  current: readonly FundHolding[], prior: readonly FundHolding[],
): FundPositionChange[] {
  const key = (h: FundHolding): string => `${h.fundCik}:${h.ticker}`;
  const cur = new Map(current.map((h) => [key(h), h]));
  const pri = new Map(prior.map((h) => [key(h), h]));
  const out: FundPositionChange[] = [];
  for (const k of new Set([...cur.keys(), ...pri.keys()])) {
    const c = cur.get(k); const p = pri.get(k);
    const ref = (c ?? p)!;
    const base = { fundCik: ref.fundCik, fundName: ref.fundName, ticker: ref.ticker };
    // WHY: percent units (×100). New = Infinity (no prior basis), exit = -100, else d/p*100.
    if (c && !p) out.push({ ...base, changeType: 'new', shareDelta: c.shares, pctChange: Infinity });
    else if (!c && p) out.push({ ...base, changeType: 'exit', shareDelta: -p.shares, pctChange: -100 });
    else if (c && p && c.shares !== p.shares) {
      const d = c.shares - p.shares;
      const isNewBasis = p.shares === 0;
      out.push({ ...base, changeType: isNewBasis ? 'new' : (d > 0 ? 'increased' : 'decreased'),
        shareDelta: d, pctChange: isNewBasis ? Infinity : (d / p.shares) * 100 });
    }
  }
  return out;
}
