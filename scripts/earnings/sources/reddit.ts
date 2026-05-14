import { fetchJson } from '../_http.ts';
import type { RawItem, Ticker } from '../_types.ts';

const DEFAULT_ENDPOINT = 'https://www.reddit.com';
const DEFAULT_OAUTH = 'https://www.reddit.com/api/v1/access_token';
const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';

// Registered with the Reddit app at reddit.com/prefs/apps. Unused by today's
// client_credentials grant, but documented here so a future authorization_code
// migration knows where the callback lives. If we ever wire that flow,
// implement an endpoint at this path that exchanges the `code` for a token.
export const REDDIT_REDIRECT_URI = 'https://thedi.butterbase.dev/auth/reddit/callback';

type TokenResp = { access_token: string; expires_in: number };
type Cached = { token: string; expiresAt: number };
type Post = { data: { title?: string; permalink?: string; selftext?: string; created_utc?: number } };
type SearchResp = { data?: { children?: Post[] } };

// WHY promise-cache (mirrors edgar.ts): N concurrent first-callers share one in-flight
// OAuth POST. Map-cache leaves a TOCTOU window where parallel awaits each fire.
// Singleton (not keyed by id) — only one set of credentials at a time in this CLI.
let tokenLoad: Promise<Cached> | null = null;

export function _resetRedditToken(): void { tokenLoad = null; }

function fetchToken(oauth: string, id: string, secret: string): Promise<Cached> {
  // Fast path: cached promise still in-flight or resolved fresh.
  if (tokenLoad) {
    const inflight = tokenLoad;
    return inflight.then((c) => {
      if (c.expiresAt > Date.now()) return c;
      // Expired: ensure exactly one refresh fires by re-checking the slot.
      // If another caller already replaced tokenLoad with a fresh promise, use it.
      if (tokenLoad === inflight) refresh(oauth, id, secret);
      return tokenLoad!;
    });
  }
  refresh(oauth, id, secret);
  return tokenLoad!;
}

function refresh(oauth: string, id: string, secret: string): void {
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const p: Promise<Cached> = fetchJson<TokenResp>(oauth, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': UA,
    },
    body: 'grant_type=client_credentials',
  }).then((r) => ({ token: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 }))
    .catch((e) => { if (tokenLoad === p) tokenLoad = null; throw e; });
  tokenLoad = p;
}

export async function fetchRedditMentions(
  tickers: readonly Ticker[],
  subreddits: readonly string[],
  hoursBack: number,
  clientId: string,
  clientSecret: string,
  endpoint: string = DEFAULT_ENDPOINT,
  oauthEndpoint: string = DEFAULT_OAUTH,
): Promise<RawItem[]> {
  if (tickers.length === 0 || subreddits.length === 0) return [];
  const { token } = await fetchToken(oauthEndpoint, clientId, clientSecret);
  const cutoffSec = Date.now() / 1000 - hoursBack * 3600;
  const headers = { authorization: `Bearer ${token}`, 'user-agent': UA };
  const pairs = subreddits.flatMap((sub) => tickers.map((ticker) => [sub, ticker] as const));
  const settled = await Promise.allSettled(pairs.map(async ([sub, ticker]) => {
    const url = `${endpoint}/r/${sub}/search.json`
      + `?q=${encodeURIComponent(ticker)}&restrict_sr=1&sort=new&limit=25&t=day`;
    const j = await fetchJson<SearchResp>(url, { headers });
    const out: RawItem[] = [];
    for (const { data: d } of j.data?.children ?? []) {
      if (!d.created_utc || d.created_utc <= cutoffSec) continue;
      const item: RawItem = {
        source: 'reddit', ticker, title: d.title ?? '',
        url: `https://reddit.com${d.permalink ?? ''}`,
        published: new Date(d.created_utc * 1000),
      };
      if (d.selftext) item.snippet = d.selftext.slice(0, 200);
      out.push(item);
    }
    return out;
  }));
  const out: RawItem[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === 'fulfilled') { out.push(...r.value); continue; }
    const [sub, ticker] = pairs[i]!;
    console.warn(`[reddit] ${sub}/${ticker}: ${String(r.reason)}`);
  }
  return out;
}
