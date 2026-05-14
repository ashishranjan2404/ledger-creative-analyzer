import { fetchJson } from '../_http.ts';
import { isTrackedTicker, toTicker } from '../_watchlist.ts';
import type { Ticker } from '../_types.ts';

const DEFAULT_ENDPOINT = 'https://api.quiverquant.com/beta';
const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';
const DAY_MS = 86_400_000;

export type CongressionalTrade = { ticker: Ticker; representative: string; party: string;
  chamber: 'House' | 'Senate' | string; transactionDate: Date; reportedDate: Date;
  transaction: 'Purchase' | 'Sale' | string; amount: string };
export type LobbyingRecord = { ticker: Ticker; year: number; quarter: number;
  amount: number; client: string; issue: string };
export type GovContract = { ticker: Ticker; date: Date; amount: number; agency: string; description: string };

// WHY: Quiver auth uses "Token <key>" (Django-REST-Framework style), NOT "Bearer".
const headers = (k: string): Record<string, string> => ({
  authorization: `Token ${k}`, 'user-agent': UA, accept: 'application/json',
});

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const asObj = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
const asArr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
function pickStr(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) { const v = o[k]; if (isStr(v)) return v; }
  return undefined;
}
function pickNum(o: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (isNum(v)) return v;
    if (isStr(v)) { const n = Number(v.replace(/[$,]/g, '')); if (Number.isFinite(n)) return n; }
  }
  return undefined;
}
import { parseGoodDate as goodDate } from '../_parsing.ts';
async function settle<T>(label: string, tickers: readonly Ticker[],
  work: (t: Ticker) => Promise<T[]>): Promise<T[]> {
  const r = await Promise.allSettled(tickers.map(work));
  const out: T[] = [];
  r.forEach((x, i) => x.status === 'fulfilled'
    ? out.push(...x.value)
    : console.warn(`${label} fetch failed for ${tickers[i]}: ${String(x.reason)}`));
  return out;
}
const getRows = async (url: string, k: string): Promise<unknown[]> =>
  asArr(await fetchJson<unknown>(url, { headers: headers(k) }));

// WHY: Quiver row field names vary by endpoint and casing has historically drifted; defensive
// `pickStr/pickNum` with capitalized + camelCase aliases (Representative/representative, etc.).
function mapCongress(t: Ticker, rows: unknown[], cutoff: number): CongressionalTrade[] {
  const out: CongressionalTrade[] = [];
  for (const raw of rows) {
    const o = asObj(raw); if (!o) continue;
    const txd = goodDate(pickStr(o, 'TransactionDate', 'Date', 'transactionDate'));
    const repd = goodDate(pickStr(o, 'ReportDate', 'Reported', 'reportDate')) ?? txd;
    if (!txd || !repd || txd.getTime() < cutoff) continue;
    // WHY: Quiver returns the range ("$1,001 - $15,000") in `Range`; older rows use `Trade_Size_USD`.
    out.push({ ticker: t,
      representative: pickStr(o, 'Representative', 'Name', 'representative') ?? '',
      party: pickStr(o, 'Party', 'party') ?? '',
      chamber: pickStr(o, 'Chamber', 'House', 'chamber') ?? '',
      transactionDate: txd, reportedDate: repd,
      transaction: pickStr(o, 'Transaction', 'Type', 'transaction') ?? '',
      amount: pickStr(o, 'Range', 'Trade_Size_USD', 'Amount', 'amount') ?? '' });
  }
  return out;
}

function mapLobbying(t: Ticker, rows: unknown[], minY: number, minQ: number): LobbyingRecord[] {
  const out: LobbyingRecord[] = [];
  for (const raw of rows) {
    const o = asObj(raw); if (!o) continue;
    const year = pickNum(o, 'Year', 'year');
    const quarter = pickNum(o, 'Quarter', 'quarter');
    const amount = pickNum(o, 'Amount', 'amount');
    if (year === undefined || quarter === undefined || amount === undefined) continue;
    if (year < minY || (year === minY && quarter < minQ)) continue;
    out.push({ ticker: t, year, quarter, amount,
      client: pickStr(o, 'Client', 'Registrant', 'client') ?? '',
      issue: pickStr(o, 'Issue', 'SpecificIssue', 'issue') ?? '' });
  }
  return out;
}

function mapGov(t: Ticker, rows: unknown[], cutoff: number): GovContract[] {
  const out: GovContract[] = [];
  for (const raw of rows) {
    const o = asObj(raw); if (!o) continue;
    const date = goodDate(pickStr(o, 'Date', 'date', 'AwardDate'));
    if (!date || date.getTime() < cutoff) continue;
    // WHY: Quiver labels the dollar column `Dollars` on /govcontracts, not `Amount`.
    out.push({ ticker: t, date, amount: pickNum(o, 'Dollars', 'Amount', 'amount') ?? 0,
      agency: pickStr(o, 'Agency', 'agency') ?? '',
      description: pickStr(o, 'Description', 'description') ?? '' });
  }
  return out;
}

export function fetchCongressionalTrades(tickers: readonly Ticker[], sinceDays: number,
  apiKey: string, endpoint: string = DEFAULT_ENDPOINT): Promise<CongressionalTrade[]> {
  const cutoff = Date.now() - sinceDays * DAY_MS;
  return settle('[quiver/congress]', tickers, async (t) => {
    if (!isTrackedTicker(t)) return [];
    return mapCongress(t, await getRows(
      `${endpoint}/historical/congresstrading/${toTicker(t)}`, apiKey), cutoff);
  });
}

export function fetchLobbying(tickers: readonly Ticker[], quarters: number,
  apiKey: string, endpoint: string = DEFAULT_ENDPOINT): Promise<LobbyingRecord[]> {
  const now = new Date();
  // WHY: convert (Y,Q) to a single counter `Y*4 + (Q-1)`; subtract (quarters-1) so that
  // requesting 1 quarter keeps the current quarter, 4 keeps the trailing year, etc.
  const total = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3) - (quarters - 1);
  const minY = Math.floor(total / 4);
  const minQ = (total % 4) + 1;
  return settle('[quiver/lobbying]', tickers, async (t) => {
    if (!isTrackedTicker(t)) return [];
    return mapLobbying(t, await getRows(
      `${endpoint}/historical/lobbying/${toTicker(t)}`, apiKey), minY, minQ);
  });
}

export function fetchGovContracts(tickers: readonly Ticker[], sinceDays: number,
  apiKey: string, endpoint: string = DEFAULT_ENDPOINT): Promise<GovContract[]> {
  const cutoff = Date.now() - sinceDays * DAY_MS;
  return settle('[quiver/contracts]', tickers, async (t) => {
    if (!isTrackedTicker(t)) return [];
    return mapGov(t, await getRows(
      `${endpoint}/historical/govcontracts/${toTicker(t)}`, apiKey), cutoff);
  });
}
