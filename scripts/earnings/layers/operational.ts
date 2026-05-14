// L6 operational velocity: shipping cadence proxies a company can't easily
// dress up for an earnings call. GitHub stars/contributors lift our most
// objective public OSS signal; LinkedIn job-listing count and Levels.fyi L5
// median comp would round out the picture but neither has a free public API,
// so V1 stubs them as undefined and documents the gap inline.
//
// Concurrency: Promise.allSettled across providers — one source's 429 must
// never poison another's payload.
import { fetchWithTimeout } from '../_http.ts';
import type { Ticker } from '../_types.ts';

export type OperationalSignal = {
  ticker: Ticker;
  asOf: Date;
  openJobs?: number;
  openJobsDelta90d?: number;     // pct change vs 90d ago
  githubStars?: number;
  githubStarsDelta90d?: number;  // pct change vs 90d ago (V1: needs history store)
  githubContributors?: number;
  l5Comp?: number;               // current L5 base+equity TC (USD)
  l5CompDeltaYoY?: number;       // pct change vs 1yr ago
};

type ProviderHandles = {
  github?: string;          // owner/repo, e.g. 'apple/swift'
  linkedinCompany?: string; // company slug for /company/<slug>/jobs
  levelsCompany?: string;   // levels.fyi slug
};

// 8 watchlist tickers. Where a company has many flagship repos we pick the
// largest single one as the OSS heartbeat (org-wide aggregation deferred to
// a later layer to keep this file lean and the API call count predictable).
export const TICKER_OPERATIONAL_MAP: Readonly<Record<string, ProviderHandles>> = {
  AAPL: { github: 'apple/swift', linkedinCompany: 'apple', levelsCompany: 'apple' },
  MSFT: { github: 'microsoft/vscode', linkedinCompany: 'microsoft', levelsCompany: 'microsoft' },
  GOOGL: { github: 'google/gemini-cli', linkedinCompany: 'google', levelsCompany: 'google' },
  AMZN: { github: 'aws/aws-cli', linkedinCompany: 'amazon', levelsCompany: 'amazon' },
  NVDA: { github: 'NVIDIA/cuda-samples', linkedinCompany: 'nvidia', levelsCompany: 'nvidia' },
  META: { github: 'facebook/react', linkedinCompany: 'meta', levelsCompany: 'facebook' },
  AMD: { github: 'ROCm/ROCm', linkedinCompany: 'amd', levelsCompany: 'amd' },
  TSLA: { github: 'teslamotors/vehicle-command', linkedinCompany: 'tesla-motors', levelsCompany: 'tesla' },
};

const GH_BASE = 'https://api.github.com';
const HEADERS = (token?: string): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  'user-agent': 'thedi-scout',
  // Authenticated requests get 5000/hr instead of 60/hr per source IP — the
  // production cron needs the headroom; tests omit the token and stay anon.
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

// Match `page=<n>` *only* inside the rel="last" link of an RFC 5988 Link header.
// One regex pass (no split → iterate → match), and the inner `[^>]*` keeps us
// from matching across multiple link entries. Returns undefined on any miss
// (header absent, single page of results, or atypical formatting).
const LAST_PAGE_RE = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/i;
function lastPageFromLink(linkHeader: string | null): number | undefined {
  if (!linkHeader) return undefined;
  const m = linkHeader.match(LAST_PAGE_RE);
  if (!m) return undefined;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Best-effort fetch. ANY non-2xx (rate limit, auth, gone, server) or thrown
// network/timeout error returns undefined — the caller fans these into the
// optional fields so a partial signal still ships. We do not differentiate
// 429 from 404: both mean "no data this run", and the next cron tick retries.
async function safeGh(path: string, token?: string): Promise<Response | undefined> {
  try {
    const res = await fetchWithTimeout(`${GH_BASE}${path}`, { headers: HEADERS(token) });
    return res.ok ? res : undefined;
  } catch {
    return undefined;
  }
}

type RepoMeta = { stars?: number; contributors?: number };
async function fetchGithub(repo: string, token?: string): Promise<RepoMeta> {
  // Run repo-meta (stars) and contributor-page-probe in parallel; allSettled
  // so a 429 on one doesn't void the other.
  const [repoR, contribR] = await Promise.allSettled([
    safeGh(`/repos/${repo}`, token),
    safeGh(`/repos/${repo}/contributors?per_page=1&anon=1`, token),
  ]);
  const out: RepoMeta = {};
  if (repoR.status === 'fulfilled' && repoR.value) {
    try {
      const j = (await repoR.value.json()) as { stargazers_count?: unknown };
      if (typeof j.stargazers_count === 'number') out.stars = j.stargazers_count;
    } catch { /* malformed body — drop */ }
  }
  if (contribR.status === 'fulfilled' && contribR.value) {
    const n = lastPageFromLink(contribR.value.headers.get('link'));
    if (n !== undefined) out.contributors = n;
    // WHY: No Link header means single-page result; counting JSON rows is the
    // exact answer in that case but pulls a body we don't otherwise need.
    // For a velocity layer, "small repo" = noise floor → leave undefined.
  }
  return out;
}

export type FetchOperationalOptions = {
  handles?: Readonly<Record<string, ProviderHandles>>;
  githubToken?: string;
};

export async function fetchOperationalSignal(
  ticker: Ticker, options: FetchOperationalOptions = {},
): Promise<OperationalSignal> {
  const map = options.handles ?? TICKER_OPERATIONAL_MAP;
  const handles = map[ticker as string];
  const asOf = new Date();
  const base: OperationalSignal = { ticker, asOf };
  if (!handles) return base;

  // V1 LIMITATION: LinkedIn /company/*/jobs and Levels.fyi /companies/* render
  // their counts client-side from authenticated GraphQL endpoints. Both block
  // unauthenticated scraping; LinkedIn ToS forbids it outright. A future layer
  // could read a curated weekly snapshot from Butterbase, but for V1 we ship
  // the GitHub half and leave job/comp deltas as undefined.
  const tasks: Promise<RepoMeta | undefined>[] = [
    handles.github ? fetchGithub(handles.github, options.githubToken) : Promise.resolve(undefined),
  ];
  const settled = await Promise.allSettled(tasks);
  const ghRes = settled[0]!;
  const gh: RepoMeta | undefined = ghRes.status === 'fulfilled' ? ghRes.value : undefined;
  // Spread only defined fields so exactOptionalPropertyTypes doesn't widen the
  // type with explicit-undefined keys (those would be JSON-serialized).
  return {
    ...base,
    ...(gh?.stars != null ? { githubStars: gh.stars } : {}),
    ...(gh?.contributors != null ? { githubContributors: gh.contributors } : {}),
  };
}
