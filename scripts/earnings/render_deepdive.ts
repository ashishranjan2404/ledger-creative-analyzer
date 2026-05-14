import type { FundamentalsTrajectory, FundamentalsMetric } from './layers/fundamentals.ts';
import type { ValuationContext, ValuationMetric } from './layers/valuation.ts';
import type { NarrativeShift } from './layers/narrative.ts';
import type { OperationalSignal } from './layers/operational.ts';
import type { SecularSignal, SecularTrend } from './layers/secular.ts';
import type { CongressionalTrade } from './sources/congress_disclosure.ts';
import type { LobbyingRecord } from './sources/lobbying.ts';
import type { GovContract } from './sources/gov_contracts.ts';
import type { Ticker } from './_types.ts';
import { sparkline } from './_sparkline.ts';

// L8 GOV: data now sourced from free public feeds (Loops 1-2 swap). Type name
// reflects the section's intent rather than the original Quiver adapter.
export type GovCapitalSignal = {
  congressional: CongressionalTrade[];
  lobbying: LobbyingRecord[];
  contracts: GovContract[];
};

export type DeepDiveCard = {
  ticker: Ticker;
  asOf?: Date;
  fundamentals?: FundamentalsTrajectory;
  valuation?: ValuationContext;
  narrative?: NarrativeShift;
  operational?: OperationalSignal;
  secular?: SecularSignal;
  govCapital?: GovCapitalSignal;
};

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const SEP = '─'.repeat(64);
const FOOTER = '⚠️ Personal long-term tool. Sources: SEC EDGAR XBRL.';
const PAD_LABEL = 16; // 'Net debt/EBITDA:' is the widest label; pad to align bars.

