import { fetchRss, type RssItem } from '../_http.ts';
import { acquireToken } from '../_ratelimit.ts';
import type { RawItem, Ticker } from '../_types.ts';

// Reddit's unauthenticated per-subreddit search RSS feeds. Heavily rate-limited
// (10 req/min, may 403 based on header heuristics). Useful as last-resort
// fallback when ApeWisdom + PullPush + Arctic-Shift are all unavailable.
// Endpoint: https://www.reddit.com/r/{sub}/search.rss?q={ticker}&restrict_sr=1&sort=new&t=day

const DEFAULT_ENDPOINT = 'https://www.reddit.com';
const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';
const RATE_OPTS = { capacity: 5, refillPerMinute: 10 } as const;

function feedUrl(endpoint: string, sub: string, ticker: Ticker): string {
  const u = new URL(`${endpoint}/r/${sub}/search.rss`);
  u.searchParams.set('q', ticker);
  u.searchParams.set('restrict_sr', '1');
  u.searchParams.set('sort', 'new');
  u.searchParams.set('t', 'day');
  return u.toString();
}

function toRaw(ticker: Ticker, it: RssItem, cutoffMs: number): RawItem | null {
  // Drop undated: cannot window-filter Reddit RSS items without a pubDate.
  if (!it.pubDate || it.pubDate.getTime() <= cutoffMs) return null;
  const item: RawItem = {
    source: 'reddit_rss',
    ticker,
    title: it.title,
    url: it.link,
    published: it.pubDate,
  };
  if (it.description) item.snippet = it.description;
  return item;
}

export async function fetchRedditRssMentions(
  tickers: readonly Ticker[],
  subreddits: readonly string[],
  hoursBack: number,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<RawItem[]> {
  if (tickers.length === 0 || subreddits.length === 0) return [];
  const cutoffMs = Date.now() - hoursBack * 3_600_000;
  const headers = { 'user-agent': UA };
  const out: RawItem[] = [];
  // Sequential: acquireToken is the throttle; parallelism would just queue on
  // the bucket. Reddit's 10/min cap + 5-token burst is too tight for fan-out.
  for (const sub of subreddits) {
    for (const ticker of tickers) {
      await acquireToken('reddit_rss', RATE_OPTS);
      try {
        const items = await fetchRss(feedUrl(endpoint, sub, ticker), { headers });
        for (const it of items) {
          const raw = toRaw(ticker, it, cutoffMs);
          if (raw) out.push(raw);
        }
      } catch (err) {
        // 403 from header heuristics is the most common failure — log + skip.
        console.warn(`[reddit_rss] ${sub}/${ticker}: ${String(err)}`);
      }
    }
  }
  return out;
}
