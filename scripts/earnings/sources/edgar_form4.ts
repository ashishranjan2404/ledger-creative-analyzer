import { fetchRss, fetchWithTimeout } from '../_http.ts';
import { tickerToCik } from './edgar.ts';
import type { Ticker } from '../_types.ts';

// SEC requires a descriptive UA per https://www.sec.gov/os/accessing-edgar-data
const UA = 'Thedi-Personal ashish@platformy.org';
const HEADERS = { 'user-agent': UA, accept: 'application/atom+xml,text/xml,application/xml' };
const DEFAULT_BASE = 'https://www.sec.gov';
// WHY: anchor on `-index.` so we match the index URL and not arbitrary digit runs.
const ACCESSION_RE = /(\d{10}-\d{2}-\d{6})-index\./i;

export type Form4Transaction = {
  ticker: Ticker; insiderName: string; insiderTitle: string; transactionDate: Date;
  transactionCode: 'P' | 'S' | 'A' | 'M' | 'F' | 'G' | string;
  shares: number; pricePerShare: number; totalValue: number;
  is10b51Plan: boolean; filingUrl: string; accessionNumber: string;
};

// WHY one walker: descend a tag path like ('transactionAmounts','transactionShares','value')
// in single recursion. \b tolerates namespace prefixes; Form 4 has no CDATA.
function pathText(xml: string, ...path: string[]): string | undefined {
  let cur: string | undefined = xml;
  for (const n of path) {
    if (!cur) return undefined;
    cur = cur.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`, 'i'))?.[1];
  }
  return cur?.trim();
}

// WHY: 10b5-1 isn't standardized. Prefer explicit <rule10b5_1Flag><value>1</value>;
// fall back to a raw substring scan of the txn block. Favor false-negative over false-positive.
function detect10b51(tx: string): boolean {
  if (pathText(tx, 'rule10b5_1Flag', 'value') === '1') return true;
  return /10b5-?1/i.test(tx);
}

function deriveTitle(rel: string): string {
  const t = pathText(rel, 'officerTitle');
  if (t) return t;
  const d = pathText(rel, 'isDirector');
  if (d === '1' || d === 'true') return 'Director';
  return pathText(rel, 'isTenPercentOwner') === '1' ? '10% Owner' : '';
}

function parseRows(t: Ticker, xml: string, url: string, acc: string): Form4Transaction[] {
  const owner = pathText(xml, 'reportingOwner') ?? '';
  // WHY: SEC nests as <reportingOwner><reportingOwnerId><rptOwnerName>; skipping the
  // wrapper silently returns "" against real filings.
  const insiderName = pathText(owner, 'reportingOwnerId', 'rptOwnerName') ?? '';
  const insiderTitle = deriveTitle(pathText(owner, 'reportingOwnerRelationship') ?? '');
  const out: Form4Transaction[] = [];
  // WHY: derivative txns matter — code M (option exercise) is a real signal.
  for (const kind of ['nonDerivativeTransaction', 'derivativeTransaction']) {
    const re = new RegExp(`<${kind}\\b[^>]*>([\\s\\S]*?)<\\/${kind}>`, 'gi');
    for (const m of xml.matchAll(re)) {
      const tx = m[1] ?? '';
      const dateStr = pathText(tx, 'transactionDate', 'value');
      const code = pathText(tx, 'transactionCoding', 'transactionCode');
      const sharesStr = pathText(tx, 'transactionAmounts', 'transactionShares', 'value');
      const priceStr = pathText(tx, 'transactionAmounts', 'transactionPricePerShare', 'value');
      if (!dateStr || !code || !sharesStr) continue;
      const dt = new Date(dateStr);
      const shares = Number(sharesStr);
      if (isNaN(dt.getTime()) || !Number.isFinite(shares)) continue;
      const px = Number.isFinite(Number(priceStr)) ? Number(priceStr) : 0;
      out.push({
        ticker: t, insiderName, insiderTitle, transactionDate: dt, transactionCode: code,
        shares, pricePerShare: px, totalValue: shares * px,
        is10b51Plan: detect10b51(tx), filingUrl: url, accessionNumber: acc,
      });
    }
  }
  return out;
}

async function tryXml(url: string): Promise<string | null> {
  try { const r = await fetchWithTimeout(url, { headers: HEADERS }); return r.ok ? await r.text() : null; }
  catch { return null; }
}

function feedUrl(endpoint: string, cik: string): string {
  return `${endpoint}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=40&output=atom`;
}

async function forTicker(t: Ticker, cutoff: number, endpoint: string): Promise<Form4Transaction[]> {
  const cik = await tickerToCik(t, endpoint);
  const cikNoPad = String(parseInt(cik, 10)); // SEC archive paths use unpadded CIK
  const items = await fetchRss(feedUrl(endpoint, cik), { headers: HEADERS });
  const out: Form4Transaction[] = [];
  for (const it of items) {
    if (!it.pubDate || it.pubDate.getTime() <= cutoff) continue;
    const acc = it.link.match(ACCESSION_RE)?.[1];
    if (!acc) continue;
    const dir = `${endpoint}/Archives/edgar/data/${cikNoPad}/${acc.replace(/-/g, '')}`;
    // WHY: try XSL-rendered XML first (cleaner field names), then raw .xml fallback.
    const xml = (await tryXml(`${dir}/xslF345X05/${acc}.xml`)) ?? (await tryXml(`${dir}/${acc}.xml`));
    if (!xml) continue;
    // WHY: try/catch — schemas vary across filers/years; skip the bad ones, keep others.
    try { out.push(...parseRows(t, xml, it.link, acc)); } catch { /* skip */ }
  }
  return out;
}

export async function fetchRecentForm4(
  tickers: readonly Ticker[],
  sinceDays: number,
  endpoint: string = DEFAULT_BASE,
): Promise<Form4Transaction[]> {
  const cutoff = Date.now() - sinceDays * 86_400_000;
  const settled = await Promise.allSettled(tickers.map((t) => forTicker(t, cutoff, endpoint)));
  const out: Form4Transaction[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === 'fulfilled') out.push(...r.value);
    else console.warn(`[form4] fetch failed for ${tickers[i]}: ${String(r.reason)}`);
  }
  return out;
}
