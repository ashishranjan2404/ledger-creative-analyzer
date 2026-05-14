import { fetchJson } from '../_http.ts';
import type { RawItem, Ticker } from '../_types.ts';

const DEFAULT_ENDPOINT = 'https://api.pullpush.io/reddit/search/submission';
const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';
const GAP_MS = 100;

type Post = {
  title?: string;
  permalink?: string;
  selftext?: string;
  created_utc?: number;
  subreddit?: string;
};
type Resp = { data?: readonly Post[] };

const sleep = (ms: number): Promise<void> =>
  new Promise((res) => setTimeout(res, ms));

// Fetch Reddit posts mentioning each ticker across the given subreddits.
// Acts as a backup to ApeWisdom: same data class (retail discussion), but
// raw posts rather than aggregated — useful when ApeWisdom is down or for
// queries ApeWisdom doesn't cover.
//
// PullPush rate limits: 15 req/min soft, 30 hard, 1000/hr. For a typical
// 4 subs x 8 tickers = 32 calls we sequentially fetch with a 100ms gap to
// stay comfortably under the soft cap (~10 req/s would burst over).
export async function fetchPullPushMentions(
  tickers: readonly Ticker[],
  subreddits: readonly string[],
  hoursBack: number,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<RawItem[]> {
  if (tickers.length === 0 || subreddits.length === 0) return [];
  const cutoffSec = Math.floor(Date.now() / 1000 - hoursBack * 3600);
  const headers = { 'user-agent': UA };
  const out: RawItem[] = [];
  let first = true;
  for (const sub of subreddits) {
    for (const ticker of tickers) {
      if (!first) await sleep(GAP_MS);
      first = false;
      const url = `${endpoint}?subreddit=${encodeURIComponent(sub)}`
        + `&q=${encodeURIComponent(ticker)}`
        + `&size=25&sort=desc&sort_type=created_utc`
        + `&after=${cutoffSec}`;
      try {
        const j = await fetchJson<Resp>(url, { headers });
        for (const d of j.data ?? []) {
          if (!d.created_utc || d.created_utc <= cutoffSec) continue;
          const item: RawItem = {
            source: 'pullpush',
            ticker,
            title: d.title ?? '',
            url: `https://reddit.com${d.permalink ?? ''}`,
            published: new Date(d.created_utc * 1000),
          };
          if (d.selftext) item.snippet = d.selftext.slice(0, 200);
          out.push(item);
        }
      } catch (err) {
        console.warn(`[pullpush] ${sub}/${ticker}: ${String(err)}`);
      }
    }
  }
  return out;
}
