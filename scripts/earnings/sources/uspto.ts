// USPTO PatentsView grants source for L7 secular signal.
//
// API: POST https://search.patentsview.org/api/v1/patent/  (free, keyless,
// identifies via UA). Public docs cap anonymous use at 45 req/min — well within
// our weekly per-ticker run. We use the documented `q` / `f` / `s` / `o`
// envelope: `_and` of `_gte: patent_date` (180d window) and `_contains` against
// `assignees_at_grant.assignee_organization` so corporate parents map to grants
// regardless of subsidiary boilerplate.
//
// fail-soft: any network/HTTP/parse error → null so the L7 fan-out continues.
// empty / malformed payload (no `patents` array, no rows) → {count:0, titles:[]}
// so callers can distinguish "endpoint dead" (null, log noise) from "no grants
// in window" (zero, render unchanged).
import { fetchJsonWithRetry } from '../_http.ts';

const DEFAULT_ENDPOINT = 'https://search.patentsview.org/api/v1/patent/';
const PAGE_SIZE = 50;
const RECENT_TITLES = 5;

type PatentsViewRow = {
  patent_id?: string;
  patent_title?: string;
  patent_date?: string;
};
// Some PatentsView responses use `patents`, newer endpoints have used the
// generic `results`/`data` key — accept any of them and fail-soft if none match.
type PatentsViewResp = {
  patents?: PatentsViewRow[];
  results?: PatentsViewRow[];
  data?: PatentsViewRow[];
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildBody(assignee: string, sinceDate: string): string {
  return JSON.stringify({
    q: {
      _and: [
        { _gte: { patent_date: sinceDate } },
        { _contains: { 'assignees_at_grant.assignee_organization': assignee } },
      ],
    },
    f: ['patent_id', 'patent_title', 'patent_date'],
    s: [{ patent_date: 'desc' }],
    o: { size: PAGE_SIZE },
  });
}

export async function fetchPatentGrants(
  assigneeName: string,
  sinceDays: number = 180,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<{ count: number; recentTitles: string[] } | null> {
  if (!assigneeName) return { count: 0, recentTitles: [] };
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  try {
    const resp = await fetchJsonWithRetry<PatentsViewResp>(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: buildBody(assigneeName, ymd(since)),
    });
    // Accept any shape the upstream sends; if none match the documented keys,
    // treat as malformed and degrade to empty (response was 2xx, just shape-mismatched).
    const rows = resp.patents ?? resp.results ?? resp.data;
    if (!Array.isArray(rows)) {
      console.warn(`[uspto] ${assigneeName}: unrecognized response shape`);
      return { count: 0, recentTitles: [] };
    }
    const titles: string[] = [];
    for (const r of rows) {
      if (titles.length >= RECENT_TITLES) break;
      if (typeof r.patent_title === 'string' && r.patent_title.trim()) {
        titles.push(r.patent_title.trim());
      }
    }
    return { count: rows.length, recentTitles: titles };
  } catch (e) {
    console.warn(`[uspto] ${assigneeName}: ${String(e)}`);
    return null;
  }
}
