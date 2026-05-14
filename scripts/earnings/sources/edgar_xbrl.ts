import { fetchJsonWithRetry } from '../_http.ts';
import { tickerToCik } from './edgar.ts';
import type { Ticker } from '../_types.ts';

const EDGAR_UA = 'Thedi-Personal ashish@platformy.org';
const HEADERS = { 'user-agent': EDGAR_UA, accept: 'application/json' };
const DEFAULT_BASE = 'https://data.sec.gov';

export type XbrlPoint = {
  end: Date;
  val: number;
  fp: string;
  fy: number;
  form: string;
  filed: Date;
};

// SEC companyconcept response shape (only the fields we read).
type RawUsdEntry = {
  end?: unknown;
  val?: unknown;
  fp?: unknown;
  fy?: unknown;
  form?: unknown;
  filed?: unknown;
};
type ConceptResponse = { units?: { USD?: RawUsdEntry[] } };

// WHY promise-cache (mirrors edgar.ts): N concurrent first-callers share one fetch.
// Key by `${ticker}:${tag}` since callers may request many tags per ticker.
const conceptCache = new Map<string, Promise<XbrlPoint[]>>();

export function _resetXbrlCache(): void {
  conceptCache.clear();
}

function isFiniteNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isStr(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function parseEntry(r: RawUsdEntry): XbrlPoint | null {
  if (!isStr(r.end) || !isStr(r.filed) || !isStr(r.fp) || !isStr(r.form)) return null;
  if (!isFiniteNum(r.val) || !isFiniteNum(r.fy)) return null;
  const end = new Date(r.end);
  const filed = new Date(r.filed);
  if (isNaN(end.getTime()) || isNaN(filed.getTime())) return null;
  return { end, val: r.val, fp: r.fp, fy: r.fy, form: r.form, filed };
}

export function fetchXbrlConcept(
  ticker: Ticker,
  tag: string,
  endpoint: string = DEFAULT_BASE,
): Promise<XbrlPoint[]> {
  const key = `${ticker}:${tag}`;
  const hit = conceptCache.get(key);
  if (hit) return hit;
  const p = doFetch(ticker, tag, endpoint).catch((e: unknown) => {
    conceptCache.delete(key); // don't poison cache on transient fail
    throw e;
  });
  conceptCache.set(key, p);
  return p;
}

// XBRL companyconcept responses are 10-100KB JSON (full quarterly history per
// concept) — the default 8s timeout in fetchWithTimeout is tight under slow
// SEC origin conditions. 20s gives one extra round of TCP retransmits without
// changing the global default.
const XBRL_TIMEOUT_MS = 20_000;
async function doFetch(ticker: Ticker, tag: string, endpoint: string): Promise<XbrlPoint[]> {
  const cik = await tickerToCik(ticker, endpoint);
  const url = `${endpoint}/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`;
  const j = await fetchJsonWithRetry<ConceptResponse>(url, { headers: HEADERS }, { timeoutMs: XBRL_TIMEOUT_MS });
  const rows = j.units?.USD ?? [];
  const out: XbrlPoint[] = [];
  for (const r of rows) {
    const p = parseEntry(r);
    if (p) out.push(p);
  }
  out.sort((a, b) => a.filed.getTime() - b.filed.getTime());
  return out;
}
