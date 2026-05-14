import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectFroth } from '../froth.ts';
import { toTicker } from '../_watchlist.ts';

type Sent = 'bullish' | 'bearish' | null;
const items = (ticker: string, n: number, bullish: number, bearish: number) => {
  const out: { ticker: ReturnType<typeof toTicker>; sentiment: Sent }[] = [];
  const t = toTicker(ticker);
  let b = bullish;
  let r = bearish;
  for (let i = 0; i < n; i++) {
    let s: Sent = null;
    if (b > 0) { s = 'bullish'; b--; }
    else if (r > 0) { s = 'bearish'; r--; }
    out.push({ ticker: t, sentiment: s });
  }
  return out;
};

const baseline30 = (mu: number, jitter: number): number[] => {
  // produces 30 numbers with given mean and small symmetric jitter
  const out: number[] = [];
  for (let i = 0; i < 30; i++) {
    out.push(mu + (i % 2 === 0 ? jitter : -jitter));
  }
  return out;
};

test('high volume + uniformly bullish → flagged with high zScore', () => {
  const current = items('PLTR', 50, 43, 7); // 86% bullish among directed
  const baseline = { PLTR: baseline30(11, 2) };
  const flags = detectFroth({ current, baseline });
  assert.equal(flags.length, 1);
  const f = flags[0]!;
  assert.equal(f.ticker, 'PLTR');
  assert.equal(f.mentions, 50);
  assert.equal(f.direction, 'bullish');
  assert.ok(f.zScore > 18, `zScore ${f.zScore} should be > 18`);
  assert.ok(f.bullishRatio > 0.85);
  assert.match(f.reason, /^PLTR mentions \+\d+% vs 30d baseline, uniformly bullish$/);
});

test('high volume but mixed sentiment (50/50) → NOT flagged', () => {
  const current = items('PLTR', 50, 25, 25);
  const baseline = { PLTR: baseline30(11, 2) };
  const flags = detectFroth({ current, baseline });
  assert.deepEqual(flags, []);
});

test('zScore below threshold → NOT flagged', () => {
  // 13 mentions vs baseline mean ~11, stddev ~2 → z ~1
  const current = items('PLTR', 13, 12, 1);
  const baseline = { PLTR: baseline30(11, 2) };
  const flags = detectFroth({ current, baseline });
  assert.deepEqual(flags, []);
});

test('missing baseline → silently skipped (no flag, no throw)', () => {
  const current = items('PLTR', 50, 45, 5);
  const flags = detectFroth({ current, baseline: {} });
  assert.deepEqual(flags, []);
});

test('baseline with <3 points → skipped', () => {
  const current = items('PLTR', 50, 45, 5);
  const flags = detectFroth({ current, baseline: { PLTR: [10, 11] } });
  assert.deepEqual(flags, []);
});

test('stddev 0 (all baseline values identical) → skipped', () => {
  const current = items('PLTR', 50, 45, 5);
  const flags = detectFroth({
    current,
    baseline: { PLTR: [10, 10, 10, 10, 10] },
  });
  assert.deepEqual(flags, []);
});

test('empty current → returns []', () => {
  const flags = detectFroth({ current: [], baseline: { PLTR: baseline30(11, 2) } });
  assert.deepEqual(flags, []);
});

test('uniformly bearish triggers bearish direction', () => {
  const current = items('AAPL', 40, 3, 37); // ~92% bearish
  const baseline = { AAPL: baseline30(8, 1) };
  const flags = detectFroth({ current, baseline });
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.direction, 'bearish');
  assert.ok(flags[0]!.bullishRatio < 0.15);
  assert.match(flags[0]!.reason, /uniformly bearish$/);
});

test('all-null sentiment (no directed mentions) → NOT flagged even at high volume', () => {
  const current = items('PLTR', 50, 0, 0);
  const baseline = { PLTR: baseline30(11, 2) };
  const flags = detectFroth({ current, baseline });
  assert.deepEqual(flags, []);
});

test('custom thresholds honored', () => {
  const current = items('PLTR', 16, 14, 2); // z ~2.5, bullishRatio ~0.875
  const baseline = { PLTR: baseline30(11, 2) };
  // default zThreshold 3 would skip; lower it
  const flags = detectFroth({ current, baseline, zThreshold: 2.0 });
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.direction, 'bullish');
});

