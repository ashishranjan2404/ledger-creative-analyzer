// L1 fundamentals trajectory: 5 metrics × 8 quarters, aligned by quarter-end.
// Pipeline: fetch every XBRL tag in parallel via allSettled → dedupe by (fy,fp)
// keeping latest-filed (so restated 10-K beats original 10-Q) → align tags into
// per-quarter cells via end-date union → apply each metric formula from a registry.
// SIMPLIFICATIONS: LongTermDebtNoncurrent proxies total debt (skips short-term);
// ROIC denom = debt + 0.5×revenue (skips equity book value to avoid extra tag);
// EBITDA ≈ OperatingIncome (no D&A add-back). All %s are quarterly, not TTM.
import { fetchXbrlConcept, type XbrlPoint } from '../sources/edgar_xbrl.ts';
import type { Ticker } from '../_types.ts';

export type FundamentalsMetric = {
  label: string;
  values: readonly number[]; // length 8, oldest→newest; NaN = missing/uncomputable.
  unit: 'pct' | 'ratio' | 'usd';
};

export type FundamentalsTrajectory = {
  ticker: Ticker;
  asOf: Date;
  metrics: readonly FundamentalsMetric[];
};

const N = 8;

// WHY tag-pair w/ fallback: filers split between legacy `Revenues` and post-ASC-606
// `RevenueFromContractWithCustomerExcludingAssessedTax`; same for long-term-debt.
const TAGS = {
  revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'],
  grossProfit: ['GrossProfit'],
  cfo: ['NetCashProvidedByOperatingActivities'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment'],
  opInc: ['OperatingIncomeLoss'],
  debt: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  cash: ['CashAndCashEquivalentsAtCarryingValue'],
} as const;
type TagKey = keyof typeof TAGS;
type Slot = string; // `${fy}-${fp}`
type QuarterCell = { slot: Slot; end: Date; vals: Partial<Record<TagKey, number>> };

async function fetchWithFallback(
  ticker: Ticker, candidates: readonly string[], endpoint?: string,
): Promise<XbrlPoint[]> {
  for (const tag of candidates) {
    try {
      const pts = await (endpoint ? fetchXbrlConcept(ticker, tag, endpoint) : fetchXbrlConcept(ticker, tag));
      if (pts.length > 0) return pts;
    } catch { /* try next */ }
  }
  return [];
}

// Latest-filed wins per (fy,fp): restated 10-K beats original 10-Q.
function dedupeByPeriod(pts: readonly XbrlPoint[]): Map<Slot, XbrlPoint> {
  const out = new Map<Slot, XbrlPoint>();
  for (const p of pts) {
    const k = `${p.fy}-${p.fp}`;
    const cur = out.get(k);
    if (!cur || p.filed.getTime() > cur.filed.getTime()) out.set(k, p);
  }
  return out;
}

// Union of (fy,fp) keys across all tags → sort by end date → take last 8.
function alignQuarters(byTag: Record<TagKey, Map<Slot, XbrlPoint>>): QuarterCell[] {
  const cells = new Map<Slot, QuarterCell>();
  for (const [tag, m] of Object.entries(byTag) as [TagKey, Map<Slot, XbrlPoint>][]) {
    for (const [k, p] of m) {
      const cell = cells.get(k) ?? { slot: k, end: p.end, vals: {} };
      if (p.end.getTime() > cell.end.getTime()) cell.end = p.end;
      cell.vals[tag] = p.val;
      cells.set(k, cell);
    }
  }
  return [...cells.values()].sort((a, b) => a.end.getTime() - b.end.getTime()).slice(-N);
}

// YoY uses slot-key lookup (`${fy-1}-${fp}`) not positional `cs[i-4]`: real XBRL
// streams are sparse, so positional lookback can land on a wrong-year quarter.
function priorYearRevenue(slot: Slot, byTag: Record<TagKey, Map<Slot, XbrlPoint>>): number | undefined {
  const [fy, fp] = slot.split('-');
  const prev = byTag.revenue.get(`${Number(fy) - 1}-${fp}`);
  return prev?.val;
}

type Formula = (cell: QuarterCell, byTag: Record<TagKey, Map<Slot, XbrlPoint>>) => number;
const FORMULAS: ReadonlyArray<{ label: string; unit: FundamentalsMetric['unit']; fn: Formula }> = [
  { label: 'Revenue YoY', unit: 'pct', fn: (c, byTag) => {
    const cur = c.vals.revenue, prior = priorYearRevenue(c.slot, byTag);
    return cur != null && prior != null && prior !== 0 ? ((cur - prior) / prior) * 100 : NaN;
  } },
  { label: 'FCF margin', unit: 'pct', fn: (c) => {
    const v = c.vals;
    return v.cfo != null && v.capex != null && v.revenue != null && v.revenue !== 0
      ? ((v.cfo - v.capex) / v.revenue) * 100 : NaN;
  } },
  { label: 'Gross margin', unit: 'pct', fn: (c) => {
    const v = c.vals;
    return v.grossProfit != null && v.revenue != null && v.revenue !== 0
      ? (v.grossProfit / v.revenue) * 100 : NaN;
  } },
  { label: 'ROIC', unit: 'pct', fn: (c) => {
    const v = c.vals;
    if (v.opInc == null || v.debt == null || v.revenue == null) return NaN;
    const denom = v.debt + v.revenue * 0.5;
    return denom !== 0 ? (v.opInc / denom) * 100 : NaN;
  } },
  { label: 'Net debt / EBITDA', unit: 'ratio', fn: (c) => {
    const v = c.vals;
    return v.debt != null && v.cash != null && v.opInc != null && v.opInc !== 0
      ? (v.debt - v.cash) / v.opInc : NaN;
  } },
];

export async function fetchFundamentalsTrajectory(
  ticker: Ticker, endpoint?: string,
): Promise<FundamentalsTrajectory> {
  const keys = Object.keys(TAGS) as TagKey[];
  const settled = await Promise.allSettled(keys.map((k) => fetchWithFallback(ticker, TAGS[k], endpoint)));
  const byTag = Object.fromEntries(
    keys.map((k, i) => {
      const r = settled[i];
      const pts = r?.status === 'fulfilled' ? r.value : [];
      return [k, dedupeByPeriod(pts)];
    }),
  ) as Record<TagKey, Map<Slot, XbrlPoint>>;

  const cells = alignQuarters(byTag);
  const offset = N - cells.length; // pad leading NaNs when <8 quarters available
  const metrics: FundamentalsMetric[] = FORMULAS.map(({ label, unit, fn }) => {
    const values = Array.from({ length: N }, () => NaN);
    for (let i = 0; i < cells.length; i++) values[offset + i] = fn(cells[i]!, byTag);
    return { label, values, unit };
  });
  return { ticker, asOf: new Date(), metrics };
}
