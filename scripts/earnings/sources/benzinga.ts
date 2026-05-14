import { fetchJson } from '../_http.ts';
import type { RawItem, Ticker } from '../_types.ts';
import { toTicker } from '../_watchlist.ts';

// WHY single batched call: Benzinga's free /v2/news endpoint accepts a
// comma-separated `tickers` filter, so one HTTP round-trip covers the whole
// watchlist. No Promise.allSettled fan-out — if the call fails, the caller
// (scout aggregator) decides whether to swallow; we shouldn't silently lose
// every ticker on a transient 5xx.
const DEFAULT_ENDPOINT = 'https://api.benzinga.com/api/v2/news';

type BenzingaStock = { name?: string };
type BenzingaItem = {
  id?: number;
  title?: string;
  url?: string;
  body?: string;
  created?: string;
  stocks?: BenzingaStock[];
};

// WHY regex (not DOM/sax): Benzinga `body` is short HTML (paragraphs +
// anchors); regex replace is faster than spinning up a parser and avoids a
// dep. Decodes the 5 named entities Benzinga actually emits. Replacing tags
// with a space (not '') prevents silently merging adjacent words like
// `<b>foo</b><b>bar</b>` → `foobar`.
const ENTS: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ENTS[e] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchBenzingaNews(
  tickers: readonly Ticker[],
  hoursBack: number,
  apiKey: string,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<RawItem[]> {
  if (tickers.length === 0) return [];
  const cutoff = Date.now() - hoursBack * 3_600_000;
  const u = new URL(endpoint);
  u.searchParams.set('token', apiKey);
  u.searchParams.set('tickers', tickers.join(','));
  u.searchParams.set('displayOutput', 'full');
  u.searchParams.set('pageSize', '50');
  const items = await fetchJson<BenzingaItem[]>(u.toString());
  const watch = new Set<string>(tickers);
  const out: RawItem[] = [];
  for (const it of items) {
    if (!it.created || !it.title || !it.url) continue;
    const pub = new Date(it.created);
    // WHY <= (not <): drop items exactly at the boundary — conservative and
    // matches the edgar adapter's window semantics.
    if (isNaN(pub.getTime()) || pub.getTime() <= cutoff) continue;
    const snippet = it.body ? stripHtml(it.body).slice(0, 200) : '';
    for (const s of it.stocks ?? []) {
      // WHY toUpperCase: Benzinga has historically returned mixed-case
      // symbols on some tags; cheap defense against silent miss.
      const name = s.name?.toUpperCase();
      if (!name || !watch.has(name)) continue;
      const item: RawItem = {
        source: 'benzinga',
        ticker: toTicker(name),
        title: it.title,
        url: it.url,
        published: pub,
      };
      if (snippet) item.snippet = snippet;
      out.push(item);
    }
  }
  return out;
}
