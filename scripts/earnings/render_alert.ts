// Event-triggered alert renderer + dedup via earnings_alert_seen.
// Subject + body builders are pure; filterAndMarkUnseen is the only I/O entry.
import type { Ticker } from './_types.ts';
import type { ClusterBuy } from './layers/insider.ts';
import type { InstitutionalSignal } from './layers/institutional.ts';
import type { CongressionalTrade } from './sources/quiver.ts';
import { wasSeen, markSeen, type AlertType } from './schema/earnings_alert_seen.ts';

export type Alert =
  | { kind: 'form4_cluster'; ticker: Ticker; sourceId: string; data: ClusterBuy }
  | { kind: 'institutional'; ticker: Ticker; sourceId: string; data: InstitutionalSignal; reason: string }
  | { kind: 'congressional'; ticker: Ticker; sourceId: string; data: { trades: CongressionalTrade[] } };

const FOOTER = '⚠️ Personal long-term tool. Sources: SEC EDGAR.';
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const fmtMoney = (n: number): string =>
  Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;
const fmtShares = (n: number): string => Math.round(n).toLocaleString();

// Insider rows don't carry urls in the ClusterBuy type; accession lives in
// sourceId. EDGAR company landing page is enough for a back-link.
const clusterFiler = (c: ClusterBuy): string =>
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4&CIK=${c.ticker}`;

function clusterSubject(a: Extract<Alert, { kind: 'form4_cluster' }>): string {
  const { ticker, data } = a;
  return `🚨 ALERT: ${ticker} · cluster buy (${data.insiderCount} insiders, ${fmtMoney(data.totalDollarValue)})`;
}

function clusterBody(a: Extract<Alert, { kind: 'form4_cluster' }>): string {
  const c = a.data;
  // Cap insider rows at 5 to keep typical bodies ≤150 words. Title omitted
  // (no parens) when empty so titleless filers render as bare names.
  const rows = c.insiders.slice(0, 5).map(
    (i) => `  • ${i.name}${i.title ? ` (${i.title})` : ''} — ${fmtShares(i.shares)} sh · ${fmtMoney(i.value)}`,
  );
  return [
    `${a.ticker}: ${c.insiderCount} insiders bought between ${ymd(c.windowStart)} and ${ymd(c.windowEnd)}.`,
    ...rows,
    `Total: ${fmtShares(c.totalShares)} sh · ${fmtMoney(c.totalDollarValue)}.`,
    `Filings: ${clusterFiler(c)}`,
    FOOTER,
  ].join('\n');
}

function instSubject(a: Extract<Alert, { kind: 'institutional' }>): string {
  const activist = a.data.activists[0];
  if (/^13D\b/i.test(a.reason) && activist) {
    return `🚨 ALERT: ${a.ticker} · ${activist.formType} activist filing (${activist.filerName || 'unknown filer'})`;
  }
  return `🚨 ALERT: ${a.ticker} · institutional ${a.reason}`;
}

function instBody(a: Extract<Alert, { kind: 'institutional' }>): string {
  const s = a.data;
  // Sub-section budgets keep typical bodies ≤150 words without post-render
  // truncation: top 5 changes + top 3 activist filings is plenty for context.
  const changeRows = s.changes.slice(0, 5).map(
    (c) => `  • ${c.fundName} ${c.changeType} ${fmtShares(Math.abs(c.shareDelta))} sh`,
  );
  const actRows = s.activists.slice(0, 3).map(
    (a2) => `  • ${a2.formType} by ${a2.filerName || 'unknown'} (${a2.percentOwnership}%) — ${a2.filingUrl}`,
  );
  return [
    `${a.ticker}: institutional signal (${a.reason}).`,
    ...changeRows,
    ...actRows,
    FOOTER,
  ].join('\n');
}

// L8 congressional: summarize trade(s) with rep name + amount range in subject.
// One alert covers all recent trades for a ticker (see event_poll); body lists
// each so multi-rep activity is visible without per-trade subject noise.
function congressSubject(a: Extract<Alert, { kind: 'congressional' }>): string {
  const trades = a.data.trades;
  const t0 = trades[0];
  if (!t0) return `🚨 ALERT: ${a.ticker} · congressional trade`;
  const verb = /Purchase/i.test(t0.transaction) ? 'bought' : /Sale/i.test(t0.transaction) ? 'sold' : 'traded';
  const rep = t0.representative || 'member';
  // Strip "Last, First" to "Last" for compact subject; full name appears in body.
  const repShort = rep.split(',')[0]?.trim() || rep;
  const more = trades.length > 1 ? ` +${trades.length - 1} more` : '';
  return `🚨 ALERT: ${a.ticker} · ${repShort} ${verb} ${t0.amount}${more}`;
}

function congressBody(a: Extract<Alert, { kind: 'congressional' }>): string {
  const trades = a.data.trades;
  // Cap at 5 rows to keep typical bodies ≤150 words; one alert may cluster
  // multiple notable members trading the same ticker in the poll window.
  const rows = trades.slice(0, 5).map(
    (t) => `  • ${t.representative} (${t.party}, ${t.chamber}) — ${t.transaction} ${t.amount} on ${ymd(t.transactionDate)}`,
  );
  return [
    `${a.ticker}: ${trades.length} congressional trade${trades.length === 1 ? '' : 's'} on the watchlist.`,
    ...rows,
    FOOTER,
  ].join('\n');
}

export function renderAlertSubject(a: Alert): string {
  if (a.kind === 'form4_cluster') return clusterSubject(a);
  if (a.kind === 'institutional') return instSubject(a);
  return congressSubject(a);
}

export function renderAlertBody(a: Alert): string {
  if (a.kind === 'form4_cluster') return clusterBody(a);
  if (a.kind === 'institutional') return instBody(a);
  return congressBody(a);
}

// Map Alert.kind → AlertType union in schema. 'institutional' alerts fan out to
// either '13dg' (activist) or 'notable_13f' (changes-driven) for storage keys —
// preserves dedup granularity (activist 13D vs 2-fund consensus get independent
// ledger rows). `satisfies AlertType` on each literal catches schema drift if
// the union in earnings_alert_seen.ts is renamed without updating this file.
function alertTypeOf(a: Alert): AlertType {
  if (a.kind === 'form4_cluster') return 'form4_cluster' satisfies AlertType;
  if (a.kind === 'congressional') return 'congressional' satisfies AlertType;
  // shouldAlertInstitutional returns rich strings; "13D" is the activist marker.
  return /^13D\b/i.test(a.reason)
    ? ('13dg' satisfies AlertType)
    : ('notable_13f' satisfies AlertType);
}

export async function filterAndMarkUnseen(
  alerts: readonly Alert[],
  serviceKey: string,
  baseUrl?: string,
): Promise<Alert[]> {
  const keys = alerts.map((a) => ({ ticker: a.ticker, alertType: alertTypeOf(a), sourceId: a.sourceId }));
  // Per-alert wasSeen in parallel; treat lookup failures as "not seen" so a
  // transient outage delivers an alert (with risk of dup) rather than swallowing.
  const seenResults = await Promise.allSettled(keys.map((k) => wasSeen(k, serviceKey, baseUrl)));
  const unseen: Alert[] = [];
  const toMark: typeof keys = [];
  for (let i = 0; i < alerts.length; i++) {
    const r = seenResults[i]!;
    if (r.status === 'fulfilled' && r.value === true) continue;
    unseen.push(alerts[i]!);
    toMark.push(keys[i]!);
  }
  await Promise.allSettled(toMark.map((k) => markSeen(k, serviceKey, baseUrl)));
  return unseen;
}
