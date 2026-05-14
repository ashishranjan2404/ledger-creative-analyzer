// L7 secular trend detector: arxiv + HN mention velocity per ticker.
// Per-keyword fetches via Promise.allSettled; per-keyword failures are warned and
// dropped. If ALL keywords fail for a metric's *current* bucket, the metric is left
// undefined (avoids misleading 'decelerating' from current=0 vs prior>0).
import { fetchJson, fetchRss } from '../_http.ts';
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
  options?: { arxivEndpoint?: string; hnEndpoint?: string; now?: Date },
): Promise<SecularSignal> {
  const asOf = options?.now ?? new Date();
  const keywords = TICKER_SECULAR_KEYWORDS[ticker] ?? [];
  if (keywords.length === 0) return { ticker, asOf };

  const arxivEp = options?.arxivEndpoint ?? ARXIV_DEFAULT;
  const hnEp = options?.hnEndpoint ?? HN_DEFAULT;
  const now = asOf.getTime();
  const cFrom = now - WIN_DAYS * DAY_MS;
  const pFrom = now - 2 * WIN_DAYS * DAY_MS;

  // Three-wave grouped fan-out: each wave is one Promise.allSettled over the
  // keyword list, so per-keyword failures stay independent within a (source,
  // bucket) cell. Note arxiv current+prior share one fetch (same RSS payload,
  // sliced client-side by countInWindow) — so it's 3 waves, not 4.
  const [arxivS, hnRecentS, hnPriorS] = await Promise.all([
    Promise.allSettled(keywords.map((k) => Promise.all([
      arxivCount(arxivEp, k, cFrom, now),
      arxivCount(arxivEp, k, pFrom, cFrom),
    ]))),
    Promise.allSettled(keywords.map((k) => hnCount(hnEp, k, cFrom, now))),
    Promise.allSettled(keywords.map((k) => hnCount(hnEp, k, pFrom, cFrom))),
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
  return out;
}
