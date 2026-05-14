import { TICKERS } from './_watchlist.ts';
import { assertPersonalRecipient } from './_recipient.ts';
import { fetchRecentForm4 } from './sources/edgar_form4.ts';
import {
  fetchNotableFund13F, fetchPriorFund13F, fetchActivism, diffHoldings,
} from './sources/edgar_13f.ts';
import { fetchCongressionalTrades, type CongressionalTrade } from './sources/congress_disclosure.ts';
import { detectClusterBuys } from './layers/insider.ts';
import {
  buildInstitutionalSignals, shouldAlertInstitutional, NOTABLE_FUNDS,
} from './layers/institutional.ts';
import {
  filterAndMarkUnseen, renderAlertSubject, renderAlertBody, type Alert,
} from './render_alert.ts';
import { sendEmail } from './send.ts';
import { insertRow } from './_butterbase.ts';
import type { Ticker } from './_types.ts';

export const ENV_VARS = ['RESEND_KEY', 'BUTTERBASE_SERVICE_KEY', 'RECIPIENT'] as const;
type EnvKey = typeof ENV_VARS[number];

const FROM = 'thedi@platformy.org';
const FORM4_SINCE_DAYS = 7;     // hourly cron easily covers cluster-buy 30d window via accumulation
const ACTIVISM_SINCE_DAYS = 30; // 13D/G filings stay relevant for ~30 days
const CONGRESS_SINCE_DAYS = 7;  // reporting lag is up to 45d but most appear within a week of trade.

// WHY aggregate-throw: same pattern as tactical/deepdive readEnv — operator
// fixes all gaps in one cron edit instead of N rounds.
export function readEnv(env: NodeJS.ProcessEnv = process.env): Record<EnvKey, string> {
  const out = {} as Record<EnvKey, string>;
  const missing: string[] = [];
  for (const k of ENV_VARS) { const v = env[k]; if (!v) missing.push(k); else out[k] = v; }
  if (missing.length) throw new Error(`missing env var(s): ${missing.join(', ')}`);
  return out;
}

// WHY named-object Promise.allSettled: results addressed by NAME, not index —
// reorder a fan-out entry without silently re-routing warn labels.
async function settledByName<T extends Record<string, Promise<unknown>>>(
  ps: T,
): Promise<{ [K in keyof T]: Awaited<T[K]> | undefined }> {
  const keys = Object.keys(ps) as (keyof T)[];
  const settled = await Promise.allSettled(keys.map((k) => ps[k]));
  const out = {} as { [K in keyof T]: Awaited<T[K]> | undefined };
  keys.forEach((k, i) => {
    const r = settled[i]!;
    if (r.status === 'fulfilled') out[k] = r.value as Awaited<T[typeof k]>;
    else { console.warn(`[${String(k)}] ${String(r.reason)}`); out[k] = undefined; }
  });
  return out;
}

