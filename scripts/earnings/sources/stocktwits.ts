import { fetchJson, withCircuitBreaker } from '../_http.ts';
import type { Ticker } from '../_types.ts';

export type StocktwitsSentiment = 'Bullish' | 'Bearish' | null;

export type StocktwitsItem = {
  ticker: Ticker;
  body: string;
  sentiment: StocktwitsSentiment;
  url: string;
  published: Date;
};

// WHY: StockTwits free streams API tags sentiment only when a poster clicked
// Bullish/Bearish in the composer; most messages have none. Keep null distinct
// from "missing" so consumers can weight signal vs. noise. id may arrive as
// number or string depending on endpoint version.
type StocktwitsMessage = {
  id?: number | string;
  body?: string;
  created_at?: string;
  entities?: { sentiment?: { basic?: string } | null } | null;
  user?: { username?: string } | null;
};
type StocktwitsResp = { messages?: StocktwitsMessage[] };

const DEFAULT_ENDPOINT = 'https://api.stocktwits.com/api/2';

function toSentiment(m: StocktwitsMessage): StocktwitsSentiment {
  const b = m.entities?.sentiment?.basic;
  return b === 'Bullish' || b === 'Bearish' ? b : null;
}

function toItem(ticker: Ticker, m: StocktwitsMessage): StocktwitsItem | null {
  const username = m.user?.username;
  if (!username || m.id == null || !m.body || !m.created_at) return null;
  const published = new Date(m.created_at);
  if (isNaN(published.getTime())) return null;
  // URL constructor handles reserved chars in usernames cleanly.
  const url = new URL(
    `/${encodeURIComponent(username)}/message/${m.id}`,
    'https://stocktwits.com/',
  ).toString();
  return {
    ticker,
    body: m.body,
    sentiment: toSentiment(m),
    url,
    published,
  };
}

export async function fetchStocktwitsForTicker(
  ticker: Ticker,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<StocktwitsItem[]> {
  const url = `${endpoint}/streams/symbol/${encodeURIComponent(ticker)}.json`;
  const json = await withCircuitBreaker('stocktwits', () =>
    fetchJson<StocktwitsResp>(url),
  );
  const out: StocktwitsItem[] = [];
  for (const m of json.messages ?? []) {
    const item = toItem(ticker, m);
    if (item) out.push(item);
  }
  return out;
}

export async function fetchStocktwitsForTickers(
  tickers: readonly Ticker[],
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<StocktwitsItem[]> {
  const settled = await Promise.allSettled(
    tickers.map((t) => fetchStocktwitsForTicker(t, endpoint)),
  );
  return settled.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[stocktwits] ${tickers[i]!}: ${String(r.reason)}`);
    return [];
  });
}
