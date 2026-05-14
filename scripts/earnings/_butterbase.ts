import { fetchJsonWithRetry } from './_http.ts';

// WHY: Butterbase exposes a REST data API at POST /api/data/{table}. Bulk inserts
// use the /bulk suffix with a JSON array body. If the deployed API differs (e.g.
// expects {rows: [...]} or no /bulk suffix), the merger should adjust BULK_PATH /
// bulkBody — the rest of the contract (Bearer auth, JSON, echoed rows) is stable.
//
// WHY selectRows shape: assumed convention is `GET /api/data/{table}?col=val` with
// equality filters serialized as a flat query string and the response a JSON array
// of rows. This MIRRORS the POST insert shape (same path, Bearer auth, JSON body
// for writes). The GET form is UNVERIFIED against the deployed router — if the real
// API uses `?where[col]=val`, `/api/data/{table}/select`, or a body filter, fix the
// query serialization + path in selectRows below; the cache layer above never needs
// to change.

export type ButterbaseConfig = {
  baseUrl?: string;
  serviceKey: string;
};

const DEFAULT_BASE_URL = 'https://app_36ybfio2fiy7.butterbase.dev';

function headers(serviceKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

// WHY: strip trailing slashes so callers passing `https://...butterbase.dev/`
// don't produce `//api/data/...` paths that some routers reject.
function dataUrl(cfg: ButterbaseConfig, table: string, bulk: boolean): string {
  const base = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  return `${base}/api/data/${encodeURIComponent(table)}${bulk ? '/bulk' : ''}`;
}

export async function insertRow<T extends Record<string, unknown>>(
  table: string,
  row: T,
  cfg: ButterbaseConfig,
): Promise<T & { id: string; created_at?: string }> {
  // WHY no-retry on writes: 5xx where the server actually processed our row
  // would create duplicates on retry (audit_log appends, findings ids drift).
  // Idempotent paths (earnings_alert_seen 409 swallow) live at the caller.
  return fetchJsonWithRetry<T & { id: string; created_at?: string }>(
    dataUrl(cfg, table, false),
    {
      method: 'POST',
      headers: headers(cfg.serviceKey),
      body: JSON.stringify(row),
    },
    { maxRetries: 0 },
  );
}

export async function selectRows<T>(
  table: string,
  where: Record<string, string | number>,
  cfg: ButterbaseConfig,
): Promise<T[]> {
  const base = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const qs = Object.entries(where)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${base}/api/data/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`;
  return fetchJsonWithRetry<T[]>(url, { method: 'GET', headers: headers(cfg.serviceKey) }, { maxRetries: 2 });
}

export async function insertRows<T extends Record<string, unknown>>(
  table: string,
  rows: readonly T[],
  cfg: ButterbaseConfig,
): Promise<(T & { id: string })[]> {
  if (rows.length === 0) return [];
  return fetchJsonWithRetry<(T & { id: string })[]>(
    dataUrl(cfg, table, true),
    {
      method: 'POST',
      headers: headers(cfg.serviceKey),
      // WHY: Butterbase bulk endpoint shape unverified; if API rejects bare
      // array, wrap as JSON.stringify({ rows }) instead.
      body: JSON.stringify(rows),
    },
    { maxRetries: 0 }, // same no-retry-on-write rationale as insertRow above
  );
}
