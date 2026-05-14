import { fetchJson } from '../_http.ts';
import { isTrackedTicker, toTicker } from '../_watchlist.ts';
import type { Ticker } from '../_types.ts';

// CongressionalTrade type must match sources/quiver.ts so downstream consumers
// (event_poll alerts, deepdive L8 renderer) swap adapters without code changes.
export type CongressionalTrade = {
  ticker: Ticker; representative: string; party: string;
  chamber: 'House' | 'Senate' | string; transactionDate: Date; reportedDate: Date;
  transaction: 'Purchase' | 'Sale' | string; amount: string;
};

const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';
const DAY_MS = 86_400_000;
const SENATE_URL =
  'https://raw.githubusercontent.com/jeremiak/senate-stock-watcher-data/master/aggregate/all_transactions.json';
const HOUSE_URL =
  'https://raw.githubusercontent.com/jeremiak/house-stock-watcher-data/master/transactions/all_transactions.json';
const HEADERS = { 'user-agent': UA, accept: 'application/json' };

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const asObj = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
const asArr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
function pickStr(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) { const v = o[k]; if (isStr(v)) return v; }
  return undefined;
}
import { parseGoodDate as goodDate } from '../_parsing.ts';

// WHY: Senate feed labels sells "Sale (Partial)" / "Sale (Full)"; House uses
// "purchase" / "sale" lowercase. Coerce to the short canonical form Quiver emits.
function normalizeTxn(s: string | undefined): string {
  if (!s) return '';
  const low = s.toLowerCase();
  if (low.startsWith('purchase') || low === 'buy') return 'Purchase';
  if (low.startsWith('sale') || low === 'sell') return 'Sale';
  return s;
}

function tickerFromRow(o: Record<string, unknown>, tracked: ReadonlySet<string>): Ticker | null {
  const raw = pickStr(o, 'ticker', 'Ticker');
  if (!raw) return null;
  const up = raw.toUpperCase().trim();
  if (!tracked.has(up)) return null;
  // up has passed membership check; toTicker validates format defensively.
  return isTrackedTicker(up) ? toTicker(up) : null;
}

function mapRows(
  rows: unknown[], chamber: 'Senate' | 'House', cutoff: number, tracked: ReadonlySet<string>,
): CongressionalTrade[] {
  const out: CongressionalTrade[] = [];
  for (const raw of rows) {
    const o = asObj(raw); if (!o) continue;
    const ticker = tickerFromRow(o, tracked); if (!ticker) continue;
    const txd = goodDate(pickStr(o, 'transaction_date', 'TransactionDate'));
    const repd = goodDate(pickStr(o, 'disclosure_date', 'DisclosureDate', 'ReportDate')) ?? txd;
    if (!txd || !repd || txd.getTime() < cutoff) continue;
    const rep = chamber === 'Senate'
      ? pickStr(o, 'senator', 'Senator', 'representative') ?? ''
      : pickStr(o, 'representative', 'Representative') ?? '';
    out.push({
      ticker, representative: rep,
      party: pickStr(o, 'party', 'Party') ?? '',
      chamber,
      transactionDate: txd, reportedDate: repd,
      transaction: normalizeTxn(pickStr(o, 'type', 'Type', 'transaction', 'Transaction')),
      amount: pickStr(o, 'amount', 'Amount', 'Range') ?? '',
    });
  }
  return out;
}

async function fetchOneOf(
  urls: readonly string[], chamber: 'Senate' | 'House',
  cutoff: number, tracked: ReadonlySet<string>,
): Promise<CongressionalTrade[]> {
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const rows = asArr(await fetchJson<unknown>(url, { headers: HEADERS }));
      return mapRows(rows, chamber, cutoff, tracked);
    } catch (e) {
      lastErr = e;
      // 404/410 (or similar) on the GitHub mirror → try next URL silently.
      // Only the final attempt's error surfaces to caller via Promise rejection.
    }
  }
  throw lastErr ?? new Error('no congress endpoints reachable');
}

export async function fetchCongressionalTrades(
  tickers: readonly Ticker[],
  sinceDays: number,
  senateEndpoint: string = SENATE_URL,
  houseEndpoint: string = HOUSE_URL,
): Promise<CongressionalTrade[]> {
  if (tickers.length === 0) return [];
  const tracked = new Set<string>(tickers.map((t) => String(t).toUpperCase()));
  const cutoff = Date.now() - sinceDays * DAY_MS;
  // Fallback: env CONGRESS_SENATE_FALLBACK / CONGRESS_HOUSE_FALLBACK can point
  // at a mirror if the jeremiak repos ever 404. Tried in order, first success
  // wins. Useful if the upstream maintainer makes the repo private.
  const senateUrls = [senateEndpoint, process.env['CONGRESS_SENATE_FALLBACK']]
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
  const houseUrls = [houseEndpoint, process.env['CONGRESS_HOUSE_FALLBACK']]
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
  const [s, h] = await Promise.allSettled([
    fetchOneOf(senateUrls, 'Senate', cutoff, tracked),
    fetchOneOf(houseUrls, 'House', cutoff, tracked),
  ]);
  const out: CongressionalTrade[] = [];
  if (s.status === 'fulfilled') out.push(...s.value);
  else console.warn(`[congress/senate-unavailable] ${String(s.reason)} — set CONGRESS_SENATE_FALLBACK to a mirror if the primary repo is gone`);
  if (h.status === 'fulfilled') out.push(...h.value);
  else console.warn(`[congress/house-unavailable] ${String(h.reason)} — set CONGRESS_HOUSE_FALLBACK to a mirror if the primary repo is gone`);
  out.sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime());
  return out;
}
