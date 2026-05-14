// L7 secular trend detector: arxiv + HN mention velocity per ticker, plus a
// per-ticker USPTO patent-grant count as a leading R&D-output proxy. Per-
// keyword fetches via Promise.allSettled; per-keyword failures are warned and
// dropped. If ALL keywords fail for a metric's *current* bucket, the metric is
// left undefined (avoids misleading 'decelerating' from current=0 vs prior>0).
import { fetchJson, fetchRss } from '../_http.ts';
import { fetchPatentGrants } from '../sources/uspto.ts';
import type { Ticker } from '../_types.ts';

export type SecularTrend = 'accelerating' | 'flat' | 'decelerating';

export type SecularSignal = {
  ticker: Ticker;
  asOf: Date;
  arxivMentions90d?: number;
  arxivMentions90dPriorPeriod?: number;
  arxivTrend?: SecularTrend;
  hnMentions90d?: number;
  hnMentions90dPriorPeriod?: number;
  hnTrend?: SecularTrend;
  // L7 patents: grant count over the last 180d + a few most-recent titles. Absent
  // (not just zero) when the ticker has no assignee mapping or USPTO call failed.
  patents?: { count: number; recentTitles: string[] };
};

export const TICKER_SECULAR_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  NVDA: ['CUDA', 'GPU training', 'transformer training'],
  MSFT: ['Azure AI', 'Copilot', 'OpenAI integration'],
  GOOGL: ['Gemini', 'TPU', 'Vertex AI'],
  AMZN: ['AWS Bedrock', 'SageMaker', 'Inferentia'],
  META: ['Llama', 'PyTorch', 'Reality Labs'],
  AMD: ['ROCm', 'MI300', 'Instinct'],
  TSLA: ['Dojo', 'FSD', 'Optimus'],
  AAPL: ['Apple Silicon', 'CoreML', 'Vision Pro'],
};

// Canonical USPTO assignee organization strings. PatentsView matches via
// `_contains` against `assignees_at_grant.assignee_organization` (case-
// insensitive substring), so we use the legal-entity name that appears on the
// grant cover sheet — NOT the brand. Ambiguous cases commented inline.
export const TICKER_TO_PATENT_ASSIGNEE: Readonly<Record<string, string>> = {
  // Apple files under the parent entity directly.
  AAPL: 'Apple Inc.',
  // MSFT: nearly all post-2014 grants assigned to the IP-holding subsidiary,
  // not "Microsoft Corporation". `_contains` would over-match "Microsoft" to
  // joint-venture noise (Microsoft Mobile Oy etc.), so we pin the LLC name.
  MSFT: 'Microsoft Technology Licensing, LLC',
  // Alphabet's primary tech IP holder remains Google LLC; very few grants are
  // on the holding co directly. "Alphabet Inc." would miss the bulk.
  GOOGL: 'Google LLC',
  // Amazon Technologies, Inc. holds the patent portfolio; "Amazon.com, Inc."
  // gets retail/logistics filings only. Tech subsidiary is the right anchor.
  AMZN: 'Amazon Technologies, Inc.',
  // NVIDIA files corporate-wide under the single legal entity.
  NVDA: 'NVIDIA Corporation',
  // Meta rebranded the assignee from "Facebook, Inc." to "Meta Platforms, Inc."
  // in 2022; only the new name is relevant for a 180d window today.
  META: 'Meta Platforms, Inc.',
  // AMD files under the single legal entity.
  AMD: 'Advanced Micro Devices, Inc.',
  // Tesla, Inc. — single legal entity, includes auto + energy + Optimus filings.
  TSLA: 'Tesla, Inc.',
};

const DAY_MS = 86_400_000;
const WIN_DAYS = 90;
const ARXIV_DEFAULT = 'http://export.arxiv.org/api/query';
const HN_DEFAULT = 'https://hn.algolia.com/api/v1/search_by_date';

function trend(current: number, prior: number): SecularTrend {
  if (prior === 0) return current > 0 ? 'accelerating' : 'flat';
  if (current > prior * 1.2) return 'accelerating';
  if (current < prior * 0.8) return 'decelerating';
  return 'flat';
}

// Items missing pubDate are dropped — arxiv populates <updated> on every entry,
// so absence ⇒ malformed (not "today"-coerced).
function countInWindow(items: readonly { pubDate?: Date }[], from: number, to: number): number {
  let n = 0;
  for (const it of items) {
    const t = it.pubDate?.getTime();
    if (t != null && t >= from && t < to) n++;
  }
  return n;
}

async function arxivCount(
  endpoint: string, keyword: string, fromMs: number, toMs: number,
): Promise<number> {
  // Quoted phrase preserves multi-word keywords like "GPU training".
  const url = `${endpoint}?search_query=${encodeURIComponent(`all:"${keyword}"`)}&start=0&max_results=200&sortBy=submittedDate&sortOrder=descending`;
  const items = await fetchRss(url);
  return countInWindow(items, fromMs, toMs);
}

