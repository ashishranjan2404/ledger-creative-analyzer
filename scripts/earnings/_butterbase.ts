import { fetchJson } from './_http.ts';

// WHY: Butterbase exposes a REST data API at POST /api/data/{table}. Bulk inserts
// use the /bulk suffix with a JSON array body. If the deployed API differs (e.g.
// expects {rows: [...]} or no /bulk suffix), the merger should adjust BULK_PATH /
// bulkBody — the rest of the contract (Bearer auth, JSON, echoed rows) is stable.

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
  return fetchJson<T & { id: string; created_at?: string }>(
    dataUrl(cfg, table, false),
    {
      method: 'POST',
      headers: headers(cfg.serviceKey),
      body: JSON.stringify(row),
    },
  );
}

export async function insertRows<T extends Record<string, unknown>>(
  table: string,
  rows: readonly T[],
  cfg: ButterbaseConfig,
): Promise<(T & { id: string })[]> {
  if (rows.length === 0) return [];
  return fetchJson<(T & { id: string })[]>(
    dataUrl(cfg, table, true),
    {
      method: 'POST',
      headers: headers(cfg.serviceKey),
      // WHY: Butterbase bulk endpoint shape unverified; if API rejects bare
      // array, wrap as JSON.stringify({ rows }) instead.
      body: JSON.stringify(rows),
    },
  );
}
