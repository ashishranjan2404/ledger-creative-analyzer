import { fetchJson } from '../_http.ts';
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
      const data = await fetchJson<FinnhubResp>(buildUrl(endpoint, t, from, to, apiKey));
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
