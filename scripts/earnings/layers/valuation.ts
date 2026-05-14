import { fetchJson } from '../_http.ts';
import { fetchXbrlConcept, type XbrlPoint } from '../sources/edgar_xbrl.ts';
import { tickerToCik } from '../sources/edgar.ts';
import { fetchEpsEstimates } from '../sources/finnhub.ts';
import type { Ticker } from '../_types.ts';

const HEADERS = { 'user-agent': 'Thedi-Personal ashish@platformy.org', accept: 'application/json' };
const DEFAULT_BASE = 'https://data.sec.gov';
const MIN_HIST_QUARTERS = 12; // 3yr min for median5yr — honest NaN below; useful >=12.

export type ValuationMetric = {
  label: string;
  current: number;
  median5yr: number;
  sectorMedian: number;
  unit: 'multiple' | 'pct';
};
export type ValuationContext = {
  ticker: Ticker;
  asOf: Date;
  sectorSic: string;
  metrics: readonly ValuationMetric[];
};
// WHY optional pb/evSales: callers that pre-date L34/L35 still satisfy the type;
// absent fields ⇒ NaN sectorMedian (renderer prints 'n/a'). No breaking change.
export type SectorPriors = {
  fwdPE: number;
  evEbitda: number;
  fcfYield: number;
  pb?: number;
  evSales?: number;
};
// WHY function-not-Map: caller composes fallback (precise SIC → 2-digit prefix → null)
// without leaking that policy into this layer. Map/Record forces eager enumeration.
export type SectorPriorsLookup = (sicCode: string) => SectorPriors | undefined;

// WHY: XBRL mixes 10-K (often fp='FY') with 10-Q. Summing both double-counts Q4.
// Drop annual rollups; sort oldest-first by period end.
function quarterly(pts: readonly XbrlPoint[]): XbrlPoint[] {
  const qs = pts.filter((p) => p.fp === 'Q1' || p.fp === 'Q2' || p.fp === 'Q3' || p.fp === 'Q4');
  return [...qs].sort((a, b) => a.end.getTime() - b.end.getTime());
}

// TTM = sum of 4 most recent flow quarters at-or-before asOf, deduped by end-date
// (last-write-wins so amendments supersede). NaN if <4 distinct quarters.
function ttmAt(qs: readonly XbrlPoint[], asOf: Date): number {
  const seen = new Map<string, number>();
  for (const p of qs) {
    if (p.end.getTime() > asOf.getTime()) continue;
    seen.set(p.end.toISOString().slice(0, 10), p.val);
  }
  if (seen.size < 4) return NaN;
  return [...seen.keys()].sort().slice(-4).reduce((s, e) => s + seen.get(e)!, 0);
}

// Latest balance-sheet val at-or-before asOf; 0 if absent (no contribution to EV).
// WHY point-in-time, not TTM: BS items are stocks (snapshots), not flows — summing 4
// quarters would 4x the value. Sort by end-date for last-write-wins on amendments.
function bsAt(qs: readonly XbrlPoint[], asOf: Date): number {
  const w = qs.filter((p) => p.end.getTime() <= asOf.getTime());
  return w.length ? w[w.length - 1]!.val : 0;
}

