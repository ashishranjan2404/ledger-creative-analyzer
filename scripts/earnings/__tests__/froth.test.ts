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