// Bounded date-range query (server-side filter via numericFilters) so each call
// returns just the window's count via nbHits — no client-side subtraction, no
// 200-hit cap risk (hitsPerPage=0 returns metadata only).
async function hnCount(
  endpoint: string, keyword: string, fromMs: number, toMs: number,
): Promise<number> {
  const fromUnix = Math.floor(fromMs / 1000);
  const toUnix = Math.floor(toMs / 1000);
  const filters = `created_at_i>${fromUnix},created_at_i<${toUnix}`;
  const url = `${endpoint}?query=${encodeURIComponent(keyword)}&tags=story&numericFilters=${encodeURIComponent(filters)}&hitsPerPage=0`;
  const j = await fetchJson<{ nbHits?: number }>(url);
  return j.nbHits ?? 0;
}

// Sum across keywords. `ok` counts successes; caller decides what to do with it
// (current bucket needs ok>0 to publish a metric — see fetchSecularSignal).
function sumOk<T>(
  rs: readonly PromiseSettledResult<T>[], pick: (v: T) => number, label: string,
): { sum: number; ok: number } {
  let sum = 0, ok = 0;
  for (const r of rs) {
    if (r.status === 'fulfilled') { sum += pick(r.value); ok++; }
    else console.warn(`[secular] ${label}:`, r.reason instanceof Error ? r.reason.message : r.reason);
  }
  return { sum, ok };
}

export async function fetchSecularSignal(
  ticker: Ticker,
  options?: {
    arxivEndpoint?: string;
    hnEndpoint?: string;
    usptoEndpoint?: string;
    now?: Date;
  },
): Promise<SecularSignal> {
  const asOf = options?.now ?? new Date();
  const keywords = TICKER_SECULAR_KEYWORDS[ticker] ?? [];
  const assignee = TICKER_TO_PATENT_ASSIGNEE[ticker];
  // No keywords AND no assignee → genuinely nothing to fetch. If we still have an
  // assignee, fall through so patents render alone.
  if (keywords.length === 0 && !assignee) return { ticker, asOf };

  const arxivEp = options?.arxivEndpoint ?? ARXIV_DEFAULT;
  const hnEp = options?.hnEndpoint ?? HN_DEFAULT;
  const now = asOf.getTime();
  const cFrom = now - WIN_DAYS * DAY_MS;
  const pFrom = now - 2 * WIN_DAYS * DAY_MS;

  // Four-wave grouped fan-out: arxiv (current+prior share one fetch), HN current,
  // HN prior, USPTO (single call). Promise.allSettled keeps each independent.
  const [arxivS, hnRecentS, hnPriorS, usptoS] = await Promise.all([
    Promise.allSettled(keywords.map((k) => Promise.all([
      arxivCount(arxivEp, k, cFrom, now),
      arxivCount(arxivEp, k, pFrom, cFrom),
    ]))),
    Promise.allSettled(keywords.map((k) => hnCount(hnEp, k, cFrom, now))),
    Promise.allSettled(keywords.map((k) => hnCount(hnEp, k, pFrom, cFrom))),
    assignee
      ? fetchPatentGrants(assignee, 180, options?.usptoEndpoint)
      : Promise.resolve(null),
  ]);

  const arxivCur = sumOk(arxivS, (v) => v[0], 'arxiv');
  const arxivPri = sumOk(arxivS, (v) => v[1], 'arxiv');
  const hnCur = sumOk(hnRecentS, (v) => v, 'hn');
  const hnPri = sumOk(hnPriorS, (v) => v, 'hn');

  const out: SecularSignal = { ticker, asOf };
  // Bug fix: require ok>0 in the *current* bucket. If every current-keyword fails
  // we'd otherwise emit current=0 vs prior>0 ⇒ misleading 'decelerating'. Prior
  // ok=0 is fine — prior=0 just means "nothing in the older window" (genuine).
  if (arxivCur.ok > 0) {
    out.arxivMentions90d = arxivCur.sum;
    out.arxivMentions90dPriorPeriod = arxivPri.sum;
    out.arxivTrend = trend(arxivCur.sum, arxivPri.sum);
  }
  if (hnCur.ok > 0) {
    out.hnMentions90d = hnCur.sum;
    out.hnMentions90dPriorPeriod = hnPri.sum;
    out.hnTrend = trend(hnCur.sum, hnPri.sum);
  }
  // USPTO: omit the field entirely when the call failed (null) so a render layer
  // can distinguish "no mapping / endpoint dead" from "0 grants in 180d".
  // fetchPatentGrants already catches its own errors → returns null on failure,
  // so we don't need an outer settled wrapper here.
  if (usptoS) {
    out.patents = usptoS;
  }
  return out;
}
