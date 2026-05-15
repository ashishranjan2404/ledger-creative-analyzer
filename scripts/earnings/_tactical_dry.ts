// One-shot wrapper: runs the tactical data pipeline with stub keys for paid
// APIs (those fail gracefully via settledByName) and outputs the rendered
// digest as JSON so an external mailer (Gmail MCP) can deliver it.
// Does NOT call sendEmail or insertRow — no RESEND_KEY / BUTTERBASE key needed.
import { TICKERS } from './_watchlist.ts';
import { fetchFinnhubEarnings } from './sources/finnhub.ts';
import { fetchPolygonEarnings } from './sources/polygon.ts';
import { fetchYahooNews } from './sources/yahoo.ts';
import { fetchBenzingaNews } from './sources/benzinga.ts';
import { fetchStocktwitsForTickers } from './sources/stocktwits.ts';
import { fetchApeWisdom, type ApeWisdomMention } from './sources/apewisdom.ts';
import { fetchPullPushMentions } from './sources/pullpush.ts';
import { fetchArcticShiftMentions } from './sources/arcticshift.ts';
import { fetchRedditRssMentions } from './sources/reddit_rss.ts';
import { detectFroth } from './froth.ts';
import { renderTacticalText, renderTacticalSubject, type TacticalDigest } from './render_tactical.ts';
import type { EarningsEvent, RawItem, Ticker } from './_types.ts';

const SUBS = ['wallstreetbets', 'stocks', 'investing', 'SecurityAnalysis'] as const;

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

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

function dedupSchedule(finn: readonly EarningsEvent[], poly: readonly EarningsEvent[]): EarningsEvent[] {
  const m = new Map<string, EarningsEvent>();
  for (const ev of finn) m.set(`${ev.ticker}|${ymd(ev.reportDate)}`, ev);
  for (const ev of poly) { const k = `${ev.ticker}|${ymd(ev.reportDate)}`; if (!m.has(k)) m.set(k, ev); }
  return Array.from(m.values());
}

type SentItem = { ticker: Ticker; sentiment: 'bullish' | 'bearish' | null };

function buildSentiment(
  ape: readonly ApeWisdomMention[],
  redditClass: readonly RawItem[],
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

const start = Date.now();
const today = new Date();
const tomorrow = new Date(today.getTime() + 86_400_000);

const r = await settledByName({
  finnhub: fetchFinnhubEarnings(TICKERS, today, tomorrow, 'stub'),
  polygon: fetchPolygonEarnings(TICKERS, today, tomorrow, 'stub'),
  yahoo: fetchYahooNews(TICKERS, 24),
  benzinga: fetchBenzingaNews(TICKERS, 24, 'stub'),
  apewisdom: fetchApeWisdom(TICKERS, 'all-stocks'),
  pullpush: fetchPullPushMentions(TICKERS, SUBS, 24),
  arcticshift: fetchArcticShiftMentions(TICKERS, SUBS, 24),
  reddit_rss: fetchRedditRssMentions(TICKERS, SUBS, 24),
  stocktwits: fetchStocktwitsForTickers(TICKERS),
});

const schedule = dedupSchedule(r.finnhub ?? [], r.polygon ?? []);
const news = [...(r.yahoo ?? []), ...(r.benzinga ?? [])]
  .sort((a, b) => b.published.getTime() - a.published.getTime()).slice(0, 5);
const redditClass = [...(r.pullpush ?? []), ...(r.arcticshift ?? []), ...(r.reddit_rss ?? [])];
const { items, baseline } = buildSentiment(r.apewisdom ?? [], redditClass, r.stocktwits ?? []);
const froth = detectFroth({ current: items, baseline });
const digest: TacticalDigest = { date: today, schedule, news, froth };

const ms = Date.now() - start;
const subject = renderTacticalSubject(digest);
const text = renderTacticalText(digest);
const findingsCount = schedule.length + news.length;

console.log(JSON.stringify({ subject, text, findingsCount, ms }));
