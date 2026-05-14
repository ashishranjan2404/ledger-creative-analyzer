import { fetchJson, withCircuitBreaker } from '../_http.ts';
import { isTrackedTicker, toTicker } from '../_watchlist.ts';
import type { Ticker } from '../_types.ts';

// WHY ApeWisdom over raw Reddit: Reddit's 2024-25 app gate requires manual
// approval. ApeWisdom is purpose-built (free, keyless, pre-aggregated across
// r/wallstreetbets + r/stocks + adjacent finance subs) and exposes the same
// mention-volume + sentiment signal we wanted from Reddit, plus a 24h-prior
// baseline for free — froth detection no longer needs its own baseline store.

const DEFAULT_ENDPOINT = 'https://apewisdom.io/api/v1.0/filter';
const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';

export type ApeWisdomFilter = 'all-stocks' | 'wallstreetbets' | 'stocks';

export type ApeWisdomMention = {
  ticker: Ticker;
  name: string;
  mentions: number;
  mentionsPrior24h: number;
  rank: number;
  sentimentLabel: string; // 'Bullish' | 'Neutral' | 'Bearish' | other
  sentimentScore: number; // 0..1 (ApeWisdom convention)
  upvotes: number;
};

type Row = {
  rank?: number | string;
  ticker?: string;
  name?: string;
  mentions?: number | string;
  upvotes?: number | string;
  rank_24h_ago?: number | string;
  mentions_24h_ago?: number | string;
  sentiment?: string;
  sentiment_score?: number | string;
};
type Resp = { results?: readonly Row[] };

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

// Filters a watchlist subset out of one ApeWisdom page (the API returns top-N
// tickers ranked by mention volume; for an 8-ticker watchlist the first page
// is sufficient — popular tickers like NVDA/MSFT live in the top 50).
export async function fetchApeWisdom(
  tickers: readonly Ticker[],
  filter: ApeWisdomFilter = 'all-stocks',
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<ApeWisdomMention[]> {
  if (tickers.length === 0) return [];
  const want = new Set<string>(tickers);
  const url = `${endpoint}/${filter}`;
  const r = await withCircuitBreaker('apewisdom', () =>
    fetchJson<Resp>(url, { headers: { 'user-agent': UA } }),
  );
  const rows = r.results ?? [];
  const out: ApeWisdomMention[] = [];
  for (const row of rows) {
    if (!row.ticker || !want.has(row.ticker) || !isTrackedTicker(row.ticker)) continue;
    out.push({
      ticker: toTicker(row.ticker),
      name: row.name ?? '',
      mentions: num(row.mentions),
      mentionsPrior24h: num(row.mentions_24h_ago),
      rank: num(row.rank),
      sentimentLabel: row.sentiment ?? '',
      sentimentScore: num(row.sentiment_score),
      upvotes: num(row.upvotes),
    });
  }
  return out;
}
