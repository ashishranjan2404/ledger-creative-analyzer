// L3 institutional signals: aggregate notable-fund 13F changes + 13D/G activism per
// ticker, then evaluate alert rules. Pure — caller owns I/O & cron cadence.
// WHY Map-not-array for NOTABLE_FUNDS: O(1) membership lookup during change filtering,
// and the value carries the display name so render doesn't need a second lookup.
// CIKs are padded-10 to match what edgar_13f emits (.padStart(10,'0')).
import type { FundActivism, FundPositionChange } from '../sources/edgar_13f.ts';
import type { Ticker } from '../_types.ts';

// TODO: verify CIK against EDGAR submissions endpoint for all 8 funds:
// Berkshire Hathaway, Pershing Square, Scion Asset Management, Coatue Management,
// Greenlight Capital, Baupost Group, Third Point, ValueAct Capital.
// Coatue/Greenlight/Baupost in particular are unverified; cross-check via
// https://data.sec.gov/submissions/CIK<padded>.json before trusting in prod.
export const NOTABLE_FUNDS: ReadonlyMap<string, string> = new Map([
  ['0001067983', 'Berkshire Hathaway'],
  ['0001336528', 'Pershing Square'],
  ['0001649339', 'Scion Asset Management'],
  ['0001603466', 'Coatue Management'],
  ['0001079114', 'Greenlight Capital'],
  ['0001061165', 'Baupost Group'],
  ['0001040273', 'Third Point'],
  ['0001418814', 'ValueAct Capital'],
]);

export type InstitutionalSignal = {
  ticker: Ticker;
  changes: readonly FundPositionChange[];
  activists: readonly FundActivism[];
};

const NEW_POSITION_SHARES_THRESHOLD = 100_000;

// Two-pass groupBy keeps each pass trivially typed; insertion-ordered, caller sorts.
function groupByTicker<T extends { ticker: Ticker }>(items: readonly T[]): Map<Ticker, T[]> {
  const m = new Map<Ticker, T[]>();
  for (const it of items) {
    const arr = m.get(it.ticker);
    if (arr) arr.push(it); else m.set(it.ticker, [it]);
  }
  return m;
}

export function buildInstitutionalSignals(
  notableChanges: readonly FundPositionChange[],
  activists: readonly FundActivism[],
): InstitutionalSignal[] {
  // Pre-filter changes to notable funds only; non-notable noise wastes downstream rule evals.
  const notable = notableChanges.filter((c) => NOTABLE_FUNDS.has(c.fundCik));
  const changesByTicker = groupByTicker(notable);
  const activistsByTicker = groupByTicker(activists);
  const tickers = new Set<Ticker>([...changesByTicker.keys(), ...activistsByTicker.keys()]);
  return [...tickers].sort().map((ticker) => ({
    ticker,
    changes: changesByTicker.get(ticker) ?? [],
    activists: activistsByTicker.get(ticker) ?? [],
  }));
}

// WHY string-not-boolean: reason flows directly into alert payload. null = no alert.
// Priority: activist > consensus > size; short-circuit at first triggered rule.
export function shouldAlertInstitutional(signal: InstitutionalSignal): string | null {
  const activist13D = signal.activists.find((a) => a.formType === '13D');
  if (activist13D) {
    const who = activist13D.filerName || 'unknown filer';
    return `13D activist position by ${who} (${activist13D.percentOwnership}%)`;
  }
  // Consensus = ≥2 distinct notable funds increased (or opened) the same ticker. Distinct
  // by fundCik so a single fund's amended filing doesn't double-count.
  const buyers = new Set(
    signal.changes
      .filter((c) => c.changeType === 'increased' || c.changeType === 'new')
      .map((c) => c.fundCik),
  );
  if (buyers.size >= 2) {
    const names = [...buyers].map((c) => NOTABLE_FUNDS.get(c) ?? c).sort().join(', ');
    return `${buyers.size} notable funds accumulating: ${names}`;
  }
  // Strict > per spec ("new position >100k shares"). shareDelta is positive-by-convention
  // for new positions; do NOT abs() — a negative here means upstream data is malformed.
  const bigNew = signal.changes.find(
    (c) => c.changeType === 'new' && c.shareDelta > NEW_POSITION_SHARES_THRESHOLD,
  );
  if (bigNew) {
    return `new ${bigNew.shareDelta.toLocaleString()}-share position by ${bigNew.fundName}`;
  }
  return null;
}
