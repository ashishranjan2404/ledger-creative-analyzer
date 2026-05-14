// Run with: node --experimental-strip-types schema/earnings_snapshot.ts
// Uses BUTTERBASE_SERVICE_KEY env var. Idempotent: 409 from server = no-op.
import { fetchWithTimeout } from '../_http.ts';

export const earningsSnapshotSchema = {
  name: 'earnings_snapshot',
  columns: [
    { name: 'ticker', type: 'text', notNull: true },
    // layer ∈ fundamentals|insider|13f|valuation|operational|secular
    { name: 'layer', type: 'text', notNull: true },
    { name: 'snapshot_date', type: 'date', notNull: true },
    { name: 'payload', type: 'jsonb', notNull: true },
    { name: 'created_at', type: 'timestamptz', notNull: true, default: 'now()' },
  ],
  primaryKey: ['ticker', 'layer', 'snapshot_date'],
  indexes: [
    // Composite indexes: most queries are "latest N snapshots for ticker/layer",
    // so leading column + snapshot_date DESC supports both filter and order in one scan.
    { name: 'idx_earnings_snapshot_ticker_date', columns: ['ticker', 'snapshot_date DESC'] },
    { name: 'idx_earnings_snapshot_layer_date', columns: ['layer', 'snapshot_date DESC'] },
  ],
} as const;

const DEFAULT_BASE_URL = 'https://app_36ybfio2fiy7.butterbase.dev';

export function renderCreateTable(): string {
  const cols = earningsSnapshotSchema.columns.map((c) => {
    const nn = c.notNull ? ' NOT NULL' : '';
    const def = 'default' in c && c.default ? ` DEFAULT ${c.default}` : '';
    return `  ${c.name} ${c.type}${nn}${def}`;
  });
  const pk = `  PRIMARY KEY (${earningsSnapshotSchema.primaryKey.join(', ')})`;
  const idx = earningsSnapshotSchema.indexes
    .map((i) => `CREATE INDEX IF NOT EXISTS ${i.name} ON ${earningsSnapshotSchema.name} (${i.columns.join(', ')});`)
    .join('\n');
  return `CREATE TABLE IF NOT EXISTS ${earningsSnapshotSchema.name} (\n${[...cols, pk].join(',\n')}\n);\n${idx}`;
}

// WHY: Butterbase admin endpoint shape unverified — assumed POST /api/admin/apply_schema
// with {schema} body and Bearer auth, mirroring the data API. If the deployed admin
// route differs (e.g. /api/schema/apply or {table, columns} body), flip APPLY_PATH /
// body shape here. 409 = "already exists" → idempotent no-op.
export async function applyEarningsSnapshotSchema(
  serviceKey: string,
  baseUrl?: string,
): Promise<{ applied: boolean; message: string }> {
  const base = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${base}/api/admin/apply_schema`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema: earningsSnapshotSchema }),
  });
  if (res.status === 200) return { applied: true, message: await res.text() };
  if (res.status === 409) return { applied: false, message: 'already exists' };
  throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env['BUTTERBASE_SERVICE_KEY'];
  if (!key) { console.error('BUTTERBASE_SERVICE_KEY env var required'); process.exit(2); }
  applyEarningsSnapshotSchema(key, process.env['BUTTERBASE_BASE_URL'])
    .then((r) => console.log(r))
    .catch((e: unknown) => { console.error(e); process.exit(1); });
}
