import type { Ticker } from './_types.ts';

export type FrothFlag = {
  ticker: Ticker;
  mentions: number;
  baseline: number;
  stddev: number;
  zScore: number;
  direction: 'bullish' | 'bearish';
  bullishRatio: number;
  reason: string;
};

// One-pass population mean+stddev. Returns null when n<3 or stddev==0 so the
// caller can skip in a single nullish check (collapses two reject paths).
// Variance is clamped at 0 to absorb floating-point drift when all values equal.
function stats(xs: readonly number[]): { mean: number; stddev: number } | null {
  if (xs.length < 3) return null;
  let sum = 0;
  let sumSq = 0;
  for (const x of xs) {
    sum += x;
    sumSq += x * x;
  }
  const mean = sum / xs.length;
  const stddev = Math.sqrt(Math.max(sumSq / xs.length - mean * mean, 0));
  return stddev === 0 ? null : { mean, stddev };
}

function groupByTicker<T extends { ticker: Ticker }>(xs: readonly T[]): Map<Ticker, T[]> {
  const out = new Map<Ticker, T[]>();
  for (const x of xs) {
    const bucket = out.get(x.ticker);
    if (bucket) bucket.push(x);
    else out.set(x.ticker, [x]);
  }
  return out;
}

// WHY: pure detector — group → stat-test → directional filter. Two-gate design
// (volume z AND directional uniformity) is what keeps result empty on normal days.
export function detectFroth(args: {
  current: { ticker: Ticker; sentiment: 'bullish' | 'bearish' | null }[];
  baseline: Record<string, number[]>;
  zThreshold?: number;
  minDirectionalRatio?: number;
}): FrothFlag[] {
  const zThr = args.zThreshold ?? 3.0;
  const minDir = args.minDirectionalRatio ?? 0.7;

  const grouped = groupByTicker(args.current);

  const out: FrothFlag[] = [];
  for (const [ticker, ms] of grouped) {
    const hist = args.baseline[ticker];
    if (!hist) continue;
    const s = stats(hist);
    if (!s) continue;
    const z = (ms.length - s.mean) / s.stddev;
    if (z < zThr) continue;
    let bullish = 0;
    let bearish = 0;
    for (const m of ms) {
      if (m.sentiment === 'bullish') bullish++;
      else if (m.sentiment === 'bearish') bearish++;
    }
    const directed = bullish + bearish;
    if (directed === 0) continue;
    const bullRatio = bullish / directed;
    const bearRatio = bearish / directed;
    const direction: 'bullish' | 'bearish' =
      bullRatio >= bearRatio ? 'bullish' : 'bearish';
    const ratio = direction === 'bullish' ? bullRatio : bearRatio;
    if (ratio < minDir) continue;
    const pct = ((ms.length / s.mean - 1) * 100).toFixed(0);
    out.push({
      ticker,
      mentions: ms.length,
      baseline: s.mean,
      stddev: s.stddev,
      zScore: z,
      direction,
      bullishRatio: bullRatio,
      reason: `${ticker} mentions +${pct}% vs ${hist.length}d baseline, uniformly ${direction}`,
    });
  }
  return out;
}
