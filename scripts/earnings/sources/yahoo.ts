import { fetchRss, withCircuitBreaker, type RssItem } from '../_http.ts';
import type { RawItem, Ticker } from '../_types.ts';

// WHY default endpoint: Yahoo's free RSS surface for per-symbol headlines.
// Public, unauth, no rate-limit headers — keep poll cadence light upstream.
const DEFAULT_ENDPOINT = 'https://feeds.finance.yahoo.com/rss/2.0/headline';

// WHY URL+searchParams (vs string concat): handles encoding once, lets the
// caller pass an endpoint already carrying ?foo=bar without us double-?ing.
function feedUrl(endpoint: string, ticker: Ticker): string {
  const u = new URL(endpoint);
  u.searchParams.set('s', ticker);
  u.searchParams.set('region', 'US');
  u.searchParams.set('lang', 'en-US');
  return u.toString();
}

function toRaw(ticker: Ticker, it: RssItem, cutoffMs: number): RawItem | null {
  // WHY drop undated: Yahoo occasionally emits malformed pubDate; we cannot
  // window-filter without a date, so the item is effectively unranked noise.
  if (!it.pubDate || it.pubDate.getTime() <= cutoffMs) return null;
  const item: RawItem = {
    source: 'yahoo',
    ticker,
    title: it.title,
    url: it.link,
    published: it.pubDate,
  };
  if (it.description) item.snippet = it.description;
  return item;
}

// WHY: Yahoo's RSS endpoint occasionally returns 200 with an HTML body
// (transient edge cache hiccup) — parseFeed yields [] in that case. One
// retry with a 250ms delay catches these without slamming the upstream.
// Network/HTTP errors are already retried by the circuit breaker / our
// general fetch path; this guards specifically against the silent-empty case.
async function fetchYahooWithParseRetry(url: string): Promise<RssItem[]> {
  const first = await fetchRss(url);
  if (first.length > 0) return first;
  await new Promise((r) => setTimeout(r, 250));
  return fetchRss(url);
}

export async function fetchYahooNews(
  tickers: readonly Ticker[],
  hoursBack: number,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<RawItem[]> {
  if (tickers.length === 0) return [];
  const cutoffMs = Date.now() - hoursBack * 3_600_000;
  const settled = await Promise.allSettled(
    tickers.map((t) =>
      withCircuitBreaker('yahoo', () => fetchYahooWithParseRetry(feedUrl(endpoint, t))).then(
        (items) => ({ t, items }),
      ),
    ),
  );
  const out: RawItem[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === 'rejected') {
      console.warn(`[yahoo] ${tickers[i]}: ${String(r.reason)}`);
      continue;
    }
    for (const it of r.value.items) {
      const raw = toRaw(r.value.t, it, cutoffMs);
      if (raw) out.push(raw);
    }
  }
  return out;
}
