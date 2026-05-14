import { fetchJsonWithRetry } from '../_http.ts';
import type { EarningsEvent, Ticker } from '../_types.ts';
import { toTicker } from '../_watchlist.ts';

// WHY: /v2/reference/earnings/{ticker} is dead (404 since Polygon's API redesign).
// /vX/reference/financials is the live replacement — returns quarterly reports
// with filing_date (when the company actually filed/announced) plus end_date
// (the fiscal-period end). We filter by filing_date.gte/lte because that's the
// "calendar" the cron cares about — period_of_report_date / end_date are the
// fiscal quarter close, which lands weeks-to-months before the announcement
// and would silently miss every upcoming-earnings event. No EPS/revenue
// estimates on free tier (those need Benzinga add-on), so we surface dates
// only as a fallback for tickers Finnhub missed.
const POLYGON_BASE = 'https://api.polygon.io';

type Financial = {
  tickers?: string[];
  filing_date?: string;
  end_date?: string;
  company_name?: string;
};
type PolygonResponse = { results?: Financial[]; status?: string };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toEvent(t: Ticker, f: Financial): EarningsEvent | null {
  // WHY filing_date ?? end_date: pragmatic defense if Polygon occasionally
  // returns a record without filing_date populated (observed for late filers).
  const dateStr = f.filing_date ?? f.end_date;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  // WHY use request ticker, not f.tickers[0]: defensive against API mis-keyed
  // responses; the request was for `t`, so the event belongs to `t`.
  return {
    ticker: t,
    companyName: '',
    reportDate: d,
    reportTime: 'unknown',
    source: 'polygon',
  };
}

export async function fetchPolygonEarnings(
  tickers: readonly Ticker[],
  dateFrom: Date,
  dateTo: Date,
  apiKey: string,
  endpoint: string = POLYGON_BASE,
): Promise<EarningsEvent[]> {
  const from = ymd(dateFrom);
  const to = ymd(dateTo);
  const results = await Promise.allSettled(
    tickers.map(async (t) => {
      const url =
        `${endpoint}/vX/reference/financials` +
        `?ticker=${encodeURIComponent(t)}` +
        `&filing_date.gte=${from}` +
        `&filing_date.lte=${to}` +
        `&apiKey=${encodeURIComponent(apiKey)}`;
      const json = await fetchJsonWithRetry<PolygonResponse>(url);
      const out: EarningsEvent[] = [];
      for (const r of json.results ?? []) {
        const ev = toEvent(toTicker(t), r);
        if (ev) out.push(ev);
      }
      return out;
    }),
  );
  const out: EarningsEvent[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r?.status === 'fulfilled') out.push(...r.value);
    else if (r?.status === 'rejected') {
      console.warn(`polygon fetch failed for ${tickers[i]}: ${String(r.reason)}`);
    }
  }
  return out;
}