function median(xs: readonly number[]): number {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

// Any zero/NaN denominator ⇒ NaN, never throws.
function safeDiv(n: number, d: number): number {
  return d === 0 || !Number.isFinite(d) || !Number.isFinite(n) ? NaN : n / d;
}

async function fetchSic(ticker: Ticker, endpoint: string): Promise<string> {
  try {
    const cik = await tickerToCik(ticker);
    const j = await fetchJson<{ sic?: unknown }>(`${endpoint}/submissions/CIK${cik}.json`, {
      headers: HEADERS,
    });
    return typeof j.sic === 'string' ? j.sic : '';
  } catch {
    return ''; // EDGAR submissions endpoint may 404; layer continues with empty SIC.
  }
}

// WHY revenue tag-pair: pre-ASC-606 filers report `Revenues`; post-606 use
// `RevenueFromContractWithCustomerExcludingAssessedTax`. Mirror fundamentals.ts.
async function fetchRevenueWithFallback(ticker: Ticker, endpoint: string): Promise<XbrlPoint[]> {
  for (const tag of ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax']) {
    try {
      const pts = await fetchXbrlConcept(ticker, tag, endpoint);
      if (pts.length > 0) return pts;
    } catch { /* try next */ }
  }
  return [];
}

// WHY swallow-on-fail (separate from required concepts above): StockholdersEquity
// is a newer addition for L34 P/B. EDGAR returns 404 for filers that have never
// tagged it (e.g. recent IPOs, foreign-private-issuers). Degrade to empty series
// rather than aborting the whole valuation — caller already prints n/a for NaN.
async function fetchEquitySafe(ticker: Ticker, endpoint: string): Promise<XbrlPoint[]> {
  try {
    return await fetchXbrlConcept(ticker, 'StockholdersEquity', endpoint);
  } catch {
    return [];
  }
}

export async function fetchValuationContext(
  ticker: Ticker,
  currentPrice: number,
  sharesOutstanding: number,
  sectorPriors?: SectorPriorsLookup,
  endpoint: string = DEFAULT_BASE,
  finnhubKey?: string | null,
): Promise<ValuationContext> {
  // WHY LongTermDebt (not LongTermDebtNoncurrent): broader tag captures the current
  // portion of long-term debt; using the noncurrent-only tag underestimates EV.
  // L34/L35: StockholdersEquity for P/B; Revenues (with fallback) for EV/Sales.
  // L36: Finnhub /estimate — optional, NaN if FINNHUB_KEY absent.
  const [opIncR, ocfR, capexR, debtR, cashR, equityR, revenueR, sectorSic, eps] = await Promise.all([
    fetchXbrlConcept(ticker, 'OperatingIncomeLoss', endpoint),
    fetchXbrlConcept(ticker, 'NetCashProvidedByOperatingActivities', endpoint),
    fetchXbrlConcept(ticker, 'PaymentsToAcquirePropertyPlantAndEquipment', endpoint),
    fetchXbrlConcept(ticker, 'LongTermDebt', endpoint),
    fetchXbrlConcept(ticker, 'CashAndCashEquivalentsAtCarryingValue', endpoint),
    fetchEquitySafe(ticker, endpoint),
    fetchRevenueWithFallback(ticker, endpoint),
    fetchSic(ticker, endpoint),
    finnhubKey ? fetchEpsEstimates(ticker, finnhubKey) : Promise.resolve(null),
  ]);
  const opInc = quarterly(opIncR);
  const ocf = quarterly(ocfR);
  const capex = quarterly(capexR);
  const debt = quarterly(debtR);
  const cash = quarterly(cashR);
  const equity = quarterly(equityR);
  const revenue = quarterly(revenueR);
  const asOf = new Date();
  const marketCap = currentPrice * sharesOutstanding;
  const ttmOp = ttmAt(opInc, asOf);
  const ttmRev = ttmAt(revenue, asOf);
  const latestEquity = bsAt(equity, asOf);
  const netDebt = bsAt(debt, asOf) - bsAt(cash, asOf);
  const ev = marketCap + netDebt;

  // WHY: V1 fwd P/E ≈ marketCap / (TTM OpInc * 1.05) — 5% growth proxy. Real fwd P/E
  // needs analyst consensus EPS; deferred to a later layer.
  const fwdPE = safeDiv(marketCap, ttmOp * 1.05);
  const evEbitda = safeDiv(ev, ttmOp);
  const fcfYield = safeDiv(ttmAt(ocf, asOf) - ttmAt(capex, asOf), marketCap) * 100;
  // L34 P/B: marketCap / latestEquity. bsAt returns 0 when equity absent ⇒ safeDiv → NaN.
  const pb = safeDiv(marketCap, latestEquity);
  // L35 EV/Sales: EV / TTM revenue. Works for unprofitable companies (no OpInc dep).
  const evSales = safeDiv(ev, ttmRev);
  // L36 Fwd EPS YoY pct: (current - prior) / |prior| * 100. Null estimate or
  // zero prior ⇒ NaN; renderer prints 'n/a'.
  const fwdEpsYoY = eps ? safeDiv(eps.current - eps.priorYear, Math.abs(eps.priorYear)) * 100 : NaN;

  // 5yr median: up to 20 historical quarter-ends. Recompute TTM OpInc at each, but hold
  // EV and marketCap constant at today's values — V1 simplification (real history needs
  // period-end price + shares). Returns NaN unless ≥MIN_HIST_QUARTERS quarters; median's
  // own finite filter drops any quarter still warming up TTM.
  const ends = opInc.map((p) => p.end).slice(-20);
  const enough = ends.length >= MIN_HIST_QUARTERS;
  const med = (xs: number[]) => (enough ? median(xs) : NaN);
  const sicM = sectorSic && sectorPriors ? sectorPriors(sectorSic.slice(0, 2)) : undefined;
  const fwdHist = ends.map((d) => safeDiv(marketCap, ttmAt(opInc, d) * 1.05));
  const evHist = ends.map((d) => safeDiv(ev, ttmAt(opInc, d)));
  const fcfH = ends.map((d) => safeDiv(ttmAt(ocf, d) - ttmAt(capex, d), marketCap) * 100);
  // L34/L35 use their own series-length checks so P/B and EV/Sales medians populate
  // even when opInc history is thin (e.g. recently-public companies with revenue but
  // no operating-profit lineage). Same MIN_HIST_QUARTERS threshold for consistency.
  const equityHistPts = equity.slice(-20);
  const pbHist = equityHistPts.map((p) => safeDiv(marketCap, p.val));
  const pbMed = equityHistPts.length >= MIN_HIST_QUARTERS ? median(pbHist) : NaN;
  // L35 5yr median EV/Sales: hold EV fixed, vary historical TTM revenue. Mirrors
  // the EV/EBITDA pattern. Quarter-ends sourced from revenue series so a company
  // that switched revenue-recognition tags mid-history still gets a median.
  const revEnds = revenue.map((p) => p.end).slice(-20);
  const evSalesHist = revEnds.map((d) => safeDiv(ev, ttmAt(revenue, d)));
  const evSalesMed = revEnds.length >= MIN_HIST_QUARTERS ? median(evSalesHist) : NaN;
  const mk = (label: string, current: number, hist: number[], s: number, unit: 'multiple' | 'pct'): ValuationMetric =>
    ({ label, current, median5yr: med(hist), sectorMedian: s, unit });
  return {
    ticker,
    asOf,
    sectorSic,
    metrics: [
      mk('Fwd P/E', fwdPE, fwdHist, sicM?.fwdPE ?? NaN, 'multiple'),
      mk('EV/EBITDA', evEbitda, evHist, sicM?.evEbitda ?? NaN, 'multiple'),
      mk('FCF yield', fcfYield, fcfH, sicM?.fcfYield ?? NaN, 'pct'),
      { label: 'P/B', current: pb, median5yr: pbMed, sectorMedian: sicM?.pb ?? NaN, unit: 'multiple' },
      { label: 'EV/Sales', current: evSales, median5yr: evSalesMed, sectorMedian: sicM?.evSales ?? NaN, unit: 'multiple' },
      // L36 fwd EPS YoY: no historical "5yr median of past forward estimates"
      // makes sense (consensus revisions aren't stored) and no sector prior
      // exists — explicit NaN passes through renderer's existing 'n/a' guard.
      { label: 'fwdEPS YoY', current: fwdEpsYoY, median5yr: NaN, sectorMedian: NaN, unit: 'pct' },
    ],
  };
}
