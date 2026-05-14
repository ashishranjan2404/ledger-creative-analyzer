import { fetchJson, fetchRss, fetchWithTimeout } from '../_http.ts';
import { tickerToCik } from './edgar.ts';
import type { Ticker } from '../_types.ts';

// SEC requires a descriptive UA per https://www.sec.gov/os/accessing-edgar-data
const UA = 'Thedi-Personal ashish@platformy.org';
const H_JSON = { 'user-agent': UA, accept: 'application/json' };
const H_FEED = { 'user-agent': UA, accept: 'application/atom+xml' };
const H_HTML = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' };
const DEFAULT_BASE = 'https://www.sec.gov';
const ACCESSION_RE = /(\d{10}-\d{2}-\d{6})-index\./i;

export type Transcript = {
  ticker: Ticker; filingDate: Date; accessionNumber: string;
  text: string; exhibitUrl: string; wordCount: number;
};

type IndexJson = { directory?: { item?: ReadonlyArray<{ name: string; type?: string }> } };

// WHY single combined regex (one pass, case-insensitive); binary-extension guard
// rejects ex99-1.jpg charts that would otherwise match the ex99 pattern.
// `\bex.?99.?\d` covers ex99-1, ex99.1, ex991, EX-99.01.
const EXHIBIT_RE = /\b(transcript|press|ex.?99.?\d)/i;
const BIN_RE = /\.(jpg|jpeg|png|gif|pdf|xlsx?|zip|xml|json)$/i;
const HTML_RE = /\.(htm|html|txt)$/i;

function isTranscriptExhibit(name: string): boolean {
  return !BIN_RE.test(name) && HTML_RE.test(name) && EXHIBIT_RE.test(name);
}

// WHY two-pass stripper: dropping <script>/<style> *blocks* first prevents their
// inner JS/CSS from leaking into output once tags are removed. Single-pass
// .replace(/<[^>]+>/g,'') would expose JS source as visible "text".
// Comment strip in between guards against `<!-- <script>x</script> -->` being
// re-exposed by an over-eager tag pass, and drops conditional/IE comments cleanly.
const SCRIPT_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const TAG_RE = /<[^>]+>/g;
const ENT_RE = /&(#x?[0-9a-f]+|[a-z]+);/gi;
// `#39` and `#x27` are decoded by the numeric branch below; listed explicitly
// for readability so a grep for "apos" surfaces every apostrophe-encoding form.
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'", nbsp: ' ',
};

function decodeEntity(c: string): string {
  if (c[0] !== '#') return ENTITIES[c.toLowerCase()] ?? ' ';
  const hex = c[1] === 'x' || c[1] === 'X';
  const n = parseInt(c.slice(hex ? 2 : 1), hex ? 16 : 10);
  return Number.isFinite(n) ? String.fromCodePoint(n) : ' ';
}

function stripHtml(html: string): string {
  return html.replace(SCRIPT_RE, ' ').replace(COMMENT_RE, ' ').replace(TAG_RE, ' ')
    .replace(ENT_RE, (_, c: string) => decodeEntity(c))
    .replace(/\s+/g, ' ').trim();
}

function feedUrl(endpoint: string, cik: string): string {
  return `${endpoint}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}` +
    `&type=8-K&dateb=&owner=include&count=40&output=atom`;
}

async function fetchExhibit(url: string): Promise<string | null> {
  try { const r = await fetchWithTimeout(url, { headers: H_HTML });
    return r.ok ? await r.text() : null; } catch { return null; }
}

async function processFiling(
  ticker: Ticker, filingDate: Date, link: string, endpoint: string, cikNoPad: string,
): Promise<Transcript | null> {
  const acc = link.match(ACCESSION_RE)?.[1];
  if (!acc) return null;
  const dir = `${endpoint}/Archives/edgar/data/${cikNoPad}/${acc.replace(/-/g, '')}`;
  const idx = await fetchJson<IndexJson>(`${dir}/index.json`, { headers: H_JSON });
  const candidates = (idx.directory?.item ?? []).filter((i) => isTranscriptExhibit(i.name));
  // WHY first-match (sequential): SEC 8-Ks rarely attach more than one transcript
  // exhibit; bounding to the first match caps per-filing fan-out at 1 fetch and
  // matches the historical behavior we relied on before parallelizing.
  for (const c of candidates) {
    const exhibitUrl = `${dir}/${c.name}`;
    const html = await fetchExhibit(exhibitUrl);
    if (!html) continue;
    const text = stripHtml(html);
    if (!text) continue;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return { ticker, filingDate, accessionNumber: acc, text, exhibitUrl, wordCount };
  }
  return null;
}

async function forTicker(t: Ticker, cutoff: number, endpoint: string): Promise<Transcript[]> {
  const cik = await tickerToCik(t, endpoint);
  const cikNoPad = String(parseInt(cik, 10));
  const items = await fetchRss(feedUrl(endpoint, cik), { headers: H_FEED });
  const out: Transcript[] = [];
  for (const it of items) {
    if (!it.pubDate || it.pubDate.getTime() <= cutoff) continue;
    try {
      const row = await processFiling(t, it.pubDate, it.link, endpoint, cikNoPad);
      if (row) out.push(row);
    } catch { /* skip filing — index.json missing or malformed */ }
  }
  return out;
}

export async function fetchRecentTranscripts(
  tickers: readonly Ticker[], sinceDays: number, endpoint: string = DEFAULT_BASE,
): Promise<Transcript[]> {
  const cutoff = Date.now() - sinceDays * 86_400_000;
  const settled = await Promise.allSettled(tickers.map((t) => forTicker(t, cutoff, endpoint)));
  const out: Transcript[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === 'fulfilled') out.push(...r.value);
    else console.warn(`[transcripts] fetch failed for ${tickers[i]}: ${String(r.reason)}`);
  }
  return out;
}
