export type RssItem = {
  title: string;
  link: string;
  pubDate?: Date;
  description?: string;
};

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 8000,
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (err) {
    if (ctl.signal.aborted) {
      throw new Error(`timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function ok(res: Response, url: string): void {
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`);
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  ok(res, url);
  return (await res.json()) as T;
}

export type RetryOpts = {
  maxRetries?: number;        // default 3 (so up to 4 attempts total)
  initialDelayMs?: number;    // default 500
  timeoutMs?: number;
};

// WHY: free tiers of Finnhub/Polygon/Benzinga + SEC EDGAR all return 429 under
// burst load; without backoff a single rate-spike kills the whole run. Honors
// Retry-After when present (seconds or HTTP-date), else exponential backoff
// (500ms, 1s, 2s, 4s …). 5xx is also retried (transient origin errors). 4xx
// other than 429 is treated as a HARD error — caller input is wrong. Hard
// errors short-circuit the outer catch via HardHttpError so we don't retry
// our own intentional throw.
class HardHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  constructor(status: number, statusText: string, url: string) {
    super(`HTTP ${status} ${statusText}: ${url}`);
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}
export async function fetchJsonWithRetry<T>(
  url: string,
  init?: RequestInit,
  opts: RetryOpts = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.initialDelayMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, opts.timeoutMs);
      if (res.ok) return (await res.json()) as T;
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable) throw new HardHttpError(res.status, res.statusText, url);
      if (attempt === maxRetries) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`);
      const ra = retryAfterMs(res.headers.get('retry-after'));
      await sleep(ra ?? baseDelay * 2 ** attempt);
      continue;
    } catch (e) {
      if (e instanceof HardHttpError) throw new Error(e.message);
      lastErr = e;
      if (attempt === maxRetries) throw e;
      // Network-level errors (DNS, ECONNRESET, etc.) — also retried with backoff.
      await sleep(baseDelay * 2 ** attempt);
    }
  }
  throw lastErr ?? new Error(`unreachable: fetchJsonWithRetry exhausted retries for ${url}`);
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const n = Number(header);
  if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, 30_000);
  const dateMs = new Date(header).getTime();
  if (Number.isFinite(dateMs)) return Math.min(Math.max(0, dateMs - Date.now()), 30_000);
  return null;
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

export async function fetchRss(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<RssItem[]> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  ok(res, url);
  return parseFeed(await res.text());
}

// WHY: regex parser, not DOMParser/xml2js — feeds (SEC/Yahoo/Reddit) are tiny
// and well-formed; avoids a dep and a 200ms parse on every poll. Known limits:
// no gzip-without-content-encoding, no response-size cap, no XML namespace
// prefix handling (e.g. <media:content>) — add if/when a real feed needs them.
const ENTRY_RE = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const LINK_HREF_RE = /<link\b[^>]*\bhref=["']([^"']+)["']/i;
const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, c: string) => {
    if (c[0] === '#') {
      const hex = c[1] === 'x' || c[1] === 'X';
      return String.fromCodePoint(parseInt(c.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return ENTITIES[c.toLowerCase()] ?? `&${c};`;
  });
}

function pickTag(block: string, ...names: string[]): string | undefined {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`, 'i'));
    if (m?.[1]) return decode(m[1].replace(CDATA_RE, '$1')).trim();
  }
  return undefined;
}

function parseFeed(xml: string): RssItem[] {
  const out: RssItem[] = [];
  for (const m of xml.matchAll(ENTRY_RE)) {
    const body = m[2] ?? '';
    const link = pickTag(body, 'link') || decode(body.match(LINK_HREF_RE)?.[1] ?? '');
    const dateStr = pickTag(body, 'pubDate', 'updated', 'published');
    const description = pickTag(body, 'description', 'summary', 'content');
    const item: RssItem = { title: pickTag(body, 'title') ?? '', link };
    if (dateStr) {
      const pd = new Date(dateStr);
      if (!isNaN(pd.getTime())) item.pubDate = pd;
    }
    if (description) item.description = description;
    out.push(item);
  }
  return out;
}