export async function runEventPoll(): Promise<{ alerts: number; newAlerts: number; ms: number }> {
  const start = Date.now();
  const env = readEnv();
  assertPersonalRecipient(env.RECIPIENT);

  // L8 congressional alerts run unconditionally — congress_disclosure.ts pulls
  // free public feeds (no API key), so the fan-out always includes a congress leg.
  // WHY prior+current 13F as siblings (not chained): one failed leg degrades to
  // empty-diff (no false alerts), and parallel settles keep total wall-time at
  // max(current, prior) instead of current+prior.
  const fundCiks = [...NOTABLE_FUNDS.keys()];
  const r = await settledByName({
    form4: fetchRecentForm4(TICKERS, FORM4_SINCE_DAYS),
    notable13F: fetchNotableFund13F(fundCiks),
    prior13F: fetchPriorFund13F(fundCiks),
    activism: fetchActivism(TICKERS, ACTIVISM_SINCE_DAYS),
    congress: fetchCongressionalTrades(TICKERS, CONGRESS_SINCE_DAYS),
  });

  // L2: cluster-buy detector over Form 4 transactions.
  const clusters = detectClusterBuys(r.form4 ?? []);
  const clusterAlerts: Alert[] = clusters.map((c) => ({
    kind: 'form4_cluster', ticker: c.ticker,
    // WHY ticker|window dates: stable dedup key across hourly polls. Theoretical
    // collision: two distinct clusters for same ticker in same window would
    // coalesce; not observed in V1 (detector emits one window per ticker).
    sourceId: `${c.ticker}|${c.windowStart.toISOString().slice(0, 10)}|${c.windowEnd.toISOString().slice(0, 10)}`,
    data: c,
  }));

  // L3: institutional signals. Diff current vs prior-quarter 13F snapshots so
  // consensus (≥2 funds accumulating) and big-new-position (>100k shares) rules
  // can fire alongside activist (13D/G). If either snapshot leg failed (undefined),
  // the diff degrades to empty — only activist alerts ship that poll, which is
  // the desired failure mode (no-alert preferred over false-alert).
  const changes = diffHoldings(r.notable13F ?? [], r.prior13F ?? []);
  const signals = buildInstitutionalSignals(changes, r.activism ?? []);
  const instAlerts: Alert[] = signals.flatMap((s): Alert[] => {
    const reason = shouldAlertInstitutional(s);
    if (!reason) return [];
    const a = s.activists[0];
    const sourceId = a ? a.accessionNumber : `${s.ticker}|inst|${reason.slice(0, 40)}`;
    return [{ kind: 'institutional', ticker: s.ticker, sourceId, data: s, reason }];
  });

  // L8: group congressional trades by ticker; one alert per ticker covers all
  // recent trades in the poll window. sourceId is ticker|sorted-tx-dates so two
  // distinct trade sets dedup independently while the same set re-polled doesn't
  // re-alert. Notable politician filter is intentionally OPEN in V1 — every
  // House/Senate member trading a watchlist ticker is signal enough at our scale.
  const congressByTicker = new Map<Ticker, CongressionalTrade[]>();
  for (const t of (r.congress ?? [])) {
    const arr = congressByTicker.get(t.ticker) ?? [];
    arr.push(t);
    congressByTicker.set(t.ticker, arr);
  }
  const congressAlerts: Alert[] = [...congressByTicker.entries()].map(([ticker, trades]) => {
    const sorted = [...trades].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
    const sourceId = `${ticker}|${sorted.map((t) => t.transactionDate.toISOString().slice(0, 10)).join(',')}`;
    return { kind: 'congressional', ticker, sourceId, data: { trades: sorted } };
  });

  const alerts = [...clusterAlerts, ...instAlerts, ...congressAlerts];
  const unseen = await filterAndMarkUnseen(alerts, env.BUTTERBASE_SERVICE_KEY);

  // WHY per-alert try/catch: one Resend failure must not kill sibling sends.
  let sentCount = 0;
  let firstError: string | null = null;
  for (const a of unseen) {
    try {
      await sendEmail({
        apiKey: env.RESEND_KEY, from: FROM, to: env.RECIPIENT,
        subject: renderAlertSubject(a), text: renderAlertBody(a),
      });
      sentCount += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!firstError) firstError = msg;
      console.warn(`[send ${a.ticker}/${a.kind}] ${msg}`);
    }
  }

  const ms = Date.now() - start;
  const failed = unseen.length - sentCount;
  const ok = failed === 0;
  const note = unseen.length === 0
    ? `no new alerts (scanned ${alerts.length})`
    : failed > 0
      ? `sent ${sentCount}/${unseen.length} new alerts; ${failed} failed: ${firstError}`
      : `sent ${sentCount}/${unseen.length} new alerts to ${env.RECIPIENT}`;
  try {
    await insertRow('audit_log', {
      step: 'event_poll_run', ok, ms, findings_count: unseen.length, note,
    }, { serviceKey: env.BUTTERBASE_SERVICE_KEY });
  } catch (e) { console.warn(`[butterbase audit] ${String(e)}`); }

  return { alerts: alerts.length, newAlerts: unseen.length, ms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await (async () => { try { console.log(await runEventPoll()); } catch (e) { console.error(e); process.exit(1); } })();
}