// WHY central fmt + two wrappers: every numeric exit point routes through `fmt`
// (single NaN→'n/a' guard + unit-suffix logic). Wrappers differ only in pct
// precision — fundamentals scan as integer pct; valuation needs 1-dec.
type Unit = FundamentalsMetric['unit'] | ValuationMetric['unit'];
function fmt(n: number, unit: Unit, pctDecimals: 0 | 1): string {
  if (!Number.isFinite(n)) return 'n/a';
  if (unit === 'pct') return pctDecimals === 0 ? `${Math.round(n)}%` : `${n.toFixed(1)}%`;
  if (unit === 'ratio' || unit === 'multiple') return `${n.toFixed(1)}x`;
  // 'usd' — render in $M with grouping.
  return `$${(n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
}
const fmtFund = (n: number, unit: FundamentalsMetric['unit']): string => fmt(n, unit, 0);
const fmtVal = (n: number, unit: ValuationMetric['unit']): string => fmt(n, unit, 1);

// WHY signed YoY: "+208%" reads very differently from "208"; only Revenue YoY
// swings negative meaningfully (signing others is harmless cosmetic).
function fmtSignedPct(v: number): string {
  if (!Number.isFinite(v)) return 'n/a';
  const r = Math.round(v);
  return `${r >= 0 ? '+' : ''}${r}%`;
}

// WHY: marker compares latest (values[7]) to 4q-prior (values[3]) — true
// year-over-year direction, not the 2nd-derivative of a rate. NaN on either
// side yields '·' so missing-data rows don't claim a spurious trend.
function yoyMarker(values: readonly number[]): string {
  const last = values.at(-1);
  const prior = values.length >= 5 ? values[values.length - 5] : undefined;
  if (last === undefined || prior === undefined) return '·';
  if (!Number.isFinite(last) || !Number.isFinite(prior)) return '·';
  if (last > prior) return '▲';
  if (last < prior) return '▼';
  return '·';
}
function fundLine(m: FundamentalsMetric): string {
  const label = `${m.label}:`.padEnd(PAD_LABEL);
  const bar = sparkline(m.values).padEnd(8);
  const yoy = yoyMarker(m.values);
  const signed = m.label === 'Revenue YoY';
  const cells = m.values.map((v) =>
    (signed && m.unit === 'pct' ? fmtSignedPct(v) : fmtFund(v, m.unit)).padStart(5),
  ).join(' ');
  return `  ${label}${bar} ${yoy}  ${cells}`;
}

function valLine(m: ValuationMetric, medianLabel: string): string {
  const cur = `${m.label}: ${fmtVal(m.current, m.unit)}`.padEnd(20);
  const med = `${medianLabel}: ${fmtVal(m.median5yr, m.unit)}`.padEnd(24);
  const sec = `sector: ${fmtVal(m.sectorMedian, m.unit)}`;
  return `  ${cur}${med}${sec}`;
}

// Spelled-out column header — aligned to valLine cell widths (20 + 24 + sector).
const VAL_HEADER = `  ${''.padEnd(11)}${'current'.padEnd(11)}${'5yr med'.padEnd(15)}sector`;

// L4/L6/L7 helpers return string[]|null — null skips the whole section so
// partial cards never show stub blocks. fmt[Num|PctOpt] centralise the
// undefined/NaN → 'n/a' guard.
const fmtNum = (n: number | undefined): string =>
  n == null || !Number.isFinite(n) ? 'n/a' : n.toLocaleString('en-US');
const fmtPctOpt = (n: number | undefined): string =>
  n == null || !Number.isFinite(n) ? 'n/a' : fmtSignedPct(n);
const ARROW: Record<SecularTrend, string> = { accelerating: '↑', flat: '→', decelerating: '↓' };

// L4 narrative: header carries `(prior → current)` date pair. Null when empty.
const narrativeBlock = (n: NarrativeShift | undefined): [string, string[]] | null =>
  !n || n.shifts.length === 0 ? null
    : [`▌NARRATIVE SHIFT (${ymd(n.priorQuarter.date)} → ${ymd(n.currentQuarter.date)})`,
       n.shifts.map((s) => `  • ${s}`)];

function operationalRows(o: OperationalSignal | undefined): string[] | null {
  if (!o) return null;
  const rows: string[] = [];
  if (o.openJobs != null || o.openJobsDelta90d != null)
    rows.push(`  Open eng roles:   ${fmtNum(o.openJobs).padStart(6)} (${fmtPctOpt(o.openJobsDelta90d)} vs 90d ago)`);
  if (o.githubStars != null || o.githubStarsDelta90d != null)
    rows.push(`  GitHub stars:     ${fmtNum(o.githubStars).padStart(6)} (${fmtPctOpt(o.githubStarsDelta90d)} qoq)`);
  if (o.githubContributors != null)
    rows.push(`  Contributors:     ${fmtNum(o.githubContributors).padStart(6)}`);
  if (o.l5Comp != null || o.l5CompDeltaYoY != null) {
    const tc = o.l5Comp == null ? 'n/a' : `$${Math.round(o.l5Comp / 1000)}k`;
    rows.push(`  L5 comp:          ${tc.padStart(6)} (${fmtPctOpt(o.l5CompDeltaYoY)} YoY)`);
  }
  return rows.length === 0 ? null : rows;
}

const secRow = (lbl: string, c: number | undefined, p: number | undefined, t: SecularTrend | undefined): string | null =>
  c == null ? null : `  ${lbl} ${fmtNum(c).padStart(5)} (was ${fmtNum(p)})  ${t ? ARROW[t] : '·'} ${t ?? ''}`.trimEnd();
function secularRows(s: SecularSignal | undefined): string[] | null {
  if (!s) return null;
  const rs = [
    secRow('arxiv mentions/90d:', s.arxivMentions90d, s.arxivMentions90dPriorPeriod, s.arxivTrend),
    secRow('HN mentions/90d:   ', s.hnMentions90d, s.hnMentions90dPriorPeriod, s.hnTrend),
  ].filter((r): r is string => r !== null);
  return rs.length === 0 ? null : rs;
}

// L8 GOV: cap rows to keep card readable. Show top 3 congressional trades (most
// recent first), latest-quarter lobbying total, top 2 most recent contracts.
// Null when all 3 sub-feeds empty so the section header is suppressed.
function fmtDollars(n: number): string {
  if (!Number.isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}
function govCapitalRows(q: GovCapitalSignal | undefined): string[] | null {
  if (!q) return null;
  const { congressional, lobbying, contracts } = q;
  if (congressional.length === 0 && lobbying.length === 0 && contracts.length === 0) return null;
  const rows: string[] = [];
  // Congress: newest-first by transactionDate; cap at 3 to keep section ≤7 lines.
  const congSorted = [...congressional].sort(
    (a, b) => b.transactionDate.getTime() - a.transactionDate.getTime(),
  );
  for (const c of congSorted.slice(0, 3)) {
    rows.push(`  Congress: ${c.representative} (${c.party}) ${c.transaction} ${c.amount} · ${ymd(c.transactionDate)}`);
  }
  // Lobbying: pick latest quarter and sum within it (quiver returns multiple records
  // per quarter — one per registrant). Single line per ticker keeps signal scannable.
  if (lobbying.length > 0) {
    let bestY = -1; let bestQ = -1;
    for (const l of lobbying) {
      if (l.year > bestY || (l.year === bestY && l.quarter > bestQ)) { bestY = l.year; bestQ = l.quarter; }
    }
    const total = lobbying.filter((l) => l.year === bestY && l.quarter === bestQ)
      .reduce((s, l) => s + l.amount, 0);
    rows.push(`  Lobbying: ${fmtDollars(total)} (Q${bestQ} ${bestY})`);
  }
  // Contracts: newest-first; cap at 2.
  const conSorted = [...contracts].sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const c of conSorted.slice(0, 2)) {
    rows.push(`  Contract: ${fmtDollars(c.amount)} · ${c.agency} · ${ymd(c.date)}`);
  }
  return rows.length === 0 ? null : rows;
}

export function renderDeepDiveCard(c: DeepDiveCard): string {
  const fundRows = c.fundamentals && c.fundamentals.metrics.length > 0
    ? c.fundamentals.metrics.map(fundLine) : ['  n/a — no XBRL data'];
  const valRows = c.valuation && c.valuation.metrics.length > 0
    ? [VAL_HEADER, ...c.valuation.metrics.map((m) => valLine(m, '5yr med'))]
    : ['  n/a — no valuation data'];
  // WHY ordering FUND→NAR→VAL→OP→SEC→GOV: narrative interprets the numbers'
  // story before the valuation snapshot; op + secular cluster as forward-looking;
  // GOV (L8: capital/policy flows) closes the card as macro context.
  const sections: Array<[string, string[] | null]> = [
    ['▌FUNDAMENTALS (8q sparklines)', fundRows],
    narrativeBlock(c.narrative) ?? ['▌NARRATIVE SHIFT', null],
    ['▌VALUATION', valRows],
    ['▌OPERATIONAL VELOCITY', operationalRows(c.operational)],
    ['▌SECULAR', secularRows(c.secular)],
    ['▌GOVERNMENT & CAPITAL', govCapitalRows(c.govCapital)],
  ];
  const body = sections.filter((s): s is [string, string[]] => s[1] !== null)
    .map(([h, rs]) => [h, ...rs].join('\n')).join('\n\n');
  return [`🏢 ${c.ticker}`, '', body, SEP].join('\n');
}

export function renderDeepDiveSubject(date: Date, n: number): string {
  return `📈 Thedi deep-dive · ${ymd(date)} · ${n} ticker${n === 1 ? '' : 's'}`;
}

export function renderDeepDiveText(cards: readonly DeepDiveCard[], date: Date): string {
  const head = `📈 Thedi Deep-Dive — ${ymd(date)}`;
  if (cards.length === 0) {
    return `${head}\n\nNo deep-dive cards available.\n\n${FOOTER}`;
  }
  const body = cards.map(renderDeepDiveCard).join('\n\n');
  return `${head}\n\n${body}\n\n${FOOTER}`;
}
