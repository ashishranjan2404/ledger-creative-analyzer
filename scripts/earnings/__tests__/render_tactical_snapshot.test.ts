// Loop 43: deterministic snapshot test for renderTacticalText.
// Fixture is fully frozen (no Date.now / no env) so the rendered output is
// byte-stable across machines. On intentional renderer change, refresh via:
//   UPDATE_SNAPSHOTS=1 node --test --experimental-strip-types __tests__/render_tactical_snapshot.test.ts
import { test } from 'node:test';
import { renderTacticalText, type TacticalDigest } from '../render_tactical.ts';
import type { EarningsEvent, RawItem, Ticker } from '../_types.ts';
import type { FrothFlag } from '../froth.ts';
import { assertSnapshot } from './_snapshot_helper.ts';

const T = (s: string) => s as Ticker;
const TODAY = new Date('2026-05-14T12:00:00Z');
const TMRW = new Date('2026-05-15T12:00:00Z');

const schedule: EarningsEvent[] = [
  {
    ticker: T('NVDA'), companyName: 'NVIDIA',
    reportDate: TODAY, reportTime: 'AMC',
    epsEstimate: 5.5, revenueEstimate: 28_000_000_000, source: 'finnhub',
  },
  {
    ticker: T('AAPL'), companyName: 'Apple',
    reportDate: TMRW, reportTime: 'BMO',
    epsEstimate: 2.1, revenueEstimate: 95_500_000_000, source: 'finnhub',
  },
  {
    ticker: T('AMD'), companyName: 'AMD',
    reportDate: TMRW, reportTime: 'unknown', source: 'yahoo',
  },
];

const news: RawItem[] = [
  {
    source: 'reuters', ticker: T('AAPL'),
    title: 'Apple cuts iPhone forecast amid soft demand',
    url: 'https://r.com/x',
    published: new Date(TODAY.getTime() - 3 * 3600_000),
  },
  {
    source: 'benzinga', ticker: T('NVDA'),
    title: 'NVIDIA inks new hyperscaler deal',
    url: 'https://benzinga.com/y',
    published: new Date(TODAY.getTime() - 12 * 3600_000),
  },
];

const froth: FrothFlag[] = [
  {
    ticker: T('PLTR'), mentions: 50, baseline: 11, stddev: 2,
    zScore: 19.5, direction: 'bullish', bullishRatio: 0.86,
    reason: 'PLTR mentions +355% vs 30d baseline, uniformly bullish',
  },
];

const digest: TacticalDigest = { date: TODAY, schedule, news, froth };

test('render_tactical snapshot (full digest, all sections)', () => {
  assertSnapshot(renderTacticalText(digest), 'render_tactical');
});
