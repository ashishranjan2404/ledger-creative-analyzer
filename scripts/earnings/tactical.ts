import { TICKERS } from './_watchlist.ts';
import { assertPersonalRecipient } from './_recipient.ts';
import { fetchFinnhubEarnings } from './sources/finnhub.ts';
import { fetchPolygonEarnings } from './sources/polygon.ts';
import { fetchYahooNews } from './sources/yahoo.ts';
import { fetchBenzingaNews } from './sources/benzinga.ts';
import { fetchRedditMentions } from './sources/reddit.ts';
import { fetchStocktwitsForTickers } from './sources/stocktwits.ts';
import { fetchApeWisdom, type ApeWisdomMention } from './sources/apewisdom.ts';
import { fetchPullPushMentions } from './sources/pullpush.ts';
import { fetchArcticShiftMentions } from './sources/arcticshift.ts';
import { fetchRedditRssMentions } from './sources/reddit_rss.ts';
import { detectFroth } from './froth.ts';
import { renderTacticalText, renderTacticalSubject, type TacticalDigest } from './render_tactical.ts';
import { sendEmail } from './send.ts';
import { insertRow, insertRows } from './_butterbase.ts';
import { readRequiredEnv, readOptionalEnv } from './_env.ts';
import type { EarningsEvent, RawItem, Finding, Ticker } from './_types.ts';

export const ENV_VARS = ['FINNHUB_KEY', 'POLYGON_KEY', 'BENZINGA_KEY',
  'RESEND_KEY', 'BUTTERBASE_SERVICE_KEY', 'RECIPIENT'] as const;
// WHY optional: Reddit's 2024-25 app gate requires manual approval. ApeWisdom +
// 3 keyless fallbacks cover sentiment; OAuth Reddit re-engages when set.
export const OPTIONAL_ENV_VARS = ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'] as const;
type EnvKey = typeof ENV_VARS[number];
type OptionalEnvKey = typeof OPTIONAL_ENV_VARS[number];
type Env = Record<EnvKey, string> & Partial<Record<OptionalEnvKey, string>>;

const SUBS = ['wallstreetbets', 'stocks', 'investing', 'SecurityAnalysis'] as const;
const FROM = 'thedi@platformy.org';

