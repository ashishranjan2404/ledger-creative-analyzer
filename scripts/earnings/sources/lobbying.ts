import { fetchJsonWithRetry } from '../_http.ts';
import { toTicker } from '../_watchlist.ts';
import type { Ticker } from '../_types.ts';

// WHY page_size=100: LDA's default is 25, which silently drops filings for
// big clients (Microsoft / Alphabet have 30-60 filings per quarter once you
// include all the lobbying firms they hire). 100 + follow-`next` covers the
// long tail without burning anonymous quota on most clients.
const PAGE_SIZE = 100;
const MAX_PAGES = 5; // safety cap — 500 filings / quarter is the upper bound we'll honor

// WHY: shape mirrors sources/quiver.ts:LobbyingRecord exactly so the deepdive
// L8 renderer can swap this adapter in without code changes.
export type LobbyingRecord = {
  ticker: Ticker;
  year: number;
  quarter: number;               // 1..4
  amount: number;                // USD
  client: string;
  issue: string;
};

// LDA filters on `client_name`. Parent legal names (the canonical filer) —
// some tickers have multiple historical entities (e.g. older META filings as
// "Facebook, Inc."); V1 covers the dominant current filer.
export const TICKER_TO_LOBBYING_CLIENT: Readonly<Record<string, string>> = {
  AAPL: 'Apple Inc',
  MSFT: 'Microsoft Corporation',
  GOOGL: 'Alphabet Inc',
  AMZN: 'Amazon.com Services LLC',
  NVDA: 'NVIDIA Corporation',
  META: 'Meta Platforms Inc',
  AMD: 'Advanced Micro Devices, Inc.',
  TSLA: 'Tesla, Inc.',
};

const DEFAULT_ENDPOINT = 'https://lda.senate.gov/api/v1/filings/';
const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';
const HEADERS: Record<string, string> = { 'user-agent': UA, accept: 'application/json' };

function periodOfQuarter(q: number): string {
  return ['first_quarter', 'second_quarter', 'third_quarter', 'fourth_quarter'][q - 1]
    ?? 'first_quarter';
}

// WHY: walk back N quarters from `now` so requesting 4 from May 2026 yields
// 2026 Q2, 2026 Q1, 2025 Q4, 2025 Q3 (i.e. the calendar quarters whose
// filings are most likely available).
function lastNQuarters(n: number, now: Date = new Date()): { year: number; quarter: number }[] {
  const cur = Math.floor(now.getUTCMonth() / 3) + 1; // 1..4
  const out: { year: number; quarter: number }[] = [];
  let y = now.getUTCFullYear();
  let q = cur;
  for (let i = 0; i < n; i++) {
    out.push({ year: y, quarter: q });
    q--;
    if (q === 0) { q = 4; y--; }
  }
  return out;
}

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const asObj = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
const asArr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

// WHY: LDA returns numerics inconsistently — `income` is often a quoted decimal
// string ("150000.00") but sometimes a JSON number; both must parse to USD.
function parseAmount(v: unknown): number {
  if (isNum(v)) return v;
  if (isStr(v)) { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

function mapFiling(t: Ticker, year: number, quarter: number, raw: unknown): LobbyingRecord | null {
  const o = asObj(raw); if (!o) return null;
  // `income` (clients self-report) OR `expenses` (registrants report on
  // behalf of clients) — LDA picks one per filing, never both populated.
  const amount = parseAmount(o['income'] ?? o['expenses']);
  const clientObj = asObj(o['client']);
  const client = clientObj && isStr(clientObj['name']) ? clientObj['name'] : '';
  const activities = asArr(o['lobbying_activities']);
  const firstAct = asObj(activities[0]);
  const issue = firstAct && isStr(firstAct['general_issue_code']) ? firstAct['general_issue_code'] : '';
  return { ticker: t, year, quarter, amount, client, issue };
}

export async function fetchLobbying(
  tickers: readonly Ticker[],
  quarters: number,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<LobbyingRecord[]> {
  const periods = lastNQuarters(quarters);
  // Build (ticker × period) tasks only for tickers we have a client name for.
  // WHY: skipping unknown tickers up-front avoids burning the 40/min anonymous
  // budget on guaranteed-empty queries.
  const tasks: { t: Ticker; year: number; quarter: number; url: string }[] = [];
  for (const tRaw of tickers) {
    const t = toTicker(tRaw);
    const name = TICKER_TO_LOBBYING_CLIENT[t];
    if (!name) continue;
    for (const p of periods) {
      const qs = new URLSearchParams({
        client_name: name, filing_year: String(p.year),
        filing_period: periodOfQuarter(p.quarter),
        page_size: String(PAGE_SIZE),
      });
      tasks.push({ t, year: p.year, quarter: p.quarter, url: `${endpoint}?${qs.toString()}` });
    }
  }
  const settled = await Promise.allSettled(tasks.map((task) => fetchAllPages(task.url)));
  const out: LobbyingRecord[] = [];
  settled.forEach((r, i) => {
    const task = tasks[i]!;
    if (r.status === 'rejected') {
      console.warn(`[lobbying] ${task.t}/${task.year}-Q${task.quarter}: ${String(r.reason)}`);
      return;
    }
    for (const raw of r.value) {
      const rec = mapFiling(task.t, task.year, task.quarter, raw);
      if (rec) out.push(rec);
    }
  });
  return out;
}

// Walks the `next` link up to MAX_PAGES times; flattens each page's `results`.
async function fetchAllPages(initialUrl: string): Promise<unknown[]> {
  const out: unknown[] = [];
  let url: string | null = initialUrl;
  for (let i = 0; i < MAX_PAGES && url; i++) {
    const j = await fetchJsonWithRetry<unknown>(url, { headers: HEADERS });
    const obj = asObj(j);
    out.push(...asArr(obj?.['results']));
    const next = obj?.['next'];
    url = typeof next === 'string' && next.length > 0 ? next : null;
  }
  return out;
}
