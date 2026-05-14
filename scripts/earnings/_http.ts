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
