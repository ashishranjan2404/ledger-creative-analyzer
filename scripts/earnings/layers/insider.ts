// L2 insider cluster-buy detector. Cluster = ≥N distinct insiders all making
// open-market purchases ('P', not 'A' grants) within a rolling window, excluding
// 10b5-1 planned trades (which carry less signal than discretionary buys).
import type { Form4Transaction } from '../sources/edgar_form4.ts';
import type { Ticker } from '../_types.ts';

export type ClusterBuy = {
  ticker: Ticker;
  insiderCount: number;
  totalShares: number;
  totalDollarValue: number;
  windowStart: Date;
  windowEnd: Date;
  insiders: readonly { name: string; title: string; shares: number; value: number }[];
};

const DAY_MS = 86_400_000;

// Aggregate a window of txs into a ClusterBuy. Insider rows summed by name; titles
// keep the first non-empty seen (filers sometimes omit on later filings).
function buildCluster(ticker: Ticker, txs: readonly Form4Transaction[]): ClusterBuy {
  const byName = new Map<string, { name: string; title: string; shares: number; value: number }>();
  let totalShares = 0, totalDollarValue = 0;
  let windowStart = txs[0]!.transactionDate, windowEnd = txs[0]!.transactionDate;
  for (const t of txs) {
    const cur = byName.get(t.insiderName) ?? { name: t.insiderName, title: t.insiderTitle, shares: 0, value: 0 };
    if (!cur.title && t.insiderTitle) cur.title = t.insiderTitle;
    cur.shares += t.shares;
    cur.value += t.totalValue;
    byName.set(t.insiderName, cur);
    totalShares += t.shares;
    totalDollarValue += t.totalValue;
    if (t.transactionDate < windowStart) windowStart = t.transactionDate;
    if (t.transactionDate > windowEnd) windowEnd = t.transactionDate;
  }
  const insiders = [...byName.values()].sort((a, b) => b.value - a.value);
  return { ticker, insiderCount: byName.size, totalShares, totalDollarValue, windowStart, windowEnd, insiders };
}

export function detectClusterBuys(
  transactions: readonly Form4Transaction[],
  windowDays: number = 30,
  minInsiders: number = 2,
): ClusterBuy[] {
  const byTicker = new Map<Ticker, Form4Transaction[]>();
  for (const t of transactions) {
    if (t.transactionCode !== 'P' || t.is10b51Plan || t.shares <= 0 || t.pricePerShare <= 0) continue;
    const arr = byTicker.get(t.ticker) ?? [];
    arr.push(t);
    byTicker.set(t.ticker, arr);
  }
  const out: ClusterBuy[] = [];
  for (const [ticker, txs] of byTicker) {
    txs.sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
    const windowMs = windowDays * DAY_MS;
    let best: ClusterBuy | undefined;
    // WHY sliding window anchored on each tx: catches the densest 30-day stretch
    // without re-scanning. Per-ticker cluster count is tiny so O(n^2) is fine.
    for (let i = 0; i < txs.length; i++) {
      const window: Form4Transaction[] = [];
      const names = new Set<string>();
      for (let j = i; j < txs.length; j++) {
        if (txs[j]!.transactionDate.getTime() - txs[i]!.transactionDate.getTime() > windowMs) break;
        window.push(txs[j]!);
        names.add(txs[j]!.insiderName);
      }
      if (names.size < minInsiders) continue;
      const cb = buildCluster(ticker, window);
      // Largest cluster wins: most insiders, tie-break on most shares.
      if (!best || cb.insiderCount > best.insiderCount
        || (cb.insiderCount === best.insiderCount && cb.totalShares > best.totalShares)) best = cb;
    }
    if (best) out.push(best);
  }
  return out;
}
