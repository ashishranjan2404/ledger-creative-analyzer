import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderTacticalText,
  renderTacticalSubject,
  type TacticalDigest,
} from '../render_tactical.ts';
import type { EarningsEvent, RawItem, Ticker } from '../_types.ts';
import type { FrothFlag } from '../froth.ts';

const T = (s: string) => s as Ticker;
const TODAY = new Date('2026-05-09T13:00:00Z');

const mkEvent = (over: Partial<EarningsEvent> = {}): EarningsEvent => ({
  ticker: T('NVDA'),
  companyName: 'NVIDIA',
  reportDate: TODAY,
  reportTime: 'AMC',
  epsEstimate: 5.5,
  revenueEstimate: 28_000_000_000,
  source: 'finnhub',
  ...over,
});

const mkNews = (over: Partial<RawItem> = {}): RawItem => ({
  source: 'reuters',
  ticker: T('AAPL'),
  title: 'Apple cuts iPhone forecast',
  url: 'https://r.com/x',
  published: new Date(TODAY.getTime() - 3 * 3600_000),
  ...over,
});

const mkFroth = (over: Partial<FrothFlag> = {}): FrothFlag => ({
  ticker: T('PLTR'),
  mentions: 50,
  baseline: 11,
  stddev: 2,
  zScore: 19.5,
  direction: 'bullish',
  bullishRatio: 0.86,
  reason: 'PLTR mentions +355% vs 30d baseline, uniformly bullish',
  ...over,
});

const mk = (over: Partial<TacticalDigest> = {}): TacticalDigest => ({
  date: TODAY,
  schedule: [],
  news: [],
  froth: [],
  ...over,
});

test('subject is Thedi tactical with ISO date', () => {
  assert.equal(renderTacticalSubject(mk()), '📊 Thedi tactical · 2026-05-09');
});

test('full digest contains all 3 section headers and rendered rows', () => {
  const body = renderTacticalText(
    mk({
      schedule: [mkEvent(), mkEvent({ ticker: T('AAPL'), reportTime: 'BMO' })],
      news: [mkNews()],
      froth: [mkFroth()],
    }),
  );
  assert.match(body, /📅 SCHEDULE — today \+ tomorrow \(2\)/);
  assert.match(body, /📰 NEWS — last 24h, watchlist/);
  assert.match(body, /⚠️ FROTH CHECK/);
  assert.match(body, /NVDA · today AMC · EPS est \$5\.5 · Rev est \$28\.0B \[finnhub\]/);
  assert.match(body, /• \[reuters\]: "Apple cuts iPhone forecast" 3h/);
  assert.match(body, /uniformly bullish/);
});

test('empty digest → default empty-state line, no section headers', () => {
  const body = renderTacticalText(mk());
  assert.equal(body, 'No watchlist activity for 2026-05-09.');
  assert.doesNotMatch(body, /SCHEDULE/);
  assert.doesNotMatch(body, /NEWS/);
  assert.doesNotMatch(body, /FROTH/);
});

test('froth-only digest contains only the FROTH section', () => {
  const body = renderTacticalText(mk({ froth: [mkFroth()] }));
  assert.match(body, /⚠️ FROTH CHECK/);
  assert.doesNotMatch(body, /SCHEDULE/);
  assert.doesNotMatch(body, /NEWS/);
});

test('tomorrow event labeled tmrw; missing estimates render n/a', () => {
  const tmrw = new Date(TODAY.getTime() + 24 * 3600_000);
  const body = renderTacticalText(
    mk({
      schedule: [
        {
          ticker: T('AMD'),
          companyName: 'AMD',
          reportDate: tmrw,
          reportTime: 'BMO',
          source: 'finnhub',
        },
      ],
    }),
  );
  assert.match(body, /AMD · tmrw BMO · EPS est n\/a · Rev est n\/a/);
});

test('reportTime "unknown" renders day label without time suffix', () => {
  const body = renderTacticalText(
    mk({ schedule: [mkEvent({ ticker: T('TSLA'), reportTime: 'unknown' })] }),
  );
  assert.match(body, /TSLA · today · EPS est/);
  assert.doesNotMatch(body, /unknown/);
});