// === Loop 42: property-based tests for detectFroth ========================
// Seeded LCG drives input generation; invariants exercised across 80 trials.

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0x100000000);
  };
}

test('detectFroth property: never throws + result is a subset of currents tickers', () => {
  const rng = seededRng(0x100A);
  for (let i = 0; i < 80; i++) {
    const tickerCount = 1 + Math.floor(rng() * 4);
    const tickerNames = ['NVDA', 'AAPL', 'MSFT', 'TSLA'].slice(0, tickerCount);
    const current: { ticker: ReturnType<typeof toTicker>; sentiment: Sent }[] = [];
    const baseline: Record<string, number[]> = {};
    for (const tn of tickerNames) {
      const n = Math.floor(rng() * 40);
      const bull = Math.floor(rng() * n);
      const bear = Math.floor(rng() * (n - bull));
      current.push(...items(tn, n, bull, bear));
      // Random baseline length 0..30 (covers <3 reject path) with jitter 0..5.
      const len = Math.floor(rng() * 30);
      baseline[tn] = Array.from({ length: len }, () => 5 + rng() * 10);
    }
    const flags = detectFroth({ current, baseline });
    const surfaced = new Set(flags.map((f) => String(f.ticker)));
    for (const t of surfaced) {
      assert.ok(tickerNames.includes(t), `flagged ticker ${t} was not in current`);
    }
  }
});

test('detectFroth property: zero-variance baseline never triggers', () => {
  // stats() returns null when stddev === 0. Even a 100× surge mustn't fire
  // because we have no signal-vs-noise denominator.
  const rng = seededRng(0xc0de);
  for (let i = 0; i < 25; i++) {
    const mu = 1 + Math.floor(rng() * 20);
    const baselineLen = 3 + Math.floor(rng() * 27);
    const baseline = { NVDA: Array.from({ length: baselineLen }, () => mu) };
    const current = items('NVDA', mu * 50, mu * 45, mu * 5); // huge bullish spike
    const flags = detectFroth({ current, baseline });
    assert.equal(flags.length, 0, `mu=${mu} baselineLen=${baselineLen} fired anyway`);
  }
});

test('detectFroth property: undirected (sentiment === null) never triggers', () => {
  // bullish + bearish must both be > 0; runs of pure-null sentiment must skip.
  const rng = seededRng(0xface);
  for (let i = 0; i < 30; i++) {
    const n = 20 + Math.floor(rng() * 30); // large surge
    const baseline = { GOOGL: Array.from({ length: 30 }, () => 5 + (rng() < 0.5 ? 1 : -1)) };
    const current = items('GOOGL', n, 0, 0); // all null sentiment
    const flags = detectFroth({ current, baseline });
    assert.equal(flags.length, 0, `n=${n} fired without any directional vote`);
  }
});

test('detectFroth property: ticker absent from baseline never triggers', () => {
  // baseline lookup is strict — unknown tickers must be ignored, never crash.
  const current = items('XYZ', 100, 60, 5);
  const flags = detectFroth({ current, baseline: { ABC: [1, 2, 3, 4, 5] } });
  assert.equal(flags.length, 0);
});

test('detectFroth property: result mentions match input count', () => {
  // If a ticker DOES fire, the reported .mentions must equal the number of
  // current items with that ticker (no off-by-ones in groupByTicker).
  const rng = seededRng(13);
  for (let i = 0; i < 20; i++) {
    const tickers = ['AAPL', 'MSFT'].slice(0, 1 + Math.floor(rng() * 2));
    const counts = new Map<string, number>();
    const current: { ticker: ReturnType<typeof toTicker>; sentiment: Sent }[] = [];
    const baseline: Record<string, number[]> = {};
    for (const t of tickers) {
      const n = 20 + Math.floor(rng() * 30);
      counts.set(t, n);
      const bull = Math.floor(n * 0.85); // strong bullish to maximize firing odds
      current.push(...items(t, n, bull, n - bull));
      baseline[t] = baseline30(2 + Math.floor(rng() * 3), 1);
    }
    const flags = detectFroth({ current, baseline });
    for (const f of flags) {
      assert.equal(f.mentions, counts.get(String(f.ticker)),
        `mention count off-by-one for ${f.ticker}`);
    }
  }
});
