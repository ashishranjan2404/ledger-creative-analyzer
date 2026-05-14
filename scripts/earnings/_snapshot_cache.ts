// Thin layer over earnings_snapshot table: read-latest + write-today.
// L1 fundamentals is the first caller (Ralph 11). Per-layer payload is opaque
// jsonb; callers parameterize on P. Cache miss returns null (never throws);
// auth/network errors propagate so caller can log + degrade to live fetch.
import { insertRow, selectRows, type ButterbaseConfig } from './_butterbase.ts';

const TABLE = 'earnings_snapshot';
const DEFAULT_MAX_AGE_DAYS = 6; // weekly cadence; 6d window keeps Sun→Sat runs hot.
const MS_PER_DAY = 86_400_000;

type SnapshotRow<P> = {
  ticker: string;
  layer: string;
  snapshot_date: string; // 'YYYY-MM-DD'
  payload: P;
};

// WHY YYYY-MM-DD UTC: snapshot_date is a `date` (not timestamp) in Postgres, so
// any local-tz date would surface as off-by-one across the Pacific midnight boundary.
function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ageDays(snapshotDate: string, now: Date = new Date()): number {
  // Treat snapshot_date as UTC midnight; same for `now` ⇒ stable integer-day delta.
  const snapMs = Date.parse(`${snapshotDate}T00:00:00Z`);
  if (Number.isNaN(snapMs)) return Number.POSITIVE_INFINITY; // unparsable ⇒ treat as stale.
  const nowMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return (nowMs - snapMs) / MS_PER_DAY;
}

export async function getLatestSnapshot<P>(
  ticker: string,
  layer: string,
  cfg: ButterbaseConfig,
  opts?: { maxAgeDays?: number },
): Promise<P | null> {
  const maxAgeDays = opts?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  // WHY no ORDER BY in the where clause: selectRows only supports equality filters.
  // We fetch all rows for (ticker, layer) — expected cardinality is small (one row
  // per weekly run × tiny retention) — then pick the newest snapshot_date client-side.
  const rows = await selectRows<SnapshotRow<P>>(TABLE, { ticker, layer }, cfg);
  if (rows.length === 0) return null;
  const latest = rows.reduce((a, b) => (a.snapshot_date >= b.snapshot_date ? a : b));
  if (ageDays(latest.snapshot_date) > maxAgeDays) return null;
  return latest.payload;
}

export async function putSnapshot<P>(
  ticker: string,
  layer: string,
  payload: P,
  cfg: ButterbaseConfig,
): Promise<void> {
  await insertRow(
    TABLE,
    { ticker, layer, snapshot_date: todayUtcIso(), payload: payload as unknown } as Record<string, unknown>,
    cfg,
  );
}
