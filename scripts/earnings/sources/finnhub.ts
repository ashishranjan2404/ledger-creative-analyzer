import { fetchJsonWithRetry } from '../_http.ts';
import type { EarningsEvent, Ticker } from '../_types.ts';
import { toTicker } from '../_watchlist.ts';

type FinnhubRow = {
  symbol: string;
  date: string;
  hour: 'bmo' | 'amc' | '';
  epsEstimate: number | null;
  revenueEstimate: number | null;
};
type FinnhubResp = { earningsCalendar?: FinnhubRow[] };

const HOUR_TO_TIME: Record<FinnhubRow['hour'], EarningsEvent['reportTime']> = {
  bmo: 'BMO',
  amc: 'AMC',
  '': 'unknown',
};

const DEFAULT_ENDPOINT = 'https://finnhub.io/api/v1/calendar/earnings';
// Quote + profile2 share Finnhub's /api/v1 root; default base lets tests inject a mock.
const DEFAULT_QUOTE_BASE = 'https://finnhub.io/api/v1';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildUrl(
  endpoint: string,
  symbol: string,
  from: string,
  to: string,
  token: string,
): string {
  const u = new URL(endpoint);
  u.searchParams.set('from', from);
  u.searchParams.set('to', to);
  u.searchParams.set('symbol', symbol);
  u.searchParams.set('token', token);
  return u.toString();
}

function toEvent(row: FinnhubRow): EarningsEvent {
  const ev: EarningsEvent = {
    ticker: toTicker(row.symbol),
    companyName: '',
    reportDate: new Date(row.date),
    reportTime: HOUR_TO_TIME[row.hour] ?? 'unknown',
    source: 'finnhub',
  };
  if (row.epsEstimate != null) ev.epsEstimate = row.epsEstimate;
  if (row.revenueEstimate != null) ev.revenueEstimate = row.revenueEstimate;
  return ev;
}

// WHY MILLIONS: Finnhub's stock/profile2.shareOutstanding is in MILLIONS of shares
// (per their docs); multiply by 1e6 for an absolute count consumable by valuation.ts.
type QuoteResp = { c?: number | null };
type Profile2Resp = { shareOutstanding?: number | null };

export async function fetchQuoteAndShares(
  ticker: Ticker,
  apiKey: string,
  endpoint: string = DEFAULT_QUOTE_BASE,
): Promise<{ price: number; sharesOutstanding: number } | null> {
  const sym = encodeURIComponent(ticker);
  const tk = encodeURIComponent(apiKey);
  // Parallel: half the wall-clock vs sequential; either failure → null (graceful).
  try {
    const [q, p] = await Promise.all([
      fetchJsonWithRetry<QuoteResp>(`${endpoint}/quote?symbol=${sym}&token=${tk}`),
      fetchJsonWithRetry<Profile2Resp>(`${endpoint}/stock/profile2?symbol=${sym}&token=${tk}`),
    ]);
    const price = typeof q.c === 'number' ? q.c : NaN;
    const sharesMm = typeof p.shareOutstanding === 'number' ? p.shareOutstanding : NaN;
    if (!Number.isFinite(price) || price <= 0) return null;
    if (!Number.isFinite(sharesMm) || sharesMm <= 0) return null;
    return { price, sharesOutstanding: sharesMm * 1_000_000 };
  } catch (e) {
    console.warn(`[finnhub-quote] ${ticker}: ${String(e)}`);
    return null;
  }
}

// WHY estimate-shape: Finnhub /stock/estimate returns `data[]` with per-period rows
// keyed by `period` (YYYY-MM-DD year-end) and `epsAvg` (mean analyst EPS). Free tier
// returns annual rows; we pick (current=largest year, prior=largest year - 1).
// Returns null on missing key, empty data, network failure, or insufficient history.
type EstimateRow = { period?: string; epsAvg?: number | null };
type EstimateResp = { data?: EstimateRow[]; symbol?: string; freq?: string };

export async function fetchEpsEstimates(
  ticker: Ticker,
  apiKey: string,
  endpoint: string = DEFAULT_QUOTE_BASE,
): Promise<{ current: number; priorYear: number } | null> {
  const sym = encodeURIComponent(ticker);
  const tk = encodeURIComponent(apiKey);
  try {
    const j = await fetchJsonWithRetry<EstimateResp>(
      `${endpoint}/stock/estimate?symbol=${sym}&token=${tk}`,
    );
    const rows = Array.isArray(j.data) ? j.data : [];
    // Each row covers a fiscal year-end period. Sort ascending so [-1] = next/current
    // year estimate, [-2] = prior. Filter to rows with both period + finite epsAvg so
    // empty-array and partial-row payloads degrade to null instead of throwing.
    const clean = rows
      .filter((r): r is { period: string; epsAvg: number } =>
        typeof r.period === 'string' && typeof r.epsAvg === 'number' && Number.isFinite(r.epsAvg))
      .sort((a, b) => a.period.localeCompare(b.period));
    if (clean.length < 2) return null;
    const current = clean[clean.length - 1]!.epsAvg;
    const priorYear = clean[clean.length - 2]!.epsAvg;
    return { current, priorYear };
  } catch (e) {
    console.warn(`[finnhub-estimate] ${ticker}: ${String(e)}`);
    return null;
  }
}

export async function fetchFinnhubEarnings(
  tickers: readonly Ticker[],
  dateFrom: Date,
  dateTo: Date,
  apiKey: string,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<EarningsEvent[]> {
  const from = ymd(dateFrom);
  const to = ymd(dateTo);
  const settled = await Promise.allSettled(
    tickers.map(async (t) => {
      const data = await fetchJsonWithRetry<FinnhubResp>(buildUrl(endpoint, t, from, to, apiKey));
      return (data.earningsCalendar ?? []).map(toEvent);
    }),
  );
  const out: EarningsEvent[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === 'fulfilled') out.push(...r.value);
    else console.warn(`[finnhub] ${tickers[i]}: ${String(r.reason)}`);
  }
  return out;
}
