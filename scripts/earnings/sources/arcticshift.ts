import { fetchJson } from '../_http.ts';
import { acquireToken } from '../_ratelimit.ts';
import type { RawItem, Ticker } from '../_types.ts';

// Arctic-Shift is a Pushshift alternative that supports full-text search
// per-subreddit (it does NOT support Reddit-wide search like PullPush).
// Useful as a 3rd-tier fallback when both ApeWisdom and PullPush degrade.
// Docs: https://arctic-shift.photon-reddit.com/api
const DEFAULT_ENDPOINT = 'https://arctic-shift.photon-reddit.com/api/posts/search';
const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';
const RL_KEY = 'arctic_shift';
const RL_OPTS = { capacity: 10, refillPerMinute: 30 } as const;

type Post = {
  title?: string;
  permalink?: string;
  selftext?: string;
  created_utc?: number;
  subreddit?: string;
};
type Resp = { data?: readonly Post[] };

export async function fetchArcticShiftMentions(
  tickers: readonly Ticker[],
  subreddits: readonly string[],
  hoursBack: number,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<RawItem[]> {
  if (tickers.length === 0 || subreddits.length === 0) return [];
  const cutoffSec = Math.floor(Date.now() / 1000 - hoursBack * 3600);
  const headers = { 'user-agent': UA };
  const out: RawItem[] = [];
  for (const sub of subreddits) {
    for (const ticker of tickers) {
      await acquireToken(RL_KEY, RL_OPTS);
      const url = `${endpoint}?subreddit=${encodeURIComponent(sub)}`
        + `&selftext=${encodeURIComponent(ticker)}`
        + `&after=${cutoffSec}&limit=25&sort=desc`;
      try {
        const j = await fetchJson<Resp>(url, { headers });
        for (const d of j.data ?? []) {
          if (!d.created_utc || d.created_utc <= cutoffSec) continue;
          const item: RawItem = {
            source: 'arctic_shift',
            ticker,
            title: d.title ?? '',
            url: `https://reddit.com${d.permalink ?? ''}`,
            published: new Date(d.created_utc * 1000),
          };
          if (d.selftext) item.snippet = d.selftext.slice(0, 200);
          out.push(item);
        }
      } catch (err) {
        console.warn(`[arctic_shift] ${sub}/${ticker}: ${String(err)}`);
      }
    }
  }
  return out;
}