// Aggregate-throw + optional-merge. Shared helpers in _env.ts; see WHY there.
export function readEnv(env: NodeJS.ProcessEnv = process.env): Env {
  return { ...readRequiredEnv(ENV_VARS, env), ...readOptionalEnv(OPTIONAL_ENV_VARS, env) };
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

// WHY Map dedup: Finnhub seeds (carries EPS/rev estimates), Polygon only fills
// keys Finnhub missed. Single Map → Array.from; no parallel Set bookkeeping.
function dedupSchedule(finn: readonly EarningsEvent[], poly: readonly EarningsEvent[]): EarningsEvent[] {
  const m = new Map<string, EarningsEvent>();
  for (const ev of finn) m.set(`${ev.ticker}|${ymd(ev.reportDate)}`, ev);
  for (const ev of poly) { const k = `${ev.ticker}|${ymd(ev.reportDate)}`; if (!m.has(k)) m.set(k, ev); }
  return Array.from(m.values());
}

// WHY named-object: results addressed by NAME, not index — reorder a fan-out
// entry without silently re-routing warn labels or mixing source arrays.
async function settledByName<T extends Record<string, Promise<unknown>>>(ps: T,
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

function buildFindings(sched: readonly EarningsEvent[], news: readonly RawItem[]): Finding[] {
  return [
    ...sched.map((ev, i): Finding => ({ ticker: ev.ticker, layer: 'schedule', rank: i + 1,
      title: `${ev.ticker} earnings ${ymd(ev.reportDate)} ${ev.reportTime}`, url: '',
      summary: `EPS est ${ev.epsEstimate ?? 'n/a'} · Rev est ${ev.revenueEstimate ?? 'n/a'}`, source: ev.source })),
    ...news.map((it, i): Finding => ({ ticker: (it.ticker ?? 'NA') as Ticker, layer: 'news_context',
      rank: i + 1, title: it.title, url: it.url, summary: it.snippet ?? '', source: it.source })),
  ];
}

type SentItem = { ticker: Ticker; sentiment: 'bullish' | 'bearish' | null };
// ApeWisdom: per-mention rows so volume drives z-score; mentionsPrior24h IS the
// baseline (3x to clear n≥3 gate; equal values → stddev 0 → froth skips, correct
// for V1 until hourly history lands). Reddit-class fallbacks lack structured
// sentiment; the directional gate suppresses unless tagged.
function buildSentiment(ape: readonly ApeWisdomMention[], redditClass: readonly RawItem[],
  stocktwits: readonly { ticker: Ticker; sentiment: string | null }[],
): { items: SentItem[]; baseline: Record<string, number[]> } {
  const items: SentItem[] = [];
  const apeSent = (a: ApeWisdomMention): 'bullish' | 'bearish' | null =>
    a.sentimentLabel === 'Bullish' ? 'bullish' : a.sentimentLabel === 'Bearish' ? 'bearish' : null;
  for (const a of ape) for (let i = 0; i < a.mentions; i++) items.push({ ticker: a.ticker, sentiment: apeSent(a) });
  for (const p of redditClass) if (p.ticker) items.push({ ticker: p.ticker, sentiment: null });
  for (const s of stocktwits) items.push({ ticker: s.ticker,
    sentiment: s.sentiment === 'Bullish' ? 'bullish' : s.sentiment === 'Bearish' ? 'bearish' : null });
  const baseline: Record<string, number[]> = {};
  for (const a of ape) baseline[a.ticker] = [a.mentionsPrior24h, a.mentionsPrior24h, a.mentionsPrior24h];
  return { items, baseline };
}

export async function runTactical(): Promise<{ sent: boolean; findings: number; ms: number }> {
  const start = Date.now();
  const env = readEnv();
  assertPersonalRecipient(env.RECIPIENT);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const redditCreds = env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET
    ? { id: env.REDDIT_CLIENT_ID, secret: env.REDDIT_CLIENT_SECRET } : null;

  const r = await settledByName({
    finnhub: fetchFinnhubEarnings(TICKERS, today, tomorrow, env.FINNHUB_KEY),
    polygon: fetchPolygonEarnings(TICKERS, today, tomorrow, env.POLYGON_KEY),
    yahoo: fetchYahooNews(TICKERS, 24),
    benzinga: fetchBenzingaNews(TICKERS, 24, env.BENZINGA_KEY),
    apewisdom: fetchApeWisdom(TICKERS, 'all-stocks'),
    pullpush: fetchPullPushMentions(TICKERS, SUBS, 24),
    arcticshift: fetchArcticShiftMentions(TICKERS, SUBS, 24),
    reddit_rss: fetchRedditRssMentions(TICKERS, SUBS, 24),
    reddit: redditCreds
      ? fetchRedditMentions(TICKERS, SUBS, 24, redditCreds.id, redditCreds.secret)
      : Promise.resolve([] as RawItem[]),
    stocktwits: fetchStocktwitsForTickers(TICKERS),
  });

  const schedule = dedupSchedule(r.finnhub ?? [], r.polygon ?? []);
  const news = [...(r.yahoo ?? []), ...(r.benzinga ?? [])]
    .sort((a, b) => b.published.getTime() - a.published.getTime()).slice(0, 5);
  const redditClass = [...(r.pullpush ?? []), ...(r.arcticshift ?? []),
    ...(r.reddit_rss ?? []), ...(r.reddit ?? [])];
  const { items, baseline } = buildSentiment(r.apewisdom ?? [], redditClass, r.stocktwits ?? []);
  const froth = detectFroth({ current: items, baseline });
  const digest: TacticalDigest = { date: today, schedule, news, froth };

  // WHY try/catch around send: a Resend outage MUST NOT abort the run —
  // findings still get persisted, audit row still written with ok:false + note.
  let sent = false;
  let emailNote: string | null = null;
  try {
    await sendEmail({ apiKey: env.RESEND_KEY, from: FROM, to: env.RECIPIENT,
      subject: renderTacticalSubject(digest), text: renderTacticalText(digest) });
    sent = true;
  } catch (e) {
    emailNote = `email failed: ${e instanceof Error ? e.message : String(e)}`;
    console.warn(`[send] ${emailNote}`);
  }

  const findings = buildFindings(schedule, news);
  const cfg = { serviceKey: env.BUTTERBASE_SERVICE_KEY };
  try { if (findings.length) await insertRows('findings', findings, cfg); }
  catch (e) { console.warn(`[butterbase findings] ${String(e)}`); }
  const ms = Date.now() - start;
  try {
    await insertRow('audit_log', { step: 'tactical_run', ok: sent, ms, findings_count: findings.length,
      note: emailNote ?? `sent ${findings.length} items to ${env.RECIPIENT}` }, cfg);
  } catch (e) { console.warn(`[butterbase audit] ${String(e)}`); }
  return { sent, findings: findings.length, ms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await (async () => { try { console.log(await runTactical()); } catch (e) { console.error(e); process.exit(1); } })();
}
