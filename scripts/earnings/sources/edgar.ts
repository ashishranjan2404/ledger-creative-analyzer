import { fetchJsonWithRetry, fetchRss } from '../_http.ts';
import type { RawItem, Ticker } from '../_types.ts';

// SEC requires a descriptive UA per https://www.sec.gov/os/accessing-edgar-data
const EDGAR_UA = 'Thedi-Personal ashish@platformy.org';
const HEADERS = { 'user-agent': EDGAR_UA, accept: 'application/json,application/atom+xml' };

const DEFAULT_BASE = 'https://www.sec.gov';

// WHY promise-cache (not Map-cache): stores the *promise* so N concurrent first-callers
// share one in-flight fetch. Map-cache leaves a TOCTOU window where parallel awaits each fire.
type CikMap = ReadonlyMap<string, string>;
type TickerRow = { cik_str: number; ticker: string; title: string };
let cikLoad: Promise<CikMap> | null = null;

function loadCikMap(endpoint: string): Promise<CikMap> {
  if (cikLoad) return cikLoad;
  cikLoad = fetchJsonWithRetry<Record<string, TickerRow>>(`${endpoint}/files/company_tickers.json`, {
    headers: HEADERS,
  })
    .then(
      (j) =>
        new Map(
          Object.values(j).map((r) => [
            r.ticker.toUpperCase(),
            String(r.cik_str).padStart(10, '0'),
          ]),
        ),
    )
    .catch((e) => {
      cikLoad = null; // don't poison cache on transient fail
      throw e;
    });
  return cikLoad;
}

export async function tickerToCik(
  ticker: Ticker,
  endpoint: string = DEFAULT_BASE,
): Promise<string> {
  const cik = (await loadCikMap(endpoint)).get(ticker.toUpperCase());
  if (!cik) throw new Error(`no CIK for ticker: ${ticker}`);
  return cik;
}

function feedUrl(endpoint: string, cik: string): string {
  return (
    `${endpoint}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}` +
    `&type=8-K&dateb=&owner=include&count=40&output=atom`
  );
}

// Test-only: drop the in-module CIK promise cache when tests swap endpoints.
export function _resetCikCache(): void {
  cikLoad = null;
}

export async function fetchRecent8K(
  tickers: readonly Ticker[],
  sinceDays: number,
  endpoint: string = DEFAULT_BASE,
): Promise<RawItem[]> {
  const cutoff = Date.now() - sinceDays * 86_400_000;
  const out: RawItem[] = [];
  // WHY: sequential with 200ms stagger to stay under SEC's 10 req/sec ceiling
  // (https://www.sec.gov/os/accessing-edgar-data); watchlist is small (≤8) so
  // total wall time is ~1.6s — acceptable for a daily poll.
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]!;
    if (i > 0) await new Promise((r) => setTimeout(r, 200));
    try {
      const cik = await tickerToCik(ticker, endpoint);
      const items = await fetchRss(feedUrl(endpoint, cik), { headers: HEADERS });
      for (const it of items) {
        // <=: an item exactly at cutoff is "as old as the window edge" → drop it.
        if (!it.pubDate || it.pubDate.getTime() <= cutoff) continue;
        const item: RawItem = {
          source: 'edgar',
          ticker,
          title: it.title,
          url: it.link,
          published: it.pubDate,
        };
        if (it.description) item.snippet = it.description;
        out.push(item);
      }
    } catch (err) {
      console.warn(`edgar fetch failed for ${ticker}: ${String(err)}`);
    }
  }
  return out;
}
