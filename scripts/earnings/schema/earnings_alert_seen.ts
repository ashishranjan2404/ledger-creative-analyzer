// Run with: node --experimental-strip-types schema/earnings_alert_seen.ts
// De-dup ledger for outbound alerts. wasSeen → suppress; markSeen → record.
// Idempotent: 409 from server = no-op.
import { fetchWithTimeout, fetchJson } from '../_http.ts';
import { insertRow } from '../_butterbase.ts';
import type { Ticker } from '../_types.ts';

// Closed union of alert types. Adding a new type means updating this union
// (and any switch/exhaustiveness checks downstream).
export type AlertType = 'form4_cluster' | '13dg' | 'notable_13f' | '8k_narrative' | 'congressional';

export const earningsAlertSeenSchema = {
  name: 'earnings_alert_seen',
  columns: [
    { name: 'ticker', type: 'text', notNull: true },
    // alert_type ∈ AlertType union (form4_cluster|13dg|notable_13f|8k_narrative|congressional)
    { name: 'alert_type', type: 'text', notNull: true },
    // source_id: EDGAR accession number or stable hash/url for the finding.
    { name: 'source_id', type: 'text', notNull: true },
    { name: 'seen_at', type: 'timestamptz', notNull: true, default: 'now()' },
  ],
  primaryKey: ['ticker', 'alert_type', 'source_id'],
  // Single index on seen_at DESC supports retention sweeps + recency reads;
  // PK already covers point lookups.
  indexes: [{ name: 'idx_earnings_alert_seen_seen_at', columns: ['seen_at DESC'] }],
} as const;

const DEFAULT_BASE_URL = 'https://app_36ybfio2fiy7.butterbase.dev';
const trim = (u?: string): string => (u ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
const auth = (k: string): Record<string, string> => ({
  Authorization: `Bearer ${k}`,
  'Content-Type': 'application/json',
});

export type AlertSeenKey = {
  ticker: Ticker;
  // Type-checked at the call site; widening to `string` here would defeat
  // the union. Update AlertType above when adding new alert kinds.
  alertType: AlertType;
  sourceId: string;
};

export function renderCreateTable(): string {
  const cols = earningsAlertSeenSchema.columns.map((c) => {
    const nn = c.notNull ? ' NOT NULL' : '';
    const def = 'default' in c && c.default ? ` DEFAULT ${c.default}` : '';
    return `  ${c.name} ${c.type}${nn}${def}`;
  });
  const pk = `  PRIMARY KEY (${earningsAlertSeenSchema.primaryKey.join(', ')})`;
  const idx = earningsAlertSeenSchema.indexes
    .map((i) => `CREATE INDEX IF NOT EXISTS ${i.name} ON ${earningsAlertSeenSchema.name} (${i.columns.join(', ')});`)
    .join('\n');
  return `CREATE TABLE IF NOT EXISTS ${earningsAlertSeenSchema.name} (\n${[...cols, pk].join(',\n')}\n);\n${idx}`;
}

export async function applyEarningsAlertSeenSchema(
  serviceKey: string,
  baseUrl?: string,
): Promise<{ applied: boolean; message: string }> {
  const res = await fetchWithTimeout(`${trim(baseUrl)}/api/admin/apply_schema`, {
    method: 'POST',
    headers: auth(serviceKey),
    body: JSON.stringify({ schema: earningsAlertSeenSchema }),
  });
  if (res.status === 200) return { applied: true, message: await res.text() };
  if (res.status === 409) return { applied: false, message: 'already exists' };
  throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
}

// WHY URLSearchParams: lets the runtime escape commas/spaces (source_id may be a
// URL) without hand-rolled encodeURIComponent. Filter syntax `col=eq.X` mirrors
// PostgREST; flip if Butterbase data API differs.
export async function wasSeen(key: AlertSeenKey, serviceKey: string, baseUrl?: string): Promise<boolean> {
  const qs = new URLSearchParams({
    ticker: `eq.${key.ticker}`,
    alert_type: `eq.${key.alertType}`,
    source_id: `eq.${key.sourceId}`,
    limit: '1',
  });
  const rows = await fetchJson<unknown[]>(
    `${trim(baseUrl)}/api/data/earnings_alert_seen?${qs.toString()}`,
    { method: 'GET', headers: auth(serviceKey) },
  );
  return Array.isArray(rows) && rows.length > 0;
}

// WHY try/catch on insertRow: composite-PK collision is the expected idempotent
// path (two callers race on same finding). Other errors re-throw.
// `\b` after 409 prevents matching messages like "HTTP 4090".
export async function markSeen(key: AlertSeenKey, serviceKey: string, baseUrl?: string): Promise<void> {
  const cfg = { serviceKey, ...(baseUrl ? { baseUrl } : {}) };
  const row = { ticker: key.ticker, alert_type: key.alertType, source_id: key.sourceId };
  try {
    await insertRow('earnings_alert_seen', row, cfg);
  } catch (e) {
    if (!(e instanceof Error && /HTTP 409\b/.test(e.message))) throw e;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const k = process.env['BUTTERBASE_SERVICE_KEY'];
  if (!k) { console.error('BUTTERBASE_SERVICE_KEY env var required'); process.exit(2); }
  applyEarningsAlertSeenSchema(k, process.env['BUTTERBASE_BASE_URL'])
    .then((r) => console.log(r))
    .catch((e: unknown) => { console.error(e); process.exit(1); });
}
