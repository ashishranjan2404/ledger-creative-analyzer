import { fetchJson } from '../_http.ts';
import { toTicker } from '../_watchlist.ts';
import type { Ticker } from '../_types.ts';

// WHY this adapter shape: must match the `GovContract` type exported by
// sources/quiver.ts so the deepdive L8 renderer can swap to USAspending
// without code changes. The free, key-less USAspending API replaces the
// paid Quiver /historical/govcontracts endpoint 1:1.
export type GovContract = {
  ticker: Ticker;
  date: Date;
  amount: number;
  agency: string;
  description: string;
};

const DEFAULT_ENDPOINT = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const UA = 'Thedi-Personal/1.0 by ashish@platformy.org';
const DAY_MS = 86_400_000;
// A=BPA Call, B=Purchase Order, C=Delivery Order, D=Definitive Contract.
const AWARD_TYPE_CODES = ['A', 'B', 'C', 'D'] as const;

// WHY parent-only: USAspending's `recipient_search_text` is a substring match
// on the recipient name; using the canonical parent covers ~all federally
// awarded contracts. AMZN routes to AWS specifically because the bulk of
// AMZN-family fed contracts are AWS GovCloud / hosting deals.
export const TICKER_TO_CONTRACT_RECIPIENT: Readonly<Record<string, string>> = {
  AAPL: 'APPLE INC',
  MSFT: 'MICROSOFT CORPORATION',
  GOOGL: 'GOOGLE LLC',
  AMZN: 'AMAZON WEB SERVICES INC',
  NVDA: 'NVIDIA CORPORATION',
  META: 'META PLATFORMS INC',
  AMD: 'ADVANCED MICRO DEVICES INC',
  TSLA: 'TESLA INC',
};

type AwardRow = {
  'Award ID'?: unknown;
  'Recipient Name'?: unknown;
  'Award Amount'?: unknown;
  'Awarding Agency'?: unknown;
  Description?: unknown;
  'Action Date'?: unknown;
};
type SearchResp = { results?: AwardRow[] };

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function goodDate(s: unknown): Date | null {
  if (!isStr(s)) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function buildBody(recipient: string, start: Date, end: Date): string {
  return JSON.stringify({
    filters: {
      award_type_codes: AWARD_TYPE_CODES,
      recipient_search_text: [recipient],
      time_period: [{ start_date: isoDate(start), end_date: isoDate(end) }],
    },
    fields: ['Award ID', 'Recipient Name', 'Award Amount',
      'Awarding Agency', 'Description', 'Action Date'],
    page: 1,
    limit: 20,
    sort: 'Action Date',
    order: 'desc',
  });
}

// WHY "Awarding Agency" can be either string or { name } depending on which
// USAspending API version answers; accept both shapes defensively.
function pickAgency(v: unknown): string {
  if (isStr(v)) return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (isStr(o.name)) return o.name;
  }
  return '';
}

function mapRow(t: Ticker, r: AwardRow): GovContract | null {
  const date = goodDate(r['Action Date']);
  const amount = r['Award Amount'];
  if (!date || !isNum(amount)) return null;
  const desc = isStr(r.Description) ? r.Description
    : isStr(r['Award ID']) ? r['Award ID'] : '';
  return { ticker: t, date, amount, agency: pickAgency(r['Awarding Agency']), description: desc };
}

export async function fetchGovContracts(
  tickers: readonly Ticker[],
  sinceDays: number,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<GovContract[]> {
  if (tickers.length === 0) return [];
  const end = new Date();
  const start = new Date(end.getTime() - sinceDays * DAY_MS);
  const work = tickers
    .map((t) => ({ t, name: TICKER_TO_CONTRACT_RECIPIENT[t as string] }))
    .filter((x): x is { t: Ticker; name: string } => isStr(x.name));
  const settled = await Promise.allSettled(work.map(async ({ t, name }) => {
    const resp = await fetchJson<SearchResp>(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': UA,
        accept: 'application/json',
      },
      body: buildBody(name, start, end),
    });
    const out: GovContract[] = [];
    for (const r of resp.results ?? []) {
      const row = mapRow(toTicker(t as string), r);
      if (row) out.push(row);
    }
    return out;
  }));
  const out: GovContract[] = [];
  settled.forEach((x, i) => x.status === 'fulfilled'
    ? out.push(...x.value)
    : console.warn(`[gov_contracts] ${work[i]!.t}: ${String(x.reason)}`));
  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out;
}
